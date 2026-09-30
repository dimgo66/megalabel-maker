import { useRef } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { LABEL_FORMATS } from '../config/labelFormats';
import { FormatSelector } from './FormatSelector';
import { serializeProject, downloadProjectFile, readProjectFile } from '../utils/projectSerializer';
import { LabelFormat } from '../types';

export function Toolbar() {
  const {
    projectName,
    selectedFormat,
    isDirty,
    labelDesign,
    sheetSettings,
    setProjectName,
    setSelectedFormat,
    loadProject,
    markSaved,
  } = useProjectStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

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
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFormatSelect = (format: LabelFormat) => {
    setSelectedFormat(format);
  };

  return (
    <div className="h-14 bg-white border-b border-gray-300 flex items-center px-4 gap-3 shrink-0">
      {/* Project name */}
      <input
        type="text"
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        className="px-2 py-1 bg-transparent border border-transparent rounded text-sm text-gray-700 hover:border-gray-300 focus:border-gray-400 focus:outline-none w-48 transition-colors"
        placeholder="Название проекта"
      />

      {/* Format selector */}
      <FormatSelector
        selectedFormat={selectedFormat}
        onSelect={handleFormatSelect}
      />

      {/* Divider */}
      <div className="h-6 w-px bg-gray-300" />

      {/* Save button */}
      <button
        onClick={handleSave}
        className="px-3 py-1.5 bg-white border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        title="Сохранить (Ctrl+S)"
      >
        💾 Сохранить
      </button>

      {/* Load button */}
      <button
        onClick={handleLoad}
        className="px-3 py-1.5 bg-white border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        title="Загрузить (Ctrl+O)"
      >
        📂 Загрузить
      </button>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.labelproj.json"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Divider */}
      <div className="h-6 w-px bg-gray-300" />

      {/* Print button (placeholder) */}
      <button
        onClick={() => alert('Печать будет доступна позже')}
        className="px-3 py-1.5 bg-white border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50 transition-colors"
      >
        🖨️ Печать
      </button>

      {/* Export PDF button (placeholder) */}
      <button
        onClick={() => alert('Экспорт будет доступен позже')}
        className="px-3 py-1.5 bg-white border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50 transition-colors"
      >
        📄 Экспорт PDF
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Save status indicator */}
      <div className="text-xs">
        {isDirty ? (
          <span className="text-gray-500">● Не сохранено</span>
        ) : (
          <span className="text-gray-400">✓ Сохранено</span>
        )}
      </div>
    </div>
  );
}
