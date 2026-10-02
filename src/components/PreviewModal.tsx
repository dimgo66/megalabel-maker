import { useState, useEffect, useRef, useCallback } from 'react';
import * as fabric from 'fabric';
import { useProjectStore } from '../store/useProjectStore';
import { composeSheetCanvas, ExportConfig, exportWithFallback } from '../utils/pdfExporter';
import { checkPdfSources } from '../utils/vectorExporter';
import { printViaPdfWindow } from '../utils/printManager';
import { calculateLayout, gridPitch } from '../utils/layoutCalculator';

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PreviewModal({ isOpen, onClose }: PreviewModalProps) {
  const { selectedFormat, sheetSettings, editorCanvas, projectName } = useProjectStore();
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [progress, setProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Генерируем превью при открытии
  useEffect(() => {
    if (!isOpen || !editorCanvas) {
      setPreviewUrl('');
      return;
    }

    const cfg: ExportConfig = {
      format: selectedFormat,
      editorCanvas,
      dpi: 300, // Достаточно для чёткого предпросмотра при увеличении
      orientation: sheetSettings.orientation,
    };

    let cancelled = false;

    const generatePreview = async () => {
      try {
        const canvas = await composeSheetCanvas(cfg, 300);
        if (!cancelled) {
          setPreviewUrl(canvas.toDataURL('image/png'));
        }
      } catch (error) {
        console.error('Ошибка генерации превью:', error);
      }
    };

    generatePreview();
    return () => {
      cancelled = true;
    };
  }, [isOpen, editorCanvas, selectedFormat, sheetSettings.orientation, projectName]);

  // Автоматическое вписывание после загрузки изображения
  const handleFitToScreen = useCallback(() => {
    const container = containerRef.current;
    if (!container || !naturalSize) return;

    const { w: nw, h: nh } = naturalSize;
    if (!nw || !nh) return;

    const cw = container.clientWidth - 48;
    const ch = container.clientHeight - 48;
    if (cw <= 0 || ch <= 0) return;

    const fitZoom = Math.min(cw / nw, ch / nh);
    const clamped = Math.max(0.1, Math.min(3.0, fitZoom));
    setZoom(clamped);
  }, [naturalSize]);

  // Автоматически вписываем при первой загрузке изображения
  useEffect(() => {
    if (naturalSize && isOpen) {
      handleFitToScreen();
    }
  }, [naturalSize, isOpen, handleFitToScreen]);

  // Закрытие по Esc
  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(3.0, prev + 0.1));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(0.1, prev - 0.1));
  };

  const handleZoomSlider = (value: number) => {
    setZoom(Math.max(0.1, Math.min(3.0, value)));
  };

  /** Проверка PDF-источников: спрашиваем разрешение, если вектор невозможен */
  const confirmPdfSources = (canvas: fabric.Canvas): boolean => {
    const { missing, total } = checkPdfSources(canvas);
    if (missing.length > 0 && total > 0) {
      return confirm(
        `PDF-источники не прикреплены в этой сессии (${missing.length} из ${total}).\n\n` +
        `В PDF они уйдут растром. Загрузите исходники повторно для векторного экспорта.\n\n` +
        `Продолжить?`
      );
    }
    return true;
  };

  const handleExport = async () => {
    if (!editorCanvas) return;

    setIsExporting(true);
    setProgress(10);

    try {
      const cfg: ExportConfig = {
        format: selectedFormat,
        editorCanvas,
        dpi: 1200, // Высокое разрешение для экспорта
        orientation: sheetSettings.orientation,
      };

      setProgress(30);

      if (!confirmPdfSources(editorCanvas)) {
        setIsExporting(false);
        setProgress(0);
        return;
      }

      setProgress(50);

      const { pdfBytes, isVector, error } = await exportWithFallback(cfg);

      setProgress(80);

      // Генерируем имя файла
      const date = new Date().toISOString().split('T')[0];
      const filename = `${projectName || 'label'}_${selectedFormat.id}_${date}.pdf`;

      setProgress(100);

      // Создаём Blob и скачиваем
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);

      // Показываем уведомление о результате
      if (!isVector && error) {
        alert(`Векторный экспорт недоступен: ${error}\n\nСохранено растром.`);
      }

      setTimeout(() => {
        setIsExporting(false);
        setProgress(0);
      }, 500);
    } catch (error) {
      console.error('EXPORT FAILED:', error);
      alert(`Ошибка экспорта: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
      setIsExporting(false);
      setProgress(0);
    }
  };

  const handlePrint = async () => {
    if (!editorCanvas) return;

    setIsPrinting(true);

    try {
      const cfg: ExportConfig = {
        format: selectedFormat,
        editorCanvas,
        dpi: 1200, // Высокое разрешение для печати
        orientation: sheetSettings.orientation,
      };

      if (!confirmPdfSources(editorCanvas)) {
        setIsPrinting(false);
        return;
      }

      const { isVector, error } = await printViaPdfWindow(cfg);

      // Показываем уведомление о результате
      if (!isVector && error) {
        alert(`Векторная печать недоступна: ${error}\n\nПечать растром.`);
      }

      setTimeout(() => {
        setIsPrinting(false);
      }, 1000);
    } catch (error) {
      console.error('PRINT FAILED:', error);
      alert(`Ошибка печати: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
      setIsPrinting(false);
    }
  };

  if (!isOpen) return null;

  const isLoading = !previewUrl;

  // ── Маска безопасных полей поверх листа ──────────────────────────────────
  // Превью — это готовый растр листа A4, поэтому оверлей редактора сюда не
  // попадает. Строим SVG-маску в координатах листа (мм) и накладываем её
  // ровно на изображение: у каждой этикетки всё, что вне безопасной зоны,
  // перекрывается (fill-rule="evenodd": внешний контур минус внутренний).
  const sheetW_mm = sheetSettings.orientation === 'portrait' ? 210 : 297;
  const sheetH_mm = sheetSettings.orientation === 'portrait' ? 297 : 210;
  const showSafety = sheetSettings.safetyMargin_mm > 0;
  const previewLayout = calculateLayout(selectedFormat, sheetSettings.orientation);
  const previewPitch = gridPitch(selectedFormat, previewLayout);
  const previewDisplayW = (naturalSize?.w || 794) * zoom;

  // Патчи безопасных полей (по одному на этикетку) в мм-координатах листа
  const safetyCells: { d: string }[] = [];
  if (showSafety) {
    const m = sheetSettings.safetyMargin_mm;
    const cw = previewLayout.cellWidth_mm;
    const ch = previewLayout.cellHeight_mm;
    let idx = 0;
    for (let row = 0; row < previewLayout.rows; row++) {
      for (let col = 0; col < previewLayout.cols; col++) {
        if (idx++ >= selectedFormat.count) break;
        const x = previewLayout.marginLeft_mm + col * previewPitch.pitchX_mm;
        const y = previewLayout.marginTop_mm + row * previewPitch.pitchY_mm;

        if (selectedFormat.shape === 'circle') {
          const R = Math.min(cw, ch) / 2;
          const r = Math.max(0, R - m);
          const cx = x + cw / 2;
          const cy = y + ch / 2;
          // Внешний круг (по часовой) + внутренний (против) → маска-кольцо
          const outer = `M ${cx - R} ${cy} a ${R} ${R} 0 1 0 ${2 * R} 0 a ${R} ${R} 0 1 0 ${-2 * R} 0 Z`;
          const inner = `M ${cx - r} ${cy} a ${r} ${r} 0 1 1 ${2 * r} 0 a ${r} ${r} 0 1 1 ${-2 * r} 0 Z`;
          safetyCells.push({ d: `${outer} ${inner}` });
        } else {
          const iw = Math.max(0, cw - m * 2);
          const ih = Math.max(0, ch - m * 2);
          const outer = `M ${x} ${y} H ${x + cw} V ${y + ch} H ${x} Z`;
          const inner = `M ${x + m} ${y + m} H ${x + m + iw} V ${y + m + ih} H ${x + m} Z`;
          safetyCells.push({ d: `${outer} ${inner}` });
        }
      }
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col"
        style={{ width: '90vw', height: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-16 border-b border-gray-200 flex items-center px-6 justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold text-gray-900">Предпросмотр</span>
            <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-lg">
              {selectedFormat.name}
            </span>
            <span className="text-sm text-gray-400">
              {selectedFormat.count} этикеток, {selectedFormat.width_mm}×{selectedFormat.height_mm} мм каждая
              {' · '}
              {sheetSettings.orientation === 'portrait' ? 'Книжная' : 'Альбомная'}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Масштаб */}
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
                min="10"
                max="300"
                value={Math.round(zoom * 100)}
                onChange={(e) => handleZoomSlider(Number(e.target.value) / 100)}
                className="w-32"
                title="Масштаб"
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
                title="Вписать в экран"
              >
                Вписать
              </button>
              <span className="text-sm text-gray-600 font-medium w-14 text-right">
                {Math.round(zoom * 100)}%
              </span>
            </div>

            {/* Закрыть */}
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
              title="Закрыть (Esc)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Preview area */}
        <div ref={containerRef} className="flex-1 overflow-auto bg-gray-100 p-6 relative flex items-center justify-center">
          {isLoading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <div className="text-sm text-gray-600">Генерация предпросмотра...</div>
            </div>
          ) : (
            <div
              className="relative border border-gray-300 shadow-lg bg-white"
              style={{ width: `${previewDisplayW}px` }}
            >
              <img
                src={previewUrl}
                alt="Предпросмотр листа"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                }}
                className="block w-full h-auto"
                style={{
                  maxWidth: 'none',
                  imageRendering: zoom > 1 ? 'crisp-edges' : 'auto',
                }}
              />

              {/* Маска безопасных полей: всё вне зоны полностью перекрыто
                  непрозрачным белым слоем (ничего не просвечивает) */}
              {showSafety && (
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox={`0 0 ${sheetW_mm} ${sheetH_mm}`}
                  preserveAspectRatio="none"
                >
                  {safetyCells.map((cell, i) => (
                    <path
                      key={i}
                      d={cell.d}
                      fill="#ffffff"
                      fillRule="evenodd"
                      clipRule="evenodd"
                    />
                  ))}
                </svg>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-20 border-t border-gray-200 flex items-center px-6 gap-4 shrink-0">
          {/* Progress */}
          {(isExporting || isPrinting) && (
            <div className="flex items-center gap-3 flex-1">
              <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${isExporting ? progress : 60}%` }}
                />
              </div>
              <span className="text-sm text-gray-600 whitespace-nowrap">
                {isExporting ? `Экспорт... ${progress}%` : 'Печать...'}
              </span>
            </div>
          )}

          <div className="flex-1" />

          {/* Print button */}
          <button
            onClick={handlePrint}
            disabled={isPrinting || isExporting}
            className="btn btn-secondary flex items-center justify-center gap-2 min-w-[140px]"
            title="Печать листа (Ctrl+P)"
          >
            {isPrinting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                <span>Печать...</span>
              </>
            ) : (
              <>
                <span>🖨️</span>
                <span>Печать</span>
              </>
            )}
          </button>

          {/* Export PDF button */}
          <button
            onClick={handleExport}
            disabled={isExporting || isPrinting}
            className="btn btn-primary flex items-center justify-center gap-2 min-w-[160px]"
            title="Скачать PDF"
          >
            {isExporting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                <span>Экспорт...</span>
              </>
            ) : (
              <>
                <span>📄</span>
                <span>Скачать PDF</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
