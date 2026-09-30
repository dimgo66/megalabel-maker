import { useEffect, useRef, useState, useCallback } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { calculateLayout, mmToPx } from '../utils/layoutCalculator';

export function SheetPreview() {
  const {
    selectedFormat,
    previewZoom,
    setPreviewZoom,
    editorCanvas,
    labelDesign,
  } = useProjectStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cachedDataURL, setCachedDataURL] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  const layout = calculateLayout(selectedFormat);

  // Кэширование dataURL этикетки
  useEffect(() => {
    if (!editorCanvas) {
      setCachedDataURL(null);
      return;
    }

    // Генерируем dataURL с множителем 2 для качества
    const dataURL = editorCanvas.toDataURL({
      format: 'png',
      multiplier: 2,
      left: 0,
      top: 0,
      width: editorCanvas.getWidth(),
      height: editorCanvas.getHeight(),
    });

    setCachedDataURL(dataURL);
  }, [editorCanvas, labelDesign.canvasJSON]);

  // Рендеринг листа предпросмотра
  const renderSheet = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cachedDataURL) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsRendering(true);

    // Размеры листа A4 в пикселях с учётом зума
    const sheetWidth_px = mmToPx(210) * previewZoom;
    const sheetHeight_px = mmToPx(297) * previewZoom;

    // Устанавливаем размер canvas
    const dpr = window.devicePixelRatio || 1;
    canvas.width = sheetWidth_px * dpr;
    canvas.height = sheetHeight_px * dpr;
    canvas.style.width = `${sheetWidth_px}px`;
    canvas.style.height = `${sheetHeight_px}px`;

    // Масштабируем контекст для Retina
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Белый фон листа
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, sheetWidth_px, sheetHeight_px);

    // Рамка листа
    ctx.strokeStyle = '#CCCCCC';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.strokeRect(0, 0, sheetWidth_px, sheetHeight_px);

    // Загружаем изображение этикетки
    const labelImg = new Image();
    labelImg.onload = () => {
      // Рендерим каждую ячейку
      let index = 0;
      for (let row = 0; row < layout.rows; row++) {
        for (let col = 0; col < layout.cols; col++) {
          if (index >= selectedFormat.count) break;

          // Позиция ячейки в мм
          const x_mm = layout.marginLeft_mm + col * (layout.cellWidth_mm + layout.gapX_mm);
          const y_mm = layout.marginTop_mm + row * (layout.cellHeight_mm + layout.gapY_mm);

          // Конвертируем в пиксели
          const x_px = mmToPx(x_mm) * previewZoom;
          const y_px = mmToPx(y_mm) * previewZoom;
          const cellW_px = mmToPx(layout.cellWidth_mm) * previewZoom;
          const cellH_px = mmToPx(layout.cellHeight_mm) * previewZoom;

          // Для круглых этикеток: круглый clipPath
          if (selectedFormat.shape === 'circle') {
            ctx.save();
            ctx.beginPath();
            const radius = Math.min(cellW_px, cellH_px) / 2;
            ctx.arc(x_px + cellW_px / 2, y_px + cellH_px / 2, radius, 0, Math.PI * 2);
            ctx.clip();
          }

          // Рисуем содержимое этикетки
          ctx.drawImage(labelImg, x_px, y_px, cellW_px, cellH_px);

          // Восстанавливаем контекст для круглых
          if (selectedFormat.shape === 'circle') {
            ctx.restore();
          }

          // Рамка ячейки (пунктирная)
          ctx.strokeStyle = '#999999';
          ctx.lineWidth = 0.5;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(x_px, y_px, cellW_px, cellH_px);

          index++;
        }
      }

      setIsRendering(false);
    };

    labelImg.src = cachedDataURL;
  }, [cachedDataURL, previewZoom, layout, selectedFormat]);

  // Дебаунс обновлений
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      renderSheet();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [renderSheet]);

  // Автоматическое вписывание при загрузке
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerWidth = container.clientWidth - 32;
    const containerHeight = container.clientHeight - 32;

    const sheetWidth = mmToPx(210);
    const sheetHeight = mmToPx(297);

    const zoomX = containerWidth / sheetWidth;
    const zoomY = containerHeight / sheetHeight;
    const fitZoom = Math.min(zoomX, zoomY);

    const clampedZoom = Math.max(0.25, Math.min(4.0, fitZoom));
    setPreviewZoom(clampedZoom);
  }, []);

  // Обработчики зума
  const handleZoomIn = () => {
    setPreviewZoom(Math.min(4.0, previewZoom + 0.25));
  };

  const handleZoomOut = () => {
    setPreviewZoom(Math.max(0.25, previewZoom - 0.25));
  };

  const handleFitToScreen = () => {
    const container = containerRef.current;
    if (!container) return;

    const containerWidth = container.clientWidth - 32;
    const containerHeight = container.clientHeight - 32;

    const sheetWidth = mmToPx(210);
    const sheetHeight = mmToPx(297);

    const zoomX = containerWidth / sheetWidth;
    const zoomY = containerHeight / sheetHeight;
    const fitZoom = Math.min(zoomX, zoomY);

    const clampedZoom = Math.max(0.25, Math.min(4.0, fitZoom));
    setPreviewZoom(clampedZoom);
  };

  return (
    <div className="h-[500px] bg-white border-t border-gray-200 flex flex-col shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
      {/* Header */}
      <div className="h-12 border-b border-gray-200 flex items-center px-6 justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-900">Предпросмотр листа</span>
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
            {selectedFormat.name}
          </span>
          <span className="text-xs text-gray-400">
            {selectedFormat.count} этикеток, {selectedFormat.width_mm}×{selectedFormat.height_mm} мм каждая
          </span>
        </div>
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
            min="25"
            max="400"
            value={previewZoom * 100}
            onChange={(e) => setPreviewZoom(Number(e.target.value) / 100)}
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
            {Math.round(previewZoom * 100)}%
          </span>
        </div>
      </div>

      {/* Preview area */}
      <div ref={containerRef} className="flex-1 overflow-hidden flex items-center justify-center bg-gray-100 p-4 relative">
        {isRendering && (
          <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
            <div className="text-sm text-gray-600">Обновление предпросмотра...</div>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="border border-gray-300 shadow-lg"
        />
      </div>
    </div>
  );
}
