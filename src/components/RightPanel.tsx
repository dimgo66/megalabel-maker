import { useId } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { TextPanel } from './TextPanel';
import { ImagePropertiesPanel } from './ImagePropertiesPanel';
import { BarcodePropertiesPanel } from './BarcodePropertiesPanel';
import { LayersPanel } from './LayersPanel';
import { CollapsibleSection } from './CollapsibleSection';
import { Lightbulb } from './icons';

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
    <div className="w-[300px] bg-white border-l border-gray-200 flex flex-col shrink-0 overflow-y-auto">
      {/* Header */}
      <div className="h-12 border-b border-gray-200 flex items-center px-4 shrink-0">
        <span className="type-region">Свойства</span>
      </div>

      {/* Text properties - shown when text object is selected */}
      <TextPanel />

      {/* Image properties - shown when image object is selected */}
      <ImagePropertiesPanel />

      {/* Barcode properties - shown when barcode object is selected */}
      <BarcodePropertiesPanel />

      {/* Layers panel */}
      <LayersPanel canvas={(window as any).__fabricCanvas} />

      {/* Sheet settings — collapsible */}
      <CollapsibleSection title="Лист" className="mx-4 mt-2 border-t border-gray-200">
        <div className="card bg-gray-50">
          <div className="space-y-3">
            <div>
              <label htmlFor={safetyInputId} className="block text-sm text-gray-700 mb-2">
                Безопасные поля
              </label>
              <div className="flex items-center gap-3">
                <input
                  id={safetyInputId}
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  value={sheetSettings.safetyMargin_mm}
                  onChange={(e) => handleSafetyMarginChange(Number(e.target.value))}
                  className="w-20"
                />
                <span className="text-sm text-gray-600">мм</span>
              </div>
            </div>

            <div>
              <label htmlFor={safetyRangeId} className="sr-only">
                Безопасные поля (ползунок)
              </label>
              <input
                id={safetyRangeId}
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={sheetSettings.safetyMargin_mm}
                onChange={(e) => handleSafetyMarginChange(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between type-meta mt-1">
                <span>0 мм</span>
                <span>10 мм</span>
              </div>
            </div>

            <div className="flex items-start gap-2 pt-2 border-t border-gray-200">
              <Lightbulb size={15} className="text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-gray-600 leading-relaxed">
                Не размещайте важные элементы за пределами безопасного поля
              </p>
            </div>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}
