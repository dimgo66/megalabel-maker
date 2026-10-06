import { useEffect } from 'react';

interface HotkeyHandlers {
  onSave?: () => void;
  onSaveAs?: () => void;
  onLoad?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onPreview?: () => void;
  onPrint?: () => void;
  onExport?: () => void;
}

export function useHotkeys(handlers: HotkeyHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      // Ctrl+Shift+S or Cmd+Shift+S - Save As.
      // Проверяется раньше Ctrl+S: при зажатом Shift `e.key` приходит как «S»,
      // поэтому сравнение идёт по toLowerCase(), а shiftKey отсекается явно.
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 's') {
        e.preventDefault();
        handlers.onSaveAs?.();
        return;
      }

      // Ctrl+S or Cmd+S - Save
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === 's') {
        e.preventDefault();
        handlers.onSave?.();
      }
      
      // Ctrl+O or Cmd+O - Open/Load
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        handlers.onLoad?.();
      }
      
      // Ctrl+Z or Cmd+Z - Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handlers.onUndo?.();
      }
      
      // Ctrl+Y or Cmd+Shift+Z or Ctrl+Shift+Z - Redo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handlers.onRedo?.();
      }
      
      // Ctrl+Shift+P - Preview
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        handlers.onPreview?.();
      }
      
      // Ctrl+P - Print
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        handlers.onPrint?.();
      }
      
      // Ctrl+Shift+E - Export
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        handlers.onExport?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}
