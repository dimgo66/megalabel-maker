import { useRef, useState } from 'react';
import { Textbox } from 'fabric';
import { useProjectStore } from '../store/useProjectStore';
import { loadGoogleFont, loadLocalFonts } from '../utils/fontLoader';
import { mmToPx } from '../utils/layoutCalculator';
import { COMPACT_WIDTH_RATIO, syncFrameGeometry } from '../utils/textFitter';
import { ImagePanel } from './ImagePanel';
import { BarcodeModal } from './BarcodeModal';
import { LibraryPanel } from './LibraryPanel';
import { CollapsibleSection } from './CollapsibleSection';
import {
  BarcodeIcon,
  Check,
  Download,
  Folder,
  Type as TypeIcon,
} from './icons';

/** Человекочитаемое имя веса — в списке шрифтов числа читаются хуже слова. */
function weightLabel(weight: number): string {
  const labels: Record<number, string> = {
    100: 'тонкий',
    200: 'сверхсветлый',
    300: 'светлый',
    400: 'обычный',
    500: 'средний',
    600: 'полужирный',
    700: 'жирный',
    800: 'сверхжирный',
    900: 'чёрный',
  };
  return labels[weight] ?? String(weight);
}

/**
 * Подставное семейство для превью незагруженного шрифта.
 * Точной гарнитуры до загрузки нет, но общий характер (с засечками или без)
 * известен по имени — этого достаточно, чтобы превью различались между собой.
 */
function previewFamily(fontName: string): string {
  return /serif|alegreya|georgia|times/i.test(fontName) ? 'serif' : 'sans-serif';
}

export function LeftPanel() {
  const {
    fontConfigs,
    loadedGoogleFonts,
    localFonts,
    setGoogleFontLoaded,
    addLocalFont,
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

  /**
   * Новый текстовый блок создаётся сразу фреймом (`Textbox`), а не `IText`.
   * У `IText` нет ширины переноса — он не тянется за боковые ручки и не может
   * быть рамкой, поэтому раньше его приходилось конвертировать на лету.
   * Боковые ручки оставлены видимыми: ими меняется ширина рамки.
   *
   * Блок встаёт в ЦЕНТР этикетки: это точка, которую пользователь считает
   * «по умолчанию», а не левый верхний угол (там блок читался как уехавший за
   * край). Позиция задаётся через `originX/originY: 'center'` — так она не
   * зависит от ширины и высоты рамки, которые ещё будут меняться.
   */
  const handleAddText = () => {
    const canvas = (window as any).__fabricCanvas;
    if (!canvas) return;

    const state = useProjectStore.getState();
    const margin = state.sheetSettings.safetyMargin_mm > 0 ? state.sheetSettings.safetyMargin_mm : 1;
    const inset = mmToPx(margin);
    // Размер сцены в базовых координатах: зум редактора на геометрию не влияет.
    const zoom = canvas.getZoom() || 1;
    const sceneW = canvas.getWidth() / zoom;
    const sceneH = canvas.getHeight() / zoom;
    const zoneWidth = Math.max(8, mmToPx(state.selectedFormat.width_mm) - inset * 2);

    const text = new Textbox('Текст', {
      left: sceneW / 2,
      top: sceneH / 2,
      originX: 'center',
      originY: 'center',
      width: Math.max(32, zoneWidth * COMPACT_WIDTH_RATIO),
      fill: '#000000',
      fontSize: 24,
      fontFamily: 'Roboto Condensed',
    });

    // Рамка идёт за текстом: при коротком тексте высота — одна строка, и
    // `clipPath` не должен отрезать то, что пользователь допишет следом.
    (text as any).frameAutoHeight = true;
    syncFrameGeometry(text);

    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.renderAll();
  };

  const googleFonts = fontConfigs.filter(f => f.source === 'google');

  return (
    <div className="w-[260px] bg-white border-r border-gray-200 flex flex-col shrink-0 overflow-y-auto">
      {/* Header */}
      <div className="h-12 border-b border-gray-200 flex items-center px-4 shrink-0">
        <span className="type-region">Инструменты</span>
      </div>

      {/* Tools section */}
      <div className="p-4 space-y-3 border-b border-gray-200">
        <button
          onClick={handleAddText}
          className="w-full card card-hover cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <TypeIcon size={20} className="text-blue-600" />
            </div>
            <div className="text-left">
              <div className="text-sm font-medium text-gray-700">Текст</div>
              <div className="type-meta">Добавить текст</div>
            </div>
          </div>
        </button>

        <ImagePanel canvas={(window as any).__fabricCanvas} />

        <button
          onClick={() => setShowBarcodeModal(true)}
          className="w-full card card-hover cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-50 rounded-lg flex items-center justify-center">
              {/* Иконка нарисована. Раньше здесь были три глифа ▮: при text-xl
                  они давали 58px в плитке 40px и вылезали за скруглённый
                  квадрат на 9px с каждой стороны, а ширина зависела от
                  подстановки шрифта. SVG всегда 20×20 по центру.
                  Teal, а не purple: фиолетовый занят изображениями, и две
                  плитки «добавить объект» выглядели одинаково. */}
              <BarcodeIcon size={20} className="text-teal-700" />
            </div>
            <div className="text-left">
              <div className="text-sm font-medium text-gray-700">Штрих-код</div>
              <div className="type-meta">EAN-13, ITF-14 (вектор)</div>
            </div>
          </div>
        </button>
      </div>

      {/* Barcode Modal */}
      <BarcodeModal
        isOpen={showBarcodeModal}
        onClose={() => setShowBarcodeModal(false)}
      />

      {/* Library — независимая секция: хранит любые объекты, не только текст */}
      <LibraryPanel />

      {/* Fonts section — collapsible.
          Разделитель даёт border-b у «Библиотеки» выше, поэтому border-t здесь не нужен.
          Внутри — только один уровень раскрытия: вложенный аккордеон внутри
          аккордеона давал двойной выпадающий список и лишний клик. */}
      <CollapsibleSection
        title="Шрифты"
        badge={
          <span className="type-meta font-normal">
            {loadedGoogleFonts.length + localFonts.length} подключено
          </span>
        }
        contentClassName="px-4 pb-4"
      >
        {/* Google Fonts — обычный подзаголовок, без собственного раскрытия */}
        <div className="mb-4">
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="type-group">
              Google Fonts (кириллица)
            </h3>
            <span className="type-meta">
              {loadedGoogleFonts.length}/{googleFonts.length}
            </span>
          </div>
          {/* Список ограничен по высоте: 17 шрифтов иначе растягивали панель
              на всю длину и выталкивали блок «С компьютера» из вида.
              Высота 80 (было 72): строки стали выше — у каждой теперь превью
              начертаний, и в прежние 288px помещалось бы 3 шрифта. */}
          <div className="border border-gray-200 rounded-lg overflow-y-auto max-h-80 bg-gray-50">
            {googleFonts.map(font => {
              const isLoaded = loadedGoogleFonts.includes(font.id);
              const fontFamily = font.name;
              return (
                <div
                  key={font.id}
                  className="px-3 py-2 border-b border-gray-100 last:border-0 hover:bg-white transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-sm leading-tight truncate"
                      style={{ fontFamily: isLoaded ? fontFamily : 'inherit', color: isLoaded ? '#1f2937' : '#6b7280' }}
                    >
                      {font.name}
                    </span>
                    {isLoaded ? (
                      <Check
                        size={14}
                        className="text-green-700 shrink-0"
                        role="img"
                        aria-label="Шрифт загружен"
                        aria-hidden={undefined}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleGoogleFontLoad(font.id)}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-1.5 py-0.5 rounded transition-colors shrink-0 font-medium"
                        title={`Загрузить ${font.name}`}
                        aria-label={`Загрузить шрифт ${font.name}`}
                      >
                        <Download size={14} />
                      </button>
                    )}
                  </div>

                  {/* Превью начертаний: каждый доступный вес показан своим
                      начертанием, поэтому до загрузки видно набор весов и
                      курсив, а после — как шрифт реально выглядит.
                      У незагруженного шрифта гарнитуры ещё нет: образец идёт
                      подставным семейством (serif/sans-serif по имени), а не
                      системным шрифтом интерфейса — иначе все превью выглядели
                      бы одинаково и ничего не сообщали. */}
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 mt-1">
                    {font.weights.map(weight => (
                      <span
                        key={weight}
                        className="text-xs leading-tight whitespace-nowrap"
                        style={{
                          fontFamily: isLoaded ? fontFamily : previewFamily(font.name),
                          fontWeight: weight,
                          color: isLoaded ? '#374151' : '#9CA3AF',
                        }}
                      >
                        Аа <span className="type-meta">{weightLabel(weight)}</span>
                      </span>
                    ))}
                    {font.styles.includes('italic') && (
                      <span
                        className="text-xs leading-tight whitespace-nowrap"
                        style={{
                          fontFamily: isLoaded ? fontFamily : previewFamily(font.name),
                          fontStyle: 'italic',
                          color: isLoaded ? '#374151' : '#9CA3AF',
                        }}
                      >
                        Аа <span className="type-meta">курсив</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Local fonts */}
        <div>
          <h3 className="type-group mb-2">
            С компьютера
          </h3>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full btn btn-secondary flex items-center justify-center gap-2 mb-2"
          >
            <Folder size={16} />
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
          <p className="type-meta mb-2">.ttf, .otf, .woff, .woff2</p>
          {localFonts.length > 0 && (
            <div>
              <div className="type-meta mb-1">
                Загруженные ({localFonts.length}):
              </div>
              <div className="space-y-1">
                {localFonts.map((font, idx) => (
                  <div key={`${font.name}-${idx}`} className="flex items-center gap-2 text-sm text-gray-700 px-2 py-1">
                    <Check size={14} className="text-green-700 shrink-0" />
                    <span className="truncate" title={font.name}>{font.name}</span>
                    <span className="type-meta shrink-0">
                      ({font.weight} {font.style === 'italic' ? 'italic' : ''})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>
    </div>
  );
}
