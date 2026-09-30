import { useEffect } from 'react';

interface HotkeyHandlers {
  onSave?: () => void;
  onLoad?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onPreview?: () => void;
}

export function useHotkeys(handlers: HotkeyHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S or Cmd+S - Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
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
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}
