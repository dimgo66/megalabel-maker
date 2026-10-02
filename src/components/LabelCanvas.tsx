import { useEffect, useRef, useCallback, useState } from 'react';
import { Canvas } from 'fabric';
import { useProjectStore } from '../store/useProjectStore';
import { mmToPx } from '../utils/layoutCalculator';
import { buildBarcodeGroup } from '../utils/barcodeObjectFactory';
import { BARCODE_NORM_VERSION } from '../utils/barcodeGenerator';
import { serializeCanvas, isHistorySuspended, withoutHistory } from '../utils/canvasHelpers';
import { calcSnapGuides, type GuideLine } from '../utils/smartGuides';

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
    sheetSettings,
    editorZoom,
    labelDesign,
    loadRevision,
    setCanvasJSON,
    setEditorZoom,
    setEditorCanvas,
    selectedObject,
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
    canvas.on('object:removed', handleModification);

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

      setGuideLines(guides);
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
      window.removeEventListener('keydown', handleKeyDelete);
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

  // Обработчики зума
  const handleZoomIn = () => {
    setEditorZoom(Math.min(10.0, editorZoom + 0.25));
  };

  const handleZoomOut = () => {
    setEditorZoom(Math.max(0.5, editorZoom - 0.25));
  };

  const handleFitToScreen = () => {
    // Вписать канвас в доступную область (примерно)
    setEditorZoom(1.5);
  };

  // Размеры холста в пикселях (с учётом zoom) для рендера направляющих
  const canvasPxW = mmToPx(selectedFormat.width_mm) * editorZoom;
  const canvasPxH = mmToPx(selectedFormat.height_mm) * editorZoom;

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
      />

      {/* Динамические направляющие (smart guides) */}
      {guideLines.length > 0 && (
        <svg
          className="absolute inset-0 pointer-events-none"
          width={canvasPxW}
          height={canvasPxH}
          style={{ zIndex: 20 }}
        >
          {guideLines.map((guide, i) =>
            guide.orientation === 'v' ? (
              // Вертикальная направляющая (x = pos * zoom)
              <line
                key={i}
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
                key={i}
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
      )}
    </>
  );
}
