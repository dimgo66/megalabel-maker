import { useEffect, useRef, useCallback } from 'react';
import { Canvas, Rect, Circle } from 'fabric';
import { useProjectStore } from '../store/useProjectStore';
import { mmToPx } from '../utils/layoutCalculator';

export function LabelCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<Canvas | null>(null);
  const safeAreaRef = useRef<Rect | Circle | null>(null);

  const {
    selectedFormat,
    sheetSettings,
    editorZoom,
    labelDesign,
    setCanvasJSON,
    setEditorZoom,
  } = useProjectStore();

  // Обновление безопасной области
  const updateSafeArea = useCallback(() => {
    if (!fabricCanvasRef.current) return;

    const canvas = fabricCanvasRef.current;
    const displayWidth = mmToPx(selectedFormat.width_mm) * editorZoom;
    const displayHeight = mmToPx(selectedFormat.height_mm) * editorZoom;
    const margin = sheetSettings.safetyMargin_mm * mmToPx(1) * editorZoom;

    // Удаляем старую безопасную область
    if (safeAreaRef.current) {
      canvas.remove(safeAreaRef.current);
    }

    // Создаём новую безопасную область
    let safeArea: Rect | Circle;

    if (selectedFormat.shape === 'circle') {
      // Круглая безопасная область
      const diameter = Math.min(displayWidth, displayHeight) - margin * 2;
      safeArea = new Circle({
        radius: diameter / 2,
        left: displayWidth / 2 - diameter / 2,
        top: displayHeight / 2 - diameter / 2,
        fill: 'transparent',
        stroke: '#999999',
        strokeWidth: 1,
        strokeDashArray: [4, 4],
        selectable: false,
        evented: false,
      });
      (safeArea as any).name = 'safeArea';
    } else {
      // Прямоугольная безопасная область
      safeArea = new Rect({
        left: margin,
        top: margin,
        width: displayWidth - margin * 2,
        height: displayHeight - margin * 2,
        fill: 'transparent',
        stroke: '#999999',
        strokeWidth: 1,
        strokeDashArray: [4, 4],
        selectable: false,
        evented: false,
      });
      (safeArea as any).name = 'safeArea';
    }

    canvas.add(safeArea);
    safeAreaRef.current = safeArea;
    canvas.renderAll();
  }, [selectedFormat, editorZoom, sheetSettings.safetyMargin_mm]);

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
    }

    // Масштабируем контекст для Retina
    const ctx = canvas.getContext();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    canvas.renderAll();
    updateSafeArea();
  }, [selectedFormat, editorZoom, sheetSettings.safetyMargin_mm, updateSafeArea]);

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

    // Обработчики событий для сохранения состояния
    const handleModification = () => {
      if (!fabricCanvasRef.current) return;
      const json = canvas.toJSON();
      // Убираем safeArea из сериализации
      const objects = json.objects?.filter((obj: any) => obj.name !== 'safeArea');
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

    // Загрузка сохранённого состояния
    const loadSavedState = async () => {
      if (labelDesign.canvasJSON && Object.keys(labelDesign.canvasJSON).length > 0) {
        await canvas.loadFromJSON(labelDesign.canvasJSON as any);
        canvas.renderAll();
        updateSafeArea();
      }
    };
    
    loadSavedState();

    return () => {
      canvas.dispose();
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
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Панель управления зумом */}
      <div className="h-12 bg-white border-b border-gray-200 flex items-center px-6 justify-between shrink-0">
        <span className="text-sm font-semibold text-gray-900">Редактор этикетки</span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200"
            title="Уменьшить"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          <input
            type="range"
            min="50"
            max="1000"
            value={editorZoom * 100}
            onChange={(e) => setEditorZoom(Number(e.target.value) / 100)}
            className="w-32"
          />
          <button
            onClick={handleZoomIn}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200"
            title="Увеличить"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            onClick={handleFitToScreen}
            className="px-3 h-9 bg-white border border-gray-300 rounded-lg text-xs text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-medium"
            title="Вписать"
          >
            Вписать
          </button>
          <span className="text-sm text-gray-600 font-medium w-14 text-right">
            {Math.round(editorZoom * 100)}%
          </span>
        </div>
      </div>

      {/* Область канваса */}
      <div className="flex-1 flex items-center justify-center overflow-auto p-8 bg-gray-100">
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="border border-gray-300 shadow-xl rounded-lg"
          />
        </div>
      </div>
    </div>
  );
}
