import { useEffect, useRef, useCallback, useState } from 'react';
import { Canvas } from 'fabric';
import { useProjectStore } from '../store/useProjectStore';
import { mmToPx } from '../utils/layoutCalculator';
import { buildBarcodeGroup } from '../utils/barcodeObjectFactory';
import { BarcodeNorm } from '../types';

export function LabelCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const [selectedBarcodeNorm, setSelectedBarcodeNorm] = useState<BarcodeNorm | null>(null);
  const [selectedBarcodePosition, setSelectedBarcodePosition] = useState<{ left: number; top: number; scaleX: number; scaleY: number } | null>(null);
  const [showModuleGrid, setShowModuleGrid] = useState((window as any).__showModuleGrid || false);

  const {
    selectedFormat,
    sheetSettings,
    editorZoom,
    labelDesign,
    setCanvasJSON,
    setEditorZoom,
    setEditorCanvas,
    selectedObject,
  } = useProjectStore();

  // Синхронизация с глобальным состоянием
  useEffect(() => {
    const interval = setInterval(() => {
      const globalValue = (window as any).__showModuleGrid;
      if (globalValue !== showModuleGrid) {
        setShowModuleGrid(globalValue);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [showModuleGrid]);



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

  // Отслеживание выбранного штрих-кода для оверлея
  useEffect(() => {
    if (selectedObject && (selectedObject as any).barcodeNorm) {
      setSelectedBarcodeNorm((selectedObject as any).barcodeNorm);
      setSelectedBarcodePosition({
        left: selectedObject.left || 0,
        top: selectedObject.top || 0,
        scaleX: selectedObject.scaleX || 1,
        scaleY: selectedObject.scaleY || 1,
      });
    } else {
      setSelectedBarcodeNorm(null);
      setSelectedBarcodePosition(null);
    }
  }, [selectedObject]);

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

  // Генерация SVG линий для оверлея
  const renderModuleGridOverlay = () => {
    if (!showModuleGrid || !selectedBarcodeNorm || !selectedBarcodePosition) {
      return null;
    }

    const norm = selectedBarcodeNorm;
    const pos = selectedBarcodePosition;
    const px = norm.pxPerModule * editorZoom;

    // Границы зон защитных штрихов (в модулях)
    const guardZones = [
      { start: 0, end: 3 },
      { start: 45, end: 50 },
      { start: 92, end: 95 },
    ];

    const lines: JSX.Element[] = [];

    // Зелёные линии на границах зон
    guardZones.forEach((zone, idx) => {
      const x1 = (norm.leftPadMod + zone.start) * px + pos.left * editorZoom;
      const x2 = (norm.leftPadMod + zone.end) * px + pos.left * editorZoom;
      
      lines.push(
        <line
          key={`guard-start-${idx}`}
          x1={x1}
          y1={0}
          x2={x1}
          y2="100%"
          stroke="#10b981"
          strokeWidth="2"
          strokeDasharray="5,5"
        />
      );
      lines.push(
        <line
          key={`guard-end-${idx}`}
          x1={x2}
          y1={0}
          x2={x2}
          y2="100%"
          stroke="#10b981"
          strokeWidth="2"
          strokeDasharray="5,5"
        />
      );
    });

    // Серые линии на центрах цифр
    norm.digits.forEach((digit, idx) => {
      const x = (norm.leftPadMod + digit.xMod) * px + pos.left * editorZoom;
      lines.push(
        <line
          key={`digit-${idx}`}
          x1={x}
          y1={0}
          x2={x}
          y2="100%"
          stroke="#9ca3af"
          strokeWidth="1"
          strokeDasharray="3,3"
        />
      );
    });

    // Розовая линия базовой линии цифр
    const baselineY = norm.digitYMod * px + pos.top * editorZoom;
    lines.push(
      <line
        key="baseline"
        x1={0}
        y1={baselineY}
        x2="100%"
        y2={baselineY}
        stroke="#ec4899"
        strokeWidth="2"
        strokeDasharray="5,5"
      />
    );

    return (
      <svg
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 1000 }}
      >
        {lines}
      </svg>
    );
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
      />
      {renderModuleGridOverlay()}
      {showModuleGrid && selectedBarcodeNorm && (
        <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-3 text-xs z-50">
          <div className="font-semibold mb-2">Сетка модулей</div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-gray-400"></div>
              <span>Центры цифр</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-green-500"></div>
              <span>Границы зон</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-pink-500"></div>
              <span>Базовая линия</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
