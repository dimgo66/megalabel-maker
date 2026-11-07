import type { Canvas } from 'fabric';
import { useProjectStore } from '../store/useProjectStore';
import { renderPdfPageFromBytes } from './pdfImageLoader';
import { previewDpiFor } from './previewDensity';
import { MM_PER_PX } from './canvasHelpers';

/**
 * Превью вставленного PDF на холсте — всегда растр: fabric не умеет рисовать
 * страницу PDF векторно. Плотность битмапа считается функцией previewDpiFor
 * (зум · devicePixelRatio, с поправкой на размер страницы), а здесь она
 * поддерживается актуальной при изменении зума.
 */

/** Прирост меньше 15% не стоит полной перерисовки страницы. */
const RERENDER_THRESHOLD = 1.15;

/**
 * Фактическая плотность текущего битмапа. Объект занимает
 * `width · scaleX` пикселей сцены при 96 dpi, значит битмап несёт
 * 96 / scaleX dpi (scaleX < 1 — битмап плотнее сцены, > 1 — растянут).
 */
function currentPreviewDpi(img: any): number {
  const scaleX = img.scaleX || 1;
  return 96 / scaleX;
}

/** Размер объекта на листе, мм. */
function objectSizeMm(img: any): [number, number] {
  return [
    (img.width || 0) * (img.scaleX || 1) * MM_PER_PX,
    (img.height || 0) * (img.scaleY || 1) * MM_PER_PX,
  ];
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось преобразовать страницу PDF в изображение'));
    img.src = src;
  });
}

/** Один перерендер за раз: шаги зума не должны наслаиваться. */
let refreshInFlight = false;

/**
 * Поднять плотность превью у вставленных PDF, если текущий зум её перерос.
 * Геометрия в мм не меняется: после подмены элемента scaleX/scaleY
 * пересчитываются так, чтобы физический размер остался прежним. История и
 * JSON проекта не пишутся — меняется только картинка превью.
 */
export async function refreshPdfPreviews(canvas: Canvas, zoom: number): Promise<void> {
  if (refreshInFlight) return;
  refreshInFlight = true;

  try {
    const { getPdfSource } = useProjectStore.getState();

    for (const obj of canvas.getObjects() as any[]) {
      if (!obj.srcPdfId || typeof obj.setElement !== 'function') continue;

      const [widthMm, heightMm] = objectSizeMm(obj);
      const target = previewDpiFor(zoom, widthMm, heightMm);
      if (currentPreviewDpi(obj) * RERENDER_THRESHOLD >= target) continue;

      const bytes = getPdfSource(obj.srcPdfId);
      if (!bytes) continue; // байты живут только в сессии — см. checkPdfSources

      try {
        // Проект, открытый из файла, несёт только копию плотности вставки:
        // фиксируем её как «низкоплотную» прежде, чем подменить элемент,
        // иначе в файл проекта уйдёт многомегабайтное превью 960 dpi.
        const previous = obj._element || (typeof obj.getElement === 'function' ? obj.getElement() : null);
        if (!obj.srcPdfLowSrc && previous?.src) {
          obj.srcPdfLowSrc = previous.src;
          obj.srcPdfPx = { width: obj.width, height: obj.height };
        }

        const rendered = await renderPdfPageFromBytes(bytes, obj.srcPdfPage || 1, target);
        const element = await loadImageElement(rendered.toDataURL('image/png'));

        const oldWidth = obj.width || element.width;
        const oldHeight = obj.height || element.height;
        const oldScaleX = obj.scaleX || 1;
        const oldScaleY = obj.scaleY || 1;

        obj.setElement(element);
        obj.set({
          width: element.width,
          height: element.height,
          // Размер в мм = width · scaleX · MM_PER_PX: держим его неизменным
          scaleX: (oldScaleX * oldWidth) / (element.width || 1),
          scaleY: (oldScaleY * oldHeight) / (element.height || 1),
        });
        obj.setCoords();
        canvas.requestRenderAll();
      } catch (error) {
        // Один сбой (битый источник, память) не должен перебирать остальные
        // объекты тем же путём — выходим, следующий зум попробует снова.
        console.warn('Не удалось повысить плотность превью PDF:', error);
        return;
      }
    }
  } finally {
    refreshInFlight = false;
  }
}
