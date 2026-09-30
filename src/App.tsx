import { Toolbar } from './components/Toolbar';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { SheetPreview } from './components/SheetPreview';
import { LabelCanvas } from './components/LabelCanvas';
import { useProjectStore } from './store/useProjectStore';
import { useHotkeys } from './hooks/useHotkeys';
import { serializeProject, downloadProjectFile, readProjectFile } from './utils/projectSerializer';
import { LABEL_FORMATS } from './config/labelFormats';
import { mmToPx } from './utils/layoutCalculator';

function App() {
  const {
    selectedFormat,
    sheetSettings,
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
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Toolbar */}
      <Toolbar />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel */}
        <LeftPanel />

        {/* Center - Canvas */}
        <main className="flex-1 flex flex-col overflow-hidden bg-gray-100">
          {/* Canvas header */}
          <div className="h-12 bg-white border-b border-gray-200 flex items-center px-6 justify-between shrink-0">
            <span className="text-sm font-semibold text-gray-900">Редактор этикетки</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                {selectedFormat.width_mm}×{selectedFormat.height_mm} мм
              </span>
              {selectedFormat.shape === 'circle' && (
                <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded font-medium">
                  ⚪ Круг
                </span>
              )}
            </div>
          </div>

          {/* Canvas area with safety margins overlay */}
          <div className="flex-1 flex items-center justify-center overflow-auto p-8">
            <div
              className="bg-white shadow-xl border border-gray-300 flex items-center justify-center relative rounded-lg overflow-hidden"
              style={{
                width: `${mmToPx(selectedFormat.width_mm) * editorZoom}px`,
                height: `${mmToPx(selectedFormat.height_mm) * editorZoom}px`,
              }}
            >
              {/* Безопасные поля - визуализация */}
              {sheetSettings.safetyMargin_mm > 0 && (
                <>
                  {/* Верхняя безопасная зона */}
                  <div
                    className="absolute top-0 left-0 right-0 bg-red-500/10 pointer-events-none z-10"
                    style={{ height: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px` }}
                  />
                  {/* Нижняя безопасная зона */}
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-red-500/10 pointer-events-none z-10"
                    style={{ height: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px` }}
                  />
                  {/* Левая безопасная зона */}
                  <div
                    className="absolute top-0 left-0 bottom-0 bg-red-500/10 pointer-events-none z-10"
                    style={{ width: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px` }}
                  />
                  {/* Правая безопасная зона */}
                  <div
                    className="absolute top-0 right-0 bottom-0 bg-red-500/10 pointer-events-none z-10"
                    style={{ width: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px` }}
                  />
                  {/* Пунктирная рамка безопасной зоны */}
                  <div
                    className="absolute border-2 border-dashed border-red-400/60 pointer-events-none z-10"
                    style={{
                      top: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px`,
                      left: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px`,
                      right: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px`,
                      bottom: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px`,
                    }}
                  />
                  {/* Подпись размера безопасного поля */}
                  <div
                    className="absolute text-xs text-red-500/80 font-medium pointer-events-none z-10"
                    style={{
                      top: `${mmToPx(sheetSettings.safetyMargin_mm / 2) * editorZoom - 6}px`,
                      left: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom + 4}px`,
                    }}
                  >
                    ↕ {sheetSettings.safetyMargin_mm} мм
                  </div>
                </>
              )}

              {/* Fabric.js Canvas */}
              <LabelCanvas />
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
