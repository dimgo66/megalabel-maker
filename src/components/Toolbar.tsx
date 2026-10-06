import { useState } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { FormatSelector } from './FormatSelector';
import { UndoRedoButtons } from './UndoRedoButtons';
import { useProjectFile } from '../hooks/useProjectFile';
import { LabelFormat } from '../types';
import { HelpModal } from './HelpModal';
import { Eye, FolderOpen, Save, SaveAs } from './icons';

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
  const { handleSave, handleSaveAs, handleLoad } = useProjectFile();

  const handleFormatSelect = (format: LabelFormat) => {
    setSelectedFormat(format);
  };

  return (
    <>
    <div className="h-16 bg-white border-b border-gray-200 flex items-center px-4 2xl:px-6 gap-2 2xl:gap-4 shrink-0 shadow-sm">
      {/* Поле названия проекта — первый и самый широкий элемент тулбара.
          Логотип и подпись «Megalabel Pro» убраны: название проекта бывает
          длинным, а место слева уходило на то, что не несёт рабочей информации.

          Ширина тянется (flex-1) и ограничена сверху max-w-[40rem], иначе на
          широких мониторах поле растягивалось бы на пол-экрана. Нижняя граница
          min-w-[14rem]: при 1024px поле сжималось до ~26px, и текст в нём был
          нечитаем.

          Цвет поля — единственный индикатор состояния проекта (сигнальные значки
          справа убраны): нежно-зелёный = сохранено, нежно-оранжевый = есть
          изменения. Для скринридеров состояние дублируется sr-only live-region. */}
      <input
        type="text"
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        aria-label="Название проекта"
        title={isDirty ? 'Есть несохранённые изменения — Ctrl+S, чтобы сохранить' : 'Проект сохранён'}
        className={`flex-1 min-w-[14rem] max-w-[40rem] px-3 py-2 rounded-lg text-base text-gray-900 placeholder-gray-500 border transition-all duration-200 focus:outline-none focus:ring-2 ${
          isDirty
            ? 'bg-amber-50 border-amber-300 focus:border-amber-400 focus:ring-amber-400/30'
            : 'bg-emerald-50 border-emerald-300 focus:border-emerald-400 focus:ring-emerald-400/30'
        }`}
        placeholder="Без названия"
      />
      <span role="status" aria-live="polite" className="sr-only">
        {isDirty ? 'Есть несохранённые изменения' : 'Проект сохранён'}
      </span>

      {/* Format selector */}
      <FormatSelector
        selectedFormat={selectedFormat}
        onSelect={handleFormatSelect}
      />

      {/* Undo/Redo buttons */}
      <UndoRedoButtons />

      {/* Divider */}
      <div className="h-8 w-px bg-gray-200 shrink-0 hidden xl:block" />

      {/* Save button — перезапись текущего файла без вопросов (Ctrl+S) */}
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

      {/* Save As button — новый файл и новое имя проекта (Ctrl+Shift+S) */}
      <button
        type="button"
        onClick={handleSaveAs}
        className="btn btn-secondary flex items-center gap-2 shrink-0"
        title="Сохранить как (Ctrl+Shift+S)"
        aria-label="Сохранить проект как"
      >
        <SaveAs size={16} />
        <span className="hidden xl:inline">Сохранить как</span>
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
    </div>

      {/* Help Modal */}
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </>
  );
}
