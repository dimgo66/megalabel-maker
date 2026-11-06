import { useRef } from 'react';
import { handleFileUpload } from '../utils/imageLoader';
import { describePdfError, isPdfPasswordError } from '../utils/pdfImageLoader';
import * as fabric from 'fabric';
import { ImageIcon } from './icons';

interface ImagePanelProps {
  canvas: fabric.Canvas | null;
}

export function ImagePanel({ canvas }: ImagePanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isProcessingRef = useRef(false);

  /**
   * Загрузка одного файла. Защищённый PDF переспрашивает пароль и пробует
   * снова; остальные ошибки показываются с причиной, а не общим «не удалось».
   */
  const loadFile = async (file: File) => {
    if (!canvas) return;

    try {
      await handleFileUpload(file, canvas);
    } catch (error) {
      if (isPdfPasswordError(error)) {
        const password = window.prompt(
          `PDF «${file.name}» защищён паролем.\nВведите пароль:`,
          ''
        );
        if (!password) return;

        try {
          await handleFileUpload(file, canvas, { password });
          return;
        } catch (retryError) {
          console.error('Ошибка загрузки PDF после ввода пароля:', retryError);
          alert(`Не удалось загрузить файл «${file.name}»: ${describePdfError(retryError)}`);
          return;
        }
      }

      console.error('Ошибка загрузки файла:', error);
      alert(`Не удалось загрузить файл «${file.name}»: ${describePdfError(error)}`);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isProcessingRef.current) return;

    const files = Array.from(e.target.files || []);
    if (!canvas || files.length === 0) return;

    isProcessingRef.current = true;

    try {
      for (const file of files) {
        await loadFile(file);
      }
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      isProcessingRef.current = false;
    }
  };

  return (
    <>
      <button
        onClick={() => fileInputRef.current?.click()}
        className="w-full card card-hover cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
            <ImageIcon size={20} className="text-purple-600" />
          </div>
          <div className="text-left">
            <div className="text-sm font-medium text-gray-700">Изображение</div>
            <div className="type-meta">PNG, JPG, SVG, PDF</div>
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
    </>
  );
}
