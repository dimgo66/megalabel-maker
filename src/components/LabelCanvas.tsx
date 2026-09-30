import { useEffect, useRef, useCallback } from 'react';
import { Canvas } from 'fabric';
import { useProjectStore } from '../store/useProjectStore';
import { mmToPx } from '../utils/layoutCalculator';
import { buildBarcodeGroup } from '../utils/barcodeObjectFactory';

export function LabelCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);

  const {
    selectedFormat,
    sheetSettings,
    editorZoom,
    labelDesign,
    setCanvasJSON,
    setEditorZoom,
    setEditorCanvas,
  } = useProjectStore();



  // Обновление размера канваса при изменении формата или зума
  const updateCanvasSize = useCallback(() => {
    if (!fabricCanvasRef.current) return;

    const canvas = fabricCanvasRef.current;
    const displayWidth = mmToPx(selectedFormat.width_mm) * editorZoom;
    const displayHeight = mmToPx(selectedFormat.height_mm) * editorZoom;

    // Для Retina дисплеев
    const dpr = window.devicePixelRatio || 1;

    // Устанавливаем физический размер (device pixels)
    canvas.setDimensions({
      width: displayWidth * dpr,
      height: displayHeight * dpr,
    }, { cssOnly: false });

    // Устанавливаем CSS размер (logical pixels)
    if (canvas.wrapperEl) {
      canvas.wrapperEl.style.width = `${displayWidth}px`;
      canvas.wrapperEl.style.height = `${displayHeight}px`;
      
      // Для круглых этикеток применяем clip-path
      if (selectedFormat.shape === 'circle') {
        canvas.wrapperEl.style.borderRadius = '50%';
        canvas.wrapperEl.style.overflow = 'hidden';
      } else {
        canvas.wrapperEl.style.borderRadius = '0';
      }
    }

    // Масштабируем контекст для Retina
    const ctx = canvas.getContext();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    canvas.renderAll();
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

    // Обработчики событий для сохранения состояния
    const handleModification = () => {
      if (!fabricCanvasRef.current) return;
      const json = canvas.toJSON();
      // Убираем safeArea из сериализации
      let objects = json.objects?.filter((obj: any) => obj.name !== 'safeArea');
      
      // Добавляем кастомные свойства штрихкода в JSON
      if (objects) {
        objects = objects.map((obj: any) => {
          if (obj.barcodeNorm) {
            return {
              ...obj,
              barcodeFormat: obj.barcodeFormat,
              barcodeValue: obj.barcodeValue,
              barcodeNorm: obj.barcodeNorm, // ЕДИНЫЙ источник истины
            };
          }
          return obj;
        });
      }
      
      json.objects = objects;
      setCanvasJSON(json);
    };

    canvas.on('object:added', handleModification);
    canvas.on('object:modified', handleModification);
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

    // Загрузка сохранённого состояния с миграцией штрих-кодов
    const loadSavedState = async () => {
      if (labelDesign.canvasJSON && Object.keys(labelDesign.canvasJSON).length > 0) {
        await canvas.loadFromJSON(labelDesign.canvasJSON as any);
        
        // Миграция: пересоздаём старые штрих-коды (без barcodeNorm) через фабрику
        const objects = canvas.getObjects();
        const oldBarcodeObjects = objects.filter((obj: any) => 
          obj.barcodeValue && obj.barcodeFormat && !obj.barcodeNorm
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
            canvas.remove(oldObj);
            canvas.add(newGroup);
          }
          
          canvas.renderAll();
        }
      }
    };

    loadSavedState();
    return () => {
      canvas.dispose();
      setEditorCanvas(null);
    };
  }, []);

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
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
    />
  );
}
