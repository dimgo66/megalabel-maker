import * as fabric from 'fabric';
import { LabelFormat, SheetSettings } from '../types';
import { exportWithFallback, ExportConfig } from './pdfExporter';

/**
 * PDF-спутник проекта: копия листа рядом с файлом проекта, чтобы Проводник
 * Windows и Finder показывали превью этикетки. Превью у `.json` без него нет,
 * а у PDF есть «из коробки» — поэтому рядом с `Этикетка.json` кладётся
 * `Этикетка.pdf`.
 *
 * Файл спутника производный: он ничего не значит для приложения, его можно
 * удалить в любой момент, и он никогда не читается при загрузке проекта.
 * Источник истины — `.json`.
 */

/** Расширение спутника. */
export const PREVIEW_PDF_EXTENSION = '.pdf';

/**
 * Имя PDF-спутника для файла проекта.
 *
 * Старые файлы оканчиваются на `.labelproj.json` — двойной хвост снимается
 * целиком, иначе рядом лежала бы `<имя>.labelproj.pdf`.
 */
export function companionPdfName(projectFileName: string): string {
  const base = projectFileName
    .replace(/\.labelproj\.json$/i, '')
    .replace(/\.json$/i, '')
    .trim();
  return `${base || 'Без названия'}${PREVIEW_PDF_EXTENSION}`;
}

/* ───────────── Папка проекта ───────────── */

/**
 * Папка, куда писать спутник. `showSaveFilePicker` не сообщает путь к папке
 * выбранного файла — браузер прячет файловую систему, — поэтому соседний файл
 * записывается только через отдельно выбранную папку (`showDirectoryPicker`).
 *
 * Ручка живёт в памяти сеанса: после перезагрузки страницы разрешение на неё
 * сбрасывается, и папку нужно выбрать заново. В localStorage/IndexedDB ручку
 * не кладём — она привязана к сеансу и там бесполезна.
 */
let projectDir: FileSystemDirectoryHandle | null = null;

export const canUseDirectoryPicker = () =>
  typeof window !== 'undefined' &&
  typeof window.showDirectoryPicker === 'function' &&
  window.isSecureContext === true;

/** Папка уже выбрана в этом сеансе. */
export const hasProjectDir = () => projectDir !== null;

/** Забыть папку (пользователь отказался или разрешение отозвано). */
export function forgetProjectDir(): void {
  projectDir = null;
}

/** Отмена диалога пользователем — не ошибка. */
function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

async function ensureDirPermission(dir: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const descriptor: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };
    if ((await dir.queryPermission(descriptor)) === 'granted') return true;
    return (await dir.requestPermission(descriptor)) === 'granted';
  } catch {
    return false;
  }
}

/**
 * Выбрать папку для спутников. Вызывается из обработчика клика/Ctrl+S, пока
 * жив «жест» пользователя: иначе браузер отклонит запрос разрешения.
 *
 * @returns папка или null, если пользователь отменил диалог / браузер не умеет
 */
export async function pickProjectDir(): Promise<FileSystemDirectoryHandle | null> {
  if (!canUseDirectoryPicker()) return null;
  try {
    const dir = await window.showDirectoryPicker({
      id: 'megalabel-projects',
      mode: 'readwrite',
      startIn: 'documents',
    });
    if (!(await ensureDirPermission(dir))) return null;
    projectDir = dir;
    return dir;
  } catch (error) {
    if (!isAbort(error)) {
      console.warn('Не удалось выбрать папку для PDF-превью:', error);
    }
    return null;
  }
}

/**
 * Папка для записи спутника: уже выбранная, иначе спрашиваем.
 *
 * Один раз за сеанс — дальше PDF пишется молча, как обычный файл проекта.
 * Отказ пользователя запоминаем только на текущий вызов: следующий Ctrl+S
 * спросит снова (это дешевле, чем потерять превью навсегда).
 */
async function resolveProjectDir(): Promise<FileSystemDirectoryHandle | null> {
  if (projectDir && (await ensureDirPermission(projectDir))) return projectDir;
  projectDir = null;
  return pickProjectDir();
}

/* ───────────── Генерация и запись ───────────── */

/**
 * Собрать PDF листа тем же путём, что и кнопка экспорта: векторный PDF, при
 * ошибке — растровый фолбэк 600 dpi (см. exportWithFallback).
 */
async function buildSheetPdf(cfg: ExportConfig): Promise<Uint8Array> {
  const { pdfBytes } = await exportWithFallback(cfg);
  return pdfBytes;
}

/** Разрешение растрового фолбэка — как у кнопки экспорта. */
export const COMPANION_DPI = 300;

/** Источник данных для спутника. Отдельно от проекта: спутник производный. */
export interface CompanionPdfInput {
  /** Имя файла проекта, к которому относится спутник (например `Этикетка.json`) */
  projectFileName: string;
  format: LabelFormat;
  sheetSettings: SheetSettings;
  editorCanvas: fabric.Canvas;
}

/**
 * Записать PDF-спутник рядом с проектом.
 *
 * Никогда не бросает: спутник — украшение файла проекта, и его сбой не должен
 * отменять успешное сохранение. Возвращает исход для подсказки пользователю.
 *
 * @param input данные листа
 * @param dir папка; без неё спрашивается у пользователя
 */
export async function writeCompanionPdf(
  input: CompanionPdfInput,
  dir?: FileSystemDirectoryHandle | null
): Promise<'written' | 'no-dir' | 'failed'> {
  const target = dir ?? (await resolveProjectDir());
  if (!target) return 'no-dir';

  try {
    const pdfBytes = await buildSheetPdf({
      format: input.format,
      editorCanvas: input.editorCanvas,
      dpi: COMPANION_DPI,
      orientation: input.sheetSettings.orientation,
    });

    const fileName = companionPdfName(input.projectFileName);
    const fileHandle = await target.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      // Копия в новый ArrayBuffer: Uint8Array может быть с окном в общий буфер.
      await writable.write(pdfBytes.slice().buffer);
      await writable.close();
    } catch (error) {
      try {
        await writable.abort();
      } catch {
        // Поток уже закрыт — исходная ошибка важнее.
      }
      throw error;
    }
    return 'written';
  } catch (error) {
    console.warn('Не удалось записать PDF-превью проекта:', error);
    return 'failed';
  }
}

/**
 * Починить папку после отказа записи: следующий вызов спросит её заново.
 * Нужна, чтобы смена/удаление папки пользователем не блокировала превью.
 */
export function resetProjectDir(): void {
  projectDir = null;
}
