import { useEffect } from 'react';

interface HotkeyHandlers {
  onSave?: () => void;
  onLoad?: () => void;
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
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}
