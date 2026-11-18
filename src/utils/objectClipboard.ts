/**
 * Буфер обмена объектов этикетки: фреймов текста, изображений, штрих-кодов,
 * групп и мультивыделения.
 *
 * Зачем отдельный буфер, а не системный: объект fabric — это не текст и не
 * картинка, а целая структура (кастомные свойства, геометрия рамки, норма
 * штрих-кода, посимвольные стили текста). Положить её в буфер обмена текстом
 * нельзя: в чужом приложении получился бы мусор, а разобрать её обратно из
 * чужого текста невозможно. Поэтому объекты живут в памяти приложения (модуль
 * не перезагружается при переключении вкладок), а в системный буфер кладётся
 * только короткая метка с токеном.
 *
 * Метка нужна ровно для одного: отличить «в буфере наш объект» от «в буфере
 * текст, скопированный в другом приложении». Без неё Ctrl+V после копирования
 * объекта либо всегда вставлял бы объект (и ломал привычную вставку текста),
 * либо никогда — в зависимости от того, что считать свежее. С меткой правило
 * простое: метка есть — вставляем объект, нет — работает обычная вставка.
 *
 * Токен в метке сверяется с токеном записи: если после копирования объекта
 * пользователь что-то скопировал ещё (или страница перезагрузилась и объекты
 * потеряны), вставка не подставит устаревший объект.
 */

/** Один объект в буфере — результат `toObject(CUSTOM_PROPS)`. */
export type ClipboardObjectJSON = Record<string, unknown>;

/** Сеанс копирования: набор объектов и вкладка, из которой их взяли. */
export interface ClipboardEntry {
  /** Токен метки в системном буфере. */
  token: string;
  /** Объекты в порядке стека слоёв (снизу вверх). */
  objects: ClipboardObjectJSON[];
  /**
   * Вкладка-источник (id). По ней решается, смещать ли копию: в той же вкладке
   * копия встаёт рядом с оригиналом, в другой — на его место.
   */
  sourceTabId: string;
}

/** Атрибут метки в HTML-варианте буфера. */
const HTML_MARKER_ATTR = 'data-megalabel-object';

/**
 * Префикс текстового варианта метки. Текст — запасной канал: HTML-вариант
 * доходит не во всех браузерах, а текст доходит всегда.
 */
const TEXT_MARKER_PREFIX = 'MEGALABEL-OBJECT-CLIP:';

const HTML_MARKER_RE = /data-megalabel-object="([^"]+)"/;
const TEXT_MARKER_RE = /^MEGALABEL-OBJECT-CLIP:([A-Za-z0-9-]+)$/;

let entry: ClipboardEntry | null = null;

/**
 * Уникальный токен метки. `randomUUID` есть только в защищённом контексте
 * (https/localhost), поэтому нужен запасной составной токен — иначе на
 * `file://` все копирования получали бы один токен.
 */
export function createClipboardToken(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `clip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Кладёт объекты в буфер обмена приложения (заменяет прежнюю запись). */
export function putClipboardEntry(next: ClipboardEntry): void {
  entry = next;
}

/** Запись буфера по токену метки: null — метка от другого копирования. */
export function getClipboardEntry(token: string): ClipboardEntry | null {
  return entry && entry.token === token ? entry : null;
}

/** Текущее содержимое буфера (без проверки токена) — для подсказок и тестов. */
export function currentClipboardEntry(): ClipboardEntry | null {
  return entry;
}

/** Чтение метки из данных буфера обмена: сначала HTML, затем текст. */
export function readClipboardToken(data: DataTransfer | null | undefined): string | null {
  if (!data) return null;

  const htmlToken = readData(data, 'text/html').match(HTML_MARKER_RE);
  if (htmlToken) return htmlToken[1];

  const textToken = readData(data, 'text/plain').trim().match(TEXT_MARKER_RE);
  return textToken ? textToken[1] : null;
}

/**
 * Текст в буфере — наша метка (а не текст пользователя).
 *
 * Нужна полям ввода: метку нельзя вставлять как обычный текст, поэтому поле
 * обязано пропустить такую вставку целиком.
 */
export function isClipboardTextMarker(text: string): boolean {
  return TEXT_MARKER_RE.test(text.trim());
}

/**
 * Записывает метку в системный буфер.
 *
 * Возвращает false, если браузер не дал записать (нет `clipboardData`,
 * исключение политики). Вызывающий код обязан в этом случае отменить всю
 * операцию: иначе при вырезании объекты исчезли бы, а вставить их было бы
 * нечем — метки в буфере нет.
 */
export function writeClipboardMarker(
  data: DataTransfer | null | undefined,
  token: string
): boolean {
  if (!data) return false;
  try {
    // HTML-вариант: в чужом приложении вставка даёт пустой фрагмент, а не
    // служебную строку. Текстовый вариант — запасной канал для чтения.
    data.setData('text/html', `<span ${HTML_MARKER_ATTR}="${token}"></span>`);
    data.setData('text/plain', `${TEXT_MARKER_PREFIX}${token}`);
    return true;
  } catch {
    return false;
  }
}

/** `getData` может бросить исключение (запрещённый тип) — читаем безопасно. */
function readData(data: DataTransfer, type: string): string {
  try {
    return data.getData(type) ?? '';
  } catch {
    return '';
  }
}
