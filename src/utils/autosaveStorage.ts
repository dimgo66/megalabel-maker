/**
 * Снимок автосохранения в localStorage — одна точка доступа.
 *
 * Ключ нужен и хуку автосохранения, и сохранению в файл: после успешной записи
 * снимок обязан исчезнуть, иначе при следующем открытии страницы появляется
 * ложный баннер «Найден несохранённый проект», а «Восстановить» откатывает
 * работу к снимку, сделанному ДО сохранения в файл.
 */
export const AUTOSAVE_KEY = 'label-maker-autosave';

/**
 * Снимок стёрт. Слушатель в useAutosave скрывает баннер «Найден несохранённый
 * проект»: после сохранения в файл он больше не соответствует действительности
 * и не должен висеть на экране.
 */
export const AUTOSAVE_CLEARED_EVENT = 'megalabel:autosave-cleared';

/** Текущий снимок (null — сохранений не было). Ошибки хранилища не фатальны. */
export function readAutosaveSnapshot(): string | null {
  try {
    return localStorage.getItem(AUTOSAVE_KEY);
  } catch {
    return null;
  }
}

/** Записать снимок. Ошибку квоты обрабатывает вызывающий: она предупреждает пользователя. */
export function writeAutosaveSnapshot(json: string): void {
  localStorage.setItem(AUTOSAVE_KEY, json);
}

/** Стереть снимок: проект сохранён в файл или только что из него загружен. */
export function clearAutosaveSnapshot(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // Приватный режим/запрет хранилища: чистить нечего, падать незачем.
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTOSAVE_CLEARED_EVENT));
  }
}
