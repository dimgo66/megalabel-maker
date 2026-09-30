import { useState, useEffect } from 'react';
import { getPdfPageThumbnails } from '../utils/pdfImageLoader';

interface PdfPageSelectorProps {
  file: File;
  onSelect: (pageNumber: number) => void;
  onCancel: () => void;
}

export function PdfPageSelector({ file, onSelect, onCancel }: PdfPageSelectorProps) {
  const [thumbnails, setThumbnails] = useState<HTMLCanvasElement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadThumbnails();
  }, [file]);

  const loadThumbnails = async () => {
    try {
      setLoading(true);
      setError(null);
      const thumbs = await getPdfPageThumbnails(file, 0.5);
      setThumbnails(thumbs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки PDF');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 shadow-xl">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-700">Загрузка PDF...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 shadow-xl max-w-md">
          <div className="text-center">
            <div className="text-red-600 text-4xl mb-4">⚠️</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Ошибка</h3>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Если только одна страница, сразу выбираем её
  if (thumbnails.length === 1) {
    useEffect(() => {
      onSelect(1);
    }, []);
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Выберите страницу PDF</h2>
          <p className="text-sm text-gray-500 mt-1">
            PDF содержит {thumbnails.length} {thumbnails.length === 1 ? 'страницу' : 'страниц'}
          </p>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-3 gap-4">
            {thumbnails.map((canvas, index) => (
              <button
                key={index}
                onClick={() => onSelect(index + 1)}
                className="group relative border-2 border-gray-200 hover:border-blue-500 rounded-lg overflow-hidden transition-all hover:shadow-lg"
              >
                <img
                  src={canvas.toDataURL()}
                  alt={`Страница ${index + 1}`}
                  className="w-full h-auto"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-sm py-2 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                  Страница {index + 1}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
