import { LabelFormat, LayoutResult } from '../types';

// A4 sheet dimensions in mm
const SHEET_WIDTH_MM = 210;
const SHEET_HEIGHT_MM = 297;

/** Геометрия печатного листа из .doc-шаблона (все значения в мм). */
export interface SheetGeometry {
  /** левое поле первой ячейки от края листа */
  marginLeft_mm: number;
  /** верхнее поле первой ячейки от края листа */
  marginTop_mm: number;
  /** число колонок */
  cols: number;
  /** число рядов */
  rows: number;
  /** ширина ячейки (сама этикетка) */
  cellWidth_mm: number;
  /** высота ячейки (сама этикетка) */
  cellHeight_mm: number;
  /** горизонтальный шаг (лево ячейки → лево следующей) */
  pitchX_mm: number;
  /** вертикальный шаг (верх ячейки → верх следующей) */
  pitchY_mm: number;
  /** свободное место справа от сетки */
  restRight_mm: number;
  /** свободное место снизу от сетки */
  restBottom_mm: number;
}

/**
 * Геометрия из .doc-шаблона: поля страницы, шаг сетки и размер ячейки.
 * Таблица в Word начинается в левом верхнем углу printable area
 * (отступ ячейки −0.26/−1.25 мм — артефакт отступа таблицы, игнорируем).
 */
export function geometryFromMargins(
  pageLeft_mm: number,
  pageTop_mm: number,
  cellWidth_mm: number,
  cellHeight_mm: number,
  cols: number,
  rows: number,
  pitchX_mm: number,
  pitchY_mm: number
): SheetGeometry {
  const gridW = (cols - 1) * pitchX_mm + cellWidth_mm;
  const gridH = (rows - 1) * pitchY_mm + cellHeight_mm;
  return {
    marginLeft_mm: pageLeft_mm,
    marginTop_mm: pageTop_mm,
    cols,
    rows,
    cellWidth_mm,
    cellHeight_mm,
    pitchX_mm,
    pitchY_mm,
    restRight_mm: SHEET_WIDTH_MM - pageLeft_mm - gridW,
    restBottom_mm: SHEET_HEIGHT_MM - pageTop_mm - gridH,
  };
}

/**
 * Calculates the optimal grid layout for a given label format on A4 sheet.
 * Centers the grid with equal margins and gaps.
 * @param format - label format configuration
 * @param orientation - page orientation ('portrait' or 'landscape'), defaults to 'portrait'
 */
export function calculateLayout(format: LabelFormat, orientation: 'portrait' | 'landscape' = 'portrait'): LayoutResult {
  const { width_mm, height_mm, count, shape, layout: preset } = format;

  // Determine sheet dimensions based on orientation
  const sheetWidth = orientation === 'landscape' ? SHEET_HEIGHT_MM : SHEET_WIDTH_MM;
  const sheetHeight = orientation === 'landscape' ? SHEET_WIDTH_MM : SHEET_HEIGHT_MM;

  // Фиксированная геометрия из шаблона .doc (приоритет), иначе авто-раскладка
  if (preset) {
    return {
      cols: preset.cols,
      rows: preset.rows,
      marginTop_mm: preset.marginTop_mm,
      marginLeft_mm: preset.marginLeft_mm,
      gapX_mm: preset.pitchX_mm - preset.cellWidth_mm,
      gapY_mm: preset.pitchY_mm - preset.cellHeight_mm,
      cellWidth_mm: preset.cellWidth_mm,
      cellHeight_mm: preset.cellHeight_mm,
    };
  }

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

/** Шаг сетки: pitch из шаблона .doc или cell+gap для авто-раскладки */
export function gridPitch(
  format: LabelFormat,
  layout: LayoutResult
): { pitchX_mm: number; pitchY_mm: number } {
  const g = format.layout;
  if (g) return { pitchX_mm: g.pitchX_mm, pitchY_mm: g.pitchY_mm };
  return {
    pitchX_mm: layout.cellWidth_mm + layout.gapX_mm,
    pitchY_mm: layout.cellHeight_mm + layout.gapY_mm,
  };
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