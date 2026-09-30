import { useRef } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { LABEL_FORMATS } from '../config/labelFormats';
import { FormatSelector } from './FormatSelector';
import { UndoRedoButtons } from './UndoRedoButtons';
import { serializeProject, downloadProjectFile, readProjectFile } from '../utils/projectSerializer';
import { LabelFormat } from '../types';

export function Toolbar() {
  const {
    projectName,
    selectedFormat,
    isDirty,
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

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFormatSelect = (format: LabelFormat) => {
    setSelectedFormat(format);
  };

  return (
    <div className="h-16 bg-white border-b border-gray-200 flex items-center px-6 gap-4 shrink-0 shadow-sm">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <span className="text-white text-lg">🏷️</span>
        </div>
        <h1 className="text-lg font-bold text-gray-900">Label Maker</h1>
      </div>

      {/* Divider */}
      <div className="h-8 w-px bg-gray-200" />

      {/* Project name */}
      <input
        type="text"
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        className="w-[200px] px-3 py-2 bg-transparent border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-400 hover:border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
        placeholder="Без названия"
      />

      {/* Format selector */}
      <FormatSelector
        selectedFormat={selectedFormat}
        onSelect={handleFormatSelect}
      />

      {/* Undo/Redo buttons */}
      <UndoRedoButtons />

      {/* Divider */}
      <div className="h-8 w-px bg-gray-200" />

      {/* Save button */}
      <button
        onClick={handleSave}
        className="btn btn-primary flex items-center gap-2"
        title="Сохранить (Ctrl+S)"
      >
        <span>💾</span>
        <span>Сохранить</span>
      </button>

      {/* Load button */}
      <button
        onClick={handleLoad}
        className="btn btn-secondary flex items-center gap-2"
        title="Загрузить (Ctrl+O)"
      >
        <span>📂</span>
        <span>Загрузить</span>
      </button>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.labelproj.json"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Print button (placeholder) */}
      <button
        onClick={() => alert('Печать будет доступна позже')}
        className="btn btn-secondary flex items-center gap-2"
      >
        <span>🖨️</span>
        <span>Печать</span>
      </button>

      {/* Export PDF button (placeholder) */}
      <button
        onClick={() => alert('Экспорт будет доступен позже')}
        className="btn btn-secondary flex items-center gap-2"
      >
        <span>📄</span>
        <span>PDF</span>
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Save status indicator */}
      <div className="flex items-center gap-2">
        {isDirty ? (
          <>
            <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            <span className="text-sm text-amber-600 font-medium">Изменения</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-sm text-green-600 font-medium">Сохранено</span>
          </>
        )}
      </div>
    </div>
  );
}
