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
  /** Alt+1..9 — перейти к вкладке с этим номером. */
  onSwitchTab?: (index: number) => void;
}

/**
 * Фокус в поле ввода. Ctrl+Z/Ctrl+Y там должны править текст, а не холст:
 * иначе опечатку в названии проекта нельзя исправить привычным Ctrl+Z —
 * отменялось бы последнее действие на холсте.
 */
function isTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true;
}

export function useHotkeys(handlers: HotkeyHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      // В поле ввода отмена/повтор остаются браузеру (правка текста).
      const typing = isTextField(e.target);

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
      if ((e.ctrlKey || e.metaKey) && key === 'o') {
        e.preventDefault();
        handlers.onLoad?.();
      }
      
      // Ctrl+Z or Cmd+Z - Undo
      if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey && !typing) {
        e.preventDefault();
        handlers.onUndo?.();
      }
      
      // Ctrl+Y or Cmd+Shift+Z or Ctrl+Shift+Z - Redo
      if (
        (e.ctrlKey || e.metaKey) &&
        (key === 'y' || (key === 'z' && e.shiftKey)) &&
        !typing
      ) {
        e.preventDefault();
        handlers.onRedo?.();
      }
      
      // Ctrl+Shift+P - Preview
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'p') {
        e.preventDefault();
        handlers.onPreview?.();
      }
      
      // Ctrl+P - Print
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'p') {
        e.preventDefault();
        handlers.onPrint?.();
      }
      
      // Ctrl+Shift+E - Export
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'e') {
        e.preventDefault();
        handlers.onExport?.();
      }

      // Alt+1..9 — переключение вкладок. Цифра берётся из e.code (Digit1..9):
      // с Alt раскладка может быть любой, и e.key менялся бы.
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[1-9]$/.test(e.code)) {
        const index = Number(e.code.slice(5)) - 1;
        e.preventDefault();
        handlers.onSwitchTab?.(index);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}
