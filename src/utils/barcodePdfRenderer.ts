import { jsPDF } from 'jspdf';
import { NormalizedBar, computeDigitPositions, BarcodeFormat } from './barcodeGenerator';

/**
 * Отрисовка векторного штрихкода в PDF
 * 
 * @param doc - экземпляр jsPDF
 * @param bars - массив нормализованных штрихов (координаты в долях 0..1)
 * @param x_mm - позиция X на листе в мм
 * @param y_mm - позиция Y на листе в мм
 * @param w_mm - ширина штрихкода в мм
 * @param h_mm - высота штрихкода в мм
 * @param format - формат штрихкода
 * @param value - значение штрихкода
 * @param textYFrac - доля Y для текста (0..1)
 * @param fontSizeFrac - доля размера шрифта (0..1)
 */
export function drawBarcodeVectorPDF(
  doc: jsPDF,
  bars: NormalizedBar[],
  x_mm: number,
  y_mm: number,
  w_mm: number,
  h_mm: number,
  format?: BarcodeFormat,
  value?: string,
  textYFrac: number = 0.95,
  fontSizeFrac: number = 0.16
): void {
  // Устанавливаем чёрный цвет для штрихов
  doc.setFillColor(0, 0, 0);
  
  // Отрисовываем каждый штрих как векторный прямоугольник
  for (const bar of bars) {
    const barX = x_mm + bar.x * w_mm;
    const barY = y_mm + bar.y * h_mm;
    const barW = bar.width * w_mm;
    const barH = bar.height * h_mm;
    
    // Пропускаем слишком маленькие штрихи (меньше 0.01 мм)
    if (barW < 0.01 || barH < 0.01) {
      continue;
    }
    
    doc.rect(barX, barY, barW, barH, 'F');
  }
  
  // Отрисовываем цифры поцифренно, если есть данные
  if (format && value && bars.length > 0) {
    const positions = computeDigitPositions(bars, format, value);
    
    // Конвертируем мм в pt (1 мм = 2.83465 pt)
    const fontPt = fontSizeFrac * h_mm * 2.83465;
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontPt);
    doc.setTextColor(0, 0, 0);
    
    for (const p of positions) {
      const charX = x_mm + p.xFrac * w_mm;
      const charY = y_mm + (textYFrac - fontSizeFrac * 0.35) * h_mm;
      
      doc.text(p.char, charX, charY, { align: 'center', baseline: 'middle' });
    }
  }
}

/**
 * Проверка наличия данных штрихкода в объекте
 */
export function hasBarcodeData(obj: any): boolean {
  return obj && 
         obj.barcodeFormat && 
         obj.barcodeValue && 
         Array.isArray(obj.barcodeBars) && 
         obj.barcodeBars.length > 0;
}

/**
 * Извлечение данных штрихкода из объекта
 */
export function extractBarcodeData(obj: any): {
  format: BarcodeFormat;
  value: string;
  bars: NormalizedBar[];
  svg?: string;
  textYFrac?: number;
  fontSizeFrac?: number;
} | null {
  if (!hasBarcodeData(obj)) {
    return null;
  }
  
  return {
    format: obj.barcodeFormat,
    value: obj.barcodeValue,
    bars: obj.barcodeBars,
    svg: obj.barcodeSVG,
    textYFrac: obj.barcodeTextYFrac,
    fontSizeFrac: obj.barcodeFontSizeFrac,
  };
}
