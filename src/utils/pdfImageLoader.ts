// Legacy-сборка pdf.js: она транспилирована и несёт core-js-полифилы, поэтому
// работает в браузерах без новых методов Uint8Array (Chrome/Edge до 140,
// Firefox до 133, Яндекс Браузер на старом Chromium). Современная сборка в них
// падает при открытии файла с «n.toHex is not a function».
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.min.mjs';
import { useProjectStore } from '../store/useProjectStore';
import { previewDpiFor } from './previewDensity';

// Установить локальный воркер через new URL для Vite.
// Воркер обязан быть из той же сборки, что и API: у modern/legacy свой набор
// полифилов, а версии должны совпадать.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

/**
 * Статические ассеты pdf.js: wasm-декодеры (JPEG2000, JBIG2, ICC) и таблицы
 * CMap со стандартными шрифтами. Без них pdf.js молча теряет изображения в
 * PDF с JPX/JBIG2 («OpenJPEG failed to initialize») или рисует пустые глифы.
 * Каталог `public/pdfjs` готовит scripts/sync-pdfjs-assets.mjs перед dev/build.
 */
const PDFJS_ASSET_BASE = `${import.meta.env.BASE_URL}pdfjs/`;

const PDFJS_RESOURCES = {
  wasmUrl: `${PDFJS_ASSET_BASE}wasm/`,
  cMapUrl: `${PDFJS_ASSET_BASE}cmaps/`,
  standardFontDataUrl: `${PDFJS_ASSET_BASE}standard_fonts/`,
  iccUrl: `${PDFJS_ASSET_BASE}iccs/`,
} as const;

/**
 * Пределы размера canvas. На крупных форматах (A0 и больше) рендер с
 * scale 3 даёт полотно, которое браузер уже не может отрисовать — получается
 * пустое изображение. Масштаб подрезается под эти пределы.
 */
const MAX_CANVAS_SIDE = 16000;
const MAX_CANVAS_AREA = 200_000_000;

export interface PdfPageResult {
  canvas: HTMLCanvasElement;
  pageCount: number;
  pageNumber: number;
  srcPdfId?: string; // ID источника PDF для векторного экспорта
}

/** Имя исключения pdf.js (PasswordException, InvalidPDFException и т. п.) */
function errorName(error: unknown): string {
  return (error as { name?: string } | null)?.name ?? '';
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : '';
}

/** PDF закрыт паролем — нужен запрос пароля и повторная попытка. */
export function isPdfPasswordError(error: unknown): boolean {
  return errorName(error) === 'PasswordException';
}

/**
 * Человеческое описание ошибки открытия PDF — чтобы вместо общего
 * «Не удалось загрузить файл» показать причину.
 */
export function describePdfError(error: unknown): string {
  const name = errorName(error);
  const message = errorMessage(error);

  if (name === 'PasswordException') {
    return 'PDF защищён паролем';
  }
  if (name === 'InvalidPDFException') {
    return 'файл повреждён или это не PDF';
  }
  if (name === 'ResponseException' || name === 'MissingDataException') {
    return 'не удалось прочитать данные файла';
  }
  if (name === 'AbortException') {
    return 'загрузка прервана';
  }
  // Браузер без новых методов Uint8Array (Chrome/Edge < 140, Firefox < 133):
  // pdf.js падает ещё до разбора файла, сообщение вида «n.toHex is not a function».
  if (/\b(to|from|setFrom)(Hex|Base64) is not a function\b/.test(message)) {
    return 'браузер устарел — обновите его (нужен Chrome или Edge 140+, Firefox 133+, Safari 18.2+)';
  }
  if (/Array buffer allocation|Invalid typed array length|out of memory/i.test(message)) {
    return 'файл слишком большой для обработки браузером';
  }
  return message || 'неизвестная ошибка PDF';
}

/**
 * Масштаб рендера, безопасный для canvas браузера.
 * При scale 3 страница A4 даёт ~2500×3500 px, что с запасом укладывается в
 * лимиты; для больших форматов масштаб уменьшается.
 */
function safeRenderScale(page: pdfjsLib.PDFPageProxy, requested: number): number {
  const base = page.getViewport({ scale: 1 });
  const bySide = MAX_CANVAS_SIDE / Math.max(base.width, base.height);
  const byArea = Math.sqrt(MAX_CANVAS_AREA / (base.width * base.height));
  return Math.max(0.25, Math.min(requested, bySide, byArea));
}

/**
 * Рендер одной страницы в canvas с заданной плотностью.
 * PDF живёт в пунктах (1 pt = 1/72″), поэтому масштаб pdf.js = dpi / 72:
 * scale 3 — это 216 dpi, scale 8,33 — 600 dpi. Масштаб подрезается под
 * пределы canvas браузера (safeRenderScale).
 */
async function renderPageCanvas(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  dpi: number
): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: safeRenderScale(page, dpi / 72) });

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Не удалось получить контекст canvas');
  }

  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));

  await page.render({
    canvasContext: context as any,
    viewport: viewport
  } as any).promise;

  return canvas;
}

/**
 * Загрузка PDF файла как изображения
 * @param file - PDF файл
 * @param pageNumber - номер страницы (по умолчанию 1)
 * @param zoom - зум редактора: от него считается плотность превью
 * @param password - пароль для защищённых PDF
 * @returns Результат с canvas и ID источника PDF
 */
export async function loadPdfAsImage(
  file: File,
  pageNumber: number = 1,
  zoom: number = 2,
  password?: string
): Promise<PdfPageResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();

    // Генерируем уникальный ID для этого PDF источника
    const srcPdfId = `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // В pdf.js уходит КОПИЯ байтов: воркер забирает буфер через transfer и
    // отсоединяет его, после чего исходные байты для pdf-lib (векторный
    // экспорт) уже непригодны — «detached ArrayBuffer». Оригинал сохраняем в
    // store только после успешного рендера, чтобы неудачная попытка
    // (неверный пароль, битый файл) не оставляла мусор в pdfSources.
    const workerBytes = arrayBuffer.slice(0);

    const pdf = await pdfjsLib.getDocument({
      data: workerBytes,
      ...PDFJS_RESOURCES,
      ...(password ? { password } : {}),
    }).promise;

    if (pageNumber < 1 || pageNumber > pdf.numPages) {
      throw new Error(`Неверный номер страницы: ${pageNumber}. PDF содержит ${pdf.numPages} страниц`);
    }

    const page = await pdf.getPage(pageNumber);

    // Размер страницы в мм известен до рендера (масштаб 1 в pdf.js = 72 dpi):
    // от него зависит, какую плотность выдержит память браузера.
    const base = page.getViewport({ scale: 1 });
    const dpi = previewDpiFor(zoom, (base.width / 72) * 25.4, (base.height / 72) * 25.4);

    const canvas = await renderPageCanvas(pdf, pageNumber, dpi);

    // Рендер удался — только теперь держим исходные байты для векторного
    // экспорта (pdf-lib встраивает исходную страницу в итоговый PDF).
    useProjectStore.getState().addPdfSource(srcPdfId, arrayBuffer);

    return {
      canvas,
      pageCount: pdf.numPages,
      pageNumber,
      srcPdfId
    };
  } catch (error) {
    console.error('Ошибка загрузки PDF:', error);
    throw error;
  }
}

/**
 * Перерисовать страницу уже вставленного PDF в другой плотности.
 * Превью на холсте — растр, поэтому при увеличении зума редактора штрихи
 * «мылятся»; здесь страница рисуется заново из байтов, которые лежат в store.
 */
export async function renderPdfPageFromBytes(
  bytes: ArrayBuffer,
  pageNumber: number,
  dpi: number
): Promise<HTMLCanvasElement> {
  // Воркер забирает буфер через transfer, поэтому в pdf.js уходит копия:
  // исходные байты нужны pdf-lib для векторного экспорта.
  const loadingTask = pdfjsLib.getDocument({
    data: bytes.slice(0),
    ...PDFJS_RESOURCES,
  });
  const pdf = await loadingTask.promise;

  try {
    if (pageNumber < 1 || pageNumber > pdf.numPages) {
      throw new Error(`Неверный номер страницы: ${pageNumber}. PDF содержит ${pdf.numPages} страниц`);
    }
    return await renderPageCanvas(pdf, pageNumber, dpi);
  } finally {
    // Документ больше не нужен: без этого воркер и разобранные структуры
    // копились бы при каждом шаге зума.
    await loadingTask.destroy().catch(() => undefined);
  }
}

/**
 * Получить миниатюры всех страниц PDF
 * @param file - PDF файл
 * @param scale - масштаб миниатюр (по умолчанию 1)
 * @param password - пароль для защищённых PDF
 */
export async function getPdfPageThumbnails(
  file: File,
  scale: number = 1,
  password?: string
): Promise<HTMLCanvasElement[]> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({
      data: arrayBuffer.slice(0),
      ...PDFJS_RESOURCES,
      ...(password ? { password } : {}),
    }).promise;

    const thumbnails: HTMLCanvasElement[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      thumbnails.push(await renderPageCanvas(pdf, i, scale * 72));
    }

    return thumbnails;
  } catch (error) {
    console.error('Ошибка создания миниатюр PDF:', error);
    throw error;
  }
}
