import { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { composeSheetCanvas, ExportConfig, exportWithFallback } from '../utils/pdfExporter';
import { checkPdfSources } from '../utils/vectorExporter';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ExportModal({ isOpen, onClose }: ExportModalProps) {
  const { selectedFormat, sheetSettings, editorCanvas, projectName } = useProjectStore();
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Генерируем превью при открытии
  useEffect(() => {
    if (!isOpen || !editorCanvas) return;

    const cfg: ExportConfig = {
      format: selectedFormat,
      editorCanvas,
      dpi: 96, // Низкий DPI для превью
      orientation: sheetSettings.orientation,
    };

    const generatePreview = async () => {
      try {
        const canvas = await composeSheetCanvas(cfg, 96);
        setPreviewUrl(canvas.toDataURL('image/png'));
      } catch (error) {
        console.error('Ошибка генерации превью:', error);
      }
    };

    generatePreview();
  }, [isOpen, editorCanvas, selectedFormat, sheetSettings.orientation]);

  const handleExport = async () => {
    if (!editorCanvas) return;

    setIsExporting(true);
    setProgress(10);

    try {
      const cfg: ExportConfig = {
        format: selectedFormat,
        editorCanvas,
        dpi: 1200, // Фиксированный DPI для экспорта
        orientation: sheetSettings.orientation,
      };

      setProgress(30);
      
      // Проверяем наличие PDF источников
      const { missing, total } = checkPdfSources(editorCanvas);
      
      if (missing.length > 0 && total > 0) {
        const confirmed = confirm(
          `PDF-источники не прикреплены в этой сессии (${missing.length} из ${total}).\n\n` +
          `В PDF они уйдут растром. Загрузите исходники повторно для векторного экспорта.\n\n` +
          `Продолжить экспорт?`
        );
        
        if (!confirmed) {
          setIsExporting(false);
          setProgress(0);
          return;
        }
      }
      
      setProgress(50);
      
      // Используем экспорт с fallback
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
        alert(`Векторный экспорт недоступен: ${error}\n\nСохранено растром 600 DPI.`);
      }

      setTimeout(() => {
        setIsExporting(false);
        setProgress(0);
        onClose();
      }, 500);
    } catch (error) {
      console.error('EXPORT FAILED:', error);
      alert(`Ошибка экспорта: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
      setIsExporting(false);
      setProgress(0);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col"
        style={{ width: '800px', height: '600px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-16 border-b border-gray-200 flex items-center px-6 justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold text-gray-900">Экспорт в PDF</span>
            <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-lg">
              {selectedFormat.name}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Preview */}
          <div className="flex-1 bg-gray-100 p-6 flex items-center justify-center overflow-auto">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Preview"
                className="max-w-full max-h-full border border-gray-300 shadow-lg"
                style={{ maxHeight: '100%' }}
              />
            ) : (
              <div className="text-gray-400">Генерация превью...</div>
            )}
          </div>

          {/* Settings */}
          <div className="w-80 border-l border-gray-200 p-6 flex flex-col">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Настройки экспорта</h3>

            {/* Качество */}
            <div className="mb-6">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-sm text-gray-700">Качество</span>
                <span className="text-sm font-semibold text-gray-900">1200 DPI</span>
              </div>
              <p className="text-xs text-gray-500 mt-2">Фиксированное высокое качество</p>
            </div>

            {/* Info */}
            <div className="mb-6 p-3 bg-blue-50 rounded-lg">
              <div className="text-xs text-blue-900 space-y-1">
                <div>✓ Векторные штрихкоды</div>
                <div>✓ Точные размеры в мм</div>
                <div>✓ Готово для печати</div>
              </div>
            </div>

            {/* Progress */}
            {isExporting && (
              <div className="mb-6">
                <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                  <span>Экспорт...</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex-1" />

            {/* Export button */}
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="w-full btn btn-primary flex items-center justify-center gap-2"
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
    </div>
  );
}
