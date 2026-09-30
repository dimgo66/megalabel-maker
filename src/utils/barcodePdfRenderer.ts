import { jsPDF } from 'jspdf';
import { NormalizedBar } from './barcodeGenerator';

/**
 * Отрисовка векторного штрихкода в PDF
 * 
 * @param doc - экземпляр jsPDF
 * @param bars - массив нормализованных штрихов (координаты в долях 0..1)
 * @param x_mm - позиция X на листе в мм
 * @param y_mm - позиция Y на листе в мм
 * @param w_mm - ширина штрихкода в мм
 * @param h_mm - высота штрихкода в мм
 */
export function drawBarcodeVectorPDF(
  doc: jsPDF,
  bars: NormalizedBar[],
  x_mm: number,
  y_mm: number,
  w_mm: number,
  h_mm: number
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
  format: string;
  value: string;
  bars: NormalizedBar[];
  svg?: string;
} | null {
  if (!hasBarcodeData(obj)) {
    return null;
  }
  
  return {
    format: obj.barcodeFormat,
    value: obj.barcodeValue,
    bars: obj.barcodeBars,
    svg: obj.barcodeSVG,
  };
}
