import React, { useState, useEffect, useCallback } from 'react';
import { getPdfPageThumbnails } from '../utils/pdfImageLoader';

interface PdfPageSelectorProps {
  file: File | null;
  onSelect: (pageNumber: number) => void;
  onCancel: () => void;
}

export function PdfPageSelector({ file, onSelect, onCancel }: PdfPageSelectorProps) {
  // ВСЕ useState — в самом верху
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState(1);

  // ВСЕ useEffect — после всех useState
  useEffect(() => {
    if (!file) return;

    let cancelled = false;

    const loadThumbnails = async () => {
      try {
        setLoading(true);
        setError(null);

        const thumbs = await getPdfPageThumbnails(file, 0.5);

        if (cancelled) return;

        const dataUrls = thumbs.map(canvas => canvas.toDataURL('image/png'));
        setThumbnails(dataUrls);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Ошибка загрузки PDF');
          setLoading(false);
        }
      }
    };

    loadThumbnails();

    return () => {
      cancelled = true;
    };
  }, [file]);

  // Обработчики — useCallback
  const handlePageClick = useCallback((pageNumber: number) => {
    setSelectedPage(pageNumber);
    onSelect(pageNumber);
  }, [onSelect]);

  const handleClose = useCallback(() => {
    onCancel();
  }, [onCancel]);

  // Ранний return — ПОСЛЕ всех хуков
  if (!file) {
    return null;
  }

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
              onClick={handleClose}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    );
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
            {thumbnails.map((dataUrl, index) => (
              <button
                key={index}
                onClick={() => handlePageClick(index + 1)}
                className={`group relative border-2 rounded-lg overflow-hidden transition-all hover:shadow-lg ${
                  selectedPage === index + 1
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <img
                  src={dataUrl}
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
            onClick={handleClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
