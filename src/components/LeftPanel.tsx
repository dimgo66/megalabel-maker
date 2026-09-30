import { useRef, useState } from 'react';
import { IText } from 'fabric';
import { useProjectStore } from '../store/useProjectStore';
import { loadGoogleFont, loadLocalFonts } from '../utils/fontLoader';
import { ImagePanel } from './ImagePanel';
import { BarcodeModal } from './BarcodeModal';

export function LeftPanel() {
  const {
    fontConfigs,
    loadedGoogleFonts,
    localFonts,
    setGoogleFontLoaded,
    addLocalFont,
    getAvailableFonts,
  } = useProjectStore();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);

  const handleGoogleFontLoad = async (fontId: string) => {
    const fontConfig = fontConfigs.find(f => f.id === fontId);
    if (!fontConfig || !fontConfig.googleUrl) return;
    
    try {
      await loadGoogleFont(fontConfig);
      setGoogleFontLoaded(fontId);
    } catch (error) {
      console.error(`Failed to load Google Font ${fontConfig.name}:`, error);
      alert(`Не удалось загрузить шрифт ${fontConfig.name}`);
    }
  };

  const handleLocalFontUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    try {
      const loadedFonts = await loadLocalFonts(files);
      loadedFonts.forEach(font => addLocalFont(font));
      
      if (loadedFonts.length > 0) {
        alert(`Загружено шрифтов: ${loadedFonts.length}`);
      }
    } catch (error) {
      console.error('Failed to load local fonts:', error);
      alert('Не удалось загрузить шрифты');
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAddText = () => {
    const canvas = (window as any).__fabricCanvas;
    if (!canvas) return;

    const text = new IText('Текст', {
      left: 100,
      top: 100,
      fill: '#000000',
      fontSize: 24,
      fontFamily: 'Arial',
    });

    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
  };

  const systemFonts = fontConfigs.filter(f => f.source === 'system');
  const googleFonts = fontConfigs.filter(f => f.source === 'google');
  const availableFonts = getAvailableFonts();

  return (
    <div className="w-[260px] bg-white border-r border-gray-200 flex flex-col shrink-0 overflow-y-auto">
      {/* Header */}
      <div className="h-12 border-b border-gray-200 flex items-center px-4 shrink-0">
        <span className="text-sm font-semibold text-gray-900">Инструменты</span>
      </div>

      {/* Tools section */}
      <div className="p-4 space-y-3 border-b border-gray-200">
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

        <ImagePanel canvas={(window as any).__fabricCanvas} />

        <button
          onClick={() => setShowBarcodeModal(true)}
          className="w-full card card-hover cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
              <span className="text-xl">▮▮▮</span>
            </div>
            <div className="text-left">
              <div className="text-sm font-medium text-gray-700">Штрих-код</div>
              <div className="text-xs text-gray-400">EAN-13, ITF-14 (вектор)</div>
            </div>
          </div>
        </button>
      </div>

      {/* Barcode Modal */}
      <BarcodeModal
        isOpen={showBarcodeModal}
        onClose={() => setShowBarcodeModal(false)}
      />

      {/* Fonts section */}
      <div className="p-4 flex-1">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Шрифты</h4>
        
        {/* System fonts */}
        <div className="mb-4">
          <div className="text-xs font-medium text-gray-600 mb-2">Системные</div>
          <div className="space-y-1">
            {systemFonts.map(font => (
              <div key={font.id} className="text-sm text-gray-700 px-2 py-1">
                {font.name}
              </div>
            ))}
          </div>
        </div>

        {/* Google Fonts */}
        <div className="mb-4">
          <div className="text-xs font-medium text-gray-600 mb-2">Кириллические (Google Fonts)</div>
          <div className="space-y-1">
            {googleFonts.map(font => {
              const isLoaded = loadedGoogleFonts.includes(font.id);
              return (
                <div key={font.id} className="flex items-center justify-between px-2 py-1">
                  <span className="text-sm text-gray-700">{font.name}</span>
                  {isLoaded ? (
                    <span className="text-green-600 text-xs">✓</span>
                  ) : (
                    <button
                      onClick={() => handleGoogleFontLoad(font.id)}
                      className="text-xs text-blue-600 hover:text-blue-700"
                    >
                      ↓ Загрузить
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Local fonts */}
        <div>
          <div className="text-xs font-medium text-gray-600 mb-2">С компьютера</div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full btn btn-secondary flex items-center justify-center gap-2 mb-2"
          >
            <span>📁</span>
            <span>Загрузить шрифт</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".ttf,.otf,.woff,.woff2"
            multiple
            onChange={handleLocalFontUpload}
            className="hidden"
          />
          <p className="text-xs text-gray-400 mb-2">.ttf, .otf, .woff, .woff2</p>
          
          {localFonts.length > 0 && (
            <div>
              <div className="text-xs text-gray-500 mb-1">Загруженные:</div>
              <div className="space-y-1">
                {localFonts.map((font, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm text-gray-700 px-2 py-1">
                    <span className="text-green-600">✓</span>
                    <span>{font.name}</span>
                    <span className="text-xs text-gray-400">
                      ({font.weight} {font.style === 'italic' ? 'italic' : ''})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
