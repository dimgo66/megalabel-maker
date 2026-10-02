import { LabelFormat, LayoutResult } from '../types';
import { getSheetDimensions, gridPitch } from './layoutCalculator';

/** Кегль подписи проекта, пункты */
export const SIGNATURE_FONT_PT = 10;
/** Начертание — встроенный в приложение шрифт (доступен и на canvas, и в PDF) */
export const SIGNATURE_FONT_FAMILY = 'Roboto Condensed';
/** Отступ от краёв листа и от столбца ячеек, мм */
const PADDING_MM = 1.2;

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

/**
 * Рассчитывает позицию блока подписи в свободном правом столбце листа
 * (справа от сетки этикеток). Возвращает null, если места недостаточно.
 */
function computeSignaturePlacement(
  format: LabelFormat,
  layout: LayoutResult,
  orientation: 'portrait' | 'landscape',
  blockWidthMm: number,
  textLengthMm: number
): SignaturePlacement | null {
  const { width: sheetW, height: sheetH } = getSheetDimensions(orientation);
  const { pitchX_mm } = gridPitch(format, layout);
  const gridRight =
    layout.marginLeft_mm + (layout.cols - 1) * pitchX_mm + layout.cellWidth_mm;

  const strip = sheetW - gridRight; // свободный столбец справа от сетки
  if (strip < blockWidthMm + PADDING_MM * 2) return null;
  if (textLengthMm > sheetH - PADDING_MM * 2) return null;

  return {
    leftMm: gridRight + (strip - blockWidthMm) / 2,
    topMm: (sheetH - textLengthMm) / 2,
    widthMm: blockWidthMm,
    heightMm: textLengthMm,
  };
}

/**
 * Растровое изображение подписи проекта, повёрнутой на 90° по часовой стрелке,
 * и её позиция в мм на листе. Текст берётся из названия проекта, обрезается
 * многоточием, если не помещается по высоте листа.
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

  const measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return null;
  measureCtx.font = `${fontPx}px ${family}`;

  const { height: sheetH } = getSheetDimensions(orientation);
  const maxLenPx = ((sheetH - PADDING_MM * 2) / 25.4) * dpi;
  const name = truncateToWidth(measureCtx, rawName, maxLenPx);

  const textWidthPx = Math.max(1, Math.ceil(measureCtx.measureText(name).width));
  const lineHeightPx = Math.max(1, Math.ceil(fontPx * 1.25));

  const blockWidthMm = (lineHeightPx / dpi) * 25.4;
  const textLengthMm = (textWidthPx / dpi) * 25.4;

  const placement = computeSignaturePlacement(
    format,
    layout,
    orientation,
    blockWidthMm,
    textLengthMm
  );
  if (!placement) return null;

  const canvas = document.createElement('canvas');
  canvas.width = lineHeightPx; // толщина строки → ширина блока
  canvas.height = textWidthPx; // длина текста → высота блока
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  ctx.font = `${fontPx}px ${family}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.translate(lineHeightPx / 2, 0);
  ctx.rotate(Math.PI / 2); // 90° по часовой стрелке: текст читается сверху вниз, буквы «смотрят» вправо
  ctx.fillText(name, 0, 0);

  return { canvas, placement };
}
