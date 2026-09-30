import { useRef, useState } from 'react';
import { handleFileUpload } from '../utils/imageLoader';
import { PdfPageSelector } from './PdfPageSelector';
import * as fabric from 'fabric';

interface ImagePanelProps {
  canvas: fabric.Canvas | null;
}

export function ImagePanel({ canvas }: ImagePanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [showPdfSelector, setShowPdfSelector] = useState(false);
  const isProcessingRef = useRef(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Защита от повторного вызова с использованием ref
    if (isProcessingRef.current) {
      console.log('ImagePanel: уже обрабатывается, пропускаем');
      return;
    }
    
    const files = Array.from(e.target.files || []);
    if (!canvas || files.length === 0) return;

    console.log('ImagePanel: начинаем обработку файлов', files.length);
    isProcessingRef.current = true;

    try {
      for (const file of files) {
        console.log('ImagePanel: обрабатываем файл', file.name);
        try {
          await handleFileUpload(file, canvas, (pdfFile) => {
            console.log('ImagePanel: показываем селектор страниц PDF');
            // Если это PDF, показываем селектор страниц
            setPdfFile(pdfFile);
            setShowPdfSelector(true);
          });
          console.log('ImagePanel: файл обработан', file.name);
        } catch (error) {
          console.error('Ошибка загрузки файла:', error);
          alert(`Не удалось загрузить файл: ${file.name}`);
        }
      }
    } finally {
      // Сбрасываем input и флаг обработки
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      console.log('ImagePanel: завершаем обработку');
      isProcessingRef.current = false;
    }
  };

  const handlePdfPageSelect = async (pageNumber: number) => {
    console.log('handlePdfPageSelect: выбрана страница', pageNumber);
    if (!canvas || !pdfFile) {
      console.log('handlePdfPageSelect: canvas или pdfFile отсутствуют, выходим');
      return;
    }

    try {
      console.log('handlePdfPageSelect: вызываем handleFileUpload');
      await handleFileUpload(pdfFile, canvas, undefined, pageNumber);
      console.log('handlePdfPageSelect: handleFileUpload завершён');
    } catch (error) {
      console.error('Ошибка загрузки PDF:', error);
      alert('Не удалось загрузить PDF');
    } finally {
      console.log('handlePdfPageSelect: закрываем селектор');
      setShowPdfSelector(false);
      setPdfFile(null);
    }
  };

  const handlePdfCancel = () => {
    setShowPdfSelector(false);
    setPdfFile(null);
  };

  return (
    <>
      <button
        onClick={() => fileInputRef.current?.click()}
        className="w-full card card-hover cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
            <span className="text-xl">🖼️</span>
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-gray-700">Изображение</div>
            <div className="text-xs text-gray-400">PNG, JPG, SVG, PDF</div>
          </div>
        </div>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.gif,.bmp,.svg,.webp,.pdf"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {showPdfSelector && pdfFile && (
        <PdfPageSelector
          file={pdfFile}
          onSelect={handlePdfPageSelect}
          onCancel={handlePdfCancel}
        />
      )}
    </>
  );
}
