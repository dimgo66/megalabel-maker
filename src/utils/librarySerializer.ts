import type { LibraryItem } from '../store/useLibraryStore';

/**
 * Файл библиотеки элементов — обмен между профилями и машинами.
 *
 * Зачем отдельный формат, а не «сохранить localStorage»: библиотека живёт в
 * persiste localStorage текущего браузера, поэтому её нельзя ни перенести на
 * другой компьютер, ни передать коллеге, ни восстановить после очистки данных
 * сайта. Здесь — обычный JSON-файл с версией и конвертом, который можно
 * положить рядом с проектом.
 *
 * Разбор намеренно терпимый: битые записи отбрасываются поштучно, а не роняют
 * весь импорт. Ошибка поднимается только тогда, когда пригодных элементов не
 * осталось вовсе — это уже не «файл с мусором», а не тот файл.
 */

const LIBRARY_APP = 'megalabel';
const LIBRARY_KIND = 'library';
const LIBRARY_VERSION = 1;

/**
 * Потолок на импорт. Библиотека хранится в localStorage (квота ~5 МБ), а
 * миниатюры — это data URL: тысяча элементов из чужого файла положила бы и
 * хранилище, и панель. Лишнее молча отбрасывается.
 */
const MAX_ITEMS = 500;

export const LIBRARY_FILE_NAME = 'megalabel-library.json';

export interface LibraryFile {
  app: string;
  kind: string;
  version: number;
  exportedAt: string;
  items: LibraryItem[];
}

const ITEM_TYPES: LibraryItem['type'][] = ['text', 'image', 'barcode', 'group', 'other'];

export function serializeLibrary(items: LibraryItem[]): string {
  const file: LibraryFile = {
    app: LIBRARY_APP,
    kind: LIBRARY_KIND,
    version: LIBRARY_VERSION,
    exportedAt: new Date().toISOString(),
    items,
  };
  return JSON.stringify(file, null, 2);
}

/** Идентификатор для элементов, пришедших без него или с дублем id. */
function newItemId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `lib-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeItem(raw: unknown, seenIds: Set<string>): LibraryItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;

  // objectJSON — единственное, без чего элемент бессмысленен: вставлять нечего.
  const objectJSON = candidate.objectJSON;
  if (!objectJSON || typeof objectJSON !== 'object' || Array.isArray(objectJSON)) return null;

  const type = ITEM_TYPES.includes(candidate.type as LibraryItem['type'])
    ? (candidate.type as LibraryItem['type'])
    : 'other';

  const name = typeof candidate.name === 'string' && candidate.name.trim()
    ? candidate.name.trim()
    : 'Элемент';

  let id = typeof candidate.id === 'string' && candidate.id ? candidate.id : newItemId();
  if (seenIds.has(id)) id = newItemId();
  seenIds.add(id);

  // Миниатюра принимается только как data URL картинки: чужой http-адрес
  // превратил бы панель в трекер, а битая строка — в «сломанную картинку».
  const thumbnail = typeof candidate.thumbnail === 'string' && candidate.thumbnail.startsWith('data:image/')
    ? candidate.thumbnail
    : '';

  const createdAt = typeof candidate.createdAt === 'string' && candidate.createdAt
    ? candidate.createdAt
    : new Date().toISOString();

  const thumbnailVersion = typeof candidate.thumbnailVersion === 'number'
    ? candidate.thumbnailVersion
    : 0;

  return { id, name, objectJSON, thumbnail, createdAt, type, thumbnailVersion };
}

/**
 * Разбирает файл библиотеки.
 *
 * @throws если JSON нечитаем, в нём нет списка элементов или ни один элемент
 *         не прошёл проверку.
 */
export function parseLibrary(json: string): LibraryItem[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('Файл не является корректным JSON');
  }

  // Принимаем и конверт { kind: 'library', items: [...] }, и просто массив —
  // второй вариант удобен, если библиотеку собрали вручную.
  const list = Array.isArray(raw) ? raw : (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(list)) {
    throw new Error('В файле нет списка элементов библиотеки');
  }

  const seenIds = new Set<string>();
  const items: LibraryItem[] = [];
  for (const entry of list.slice(0, MAX_ITEMS)) {
    const item = normalizeItem(entry, seenIds);
    if (item) items.push(item);
  }

  if (items.length === 0) {
    throw new Error('В файле не найдено ни одного корректного элемента');
  }
  return items;
}

/**
 * Сливает библиотеки по id: пришедший элемент с тем же id заменяет текущий
 * (пользователь мог переименовать его на другой машине), остальные добавляются
 * в конец. Возвращает и результат, и счётчики для сообщения пользователю.
 */
export function mergeLibraries(
  current: LibraryItem[],
  incoming: LibraryItem[]
): { items: LibraryItem[]; added: number; updated: number } {
  const byId = new Map(current.map(item => [item.id, item]));
  let added = 0;
  let updated = 0;

  for (const item of incoming) {
    if (byId.has(item.id)) updated++;
    else added++;
    byId.set(item.id, item);
  }

  return { items: Array.from(byId.values()), added, updated };
}

/** Скачивает библиотеку файлом. */
export function downloadLibraryFile(items: LibraryItem[]): void {
  const blob = new Blob([serializeLibrary(items)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = LIBRARY_FILE_NAME;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Читает и разбирает выбранный файл библиотеки. */
export function readLibraryFile(file: File): Promise<LibraryItem[]> {
  return new Promise((resolve, reject) => {
    if (!/\.json$/i.test(file.name)) {
      reject(new Error('Ожидается файл .json'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(parseLibrary(String(e.target?.result ?? '')));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsText(file);
  });
}
