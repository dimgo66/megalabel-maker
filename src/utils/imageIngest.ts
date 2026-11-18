import * as fabric from 'fabric';
import { handleFileUpload } from './imageLoader';
import { describePdfError, isPdfPasswordError } from './pdfImageLoader';
import { sceneHeight, sceneWidth } from './canvasHelpers';

/**
 * Единая точка попадания файла на этикетку.
 *
 * Файл приходит двумя путями — кнопка «Изображение» в левой панели и
 * перетаскивание с рабочего стола (useCanvasFileDrop). Логика у них обязана
 * совпадать: тип файла, защищённый паролем PDF, авто-масштаб и сообщения об
 * ошибках. Раньше она жила в ImagePanel, и второй путь пришлось бы писать
 * копией — то есть поддерживать две версии обработки ошибок.
 */

/** Куда встаёт брошенный файл. */
export interface DropPoint {
  /**
   * Точка сброса в координатах этикетки (базовые пиксели сцены, 96 dpi),
   * левый верхний угол объекта. Без неё объект встаёт в центр этикетки.
   */
  x?: number;
  y?: number;
}

/** Разрешение изображения при перетаскивании с рабочего стола, мм. */
const DEFAULT_DROP_MM = 20;

/**
 * Переносит готовый объект так, чтобы его левый верхний угол был в точке
 * сброса, но сам объект целиком оставался в пределах этикетки.
 *
 * Зачем прижимать: пользователь бросает файл «примерно туда», а ручки объекта
 * и его содержимое рисуются только внутри холста. Если бросить у самого края,
 * объект уехал бы за лист и выглядел бы пропавшим.
 */
export function placeAtDropPoint(
  object: fabric.FabricObject,
  canvas: fabric.Canvas,
  point: DropPoint
): void {
  const labelW = sceneWidth(canvas);
  const labelH = sceneHeight(canvas);

  // Габарит под масштабом: width/height объекта не учитывают scaleX/scaleY,
  // а после вписывания по размеру этикетки масштаб меньше единицы.
  const objW = object.getScaledWidth();
  const objH = object.getScaledHeight();

  const rawX = point.x ?? labelW / 2;
  const rawY = point.y ?? labelH / 2;

  // Объект больше этикетки — прижимаем к левому верхнему углу: половина
  // содержимого всё равно не влезет, а обрезки сверху не будет.
  const maxX = Math.max(0, labelW - objW);
  const maxY = Math.max(0, labelH - objH);
  const left = Math.min(Math.max(0, rawX - objW / 2), maxX);
  const top = Math.min(Math.max(0, rawY - objH / 2), maxY);

  object.set({ left, top, originX: 'left', originY: 'top' });
  object.setCoords();
}

/**
 * Загружает один файл на холст.
 *
 * @param point — точка сброса; без неё объект встаёт в центр этикетки (поведение
 *                кнопки «Изображение»).
 * @returns true, если файл лёг на холст.
 */
export async function ingestFile(
  file: File,
  canvas: fabric.Canvas,
  point?: DropPoint
): Promise<boolean> {
  const place = (object: fabric.FabricObject) => {
    if (!point) return;
    placeAtDropPoint(object, canvas, point);
    canvas.requestRenderAll();
  };

  try {
    await handleFileUpload(file, canvas, {}, place);
    return true;
  } catch (error) {
    if (isPdfPasswordError(error)) {
      const password = window.prompt(
        `PDF «${file.name}» защищён паролем.\nВведите пароль:`,
        ''
      );
      if (!password) return false;

      try {
        await handleFileUpload(file, canvas, { password }, place);
        return true;
      } catch (retryError) {
        console.error('Ошибка загрузки PDF после ввода пароля:', retryError);
        alert(`Не удалось загрузить файл «${file.name}»: ${describePdfError(retryError)}`);
        return false;
      }
    }

    console.error('Ошибка загрузки файла:', error);
    alert(`Не удалось загрузить файл «${file.name}»: ${describePdfError(error)}`);
    return false;
  }
}

/**
 * Берёт только файлы изображений и PDF.
 *
 * Перетащить в окно можно что угодно — ссылку, текст, HTML. Отбрасываем всё,
 * кроме файлов поддерживаемых типов: иначе PDF-просмотрщик или браузер
 * получил бы дроп, который обязан был бы обработать сам.
 */
export function extractDroppedFiles(transfer: DataTransfer | null): File[] {
  if (!transfer) return [];

  const files = Array.from(transfer.files || []).filter(isSupportedFile);
  if (files.length > 0) return files;

  // Часть браузеров отдаёт файл только через items (например, при броске из
  // почтового клиента), а `files` при этом пуст.
  return Array.from(transfer.items || [])
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter((file): file is File => file !== null && isSupportedFile(file));
}

/** Расширения, которые понимает загрузчик (согласованы с accept в ImagePanel). */
const SUPPORTED_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.svg',
  '.webp',
  '.pdf',
];

function isSupportedFile(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  if (type === 'application/pdf' || type.startsWith('image/')) return true;
  // SVG и некоторые форматы приходят с пустым MIME: смотрим на расширение.
  const name = file.name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some(ext => name.endsWith(ext));
}

/** Есть ли в перетаскиваемом наборе хотя бы один файл (а не текст/ссылка). */
export function transferHasFiles(transfer: DataTransfer | null): boolean {
  if (!transfer) return false;

  const types = Array.from(transfer.types || []);
  // Safari сообщает только "Files", Chrome — "Files" плюс MIME-типы файлов.
  if (!types.includes('Files')) return false;

  if (transfer.items && transfer.items.length > 0) {
    return Array.from(transfer.items).some(item => item.kind === 'file');
  }
  return true;
}

export { DEFAULT_DROP_MM };
