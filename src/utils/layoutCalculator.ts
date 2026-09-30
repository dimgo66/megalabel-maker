import { LabelFormat, LayoutResult } from '../types';

// A4 sheet dimensions in mm
const SHEET_WIDTH_MM = 210;
const SHEET_HEIGHT_MM = 297;

/**
 * Calculates the optimal grid layout for a given label format on A4 sheet.
 * Centers the grid with equal margins and gaps.
 * @param format - label format configuration
 * @param orientation - page orientation ('portrait' or 'landscape'), defaults to 'portrait'
 */
export function calculateLayout(format: LabelFormat, orientation: 'portrait' | 'landscape' = 'portrait'): LayoutResult {
  const { width_mm, height_mm, count, shape } = format;

  // Determine sheet dimensions based on orientation
  const sheetWidth = orientation === 'landscape' ? SHEET_HEIGHT_MM : SHEET_WIDTH_MM;
  const sheetHeight = orientation === 'landscape' ? SHEET_WIDTH_MM : SHEET_HEIGHT_MM;

  // For circular labels, cell is a square with side = diameter
  const cellWidth_mm = shape === 'circle' ? width_mm : width_mm;
  const cellHeight_mm = shape === 'circle' ? height_mm : height_mm;

  // Find optimal cols and rows
  // We need cols * rows >= count
  // Try to find the best arrangement that fits on the sheet
  let bestCols = 1;
  let bestRows = count;
  let bestScore = Infinity;

  // Try all possible column counts
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);

    // Check if the grid fits on the sheet (with minimal margins)
    const totalWidth = cols * cellWidth_mm;
    const totalHeight = rows * cellHeight_mm;

    if (totalWidth > sheetWidth || totalHeight > sheetHeight) {
      continue;
    }

    // Score: prefer layouts that are closer to square and use space efficiently
    const usedWidth = cols * cellWidth_mm;
    const usedHeight = rows * cellHeight_mm;
    const wastedWidth = sheetWidth - usedWidth;
    const wastedHeight = sheetHeight - usedHeight;
    const score = wastedWidth + wastedHeight;

    if (score < bestScore) {
      bestScore = score;
      bestCols = cols;
      bestRows = rows;
    }
  }

  // Calculate gaps and margins
  const totalUsedWidth = bestCols * cellWidth_mm;
  const totalUsedHeight = bestRows * cellHeight_mm;

  const availableGapX = sheetWidth - totalUsedWidth;
  const availableGapY = sheetHeight - totalUsedHeight;

  // Distribute space: margins on edges + gaps between cells
  // margin + (cols-1)*gap + margin = availableGapX
  // We want equal margins and gaps
  // 2*margin + (cols-1)*gap = availableGapX
  // Let's set margin = gap for simplicity when possible
  let marginLeft_mm: number;
  let gapX_mm: number;
  let marginTop_mm: number;
  let gapY_mm: number;

  if (bestCols === 1) {
    marginLeft_mm = availableGapX / 2;
    gapX_mm = 0;
  } else {
    // margin = gap: 2*margin + (cols-1)*margin = availableGapX => margin = availableGapX / (cols + 1)
    gapX_mm = availableGapX / (bestCols + 1);
    marginLeft_mm = gapX_mm;
  }

  if (bestRows === 1) {
    marginTop_mm = availableGapY / 2;
    gapY_mm = 0;
  } else {
    gapY_mm = availableGapY / (bestRows + 1);
    marginTop_mm = gapY_mm;
  }

  return {
    cols: bestCols,
    rows: bestRows,
    marginTop_mm,
    marginLeft_mm,
    gapX_mm,
    gapY_mm,
    cellWidth_mm,
    cellHeight_mm,
  };
}

/**
 * Convert mm to pixels at 96 DPI (standard screen resolution)
 */
export function mmToPx(mm: number, dpi: number = 96): number {
  return (mm / 25.4) * dpi;
}

/**
 * Convert pixels to mm at given DPI
 */
export function pxToMm(px: number, dpi: number = 96): number {
  return (px * 25.4) / dpi;
}

/**
 * Get the sheet dimensions in mm based on orientation
 */
export function getSheetDimensions(orientation: 'portrait' | 'landscape'): { width: number; height: number } {
  if (orientation === 'landscape') {
    return { width: SHEET_HEIGHT_MM, height: SHEET_WIDTH_MM };
  }
  return { width: SHEET_WIDTH_MM, height: SHEET_HEIGHT_MM };
}
