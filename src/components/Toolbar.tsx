import { useState } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { FormatSelector } from './FormatSelector';
import { UndoRedoButtons } from './UndoRedoButtons';
import { useProjectFile } from '../hooks/useProjectFile';
import { LabelFormat } from '../types';
import { HelpModal } from './HelpModal';
import { Eye, FolderOpen, Save, Tag } from './icons';

interface ToolbarProps {
  onPreview?: () => void;
}

export function Toolbar({ onPreview }: ToolbarProps) {
  const {
    projectName,
    selectedFormat,
    isDirty,
    setProjectName,
    setSelectedFormat,
  } = useProjectStore();

  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Сохранение и загрузка — общая реализация с горячими клавишами App.tsx
  const { handleSave, handleLoad } = useProjectFile();

  const handleFormatSelect = (format: LabelFormat) => {
    setSelectedFormat(format);
  };

  return (
    <>
    <div className="h-16 bg-white border-b border-gray-200 flex items-center px-4 2xl:px-6 gap-2 2xl:gap-4 shrink-0 shadow-sm">
      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
          <Tag size={18} className="text-white" />
        </div>
        <h1 className="text-lg font-bold text-gray-900 whitespace-nowrap">Megalabel Pro</h1>
      </div>

      {/* Divider */}
      <div className="h-8 w-px bg-gray-200 shrink-0" />

      {/* Project name.
          Ширина сжимается до min-w-[8rem], а не до min-content: при 1024px
          поле раньше сжималось до ~26px и текст в нём был нечитаем. */}
      <input
        type="text"
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        aria-label="Название проекта"
        className="w-[280px] min-w-[8rem] px-3 py-2 bg-transparent border border-transparent rounded-lg text-sm text-gray-900 placeholder-gray-500 hover:border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
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
      <div className="h-8 w-px bg-gray-200 shrink-0 hidden xl:block" />

      {/* Save button */}
      <button
        type="button"
        onClick={handleSave}
        className="btn btn-primary flex items-center gap-2 shrink-0"
        title="Сохранить (Ctrl+S)"
        aria-label="Сохранить проект"
      >
        <Save size={16} />
        <span className="hidden xl:inline">Сохранить</span>
      </button>

      {/* Load button */}
      <button
        type="button"
        onClick={handleLoad}
        className="btn btn-secondary flex items-center gap-2 shrink-0"
        title="Загрузить (Ctrl+O)"
        aria-label="Загрузить проект"
      >
        <FolderOpen size={16} />
        <span className="hidden xl:inline">Загрузить</span>
      </button>

      {/* Preview button */}
      <button
        type="button"
        onClick={onPreview}
        className="btn btn-secondary flex items-center gap-2 shrink-0"
        title="Предпросмотр листа, печать и сохранение PDF (Ctrl+Shift+P)"
        aria-label="Предпросмотр листа"
      >
        <Eye size={16} />
        <span className="hidden xl:inline">Предпросмотр</span>
      </button>

      {/* Spacer */}
      <div className="flex-1 min-w-0" />

      {/* Help button */}
      <button
        type="button"
        onClick={() => setIsHelpOpen(true)}
        className="btn-icon shrink-0"
        title="Справка"
        aria-label="Справка"
      >
        <span className="text-base font-bold text-gray-500" aria-hidden="true">?</span>
      </button>

      {/* Save status indicator.
          До 1280px текст статуса скрывается — остаётся иконка с aria-label.
          Раньше при 1024–1140px индикатор уходил за правый край окна. */}
      <div
        className="flex items-center gap-2 shrink-0"
        role="status"
        aria-live="polite"
        aria-label={isDirty ? 'Есть несохранённые изменения' : 'Изменения сохранены'}
      >
        {isDirty ? (
          <>
            {/* amber-600, а не amber-500: 2.15:1 на белом ниже нормы 3:1 для
                нетекстового индикатора. Справка рисует тот же тон, иначе
                легенда расходится с тем, что человек видит в панели. */}
            <div className="w-2 h-2 bg-amber-600 rounded-full animate-pulse" aria-hidden="true" />
            <span className="text-sm text-amber-700 font-medium hidden xl:inline">Изменения</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-sm text-green-700 font-medium hidden xl:inline">Сохранено</span>
          </>
        )}
      </div>
    </div>

      {/* Help Modal */}
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </>
  );
}
