import { useRef, useEffect, useCallback } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { calculateLayout, mmToPx } from '../utils/layoutCalculator';

export function SheetPreview() {
  const {
    selectedFormat,
    previewZoom,
    setPreviewZoom,
  } = useProjectStore();

  const layout = calculateLayout(selectedFormat);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-fit on mount and resize
  const fitToContainer = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerWidth = container.clientWidth - 48;
    const containerHeight = container.clientHeight - 48;

    const a4WidthPx = mmToPx(210);
    const a4HeightPx = mmToPx(297);

    const zoomX = containerWidth / a4WidthPx;
    const zoomY = containerHeight / a4HeightPx;
    const fitZoom = Math.min(zoomX, zoomY);

    const clampedZoom = Math.max(0.25, Math.min(4.0, fitZoom));
    setPreviewZoom(clampedZoom);
  }, [setPreviewZoom]);

  useEffect(() => {
    fitToContainer();
    window.addEventListener('resize', fitToContainer);
    return () => window.removeEventListener('resize', fitToContainer);
  }, [fitToContainer]);

  const handleZoomIn = () => {
    setPreviewZoom(Math.min(4.0, previewZoom + 0.25));
  };

  const handleZoomOut = () => {
    setPreviewZoom(Math.max(0.25, previewZoom - 0.25));
  };

  const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPreviewZoom(Number(e.target.value) / 100);
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
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            className="btn-icon"
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
            onChange={handleZoomChange}
            className="w-32"
          />
          <button
            onClick={handleZoomIn}
            className="btn-icon"
            title="Увеличить"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            onClick={fitToContainer}
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
      <div ref={containerRef} className="flex-1 overflow-hidden flex items-center justify-center bg-gray-100 p-6">
        <div
          className="bg-white shadow-lg border border-gray-300 relative rounded"
          style={{
            width: `${mmToPx(210) * previewZoom}px`,
            height: `${mmToPx(297) * previewZoom}px`,
          }}
        >
          {/* Grid cells - БЕЗ безопасных полей */}
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
                {/* Cell border - пунктирная рамка */}
                <div
                  className={`absolute inset-0 border border-gray-400 ${
                    selectedFormat.shape === 'circle' ? 'rounded-full' : 'rounded-sm'
                  }`}
                  style={{ 
                    borderWidth: '1px',
                    borderStyle: 'dashed',
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
