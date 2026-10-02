import { useEffect, useRef, useCallback, useState } from 'react';
import { Canvas } from 'fabric';
import { useProjectStore } from '../store/useProjectStore';
import { mmToPx } from '../utils/layoutCalculator';
import { buildBarcodeGroup } from '../utils/barcodeObjectFactory';
import { BARCODE_NORM_VERSION } from '../utils/barcodeGenerator';
import { serializeCanvas, isHistorySuspended, withoutHistory } from '../utils/canvasHelpers';

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

export function LabelCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);

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

    canvas.on('object:added', handleModification);
    canvas.on('object:modified', (e: any) => {
      if (e.target) normalizeTextScale(e.target);
      // bumpObjectRevision вызываем ВСЕГДА (не зависит от istHistorySuspended)
      // чтобы TextPanel всегда обновлялся
      useProjectStore.getState().bumpObjectRevision();
      handleModification(e);
    });
    canvas.on('object:removed', handleModification);

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

    // Загрузка сохранённого состояния (при первичном монтировании)
    let disposed = false;
    const loadSavedState = async () => {
      await applyStateToCanvas(canvas, labelDesign.canvasJSON || {});
      if (disposed) return;
      canvas.requestRenderAll();
    };

    loadSavedState();
    return () => {
      disposed = true;
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

    const handleWheel = (opt: any) => {
      const e = opt.e as WheelEvent;
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY;
        let newZoom = editorZoom;
        
        if (delta > 0) {
          newZoom = Math.max(0.5, editorZoom - 0.1);
        } else {
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

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
      />
    </>
  );
}
