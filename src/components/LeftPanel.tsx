import { useProjectStore } from '../store/useProjectStore';

export function LeftPanel() {
  const { sheetSettings, setSheetSettings } = useProjectStore();

  return (
    <div className="w-60 bg-white border-r border-gray-300 flex flex-col shrink-0">
      {/* Header */}
      <div className="h-10 border-b border-gray-200 flex items-center px-4 shrink-0">
        <span className="text-sm font-medium text-gray-700">Инструменты</span>
      </div>

      {/* Sheet settings */}
      <div className="p-3 border-b border-gray-200">
        <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Настройки листа</h4>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Безопасные поля: {sheetSettings.safetyMargin_mm} мм
          </label>
          <input
            type="range"
            min="0"
            max="15"
            step="0.5"
            value={sheetSettings.safetyMargin_mm}
            onChange={(e) => setSheetSettings({ safetyMargin_mm: Number(e.target.value) })}
            className="w-full"
          />
        </div>
      </div>

      {/* Content - placeholder for step 3 */}
      <div className="flex-1 p-4">
        <div className="text-xs text-gray-400 text-center mt-8">
          Инструменты будут добавлены на шаге 3
        </div>
      </div>
    </div>
  );
}
