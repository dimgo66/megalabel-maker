import { useEffect, useRef, useCallback, useState } from 'react';
import { Canvas, Textbox } from 'fabric';
import { useProjectStore } from '../store/useProjectStore';
import { mmToPx } from '../utils/layoutCalculator';
import { isOutdatedBarcode, recreateBarcodeObject } from '../utils/barcodeObjectFactory';
import { applyStoredLocks, isHiddenRender, serializeCanvas, isHistorySuspended, withoutHistory, sceneWidth, sceneHeight, setPasteboardPx as writePasteboardPx } from '../utils/canvasHelpers';
import { copySelectionToClipboard, pasteObjectsFromClipboard } from '../utils/clipboardPaste';
import { getClipboardEntry, readClipboardToken } from '../utils/objectClipboard';
import {
  COMPACT_WIDTH_RATIO,
  applyFrameScale,
  ensureTextFrame,
  fitOptionsFromStore,
  fitTextToLabel,
  normalizeText,
  sanitizePastedFragment,
  syncFrameGeometry,
  syncFrameGeometryKeepingTop,
  whenPastedTextInserted,
} from '../utils/textFitter';
import { calcSnapGuides, sameGuides, type GuideLine } from '../utils/smartGuides';
import { computePasteboardPx } from '../utils/pasteboard';
import { refreshPdfPreviews } from '../utils/pdfPreview';

/**
 * Применяет сериализованное состояние к канвасу и мигрирует устаревшие штрих-коды.
 * Используется при первичной загрузке и при загрузке проекта из файла/автосохранения.
 */
async function applyStateToCanvas(c: Canvas, json: object): Promise<void> {
  if (!json || Object.keys(json).length === 0) {
    // Пустое состояние: очищаем канвас (для «нового проекта»)
    await withoutHistory(() => c.clear());
    // Холст прозрачный: белый лист этикетки — DOM-слой под холстом, вокруг —
    // рабочая зона. Фон холста закрасил бы её целиком.
    c.backgroundColor = '';
    c.requestRenderAll();
    return;
  }

  await withoutHistory(() => c.loadFromJSON(json as any));

  // Проект мог хранить фон холста (старые сохранения кладут background в JSON):
  // в редакторе фон обязан быть прозрачным, иначе рабочая зона станет белой.
  c.backgroundColor = '';

  // Миграция: пересоздаём старые штрих-коды (без barcodeNorm или с устаревшей
  // нормой). Так проекты, сохранённые генератором с ошибкой в таблице чётности
  // EAN-13, исправляются сами при открытии.
  const oldBarcodeObjects = c.getObjects().filter(isOutdatedBarcode);

  if (oldBarcodeObjects.length > 0) {
    console.log(`Миграция: пересоздаём ${oldBarcodeObjects.length} старых штрих-кодов через фабрику`);

    for (const oldObj of oldBarcodeObjects) {
      const newGroup = recreateBarcodeObject(oldObj);
      if (!newGroup) continue;

      // Заменяем старый объект на том же месте в стопке слоёв
      const index = c.getObjects().indexOf(oldObj);
      c.remove(oldObj);
      if (index >= 0) c.insertAt(index, newGroup);
      else c.add(newGroup);
    }

    c.renderAll();
  }

  // Миграция: IText → фрейм (Textbox).
  //
  // У IText нет ширины переноса — он всегда растёт одной строкой, поэтому
  // фреймом быть не может: за боковые ручки такой текст не тянется. Конвертация
  // делается ЗДЕСЬ (при загрузке), а не во время перетаскивания: подмена объекта
  // посреди трансформации ломает fabric — он держит ссылку на удалённый объект.
  const legacyTextObjects = c.getObjects().filter((obj: any) => obj.type === 'i-text');
  if (legacyTextObjects.length > 0) {
    console.log(`Миграция: ${legacyTextObjects.length} текстовых блоков переведены во фреймы`);
    await withoutHistory(async () => {
      for (const legacy of legacyTextObjects) {
        ensureTextFrame(legacy as any);
      }
    });
    c.renderAll();
  }

  // Восстанавливаем геометрию фреймов: loadFromJSON ставит height по содержимому,
  // а собственная высота рамки хранится в frameHeight. Заодно возвращается
  // обрезка по рамке.
  await withoutHistory(async () => {
    for (const obj of c.getObjects()) {
      if (obj.type === 'textbox') syncFrameGeometry(obj as any);
      // Замки: fabric не сериализует selectable/evented/lockMovement, поэтому
      // закреплённая позиция и замок слоя пришлось бы включать заново вручную.
      applyStoredLocks(obj as any);
    }
  });
}

/**
 * Управляет ручками масштабирования у текста, изображений и штрих-кодов.
 *
 * У текста-фрейма доступны ВСЕ ручки: боковые и верх/низ тянут размеры рамки
 * (ширину и высоту соответственно), углы — оба размера; точка поворота остаётся.
 * Кегль при этом не меняется: масштаб сворачивается в размеры рамки в
 * `object:scaling`.
 *
 * Вертикальный масштаб больше не запрещён (`lockScalingY`): высота рамки теперь
 * независима, поэтому `scalingIsForbidden` не блокирует и углы. Отражение
 * запрещено — случайно перевёрнутый текст выглядит как поломка.
 * У изображений и штрих-кодов скрыты все четыре средние точки, как и раньше.
 */
function hideMiddleControls(obj: any) {
  const t = obj?.type;
  const isBarcode = !!obj?.barcodeValue;
  const isText = t === 'i-text' || t === 'textbox';
  if (isText) {
    obj.set({ lockScalingY: false, lockScalingFlip: true });
  } else if (t === 'image' || isBarcode) {
    obj.setControlsVisibility({
      ml: false,
      mr: false,
      mt: false,
      mb: false,
    });
  }
}

export function LabelCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const [guideLines, setGuideLines] = useState<GuideLine[]>([]);

  /**
   * Рабочая зона вокруг этикетки (pasteboard).
   *
   * Холст редактора больше этикетки: вокруг неё есть поле, на котором fabric
   * рисует объекты, вышедшие за край, их рамки выделения и ручки. Без этого
   * поля ручки объекта, который больше этикетки, физически не нарисовать и не
   * поймать мышью — контролы рисуются только внутри холста.
   *
   * Пересчёт откладывается до конца жеста: менять размер холста посреди drag
   * или scaling нельзя — координата под курсором съедет.
   */
  const geometryRef = useRef('');
  const geometryTimerRef = useRef<number | null>(null);
  /**
   * Мышь/палец сейчас зажат. Пока это так, размер холста менять нельзя: fabric
   * считает координату под курсором от текущего вьюпорта, и смена размера
   * посреди жеста сдвинула бы объект. Пересчёт отложится до отпускания.
   */
  const pointerDownRef = useRef(false);

  /**
   * Приводит холст к формату, зуму и фактическому выходу объектов за этикетку.
   *
   * Сцена остаётся в координатах ЭТИКЕТКИ (0,0 — её левый верх): меняются
   * только размер холста и сдвиг вьюпорта. Поэтому JSON проекта, история,
   * экспорт и печать от размера рабочей зоны не зависят.
   */
  const applyCanvasGeometry = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    // Идёт экспорт: withHidden временно держит единичный вьюпорт, свой сдвиг
    // выставим после него (его requestRenderAll снова вызовет пересчёт).
    if (isHiddenRender()) return;

    const { selectedFormat: format, editorZoom: zoom } = useProjectStore.getState();
    const labelW = mmToPx(format.width_mm);
    const labelH = mmToPx(format.height_mm);
    const pasteboard = computePasteboardPx(canvas, labelW, labelH, zoom);

    const width = labelW * zoom + pasteboard * 2;
    const height = labelH * zoom + pasteboard * 2;
    const key = `${width}x${height}@${zoom}`;
    if (key === geometryRef.current) return;
    geometryRef.current = key;

    // Размер поля живёт на холсте: по нему `sceneWidth`/`sceneHeight` отдают
    // размеры этикетки, а не всего холста с полем.
    writePasteboardPx(canvas, pasteboard);

    canvas.setDimensions({ width, height });
    // Этикетка остаётся на месте в сцене, а в пикселях холста сдвигается на
    // размер поля: сцена (0,0) → (pasteboard, pasteboard).
    canvas.setViewportTransform([zoom, 0, 0, zoom, pasteboard, pasteboard]);
    // Элемент переехал и изменился — без пересчёта смещения мышь считалась бы
    // от старой позиции, и попадание по объектам уезжало бы.
    canvas.calcOffset();

    // App по этому значению расставляет белый лист этикетки и безопасные поля.
    const store = useProjectStore.getState();
    if (store.pasteboardPx !== pasteboard) store.setPasteboardPx(pasteboard);

    canvas.requestRenderAll();
  }, []);

  /**
   * Отложенный пересчёт геометрии. `after:render` покрывает все причины
   * изменения рамки — drag, тягу за ручки, правку текста и кегля из панели,
   * добавление и удаление объектов, загрузку, undo/redo, зум; задержка
   * гарантирует, что размер холста не меняется посреди трансформации.
   */
  const scheduleGeometrySync = useCallback(() => {
    if (geometryTimerRef.current !== null) window.clearTimeout(geometryTimerRef.current);
    geometryTimerRef.current = window.setTimeout(() => {
      geometryTimerRef.current = null;
      // Кнопка мыши ещё зажата — пересчёт отложен до mouse:up, иначе холст
      // изменит размер посреди перетаскивания.
      if (pointerDownRef.current) return;
      applyCanvasGeometry();
    }, 160);
  }, [applyCanvasGeometry]);

  /**
   * Счётчик идущих загрузок состояния в холст (переключение вкладки, загрузка
   * файла, автосохранения). Пока он больше нуля, сохранение и автосохранение
   * берут canvasJSON из стора, а не снимок с холста: во время loadFromJSON
   * холст пуст или заполнен наполовину, и такой снимок затёр бы этикетку в
   * файле.
   */
  const canvasLoadsRef = useRef(0);
  const beginCanvasLoad = useCallback(() => {
    canvasLoadsRef.current += 1;
    useProjectStore.getState().setCanvasLoading(true);
  }, []);
  const endCanvasLoad = useCallback(() => {
    canvasLoadsRef.current = Math.max(0, canvasLoadsRef.current - 1);
    if (canvasLoadsRef.current === 0) {
      useProjectStore.getState().setCanvasLoading(false);
    }
  }, []);

  const {
    selectedFormat,
    editorZoom,
    pasteboardPx,
    labelDesign,
    loadRevision,
    setCanvasJSON,
    setEditorZoom,
    setEditorCanvas,
  } = useProjectStore();

  // Формат и зум применяются эффектом ниже, ПОСЛЕ инициализации холста:
  // applyCanvasGeometry работает с живым экземпляром fabric.

  // Превью вставленных PDF — растр фиксированной плотности, поэтому при
  // увеличении зума страница дорисована резче (дебаунс: не рендерим на каждый
  // шаг зума). Физический размер объектов в мм при этом не меняется.
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;
    const timer = window.setTimeout(() => {
      void refreshPdfPreviews(canvas, editorZoom);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [editorZoom, loadRevision]);

  // Инициализация канваса
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new Canvas(canvasRef.current, {
      // Фон прозрачный: белый лист этикетки и серая рабочая зона — DOM-слои
      // под холстом (см. App), а объекты за краем рисуются поверх зоны.
      preserveObjectStacking: true,
    });

    // Новый холст — геометрию (размер этикетки + рабочая зона) применяем заново.
    geometryRef.current = '';

    fabricCanvasRef.current = canvas;
    
    // Экспортируем canvas для доступа из других компонентов
    (window as any).__fabricCanvas = canvas;
    
    // Сохраняем canvas в store для предпросмотра
    setEditorCanvas(canvas);

    // Фрейм текста: масштаб уходит в ШИРИНУ рамки, кегль не меняется.
    //
    // Раньше любой ресайз текста превращался в кегль (scaleX/scaleY → fontSize),
    // поэтому «размер рамки» и «размер текста» были одним и тем же, и рамку
    // нельзя было ни растянуть, ни сузить. Теперь потянутая ручка меняет ширину
    // переноса, а кегль правится только в панели «Текст».
    //
    // Считаем на живом событии object:scaling, а не только на object:modified:
    // иначе во время перетаскивания текст растягивался бы и «прыгал» в конце.
    const handleFrameScaling = (e: any) => {
      const target = e?.target;
      // Только готовый фрейм: конвертация IText подменяет объект на холсте, а
      // внутри трансформации это ломает перетаскивание (fabric держит ссылку на
      // удаляемый объект). Старые IText переводятся во фреймы при загрузке.
      if (target?.type !== 'textbox') return;

      const action = e?.transform?.action;
      // 'scaleX'/'scaleY' — боковые ручки и верх/низ, 'scale' — углы. Любое из
      // них меняет РАЗМЕР РАМКИ: масштаб сворачивается в width/frameHeight.
      if (action !== 'scaleX' && action !== 'scaleY' && action !== 'scale') return;

      applyFrameScale(target);
    };
    canvas.on('object:scaling', handleFrameScaling);

    // Рабочая зона вокруг этикетки: пересчитываем её после каждой отрисовки
    // холста (с задержкой). `after:render` — единственная точка, покрывающая
    // все причины: drag, тягу за ручки, правку текста, кегль из панели,
    // добавление/удаление объектов, загрузку, undo/redo и зум. Собственного
    // рендера здесь не происходит, поэтому рекурсии нет: следующий вызов
    // увидит тот же размер и ничего не изменит.
    canvas.on('after:render', scheduleGeometrySync);

    // Пока кнопка мыши зажата, пересчёт рабочей зоны откладывается: смена
    // размера холста посреди жеста сдвинула бы координату под курсором.
    const handlePointerDown = () => {
      pointerDownRef.current = true;
    };
    const handlePointerUp = () => {
      pointerDownRef.current = false;
      scheduleGeometrySync();
    };
    canvas.on('mouse:down', handlePointerDown);
    canvas.on('mouse:up', handlePointerUp);

    // Рамка обязана помнить собственную высоту: fabric пересчитывает height из
    // содержимого при каждой правке текста и каждом переносе строк. Поэтому
    // после такого пересчёта возвращаем высоту рамки и обрезку — но верхний край
    // оставляем там, где он был до нажатия. Без этого у рамки с ручной высотой
    // каждое нажатие сдвигало её на половину разницы «содержимое − рамка»: при
    // рамке выше текста она уезжала вверх, при рамке ниже — вниз.
    const handleFrameTextChanged = (e: any) => {
      if (e?.target?.type !== 'textbox') return;
      syncFrameGeometryKeepingTop(e.target);
    };
    canvas.on('text:changed', handleFrameTextChanged);

    // Страховка на отпускание: если масштаб всё же остался (программный ресайз,
    // загрузка чужого проекта) — свернуть его в размеры рамки.
    const normalizeTextScale = (obj: any) => {
      if (obj?.type !== 'textbox') return;
      applyFrameScale(obj);
      syncFrameGeometry(obj);
    };

    // Обработчики событий для сохранения состояния
    const handleModification = (e?: any) => {
      if (!fabricCanvasRef.current || isHistorySuspended()) return;
      const target = e?.target;
      if (target) {
        useProjectStore.getState().setSelectedObject(target);
      }
      setCanvasJSON(serializeCanvas(canvas));
    };

    // Скрытие средних точек масштабирования — используем модульную функцию hideMiddleControls

    canvas.on('object:added', (e: any) => {
      if (e.target) hideMiddleControls(e.target);
      handleModification(e);
    });
    canvas.on('object:modified', (e: any) => {
      if (e.target) normalizeTextScale(e.target);
      // bumpObjectRevision вызываем ВСЕГДА (не зависит от istHistorySuspended)
      // чтобы TextPanel всегда обновлялся
      useProjectStore.getState().bumpObjectRevision();
      handleModification(e);
      setGuideLines([]);
    });
    // Удаление нельзя вести через handleModification: fabric поднимает
    // selection:cleared РАНЬШЕ object:removed, поэтому порядок такой —
    //   1) selection:cleared → selectedObject = null
    //   2) object:removed    → handleModification(e) записал бы в selectedObject
    //                          уже удалённый объект
    // Панели свойств (TextPanel, Image/Barcode-панели) оставались бы привязаны к
    // объекту, которого нет на канвасе, и показывали бы его свойства до тех пор,
    // пока пользователь не выделит что-то другое. Здесь выделение только
    // сбрасываем, а canvasJSON обновляем — удаление обязано попасть в историю.
    const handleObjectRemoved = (e: any) => {
      if (!fabricCanvasRef.current || isHistorySuspended()) return;
      const removed = e?.target;
      const store = useProjectStore.getState();
      if (removed && store.selectedObject === removed) {
        store.setSelectedObject(null);
      }
      setCanvasJSON(serializeCanvas(canvas));
    };
    canvas.on('object:removed', handleObjectRemoved);

    // ── Порог случайного сдвига ────────────────────────────────────────────
    // Мышь задевает объект на 1–2 px при обычном клике, и содержимое уезжает.
    // Пока смещение меньше порога, объект возвращается на место: сдвиг требует
    // осознанного жеста. Значение в пикселях сцены — при базовом масштабе 96 dpi
    // 3 px ≈ 0.8 мм, заметно меньше любого осмысленного перемещения.
    const DRAG_THRESHOLD_PX = 3;
    let dragStart: { obj: any; left: number; top: number } | null = null;
    let dragArmed = false;

    // ── Alt+drag: дублирование объекта ─────────────────────────────────────
    // cloneRef хранит готовый клон между mouse:down и первым object:moving
    let cloneRef: any = null;
    let altDragDone = false; // swap выполнен — не повторять

    canvas.on('mouse:down', (opt: any) => {
      cloneRef = null;
      altDragDone = false;
      dragArmed = false;
      const target = opt.target as any;
      dragStart = target ? { obj: target, left: target.left ?? 0, top: target.top ?? 0 } : null;
      const e = opt.e as MouseEvent;
      if (!e.altKey) return;
      const active = canvas.getActiveObject();
      if (!active) return;
      // Клонируем асинхронно — к моменту первого object:moving клон уже готов
      active.clone().then((cl: any) => {
        // Клон встаёт ровно на место оригинала
        cl.set({ left: active.left, top: active.top });
        cl.setCoords();
        cloneRef = cl;
      });
    });

    // ── Smart Guides: snap при перемещении ─────────────────────────────────
    canvas.on('object:moving', (e: any) => {
      const target = e.target;
      if (!target) return;

      // Случайное касание: пока смещение меньше порога, объект стоит на месте.
      // Проверка идёт ДО Alt+drag и направляющих — иначе клон создавался бы от
      // простого клика с дрожанием руки.
      if (dragStart && !dragArmed && dragStart.obj === target) {
        const dx = (target.left ?? 0) - dragStart.left;
        const dy = (target.top ?? 0) - dragStart.top;
        if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
          target.set({ left: dragStart.left, top: dragStart.top });
          target.setCoords();
          return;
        }
        dragArmed = true;
      }

      // Alt+drag: при первом движении добавляем клон вместо оригинала
      if (cloneRef && !altDragDone) {
        altDragDone = true;
        const clone = cloneRef;
        cloneRef = null;

        // Добавляем клон (он остаётся на исходной позиции)
        withoutHistory(() => {
          canvas.add(clone);
          hideMiddleControls(clone);
        });
        // Сохраняем клон в истории как новый объект
        setCanvasJSON(serializeCanvas(canvas));
      }

      const { guides, deltaX, deltaY } = calcSnapGuides(canvas, target);

      // Применяем snap-смещение
      if (deltaX !== 0 || deltaY !== 0) {
        target.set({
          left: (target.left ?? 0) + deltaX,
          top: (target.top ?? 0) + deltaY,
        });
        target.setCoords();
      }

      setGuideLines(prev => (sameGuides(prev, guides) ? prev : guides));
    });

    // Скрываем направляющие при завершении перемещения
    canvas.on('mouse:up', () => {
      cloneRef = null;
      altDragDone = false;
      dragStart = null;
      dragArmed = false;
      setGuideLines([]);
    });

    // Обработчик выбора объекта
    canvas.on('selection:created', (e: any) => {
      const selected = e.selected?.[0];
      if (selected) {
        useProjectStore.getState().setSelectedObject(selected);
      }
    });

    canvas.on('selection:updated', (e: any) => {
      const selected = e.selected?.[0];
      if (selected) {
        useProjectStore.getState().setSelectedObject(selected);
      }
    });

    canvas.on('selection:cleared', () => {
      useProjectStore.getState().setSelectedObject(null);
    });

    // Обработчик изменения выделения текста (для IText)
    canvas.on('text:selection:changed', (e: any) => {
      const textObj = e.target;
      if (textObj) {
        // Обновляем selectedObject чтобы TextPanel знал об изменении выделения
        useProjectStore.getState().setSelectedObject(textObj);
      }
    });

    // ── Delete / Backspace: удаление выбранного объекта ────────────────────
    const handleKeyDelete = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;

      // Не удаляем если фокус в input/textarea (браузерное поле ввода)
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      // Не удаляем если fabric редактирует текст (курсор внутри IText/Textbox)
      const active = canvas.getActiveObject() as any;
      if (!active) return;
      if (active.isEditing) return;

      e.preventDefault();
      canvas.remove(active);
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    };

    window.addEventListener('keydown', handleKeyDelete);

    // ── Стрелки: перемещение выбранного объекта с клавиатуры ───────────────
    // Шаг — 1 px сцены (базовые координаты 96 dpi, ≈0.26 мм), Shift — 10 px.
    const NUDGE_STEP = 1;
    const NUDGE_STEP_SHIFT = 10;
    // Удержание стрелки даёт автоповтор ОС: писать историю на каждый пиксель
    // нельзя — undo-стек (50 шагов) выгорает за одно удержание клавиши.
    // Поэтому серия сдвигов пишется в историю один раз, в конце серии.
    const NUDGE_FLUSH_DELAY = 400;
    let nudgeTimer: ReturnType<typeof setTimeout> | null = null;

    // Фиксация результата серии сдвигов. Нужна не только для undo: canvasJSON —
    // это и есть сохраняемое состояние проекта, поэтому незафиксированный сдвиг
    // не попал бы ни в автосохранение, ни в файл проекта.
    const flushNudgeHistory = () => {
      if (nudgeTimer === null) return;
      clearTimeout(nudgeTimer);
      nudgeTimer = null;
      const c = fabricCanvasRef.current;
      if (!c) return;
      setCanvasJSON(serializeCanvas(c));
    };

    /** Холст перекрыт модалкой или поповером — двигать «вслепую» нельзя. */
    const isCanvasCovered = (): boolean => {
      const el = canvas.upperCanvasEl as HTMLCanvasElement | undefined;
      if (!el || typeof document.elementFromPoint !== 'function') return false;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return false;

      // Проверяем центр ВИДИМОЙ части холста, а не всего холста: при сильном
      // увеличении (до 1000%) центр холста уходит за пределы вьюпорта, и
      // проверка по нему возвращала бы null — модалка поверх холста осталась бы
      // незамеченной, и объект уехал бы «за» окном предпросмотра.
      const left = Math.max(r.left, 0);
      const top = Math.max(r.top, 0);
      const right = Math.min(r.right, window.innerWidth);
      const bottom = Math.min(r.bottom, window.innerHeight);
      // Видимой части нет — холст вне экрана, двигать нечего.
      if (right <= left || bottom <= top) return true;

      const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
      // null — hit-test недоступен в этой точке; не мешаем работе.
      if (!hit) return false;

      // Свой холст и его fabric-обёртка (canvas-container) — это не перекрытие.
      // Сравниваем именно с обёрткой, а не с «любым предком»: предком является и
      // <body>, поэтому проверка вида `!hit.contains(el)` сочла бы перекрытием
      // любой посторонний элемент и молча отключила бы стрелки.
      const wrapper = el.parentElement;
      if (hit === el || hit === wrapper || hit.parentElement === wrapper) return false;

      // body/html означают, что холста в этой точке геометрически нет — судить о
      // перекрытии не по чему. Намеренно НЕ блокируем: ложное «перекрыто» тихо
      // ломает стрелки, а ложное «свободно» лишь сдвинет объект (отменяется Ctrl+Z).
      if (hit === document.body || hit === document.documentElement) return false;

      return true;
    };

    const handleKeyNudge = (e: KeyboardEvent) => {
      // Любая не-стрелка завершает серию: результат попадает в историю до того,
      // как сработает Ctrl+Z/Ctrl+Y или другое действие — иначе отложенная
      // запись перезаписала бы состояние уже после отката.
      if (!e.key.startsWith('Arrow')) {
        flushNudgeHistory();
        return;
      }

      // Ctrl/Alt/Meta+стрелка — не наши комбинации (браузерные жесты, выделение)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Фокус в поле ввода: стрелки двигают курсор, а не объект
      const activeEl = document.activeElement as HTMLElement | null;
      const tag = activeEl?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || activeEl?.isContentEditable) {
        return;
      }

      if (isCanvasCovered()) return;

      const active = canvas.getActiveObject() as any;
      if (!active) return;
      // Режим ввода текста: стрелки — навигация по символам
      if (active.isEditing) return;
      // Заблокированный слой: мышью он не двигается (evented=false) — с
      // клавиатуры тоже не должен. Закреплённая позиция — то же самое.
      if (active.locked || active.positionLocked) return;

      e.preventDefault();

      const step = e.shiftKey ? NUDGE_STEP_SHIFT : NUDGE_STEP;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;

      // Мультивыделение двигаем как единое целое. У детей внутри
      // ActiveSelection left/top относительны группы (fabric v7), поэтому сдвиг
      // самих детей дал бы дрейф и разъехавшуюся рамку выделения.
      active.set({
        left: (active.left ?? 0) + dx,
        top: (active.top ?? 0) + dy,
      });
      active.setCoords();
      canvas.requestRenderAll();

      // Панели свойств читают позицию через objectRevision. Событие
      // object:modified здесь не поднимаем намеренно: его обработчик сразу
      // вызвал бы setCanvasJSON и обесценил склейку серии сдвигов.
      useProjectStore.getState().bumpObjectRevision();

      if (nudgeTimer !== null) clearTimeout(nudgeTimer);
      nudgeTimer = setTimeout(flushNudgeHistory, NUDGE_FLUSH_DELAY);
    };

    // Начало перетаскивания мышью завершает серию сдвигов
    const handleNudgeMouseDown = () => flushNudgeHistory();
    // Потеря фокуса окна — тоже конец серии (иначе сдвиг останется вне истории)
    const handleNudgeBlur = () => flushNudgeHistory();

    // Слушатель — в фазе перехвата (capture). Это принципиально: фиксация
    // серии сдвигов обязана произойти ДО обработчиков Ctrl+Z/Ctrl+Y, иначе undo
    // отработает по устаревшей истории, а отложенная запись допишется уже после
    // отката. Перехват выполняется раньше любых bubble-слушателей независимо от
    // порядка их регистрации, поэтому результат не зависит от порядка монтирования.
    window.addEventListener('keydown', handleKeyNudge, true);
    canvas.on('mouse:down', handleNudgeMouseDown);
    window.addEventListener('blur', handleNudgeBlur);

    // ── Вставка текста из буфера обмена ────────────────────────────────────
    // Штатный путь fabric (двойной клик по тексту → Ctrl+V) вставляет текст в
    // скрытую textarea и НЕ переносит строки: длинная строка уезжает за край
    // этикетки. Здесь после вставки текст подгоняется под формат: перенос по
    // строкам, уменьшение кегля, сдвиг по направлению выравнивания абзаца.
    //
    // ВАЖНО: скрытая textarea fabric — обычный <textarea data-fabric="textarea">,
    // который fabric приклеивает к document.body и фокусирует в режиме ввода.
    // То есть в момент вставки document.activeElement — это textarea, и наивная
    // проверка «фокус в поле ввода → пропустить» отключала бы обработчик ровно
    // там, где он нужен. Пропускаем только ЧУЖИЕ поля (панель «Текст»).
    const isForeignInputField = (el: HTMLElement | null): boolean => {
      if (!el) return false;
      const isField = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
      if (!isField) return false;
      return el.getAttribute('data-fabric') !== 'textarea';
    };

    // ── Копирование и вырезание объектов ───────────────────────────────────
    // Слушаем события `copy`/`cut`, а не keydown: только здесь браузер даёт
    // записать в системный буфер без разрешений и без промисов. Объекты при
    // этом кладутся в буфер приложения (objectClipboard), поэтому переключение
    // вкладки их не теряет — холст перезагружается, а модуль живёт.
    //
    // Ctrl+C не наш, когда: идёт правка текста в объекте, выделен текст на
    // странице (справка, подписи), фокус в поле панели, холст закрыт модалкой.
    const isCanvasCopyContext = (): boolean => {
      const active = canvas.getActiveObject() as any;
      if (!active || active.isEditing) return false;
      if (isForeignInputField(document.activeElement as HTMLElement | null)) return false;
      if ((window.getSelection()?.toString() ?? '').trim()) return false;
      return !isCanvasCovered();
    };

    const handleClipboardCut = (mode: 'copy' | 'cut') => (e: ClipboardEvent) => {
      if (!isCanvasCopyContext()) return;
      if (!copySelectionToClipboard(canvas, e.clipboardData, mode)) return;
      e.preventDefault();
    };

    const handleCopy = handleClipboardCut('copy');
    const handleCut = handleClipboardCut('cut');

    document.addEventListener('copy', handleCopy);
    document.addEventListener('cut', handleCut);

    /**
     * Поле ввода не должно получить метку буфера как текст.
     *
     * В системном буфере после копирования объекта лежит служебная строка
     * (`MEGALABEL-OBJECT-CLIP:…`). Без этого перехвата Ctrl+V в поле названия
     * или в панели «Текст» вставил бы её как обычный текст. Перехват — в фазе
     * захвата: он обязан сработать раньше обработчика вставки самой панели.
     */
    const handleMarkerPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || typeof target.tagName !== 'string') return;
      const isField =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (!isField) return;
      if (!readClipboardToken(e.clipboardData)) return;
      e.preventDefault();
      e.stopPropagation();
    };

    document.addEventListener('paste', handleMarkerPaste, true);

    const handlePaste = (e: ClipboardEvent) => {
      if (isForeignInputField(document.activeElement as HTMLElement | null)) return;

      // Объект, скопированный в приложении (в том числе в другой вкладке).
      // Метка — единственный признак: в буфере лежит служебная строка, и
      // вставлять её на этикетку текстом нельзя ни в каком случае.
      const token = readClipboardToken(e.clipboardData);
      if (token) {
        e.preventDefault();
        const entry = getClipboardEntry(token);
        // В режиме правки текста объекта клавиша принадлежит тексту: объект в
        // него не вставляем, но и метку в текст не пускаем.
        const editing = (canvas.getActiveObject() as any)?.isEditing;
        // Холст закрыт модалкой (предпросмотр, справка) — вставка относилась бы
        // к ней, а не к этикетке: объект появился бы «за» окном.
        if (entry && !editing && !isCanvasCovered()) {
          void pasteObjectsFromClipboard(canvas, entry);
        }
        return;
      }

      const active = canvas.getActiveObject() as any;
      const isTextField = !!active && (active.type === 'i-text' || active.type === 'textbox');

      const clip = e.clipboardData?.getData('text/plain') ?? '';
      if (!clip.trim()) return;

      const fragment = sanitizePastedFragment(clip);
      if (!fragment) return;

      const applyFit = (obj: any) => {
        const c = fabricCanvasRef.current;
        if (!c) return;

        const result = fitTextToLabel(obj, fitOptionsFromStore());
        c.requestRenderAll();
        useProjectStore.getState().setSelectedObject(result.object);
        useProjectStore.getState().bumpObjectRevision();
        setCanvasJSON(serializeCanvas(c));

        if (result.overflow) {
          alert('Текст не помещается в этикетку: кегль уменьшен до минимального');
        }
      };

      if (!isTextField) {
        // Выделен не текст (например, изображение) — вставку не подменяем.
        if (active) return;

        // Ничего не выделено: создаём текстовый блок из буфера. Раньше Ctrl+V в
        // этом состоянии не делал ничего, и вставка «не работала» именно так.
        // Добавление идёт без записи в историю, чтобы в undo попало одно действие
        // — вставка целиком, а не «добавление объекта» и «подгонка» отдельно.
        const state = useProjectStore.getState();
        const inset = mmToPx(state.sheetSettings.safetyMargin_mm > 0 ? state.sheetSettings.safetyMargin_mm : 1);
        // Стартовая ширина — та же доля безопасной зоны, что и в подгонке
        // (COMPACT_WIDTH_RATIO): новая рамка не должна начинаться «во всю
        // этикетку», иначе её невозможно сдвинуть вбок.
        const zoneWidth = Math.max(8, mmToPx(state.selectedFormat.width_mm) - inset * 2);
        const initialWidth = Math.max(32, zoneWidth * COMPACT_WIDTH_RATIO);
        // Блок встаёт в центр этикетки, как и при добавлении через панель:
        // левый верхний угол читался как «уехавший за край» блок. Размер сцены
        // берём без рабочей зоны (sceneWidth): иначе центр считался бы по всему
        // холсту и блок встал бы за краем этикетки.
        const textbox = new Textbox(fragment, {
          left: sceneWidth(canvas) / 2,
          top: sceneHeight(canvas) / 2,
          originX: 'center',
          originY: 'center',
          width: initialWidth,
          fontSize: 14,
          fontFamily: 'Roboto Condensed',
          fill: '#000000',
        });
        (textbox as any).frameAutoHeight = true;
        syncFrameGeometry(textbox);
        hideMiddleControls(textbox);

        withoutHistory(() => {
          canvas.add(textbox);
          canvas.setActiveObject(textbox);
        });

        applyFit(textbox);
        return;
      }

      /** Дописать фрагмент в место курсора — если fabric вставку не подхватил. */
      const insertFragment = (obj: any) => {
        const current = obj.text ?? '';
        const start = obj.selectionStart ?? current.length;
        const end = obj.selectionEnd ?? start;
        obj.set('text', current.slice(0, start) + fragment + current.slice(end));
        obj.selectionStart = start + fragment.length;
        obj.selectionEnd = start + fragment.length;
      };

      whenPastedTextInserted({
        readText: () => {
          const c = fabricCanvasRef.current;
          const obj = c?.getActiveObject() as any;
          if (!obj || (obj.type !== 'i-text' && obj.type !== 'textbox')) return null;
          return String(obj.text ?? '');
        },
        fragment,
        onInserted: () => {
          const obj = fabricCanvasRef.current?.getActiveObject() as any;
          if (!obj) return;
          const normalized = normalizeText(obj.text ?? '');
          if (normalized !== obj.text) obj.set('text', normalized);
          applyFit(obj);
        },
        onMissing: () => {
          const obj = fabricCanvasRef.current?.getActiveObject() as any;
          if (!obj) return;
          // Объект выделен, но не в режиме ввода — fabric вставку не обрабатывает,
          // поэтому текст дописываем сами: «вставить в элемент» работает и без
          // двойного клика.
          if (obj.isEditing) insertFragment(obj);
          else obj.set('text', obj.text ? `${obj.text}\n${fragment}` : fragment);
          applyFit(obj);
        },
      });
    };

    document.addEventListener('paste', handlePaste);

    // Загрузка сохранённого состояния (при первичном монтировании)
    let disposed = false;
    const loadSavedState = async () => {
      beginCanvasLoad();
      try {
        await applyStateToCanvas(canvas, labelDesign.canvasJSON || {});
      } finally {
        endCanvasLoad();
      }
      if (disposed) return;
      // Скрываем средние точки для всех уже загруженных объектов
      canvas.getObjects().forEach(hideMiddleControls);
      canvas.requestRenderAll();
      // Состояние фактически применено — предпросмотр может строить лист
      useProjectStore.getState().bumpCanvasContentRevision();
    };

    loadSavedState();
    return () => {
      disposed = true;
      // Незафиксированная серия сдвигов должна попасть в историю и в
      // canvasJSON до размонтирования, иначе последний сдвиг потеряется.
      flushNudgeHistory();
      // Пересчёт рабочей зоны идёт по таймеру «после отрисовки»: снимаем
      // подписку и гасим таймер, иначе он дёрнет уже уничтоженный холст.
      canvas.off('after:render', scheduleGeometrySync);
      canvas.off('mouse:down', handlePointerDown);
      canvas.off('mouse:up', handlePointerUp);
      if (geometryTimerRef.current !== null) {
        window.clearTimeout(geometryTimerRef.current);
        geometryTimerRef.current = null;
      }
      window.removeEventListener('keydown', handleKeyDelete);
      window.removeEventListener('keydown', handleKeyNudge, true);
      window.removeEventListener('blur', handleNudgeBlur);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('cut', handleCut);
      document.removeEventListener('paste', handleMarkerPaste, true);
      canvas.off('mouse:down', handleNudgeMouseDown);
      canvas.dispose();
      setEditorCanvas(null);
    };
  }, []);

  // Перезагрузка канваса при внешней загрузке проекта (из файла или автосохранения).
  // setCanvasJSON не меняет loadRevision, поэтому циклических перезагрузок не возникает.
  const prevLoadRevisionRef = useRef(loadRevision);
  useEffect(() => {
    const prev = prevLoadRevisionRef.current;
    prevLoadRevisionRef.current = loadRevision;
    // Первый запуск пропускаем: начальное состояние уже применил init-эффект
    if (loadRevision === prev) return;

    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const design = useProjectStore.getState().labelDesign;
    const revisionAtStart = loadRevision;
    // С этого момента и до конца загрузки холст не считается источником истины
    // для сохранения и автосохранения (см. collectProjectState).
    beginCanvasLoad();
    applyStateToCanvas(canvas, design.canvasJSON || {}).then(() => {
      // Если во время асинхронной загрузки началась другая загрузка — канвас не трогаем
      if (useProjectStore.getState().loadRevision !== revisionAtStart) return;
      const c = fabricCanvasRef.current;
      if (!c) return;
      // Скрываем средние точки для всех загруженных объектов
      c.getObjects().forEach(hideMiddleControls);
      c.discardActiveObject();
      c.requestRenderAll();
      // Состояние вкладки фактически применено — предпросмотр может строить лист
      useProjectStore.getState().bumpCanvasContentRevision();
    })
      .catch(error => {
        // Битая этикетка не должна оставлять холст «вечно загружающимся»:
        // флаг снимается в finally, но молчать об ошибке нельзя.
        console.error('Не удалось применить состояние к холсту:', error);
      })
      .finally(() => {
        endCanvasLoad();
      });
  }, [loadRevision]);

  // Формат и зум: сцена всегда в базовых координатах (96 dpi), масштаб — через
  // viewportTransform, а вокруг этикетки — рабочая зона. Эффект объявлен после
  // инициализации холста, чтобы к первому вызову экземпляр fabric уже был.
  useEffect(() => {
    applyCanvasGeometry();
  }, [applyCanvasGeometry, selectedFormat, editorZoom]);

  // Обработчик колеса мыши для зума
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    const DEFAULT_ZOOM = 2.0;
    const handleWheel = (opt: any) => {
      const e = opt.e as WheelEvent;
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY;
        let newZoom = editorZoom;
        
        if (delta > 0) {
          // Уменьшение — не ниже дефолта
          newZoom = Math.max(DEFAULT_ZOOM, editorZoom - 0.1);
        } else {
          // Увеличение — до 10x
          newZoom = Math.min(10.0, editorZoom + 0.1);
        }
        
        setEditorZoom(newZoom);
      }
    };

    canvas.on('mouse:wheel', handleWheel);

    return () => {
      canvas.off('mouse:wheel', handleWheel);
    };
  }, [editorZoom, setEditorZoom]);

  // Обработчики зума здесь не объявляются: зум живёт в App.tsx (тулбар) и
  // PreviewModal.tsx (окно предпросмотра). Локальные копии были объявлены, но
  // ни к чему не подключены.

  // Размеры холста в пикселях (этикетка + рабочая зона) для рендера направляющих.
  // Сами направляющие живут в координатах этикетки, поэтому сдвигаются на поле.
  const canvasPxW = mmToPx(selectedFormat.width_mm) * editorZoom + pasteboardPx * 2;
  const canvasPxH = mmToPx(selectedFormat.height_mm) * editorZoom + pasteboardPx * 2;

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
      />

      {/* Динамические направляющие (smart guides).
          Контейнер смонтирован всегда, а не условно: смена числа React-соседей
          <canvas> заставляет React вставлять/удалять узлы рядом с элементом,
          который fabric переносит в свою обёртку (см. комментарий в App.tsx).
          Показываем и прячем только содержимое SVG. */}
      <svg
        className="absolute inset-0 pointer-events-none"
        width={canvasPxW}
        height={canvasPxH}
        style={{ zIndex: 20, display: guideLines.length > 0 ? undefined : 'none' }}
        aria-hidden="true"
      >
        {guideLines.map((guide, i) =>
          guide.orientation === 'v' ? (
            // Вертикальная направляющая: x = поле + pos * zoom
            <line
              key={`v${i}`}
              x1={pasteboardPx + guide.pos * editorZoom}
              y1={0}
              x2={pasteboardPx + guide.pos * editorZoom}
              y2={canvasPxH}
              stroke="#3b82f6"
              strokeWidth={1}
              strokeDasharray="4 3"
              opacity={0.85}
            />
          ) : (
            // Горизонтальная направляющая: y = поле + pos * zoom
            <line
              key={`h${i}`}
              x1={0}
              y1={pasteboardPx + guide.pos * editorZoom}
              x2={canvasPxW}
              y2={pasteboardPx + guide.pos * editorZoom}
              stroke="#3b82f6"
              strokeWidth={1}
              strokeDasharray="4 3"
              opacity={0.85}
            />
          )
        )}
      </svg>
    </>
  );
}
