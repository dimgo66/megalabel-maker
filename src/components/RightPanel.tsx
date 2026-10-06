import { useId } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { TextPanel } from './TextPanel';
import { ImagePropertiesPanel } from './ImagePropertiesPanel';
import { BarcodePropertiesPanel } from './BarcodePropertiesPanel';
import { LayersPanel } from './LayersPanel';

export function RightPanel() {
  const safetyInputId = useId();
  const safetyRangeId = useId();

  const { sheetSettings, setSheetSettings } = useProjectStore();

  const handleSafetyMarginChange = (value: number) => {
    if (Number.isNaN(value)) return;
    const clamped = Math.min(10, Math.max(0, value));
    setSheetSettings({ safetyMargin_mm: clamped });
  };

  return (
    <div className="w-[300px] bg-white border-l border-gray-200 flex flex-col shrink-0">
      {/* Header */}
      <div className="h-12 border-b border-gray-200 flex items-center px-4 shrink-0">
        <span className="type-region">Свойства</span>
      </div>

      {/* Безопасные поля — закреплены наверху сайдбара.
          Раньше жили внутри сворачиваемой секции «Лист» и уезжали вниз вместе
          с прокруткой свойств. Теперь это отдельный не-скроллящийся блок между
          заголовком и областью свойств: `position: sticky` здесь не подходит —
          он прилипал бы к верхней кромке скроллера и накрывал заголовок
          «Свойства». Поэтому скроллится только нижняя часть панели. */}
      <div className="px-4 py-3 border-b border-gray-200 shrink-0">
        <div className="flex items-baseline justify-between mb-2">
          <span className="type-group">Безопасные поля</span>
          <span className="type-meta">{sheetSettings.safetyMargin_mm} мм</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            id={safetyInputId}
            type="number"
            min="0"
            max="10"
            step="0.5"
            value={sheetSettings.safetyMargin_mm}
            onChange={(e) => handleSafetyMarginChange(Number(e.target.value))}
            aria-label="Безопасные поля, мм"
            className="w-16"
          />
          <input
            id={safetyRangeId}
            type="range"
            min="0"
            max="10"
            step="0.5"
            value={sheetSettings.safetyMargin_mm}
            onChange={(e) => handleSafetyMarginChange(Number(e.target.value))}
            className="flex-1"
            aria-label="Безопасные поля (ползунок)"
          />
        </div>
        <p className="type-meta mt-1.5">
          Не размещайте важные элементы за пределами безопасного поля
        </p>
      </div>

      {/* Прокручиваемая часть: свойства выбранного объекта и слои */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Text properties - shown when text object is selected */}
        <TextPanel />

        {/* Image properties - shown when image object is selected */}
        <ImagePropertiesPanel />

        {/* Barcode properties - shown when barcode object is selected */}
        <BarcodePropertiesPanel />

        {/* Layers panel — выпадающая секция */}
        <LayersPanel canvas={(window as any).__fabricCanvas} />
      </div>
    </div>
  );
}
