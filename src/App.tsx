import { Toolbar } from './components/Toolbar';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { SheetPreview } from './components/SheetPreview';
import { LabelCanvas } from './components/LabelCanvas';
import { useProjectStore } from './store/useProjectStore';
import { useHotkeys } from './hooks/useHotkeys';
import { serializeProject, downloadProjectFile, readProjectFile } from './utils/projectSerializer';
import { LABEL_FORMATS } from './config/labelFormats';

function App() {
  const {
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
          <LabelCanvas />
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
