import { useProjectStore } from './store/useProjectStore';
import { LABEL_FORMATS } from './config/labelFormats';
import { calculateLayout, mmToPx } from './utils/layoutCalculator';
import { serializeProject, downloadProjectFile, readProjectFile } from './utils/projectSerializer';
import { loadMyriadPro } from './utils/fontLoader';
import { useRef } from 'react';

function App() {
  const {
    selectedFormat,
    sheetSettings,
    projectName,
    isDirty,
    editorZoom,
    previewZoom,
    loadedFonts,
    setSelectedFormat,
    setProjectName,
    setEditorZoom,
    setPreviewZoom,
    resetProject,
    markSaved,
    loadProject,
    addLoadedFont,
  } = useProjectStore();

  const layout = calculateLayout(selectedFormat);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFormatChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const format = LABEL_FORMATS.find(f => f.id === e.target.value);
    if (format) {
      setSelectedFormat(format);
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProjectName(e.target.value);
  };

  const handleSaveProject = () => {
    const state = useProjectStore.getState();
    const json = serializeProject(state.labelDesign, state.sheetSettings);
    const project = JSON.parse(json);
    downloadProjectFile(project, `${state.projectName}.labelproj.json`);
    markSaved();
  };

  const handleLoadProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const project = await readProjectFile(file);
        loadProject(project.labelDesign, project.sheetSettings);
      } catch (err) {
        alert(`Ошибка загрузки: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
      }
    }
  };

  const handleFontLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const result = await loadMyriadPro(files);
      if (result.loaded.length > 0) {
        result.loaded.forEach(font => {
          addLoadedFont(font);
        });
        alert(`Загружены шрифты: ${result.loaded.join(', ')}`);
      }
      if (result.errors.length > 0) {
        alert(`Ошибки:\n${result.errors.join('\n')}`);
      }
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-blue-400">🏷️</span>
          <h1 className="text-lg font-bold">Megalabel Pro</h1>
        </div>
        
        <div className="h-6 w-px bg-gray-600" />
        
        {/* Project name */}
        <input
          type="text"
          value={projectName}
          onChange={handleNameChange}
          className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm w-48 focus:outline-none focus:border-blue-500"
          placeholder="Название проекта"
        />
        
        {isDirty && (
          <span className="text-yellow-400 text-xs">● несохранено</span>
        )}
        
        <div className="flex-1" />
        
        {/* Zoom controls */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-400">Редактор:</span>
          <input
            type="range"
            min="50"
            max="500"
            value={editorZoom * 100}
            onChange={(e) => setEditorZoom(Number(e.target.value) / 100)}
            className="w-20 accent-blue-500"
          />
          <span className="w-12 text-right">{Math.round(editorZoom * 100)}%</span>
        </div>
        
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-400">Превью:</span>
          <input
            type="range"
            min="25"
            max="300"
            value={previewZoom * 100}
            onChange={(e) => setPreviewZoom(Number(e.target.value) / 100)}
            className="w-20 accent-blue-500"
          />
          <span className="w-12 text-right">{Math.round(previewZoom * 100)}%</span>
        </div>
      </header>
      
      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - Settings */}
        <aside className="w-72 bg-gray-800 border-r border-gray-700 p-4 overflow-y-auto shrink-0">
          {/* Format selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Формат этикеток
            </label>
            <select
              value={selectedFormat.id}
              onChange={handleFormatChange}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            >
              {LABEL_FORMATS.map(format => (
                <option key={format.id} value={format.id}>
                  {format.name}
                </option>
              ))}
            </select>
          </div>
          
          {/* Format info */}
          <div className="mb-6 rounded-lg p-3 border border-gray-700 bg-gray-800/50">
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Параметры формата</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Размер:</span>
                <span>{selectedFormat.width_mm}×{selectedFormat.height_mm} мм</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Количество:</span>
                <span>{selectedFormat.count} шт</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Форма:</span>
                <span>{selectedFormat.shape === 'circle' ? 'Круг' : 'Прямоугольник'}</span>
              </div>
            </div>
          </div>
          
          {/* Layout info */}
          <div className="mb-6 rounded-lg p-3 border border-gray-700 bg-gray-800/50">
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Раскладка на листе</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Сетка:</span>
                <span>{layout.cols}×{layout.rows}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Отступ сверху:</span>
                <span>{layout.marginTop_mm.toFixed(1)} мм</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Отступ слева:</span>
                <span>{layout.marginLeft_mm.toFixed(1)} мм</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Зазор X:</span>
                <span>{layout.gapX_mm.toFixed(1)} мм</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Зазор Y:</span>
                <span>{layout.gapY_mm.toFixed(1)} мм</span>
              </div>
            </div>
          </div>
          
          {/* Sheet settings */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Настройки листа</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={sheetSettings.showCutLines}
                  onChange={(e) => useProjectStore.getState().setSheetSettings({ showCutLines: e.target.checked })}
                  className="accent-blue-500"
                />
                Линии отреза
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={sheetSettings.mirrorPrint}
                  onChange={(e) => useProjectStore.getState().setSheetSettings({ mirrorPrint: e.target.checked })}
                  className="accent-blue-500"
                />
                Зеркальная печать
              </label>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Безопасные поля: {sheetSettings.safetyMargin_mm} мм
                </label>
                <input
                  type="range"
                  min="0"
                  max="15"
                  step="0.5"
                  value={sheetSettings.safetyMargin_mm}
                  onChange={(e) => useProjectStore.getState().setSheetSettings({ safetyMargin_mm: Number(e.target.value) })}
                  className="w-full accent-blue-500"
                />
              </div>
            </div>
          </div>
          
          {/* Actions */}
          <div className="space-y-2">
            <button
              onClick={resetProject}
              className="w-full bg-red-600 hover:bg-red-700 text-white text-sm py-2 px-3 rounded transition-colors"
            >
              🗑️ Новый проект
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.labelproj.json"
              className="hidden"
              onChange={handleLoadProject}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-gray-600 hover:bg-gray-500 text-white text-sm py-2 px-3 rounded transition-colors"
            >
              📂 Загрузить проект
            </button>
            <button
              onClick={handleSaveProject}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 px-3 rounded transition-colors"
            >
              💾 Сохранить проект
            </button>
          </div>
        </aside>
        
        {/* Center - Canvas area (placeholder) */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center gap-2 shrink-0">
            <span className="text-sm text-gray-400">Редактор этикетки</span>
            <div className="flex-1" />
            <span className="text-xs text-gray-500">
              {selectedFormat.width_mm}×{selectedFormat.height_mm} мм
              {selectedFormat.shape === 'circle' ? ` | ⌀${selectedFormat.width_mm} мм` : ''}
            </span>
          </div>
          
          {/* Canvas placeholder */}
          <div className="flex-1 flex items-center justify-center bg-gray-900 overflow-auto p-8">
            <div 
              className="bg-white shadow-2xl border border-gray-300 flex items-center justify-center relative"
              style={{
                width: `${mmToPx(selectedFormat.width_mm) * editorZoom}px`,
                height: `${mmToPx(selectedFormat.height_mm) * editorZoom}px`,
              }}
            >
              {selectedFormat.shape === 'circle' ? (
                <div className="absolute inset-2 border-2 border-dashed border-gray-300 rounded-full flex items-center justify-center">
                  <div className="text-center text-gray-400">
                    <p className="text-sm">⭕ Круглая этикетка</p>
                    <p className="text-xs mt-1">⌀{selectedFormat.width_mm} мм</p>
                    <p className="text-xs text-gray-300 mt-2">Canvas-редактор (Fabric.js)</p>
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-400">
                  <p className="text-sm">🏷️ Область редактирования</p>
                  <p className="text-xs mt-1">{selectedFormat.width_mm}×{selectedFormat.height_mm} мм</p>
                  <p className="text-xs text-gray-300 mt-2">Canvas-редактор (Fabric.js)</p>
                </div>
              )}
            </div>
          </div>
        </main>
        
        {/* Right sidebar - Preview */}
        <aside className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col overflow-hidden shrink-0">
          <div className="px-4 py-2 border-b border-gray-700 flex items-center">
            <span className="text-sm font-medium text-gray-300">Предпросмотр листа A4</span>
          </div>
          
          <div className="flex-1 overflow-auto p-4 flex items-start justify-center">
            {/* A4 Sheet preview */}
            <div 
              className="bg-white shadow-xl border border-gray-300 relative"
              style={{
                width: `${mmToPx(210) * previewZoom}px`,
                height: `${mmToPx(297) * previewZoom}px`,
              }}
            >
              {/* Grid cells */}
              {Array.from({ length: layout.rows * layout.cols }).map((_, idx) => {
                const col = idx % layout.cols;
                const row = Math.floor(idx / layout.cols);
                const x = layout.marginLeft_mm + col * (layout.cellWidth_mm + layout.gapX_mm);
                const y = layout.marginTop_mm + row * (layout.cellHeight_mm + layout.gapY_mm);
                
                return (
                  <div
                    key={idx}
                    className={`absolute border border-dashed border-gray-300 ${selectedFormat.shape === 'circle' ? 'rounded-full' : ''}`}
                    style={{
                      left: `${mmToPx(x) * previewZoom}px`,
                      top: `${mmToPx(y) * previewZoom}px`,
                      width: `${mmToPx(layout.cellWidth_mm) * previewZoom}px`,
                      height: `${mmToPx(layout.cellHeight_mm) * previewZoom}px`,
                    }}
                  />
                );
              })}
              
              {/* Sheet info overlay */}
              <div className="absolute bottom-1 right-1 text-[8px] text-gray-400">
                A4 {sheetSettings.orientation === 'portrait' ? '📄' : '📃'}
              </div>
            </div>
          </div>
          
          {/* Font loader */}
          <div className="border-t border-gray-700 p-3">
            <label className="block text-xs font-medium text-gray-400 mb-1">
              Шрифт Myriad Pro
            </label>
            <label className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 rounded px-3 py-2 cursor-pointer transition-colors">
              <span className="text-sm">📎 Загрузить .ttf / .otf</span>
              <input
                type="file"
                accept=".ttf,.otf,.woff,.woff2"
                multiple
                className="hidden"
                onChange={handleFontLoad}
              />
            </label>
            {loadedFonts.length > 0 && (
              <div className="mt-2 text-xs text-green-400">
                ✓ Загружено: {loadedFonts.join(', ')}
              </div>
            )}
          </div>
        </aside>
      </div>
      
      {/* Footer */}
      <footer className="bg-gray-800 border-t border-gray-700 px-4 py-1 flex items-center justify-between text-xs text-gray-500 shrink-0">
        <span>Megalabel Pro v1.0.0 | Шаг 1: Архитектура</span>
        <span>
          Формат: {selectedFormat.name} | Сетка: {layout.cols}×{layout.rows} | 
          Лист: {sheetSettings.orientation === 'portrait' ? 'Книжная' : 'Альбомная'}
        </span>
      </footer>
    </div>
  );
}

export default App;
