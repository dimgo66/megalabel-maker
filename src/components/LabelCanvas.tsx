import { useEffect, useRef, useCallback, useState } from 'react';
import { Canvas } from 'fabric';
import { useProjectStore } from '../store/useProjectStore';
import { mmToPx } from '../utils/layoutCalculator';
import { buildBarcodeGroup } from '../utils/barcodeObjectFactory';
import { BARCODE_NORM_VERSION } from '../utils/barcodeGenerator';
import { serializeCanvas, isHistorySuspended, withoutHistory } from '../utils/canvasHelpers';
import { calcSnapGuides, sameGuides, type GuideLine } from '../utils/smartGuides';

/**
 * Применяет сериализованное состояние к канвасу и мигрирует устаревшие штрих-коды.
 * Используется при первичной загрузке и при загрузке проекта из файла/автосохранения.
 */
async function applyStateToCanvas(c: Canvas, json: object): Promise<void> {
  if (!json || Object.keys(json).length === 0) {
    // Пустое состояние: очищаем канвас (для «нового проекта»)
    await withoutHistory(() => c.clear());
    c.backgroundColor = '#FFFFFF';
    c.requestRenderAll();
    return;
  }

  await withoutHistory(() => c.loadFromJSON(json as any));

  // Миграция: пересоздаём старые штрих-коды (без barcodeNorm или с устаревшей геометрией)
  const objects = c.getObjects();
  const oldBarcodeObjects = objects.filter((obj: any) =>
    obj.barcodeValue && obj.barcodeFormat &&
    (!obj.barcodeNorm || obj.barcodeNorm.version !== BARCODE_NORM_VERSION)
  );

  if (oldBarcodeObjects.length > 0) {
    console.log(`Миграция: пересоздаём ${oldBarcodeObjects.length} старых штрих-кодов через фабрику`);

    for (const oldObj of oldBarcodeObjects) {
      const oldAny = oldObj as any;
      const format = oldAny.barcodeFormat;
      const value = oldAny.barcodeValue;

      if (!format || !value) continue;

      // Сохраняем позицию и трансформации
      const left = oldObj.left || 0;
      const top = oldObj.top || 0;
      const scaleX = oldObj.scaleX || 1;
      const scaleY = oldObj.scaleY || 1;
      const angle = oldObj.angle || 0;

      // Создаём новый штрих-код через фабрику
      const newGroup = buildBarcodeGroup(value, format);

      // Восстанавливаем позицию и трансформации
      newGroup.set({
        left,
        top,
        scaleX,
        scaleY,
        angle,
      });

      // Заменяем старый объект
      c.remove(oldObj);
      c.add(newGroup);
    }

    c.renderAll();
  }
}

/** Скрывает средние точки масштабирования для текста, изображений и штрих-кодов. */
function hideMiddleControls(obj: any) {
  const t = obj?.type;
  const isBarcode = !!obj?.barcodeValue;
  if (t === 'i-text' || t === 'textbox' || t === 'image' || isBarcode) {
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

  const {
    selectedFormat,
    editorZoom,
    labelDesign,
    loadRevision,
    setCanvasJSON,
    setEditorZoom,
    setEditorCanvas,
  } = useProjectStore();

  // Размер и зум: сцена всегда в базовых координатах (96 dpi), масштаб — через setZoom.
  // Retina-масштабирование fabric делает сам.
  const updateCanvasSize = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    canvas.setDimensions({
      width: mmToPx(selectedFormat.width_mm) * editorZoom,
      height: mmToPx(selectedFormat.height_mm) * editorZoom,
    });
    canvas.setZoom(editorZoom);

    if (canvas.wrapperEl) {
      canvas.wrapperEl.style.borderRadius = selectedFormat.shape === 'circle' ? '50%' : '0';
      canvas.wrapperEl.style.overflow = selectedFormat.shape === 'circle' ? 'hidden' : '';
    }
    canvas.requestRenderAll();
  }, [selectedFormat, editorZoom]);

  // Инициализация канваса
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new Canvas(canvasRef.current, {
      backgroundColor: '#FFFFFF',
      preserveObjectStacking: true,
    });

    fabricCanvasRef.current = canvas;
    
    // Экспортируем canvas для доступа из других компонентов
    (window as any).__fabricCanvas = canvas;
    
    // Сохраняем canvas в store для предпросмотра
    setEditorCanvas(canvas);

    // Нормализация масштаба текстового объекта: переносим scaleX/scaleY в fontSize
    const normalizeTextScale = (obj: any) => {
      if (obj.type !== 'i-text' && obj.type !== 'textbox') return;
      const scaleX = obj.scaleX ?? 1;
      const scaleY = obj.scaleY ?? 1;
      // Если масштаб не единичный — нормализуем
      if (Math.abs(scaleX - 1) > 0.001 || Math.abs(scaleY - 1) > 0.001) {
        const scale = (scaleX + scaleY) / 2;
        const newFontSize = Math.round((obj.fontSize ?? 14) * scale);
        obj.set({
          fontSize: newFontSize,
          scaleX: 1,
          scaleY: 1,
        });
        obj.setCoords();
      }
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

    // ── Alt+drag: дублирование объекта ─────────────────────────────────────
    // cloneRef хранит готовый клон между mouse:down и первым object:moving
    let cloneRef: any = null;
    let altDragDone = false; // swap выполнен — не повторять

    canvas.on('mouse:down', (opt: any) => {
      cloneRef = null;
      altDragDone = false;
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
      // клавиатуры тоже не должен
      if (active.locked) return;

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

    // Загрузка сохранённого состояния (при первичном монтировании)
    let disposed = false;
    const loadSavedState = async () => {
      await applyStateToCanvas(canvas, labelDesign.canvasJSON || {});
      if (disposed) return;
      // Скрываем средние точки для всех уже загруженных объектов
      canvas.getObjects().forEach(hideMiddleControls);
      canvas.requestRenderAll();
    };

    loadSavedState();
    return () => {
      disposed = true;
      // Незафиксированная серия сдвигов должна попасть в историю и в
      // canvasJSON до размонтирования, иначе последний сдвиг потеряется.
      flushNudgeHistory();
      window.removeEventListener('keydown', handleKeyDelete);
      window.removeEventListener('keydown', handleKeyNudge, true);
      window.removeEventListener('blur', handleNudgeBlur);
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
    applyStateToCanvas(canvas, design.canvasJSON || {}).then(() => {
      // Если во время асинхронной загрузки началась другая загрузка — канвас не трогаем
      if (useProjectStore.getState().loadRevision !== revisionAtStart) return;
      const c = fabricCanvasRef.current;
      if (!c) return;
      // Скрываем средние точки для всех загруженных объектов
      c.getObjects().forEach(hideMiddleControls);
      c.discardActiveObject();
      c.requestRenderAll();
    });
  }, [loadRevision]);

  // Обновление размера при изменении формата или зума
  useEffect(() => {
    updateCanvasSize();
  }, [updateCanvasSize]);

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

  // Размеры холста в пикселях (с учётом zoom) для рендера направляющих
  const canvasPxW = mmToPx(selectedFormat.width_mm) * editorZoom;
  const canvasPxH = mmToPx(selectedFormat.height_mm) * editorZoom;

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
            // Вертикальная направляющая (x = pos * zoom)
            <line
              key={`v${i}`}
              x1={guide.pos * editorZoom}
              y1={0}
              x2={guide.pos * editorZoom}
              y2={canvasPxH}
              stroke="#3b82f6"
              strokeWidth={1}
              strokeDasharray="4 3"
              opacity={0.85}
            />
          ) : (
            // Горизонтальная направляющая (y = pos * zoom)
            <line
              key={`h${i}`}
              x1={0}
              y1={guide.pos * editorZoom}
              x2={canvasPxW}
              y2={guide.pos * editorZoom}
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
