import { useProjectStore } from '../store/useProjectStore';
import { TextPanel } from './TextPanel';
import { ImagePropertiesPanel } from './ImagePropertiesPanel';
import { LayersPanel } from './LayersPanel';

export function RightPanel() {
  const {
    selectedFormat,
    sheetSettings,
    setSheetSettings,
  } = useProjectStore();

  const handleSafetyMarginChange = (value: number) => {
    setSheetSettings({ safetyMargin_mm: value });
  };

  return (
    <div className="w-[300px] bg-white border-l border-gray-200 flex flex-col shrink-0 overflow-y-auto">
      {/* Header */}
      <div className="h-12 border-b border-gray-200 flex items-center px-4 shrink-0">
        <span className="text-sm font-semibold text-gray-900">Свойства</span>
      </div>

      {/* Text properties - shown when text object is selected */}
      <TextPanel />

      {/* Image properties - shown when image object is selected */}
      <ImagePropertiesPanel />

      {/* Layers panel */}
      <LayersPanel canvas={(window as any).__fabricCanvas} />

      {/* Format section */}
      <div className="p-4 border-b border-gray-200">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Формат</h4>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Размер этикетки:</span>
            <span className="text-sm font-medium text-gray-900">
              {selectedFormat.width_mm}×{selectedFormat.height_mm} мм
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Количество на листе:</span>
            <span className="text-sm font-medium text-gray-900">{selectedFormat.count} шт</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Форма:</span>
            <span className="text-sm font-medium text-gray-900">
              {selectedFormat.shape === 'circle' ? '⚪ Круг' : '▭ Прямоугольник'}
            </span>
          </div>
        </div>
      </div>



      {/* Safety margin section */}
      <div className="p-4">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Безопасные поля</h4>
        <div className="card bg-gray-50">
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-700 mb-2">
                Отступ от края этикетки:
              </label>
              <div className="flex items-center gap-3">
                <input
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
              <input
                type="range"
                min="0"
                max="10"
                step="0.5"
                value={sheetSettings.safetyMargin_mm}
                onChange={(e) => handleSafetyMarginChange(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>0 мм</span>
                <span>10 мм</span>
              </div>
            </div>
            <div className="flex items-start gap-2 pt-2 border-t border-gray-200">
              <span className="text-blue-600 text-sm">💡</span>
              <p className="text-xs text-gray-600 leading-relaxed">
                Не размещайте важные элементы за пределами безопасного поля
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
