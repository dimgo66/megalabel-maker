import { Toolbar } from './components/Toolbar';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { SheetPreview } from './components/SheetPreview';
import { useProjectStore } from './store/useProjectStore';
import { useHotkeys } from './hooks/useHotkeys';
import { serializeProject, downloadProjectFile, readProjectFile } from './utils/projectSerializer';
import { LABEL_FORMATS } from './config/labelFormats';
import { mmToPx } from './utils/layoutCalculator';

function App() {
  const {
    selectedFormat,
    sheetSettings,
    projectName,
    editorZoom,
    markSaved,
    loadProject,
  } = useProjectStore();

  const handleSave = () => {
    const state = useProjectStore.getState();
    const json = serializeProject(state.labelDesign, state.sheetSettings);
    const project = JSON.parse(json);
    downloadProjectFile(project, `${state.projectName}.labelproj.json`);
    markSaved();
  };

  const handleLoad = () => {
    const state = useProjectStore.getState();
    if (state.isDirty) {
      const confirmed = confirm('Есть несохранённые изменения. Загрузить проект без сохранения?');
      if (!confirmed) return;
    }
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.labelproj.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const project = await readProjectFile(file);
        const format = LABEL_FORMATS.find(f => f.id === project.labelDesign.formatId);
        if (format) {
          loadProject(project.labelDesign, project.sheetSettings);
        } else {
          alert('Формат из файла не найден в списке доступных');
        }
      } catch (err) {
        alert(`Ошибка загрузки: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
      }
    };
    input.click();
  };

  useHotkeys({
    onSave: handleSave,
    onLoad: handleLoad,
  });

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Toolbar */}
      <Toolbar />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel */}
        <LeftPanel />

        {/* Center - Canvas */}
        <main className="flex-1 flex flex-col overflow-hidden bg-gray-200">
          {/* Canvas header */}
          <div className="h-10 bg-white border-b border-gray-300 flex items-center px-4 justify-between shrink-0">
            <span className="text-sm text-gray-700">Редактор этикетки</span>
            <span className="text-xs text-gray-500">
              {selectedFormat.width_mm}×{selectedFormat.height_mm} мм
              {selectedFormat.shape === 'circle' && ` • ⌀${selectedFormat.width_mm} мм`}
            </span>
          </div>

          {/* Canvas area */}
          <div className="flex-1 flex items-center justify-center overflow-auto p-8">
            <div
              className="bg-white shadow-lg border border-gray-300 flex items-center justify-center relative overflow-hidden"
              style={{
                width: `${mmToPx(selectedFormat.width_mm) * editorZoom}px`,
                height: `${mmToPx(selectedFormat.height_mm) * editorZoom}px`,
              }}
            >
              {/* Safety margin visualization */}
              {sheetSettings.safetyMargin_mm > 0 && (
                <>
                  {/* Top safety zone */}
                  <div
                    className="absolute top-0 left-0 right-0 bg-red-500/10 pointer-events-none"
                    style={{ height: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px` }}
                  />
                  {/* Bottom safety zone */}
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-red-500/10 pointer-events-none"
                    style={{ height: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px` }}
                  />
                  {/* Left safety zone */}
                  <div
                    className="absolute top-0 left-0 bottom-0 bg-red-500/10 pointer-events-none"
                    style={{ width: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px` }}
                  />
                  {/* Right safety zone */}
                  <div
                    className="absolute top-0 right-0 bottom-0 bg-red-500/10 pointer-events-none"
                    style={{ width: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px` }}
                  />
                  {/* Safety margin border */}
                  <div
                    className="absolute border border-dashed border-red-400/60 pointer-events-none"
                    style={{
                      top: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px`,
                      left: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px`,
                      right: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px`,
                      bottom: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px`,
                    }}
                  />
                  {/* Safety margin label (top) */}
                  <div
                    className="absolute text-[9px] text-red-500/80 font-medium pointer-events-none"
                    style={{
                      top: `${mmToPx(sheetSettings.safetyMargin_mm / 2) * editorZoom - 5}px`,
                      left: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom + 3}px`,
                    }}
                  >
                    ↕ {sheetSettings.safetyMargin_mm} мм
                  </div>
                  {/* Safety margin label (left) */}
                  <div
                    className="absolute text-[9px] text-red-500/80 font-medium pointer-events-none"
                    style={{
                      top: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom + 3}px`,
                      left: `${mmToPx(sheetSettings.safetyMargin_mm / 2) * editorZoom - 12}px`,
                    }}
                  >
                    ↔ {sheetSettings.safetyMargin_mm} мм
                  </div>
                </>
              )}

              {/* Shape guide */}
              {selectedFormat.shape === 'circle' ? (
                <div className="absolute inset-2 border-2 border-dashed border-gray-300 rounded-full flex items-center justify-center z-10">
                  <div className="text-center text-gray-400">
                    <p className="text-sm">⭕ Круглая этикетка</p>
                    <p className="text-xs mt-1">⌀{selectedFormat.width_mm} мм</p>
                    <p className="text-xs text-gray-300 mt-2">Canvas-редактор (Fabric.js)</p>
                  </div>
                </div>
              ) : (
                <div className="text-center text-gray-400 z-10">
                  <p className="text-sm">🏷️ Область редактирования</p>
                  <p className="text-xs mt-1">{selectedFormat.width_mm}×{selectedFormat.height_mm} мм</p>
                  <p className="text-xs text-gray-300 mt-2">Canvas-редактор (Fabric.js)</p>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Right panel */}
        <RightPanel />
      </div>

      {/* Bottom preview panel */}
      <SheetPreview />
    </div>
  );
}

export default App;
