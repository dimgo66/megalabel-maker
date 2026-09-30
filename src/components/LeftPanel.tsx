import { useRef } from 'react';
import { IText } from 'fabric';
import { useProjectStore } from '../store/useProjectStore';
import { loadMyriadPro } from '../utils/fontLoader';

export function LeftPanel() {
  const { loadedFonts, addLoadedFont } = useProjectStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddText = () => {
    const canvas = (window as any).__fabricCanvas;
    if (!canvas) return;

    const text = new IText('Текст', {
      fill: '#000000',
      fontSize: 14,
      fontFamily: loadedFonts.includes('Myriad Pro') ? 'Myriad Pro' : 'Arial',
    });

    canvas.add(text);
    canvas.centerObject(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
  };

  const handleFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const result = await loadMyriadPro(files);
      if (result.loaded.length > 0) {
        result.loaded.forEach(font => addLoadedFont(font));
        alert(`Загружены шрифты: ${result.loaded.join(', ')}`);
      }
      if (result.errors.length > 0) {
        alert(`Ошибки:\n${result.errors.join('\n')}`);
      }
    }
  };

  return (
    <div className="w-[260px] bg-white border-r border-gray-200 flex flex-col shrink-0">
      {/* Header */}
      <div className="h-12 border-b border-gray-200 flex items-center px-4 shrink-0">
        <span className="text-sm font-semibold text-gray-900">Инструменты</span>
      </div>

      {/* Tools section */}
      <div className="p-4 space-y-3">
        <button
          onClick={handleAddText}
          className="w-full card card-hover cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <span className="text-xl text-blue-600">T</span>
            </div>
            <div className="text-left">
              <div className="text-sm font-medium text-gray-700">Текст</div>
              <div className="text-xs text-gray-400">Добавить текст</div>
            </div>
          </div>
        </button>

        <div className="card opacity-50 cursor-not-allowed">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">🖼️</span>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700">Изображение</div>
              <div className="text-xs text-gray-400">Добавить картинку</div>
            </div>
          </div>
        </div>

        <div className="card opacity-50 cursor-not-allowed">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">▮▮▮</span>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700">Штрих-код</div>
              <div className="text-xs text-gray-400">Добавить штрих-код</div>
            </div>
          </div>
        </div>
      </div>

      {/* Fonts section */}
      <div className="p-4 border-t border-gray-200">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Шрифты</h4>
        
        {loadedFonts.includes('Myriad Pro') ? (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="font-medium">Myriad Pro загружен</span>
          </div>
        ) : (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full btn btn-secondary flex items-center justify-center gap-2"
            >
              <span>📎</span>
              <span>Загрузить Myriad Pro</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".ttf,.otf"
              multiple
              onChange={handleFontUpload}
              className="hidden"
            />
            <p className="text-xs text-gray-400 mt-2 text-center">
              .ttf, .otf файлы
            </p>
          </>
        )}
      </div>
    </div>
  );
}
