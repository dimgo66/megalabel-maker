import { LabelFormat, LayoutResult } from '../types';
import { getSheetDimensions, gridPitch } from './layoutCalculator';

/** Кегль подписи проекта, пункты */
export const SIGNATURE_FONT_PT = 10;
/** Начертание — встроенный в приложение шрифт (доступен и на canvas, и в PDF) */
export const SIGNATURE_FONT_FAMILY = 'Roboto Condensed';
/** Высота строки в кеглях: межстрочный интервал, в который заведомо влезают чернила */
const LINE_HEIGHT_RATIO = 1.25;

/**
 * Зазор от правого края листа до ЧЕРНИЛ подписи, мм — именно он решает задачу
 * «верхушки букв попадали в непечатную зону». Непечатная зона лазерного
 * принтера — 4.2 мм (`config/printer.ts`); 5.0 мм дают запас ~0.8 мм на
 * погрешность печати и обрезки листа.
 */
const RIGHT_EDGE_GAP_MM = 5.0;

/** Минимальный зазор от чернил подписи до столбца этикеток и до краёв листа, мм */
const SIDE_GAP_MM = 1.2;

/**
 * Шаблоны, на свободном месте которых печатается вертикальная подпись
 * названия проекта. Сейчас это единственный шаблон на 85 этикеток (38×16.9).
 */
export function usesProjectSignature(format: LabelFormat): boolean {
  return format.count === 85 || format.id === '38x16.9_85';
}

export interface SignaturePlacement {
  /** левый край блока подписи, мм от левого края листа */
  leftMm: number;
  /** верхний край блока подписи, мм от верхнего края листа */
  topMm: number;
  /** толщина строки (перпендикулярно чтению), мм */
  widthMm: number;
  /** длина текста (вдоль чтения — вертикально), мм */
  heightMm: number;
}

export interface SignatureRender {
  /** Растровое изображение уже повёрнутого текста (готово к drawImage) */
  canvas: HTMLCanvasElement;
  placement: SignaturePlacement;
}

/** Обрезает текст многоточием, чтобы влез в maxWidthPx */
function truncateToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidthPx: number
): string {
  if (ctx.measureText(text).width <= maxWidthPx) return text;
  const ell = '…';
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = text.slice(0, mid).trimEnd() + ell;
    if (ctx.measureText(candidate).width <= maxWidthPx) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo).trimEnd() + ell;
}

/** Границы полупрозрачных пикселей холста либо null, если холст пуст */
function inkBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (data[(row + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

/**
 * Позиция подписи в свободной полосе справа от сетки этикеток.
 *
 * Размеры здесь — размеры ЧЕРНИЛ, а не прямоугольника строки: холст подписи
 * обрезан по закрашенным пикселям, поэтому подпись ставится своим видимым
 * краем. До этой правки центрировался прямоугольник строки, а верхушки букв
 * (после поворота на 90° по часовой стрелке они смотрят вправо, к краю листа)
 * оказывались в 3.7 мм от края — внутри непечатной зоны принтера 4.2 мм.
 *
 * Возвращает null, если подпись не помещается между сеткой и краем листа или
 * не влезает по высоте листа.
 */
export function computeSignaturePlacement(
  format: LabelFormat,
  layout: LayoutResult,
  orientation: 'portrait' | 'landscape',
  inkWidthMm: number,
  inkLengthMm: number
): SignaturePlacement | null {
  const { width: sheetW, height: sheetH } = getSheetDimensions(orientation);
  const { pitchX_mm } = gridPitch(format, layout);
  const gridRight =
    layout.marginLeft_mm + (layout.cols - 1) * pitchX_mm + layout.cellWidth_mm;

  const minLeftMm = gridRight + SIDE_GAP_MM;
  const maxLeftMm = sheetW - RIGHT_EDGE_GAP_MM - inkWidthMm;

  if (maxLeftMm < minLeftMm) return null;
  if (inkLengthMm > sheetH - SIDE_GAP_MM * 2) return null;

  return {
    leftMm: maxLeftMm,
    topMm: (sheetH - inkLengthMm) / 2,
    widthMm: inkWidthMm,
    heightMm: inkLengthMm,
  };
}

/**
 * Растровое изображение подписи проекта, повёрнутой на 90° по часовой стрелке,
 * и её позиция в мм на листе. Текст берётся из названия проекта, обрезается
 * многоточием, если не помещается по высоте листа.
 *
 * Холст обрезается по чернилам: у повёрнутой строки «верх» букв смотрит вправо,
 * поэтому позиция обязана считаться по видимому краю надписи, а не по границам
 * прямоугольника строки — они шире букв и смещены относительно них.
 */
export async function renderSheetSignature(
  projectName: string,
  format: LabelFormat,
  layout: LayoutResult,
  orientation: 'portrait' | 'landscape',
  dpi: number
): Promise<SignatureRender | null> {
  const rawName = (projectName || '').trim();
  if (!rawName || !usesProjectSignature(format)) return null;

  // Гарантируем, что метрики снимаются и текст рисуется именно этим шрифтом
  try {
    await document.fonts.load(`${SIGNATURE_FONT_PT}pt "${SIGNATURE_FONT_FAMILY}"`);
  } catch {
    /* шрифт недоступен — используем fallback, но не падаем */
  }

  const family = `"${SIGNATURE_FONT_FAMILY}", sans-serif`;
  const fontPx = (SIGNATURE_FONT_PT / 72) * dpi;
  const pxPerMm = dpi / 25.4;

  const measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return null;
  measureCtx.font = `${fontPx}px ${family}`;

  const { height: sheetH } = getSheetDimensions(orientation);
  // Поля на полкели: `measureText` даёт ширину по advance, а чернила последнего
  // глифа могут чуть выходить за неё. Без запаса имя, ровно упирающееся в
  // лимит, дало бы чернила длиннее листа и подпись пропала бы совсем.
  const maxLenPx = ((sheetH - SIDE_GAP_MM * 2) / 25.4) * dpi - fontPx * 0.5;
  const name = truncateToWidth(measureCtx, rawName, maxLenPx);

  const textWidthPx = Math.max(1, Math.ceil(measureCtx.measureText(name).width));
  const lineHeightPx = Math.max(1, Math.ceil(fontPx * LINE_HEIGHT_RATIO));

  // Промежуточный холст с запасом по всем сторонам: если чернила упрутся в его
  // край, обрезка по пикселям отрежет выносные элементы букв.
  const pad = Math.ceil(fontPx * 0.75) + 2;
  const scratch = document.createElement('canvas');
  scratch.width = lineHeightPx + pad * 2;
  scratch.height = textWidthPx + pad * 2;
  const sctx = scratch.getContext('2d');
  if (!sctx) return null;

  sctx.fillStyle = '#000000';
  sctx.font = `${fontPx}px ${family}`;
  sctx.textAlign = 'left';
  sctx.textBaseline = 'middle';
  sctx.translate(lineHeightPx / 2 + pad, pad);
  sctx.rotate(Math.PI / 2); // 90° по часовой стрелке: текст читается сверху вниз, буквы «смотрят» вправо
  sctx.fillText(name, 0, 0);

  const bounds = inkBounds(
    sctx.getImageData(0, 0, scratch.width, scratch.height).data,
    scratch.width,
    scratch.height
  );
  if (!bounds) return null;

  const inkW = bounds.maxX - bounds.minX + 1;
  const inkH = bounds.maxY - bounds.minY + 1;

  const canvas = document.createElement('canvas');
  canvas.width = inkW; // толщина чернил → ширина блока
  canvas.height = inkH; // длина чернил → высота блока
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(scratch, -bounds.minX, -bounds.minY);

  const placement = computeSignaturePlacement(
    format,
    layout,
    orientation,
    inkW / pxPerMm,
    inkH / pxPerMm
  );
  if (!placement) return null;

  return { canvas, placement };
}
