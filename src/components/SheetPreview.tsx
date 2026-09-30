import { useRef, useEffect, useCallback } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { calculateLayout, mmToPx } from '../utils/layoutCalculator';

export function SheetPreview() {
  const {
    selectedFormat,
    sheetSettings,
    previewZoom,
    setPreviewZoom,
  } = useProjectStore();

  const layout = calculateLayout(selectedFormat);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-fit on mount and resize
  const fitToContainer = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerWidth = container.clientWidth - 32;
    const containerHeight = container.clientHeight - 32;

    const a4WidthPx = mmToPx(210);
    const a4HeightPx = mmToPx(297);

    const zoomX = containerWidth / a4WidthPx;
    const zoomY = containerHeight / a4HeightPx;
    const fitZoom = Math.min(zoomX, zoomY);

    const clampedZoom = Math.max(0.25, Math.min(3.0, fitZoom));
    setPreviewZoom(clampedZoom);
  }, [setPreviewZoom]);

  useEffect(() => {
    fitToContainer();
    window.addEventListener('resize', fitToContainer);
    return () => window.removeEventListener('resize', fitToContainer);
  }, [fitToContainer]);

  const handleZoomIn = () => {
    setPreviewZoom(Math.min(3.0, previewZoom + 0.25));
  };

  const handleZoomOut = () => {
    setPreviewZoom(Math.max(0.25, previewZoom - 0.25));
  };

  const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPreviewZoom(Number(e.target.value) / 100);
  };

  return (
    <div className="h-[300px] bg-white border-t border-gray-300 flex flex-col shrink-0">
      {/* Header */}
      <div className="h-10 border-b border-gray-200 flex items-center px-4 justify-between shrink-0">
        <div className="text-sm text-gray-700">
          Предпросмотр: {selectedFormat.name}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            className="w-7 h-7 bg-white border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center"
            title="Уменьшить"
          >
            −
          </button>
          <input
            type="range"
            min="25"
            max="300"
            value={previewZoom * 100}
            onChange={handleZoomChange}
            className="w-24 accent-gray-500"
          />
          <button
            onClick={handleZoomIn}
            className="w-7 h-7 bg-white border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center"
            title="Увеличить"
          >
            +
          </button>
          <button
            onClick={fitToContainer}
            className="px-2 h-7 bg-white border border-gray-300 rounded text-xs text-gray-700 hover:bg-gray-50 transition-colors"
            title="Вписать"
          >
            Вписать
          </button>
          <span className="text-xs text-gray-500 w-12 text-right">
            {Math.round(previewZoom * 100)}%
          </span>
        </div>
      </div>

      {/* Preview area */}
      <div ref={containerRef} className="flex-1 overflow-hidden flex items-center justify-center bg-gray-100 p-4">
        <div
          className="bg-white shadow-md border border-gray-300 relative"
          style={{
            width: `${mmToPx(210) * previewZoom}px`,
            height: `${mmToPx(297) * previewZoom}px`,
          }}
        >
          {/* Grid cells */}
          {Array.from({ length: layout.rows * layout.cols }).map((_, idx) => {
            const col = idx % layout.cols;
            const row = Math.floor(idx / layout.cols);
            const x = layout.marginLeft_mm + col * (layout.cellWidth_mm + layout.gapX_mm);
            const y = layout.marginTop_mm + row * (layout.cellHeight_mm + layout.gapY_mm);

            const cellWidthPx = mmToPx(layout.cellWidth_mm) * previewZoom;
            const cellHeightPx = mmToPx(layout.cellHeight_mm) * previewZoom;

            return (
              <div
                key={idx}
                className="absolute"
                style={{
                  left: `${mmToPx(x) * previewZoom}px`,
                  top: `${mmToPx(y) * previewZoom}px`,
                  width: `${cellWidthPx}px`,
                  height: `${cellHeightPx}px`,
                }}
              >
                {/* Cell border */}
                <div
                  className={`absolute inset-0 border border-gray-400 ${
                    selectedFormat.shape === 'circle' ? 'rounded-full' : ''
                  }`}
                  style={{ borderWidth: '0.5px' }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
