import { jsPDF } from 'jspdf';
import * as fabric from 'fabric';
import { LabelFormat, BarcodeNorm } from '../types';
import { calculateLayout } from './layoutCalculator';
import { drawBarcodeVectorPDF } from './barcodePdfRenderer';

export interface ExportConfig {
  format: LabelFormat;
  editorCanvas: fabric.Canvas;
  dpi: number;
  orientation: 'portrait' | 'landscape';
}

interface BarcodePlacement {
  norm: BarcodeNorm;
  symbolLeft_mm: number;
  symbolTop_mm: number;
  moduleMm: number;
}

/**
 * Рендер растра этикетки (без штрих-кодов)
 */
export function renderLabelRaster(
  canvas: fabric.Canvas,
  format: LabelFormat,
  dpi: number
): string {
  // Временно скрываем штрих-коды
  const barcodeObjects: fabric.FabricObject[] = [];
  canvas.getObjects().forEach((obj: any) => {
    if (obj.barcodeNorm) {
      barcodeObjects.push(obj);
      obj.set('visible', false);
    }
  });

  // Для круглых этикеток временно убираем фон
  const originalBg = canvas.backgroundColor;
  if (format.shape === 'circle') {
    canvas.backgroundColor = 'transparent';
  }

  canvas.renderAll();

  // Рассчитываем масштаб для нужного DPI
  const canvasWidthPx = canvas.getWidth();
  const targetWidthPx = (format.width_mm / 25.4) * dpi;
  const multiplier = targetWidthPx / canvasWidthPx;

  // Генерируем dataURL
  const dataURL = canvas.toDataURL({
    format: 'png',
    multiplier,
    left: 0,
    top: 0,
    width: canvasWidthPx,
    height: canvas.getHeight(),
  });

  // Восстанавливаем видимость
  barcodeObjects.forEach((obj) => {
    obj.set('visible', true);
  });

  // Восстанавливаем фон
  if (format.shape === 'circle') {
    canvas.backgroundColor = originalBg;
  }

  canvas.renderAll();

  return dataURL;
}

/**
 * Сбор данных о штрих-кодах на канвасе
 */
export function collectBarcodes(
  canvas: fabric.Canvas,
  format: LabelFormat
): BarcodePlacement[] {
  const mmPerPx = format.width_mm / canvas.getWidth();
  const barcodes: BarcodePlacement[] = [];

  canvas.getObjects().forEach((obj: any) => {
    if (obj.barcodeNorm) {
      const norm = obj.barcodeNorm as BarcodeNorm;
      
      // Размер одного модуля в мм
      const moduleMm = (norm.pxPerModule * obj.scaleX) * mmPerPx;
      
      // Позиция символа в мм
      const symbolLeft_mm = (obj.left + norm.leftPadMod * norm.pxPerModule * obj.scaleX) * mmPerPx;
      const symbolTop_mm = obj.top * mmPerPx;

      barcodes.push({
        norm,
        symbolLeft_mm,
        symbolTop_mm,
        moduleMm,
      });
    }
  });

  return barcodes;
}

/**
 * Экспорт в PDF
 */
export async function exportToPDF(cfg: ExportConfig): Promise<jsPDF> {
  const { format, editorCanvas, dpi, orientation } = cfg;

  // Создаём документ
  const doc = new jsPDF({
    format: 'a4',
    orientation,
    unit: 'mm',
    compress: true,
  });

  // Рассчитываем раскладку
  const layout = calculateLayout(format);

  // Рендерим растр и собираем штрих-коды
  const raster = renderLabelRaster(editorCanvas, format, dpi);
  const barcodes = collectBarcodes(editorCanvas, format);

  // Рендерим каждую ячейку
  let index = 0;
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      if (index >= format.count) break;

      // Позиция ячейки в мм
      const x = layout.marginLeft_mm + col * (layout.cellWidth_mm + layout.gapX_mm);
      const y = layout.marginTop_mm + row * (layout.cellHeight_mm + layout.gapY_mm);

      // Для круглых этикеток рисуем белый круг
      if (format.shape === 'circle') {
        doc.setFillColor(255, 255, 255);
        const centerX = x + layout.cellWidth_mm / 2;
        const centerY = y + layout.cellHeight_mm / 2;
        const radius = Math.min(layout.cellWidth_mm, layout.cellHeight_mm) / 2;
        doc.circle(centerX, centerY, radius, 'F');
      }

      // Добавляем растр этикетки
      doc.addImage(raster, 'PNG', x, y, layout.cellWidth_mm, layout.cellHeight_mm);

      // Рендерим штрих-коды векторно
      for (const bc of barcodes) {
        drawBarcodeVectorPDF(
          doc,
          bc.norm,
          x + bc.symbolLeft_mm,
          y + bc.symbolTop_mm,
          bc.moduleMm
        );
      }

      index++;
    }
  }

  return doc;
}

/**
 * Создание canvas для превью/печати
 */
export function composeSheetCanvas(
  cfg: ExportConfig,
  screenDpi: number = 96
): HTMLCanvasElement {
  const { format, editorCanvas, dpi, orientation } = cfg;

  // Размеры листа A4 в пикселях
  const sheetWidthMm = orientation === 'portrait' ? 210 : 297;
  const sheetHeightMm = orientation === 'portrait' ? 297 : 210;
  const sheetWidthPx = (sheetWidthMm / 25.4) * screenDpi;
  const sheetHeightPx = (sheetHeightMm / 25.4) * screenDpi;

  // Создаём offscreen canvas
  const canvas = document.createElement('canvas');
  canvas.width = sheetWidthPx;
  canvas.height = sheetHeightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Не удалось получить контекст canvas');

  // Белый фон
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, sheetWidthPx, sheetHeightPx);

  // Рассчитываем раскладку
  const layout = calculateLayout(format);

  // Рендерим растр и собираем штрих-коды
  const raster = renderLabelRaster(editorCanvas, format, dpi);
  const barcodes = collectBarcodes(editorCanvas, format);

  // Загружаем растр как изображение
  const img = new Image();
  img.src = raster;

  // Рендерим каждую ячейку
  let index = 0;
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      if (index >= format.count) break;

      // Позиция ячейки в мм
      const x_mm = layout.marginLeft_mm + col * (layout.cellWidth_mm + layout.gapX_mm);
      const y_mm = layout.marginTop_mm + row * (layout.cellHeight_mm + layout.gapY_mm);

      // Конвертируем в пиксели
      const x_px = (x_mm / 25.4) * screenDpi;
      const y_px = (y_mm / 25.4) * screenDpi;
      const cellW_px = (layout.cellWidth_mm / 25.4) * screenDpi;
      const cellH_px = (layout.cellHeight_mm / 25.4) * screenDpi;

      // Для круглых этикеток: круглый clipPath
      if (format.shape === 'circle') {
        ctx.save();
        ctx.beginPath();
        const radius = Math.min(cellW_px, cellH_px) / 2;
        ctx.arc(x_px + cellW_px / 2, y_px + cellH_px / 2, radius, 0, Math.PI * 2);
        ctx.clip();
      }

      // Рисуем растр этикетки
      ctx.drawImage(img, x_px, y_px, cellW_px, cellH_px);

      // Восстанавливаем контекст для круглых
      if (format.shape === 'circle') {
        ctx.restore();
      }

      // Рендерим штрих-коды
      for (const bc of barcodes) {
        const norm = bc.norm;
        const px = norm.pxPerModule;
        const modulePx = px * bc.moduleMm / (format.width_mm / (canvas.width / screenDpi * 25.4));

        const bcX_px = x_px + (bc.symbolLeft_mm / layout.cellWidth_mm) * cellW_px;
        const bcY_px = y_px + (bc.symbolTop_mm / layout.cellHeight_mm) * cellH_px;

        // Рисуем штрихи
        ctx.fillStyle = '#000000';
        for (const bar of norm.bars) {
          const barX = bcX_px + (norm.leftPadMod + bar.xMod) * modulePx;
          const barY = bcY_px;
          const barW = bar.wMod * modulePx;
          const barH = bar.hMod * modulePx;  // используем индивидуальную высоту штриха

          if (barW < 0.5 || barH < 0.5) continue;

          ctx.fillRect(barX, barY, barW, barH);
        }

        // Рисуем цифры
        const fontSize = norm.fontMod * modulePx;
        ctx.font = `${fontSize}px Arial`;
        ctx.fillStyle = '#000000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';

        for (const digit of norm.digits) {
          const digitX = bcX_px + (norm.leftPadMod + digit.xMod) * modulePx;
          const digitY = bcY_px + norm.digitYMod * modulePx;
          ctx.fillText(digit.char, digitX, digitY);
        }
      }

      index++;
    }
  }

  return canvas;
}
