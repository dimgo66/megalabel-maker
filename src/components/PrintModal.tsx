import { useState } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { printViaPdfWindow, printViaBrowser } from '../utils/printManager';
import { ExportConfig } from '../utils/pdfExporter';

interface PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PrintModal({ isOpen, onClose }: PrintModalProps) {
  const { selectedFormat, sheetSettings, editorCanvas } = useProjectStore();
  const [printMethod, setPrintMethod] = useState<'pdf' | 'browser'>('pdf');
  const [browserDpi, setBrowserDpi] = useState<300 | 600>(300);
  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrint = async () => {
    if (!editorCanvas) return;

    setIsPrinting(true);

    try {
      const cfg: ExportConfig = {
        format: selectedFormat,
        editorCanvas,
        dpi: printMethod === 'pdf' ? 300 : browserDpi,
        orientation: sheetSettings.orientation,
      };

      if (printMethod === 'pdf') {
        await printViaPdfWindow(cfg);
      } else {
        printViaBrowser(cfg, browserDpi);
      }

      setTimeout(() => {
        setIsPrinting(false);
        onClose();
      }, 1000);
    } catch (error) {
      console.error('Ошибка печати:', error);
      alert('Ошибка при печати');
      setIsPrinting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col"
        style={{ width: '600px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-16 border-b border-gray-200 flex items-center px-6 justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold text-gray-900">Печать</span>
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
        <div className="p-6">
          {/* Print method */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3">Способ печати</label>
            <div className="space-y-3">
              <label className="flex items-start gap-3 p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
                <input
                  type="radio"
                  name="printMethod"
                  value="pdf"
                  checked={printMethod === 'pdf'}
                  onChange={() => setPrintMethod('pdf')}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">Открыть PDF</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Рекомендуемый способ. Векторные штрихкоды, точные размеры.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 border-2 border-gray-200 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
                <input
                  type="radio"
                  name="printMethod"
                  value="browser"
                  checked={printMethod === 'browser'}
                  onChange={() => setPrintMethod('browser')}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">Печать через браузер</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Растровая печать. Используйте, если PDF не работает.
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Browser DPI */}
          {printMethod === 'browser' && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Качество (DPI)</label>
              <div className="space-y-2">
                {[300, 600].map((d) => (
                  <label key={d} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="browserDpi"
                      value={d}
                      checked={browserDpi === d}
                      onChange={() => setBrowserDpi(d as any)}
                      className="text-blue-600"
                    />
                    <span className="text-sm text-gray-700">{d} DPI</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Warning */}
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-2">
              <span className="text-amber-600 text-lg">⚠️</span>
              <div className="text-xs text-amber-900 space-y-1">
                <div className="font-medium">Важные настройки печати:</div>
                <div>• Поля: НЕТ (без полей)</div>
                <div>• Масштаб: 100%</div>
                <div>• Ориентация: {sheetSettings.orientation === 'portrait' ? 'Книжная' : 'Альбомная'}</div>
                <div>• Цвет: Чёрно-белый</div>
              </div>
            </div>
          </div>

          {/* Print button */}
          <button
            onClick={handlePrint}
            disabled={isPrinting}
            className="w-full btn btn-primary flex items-center justify-center gap-2"
          >
            {isPrinting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                <span>Печать...</span>
              </>
            ) : (
              <>
                <span>🖨️</span>
                <span>Печать</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
