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
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Защита от повторного вызова
    if (isProcessing) return;
    
    const files = Array.from(e.target.files || []);
    if (!canvas || files.length === 0) return;

    setIsProcessing(true);

    try {
      for (const file of files) {
        try {
          await handleFileUpload(file, canvas, (pdfFile) => {
            // Если это PDF, показываем селектор страниц
            setPdfFile(pdfFile);
            setShowPdfSelector(true);
          });
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
      setIsProcessing(false);
    }
  };

  const handlePdfPageSelect = async (pageNumber: number) => {
    if (!canvas || !pdfFile) return;

    try {
      await handleFileUpload(pdfFile, canvas, undefined, pageNumber);
    } catch (error) {
      console.error('Ошибка загрузки PDF:', error);
      alert('Не удалось загрузить PDF');
    } finally {
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
