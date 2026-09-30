import { jsPDF } from 'jspdf';
import { BarcodeNorm } from '../types';

/**
 * Отрисовка векторного штрих-кода в PDF из BarcodeNorm
 */
export function drawBarcodeVectorPDF(
  doc: jsPDF,
  norm: BarcodeNorm,
  x_mm: number,
  y_mm: number,
  width_mm: number,
  height_mm: number
): void {
  // Вычисляем масштаб
  const totalHeightPx = norm.totalHeightModules * norm.unit;
  const barHeightPx = norm.barHeightModules * norm.unit;
  
  const scaleX = width_mm / (norm.unit * (1 + norm.overhangFrac * 2)); // учитываем overhang
  const scaleY = height_mm / totalHeightPx;

  // Отрисовка штрихов
  doc.setFillColor(0, 0, 0);
  
  for (const bar of norm.bars) {
    const barX = x_mm + (norm.overhangFrac + bar.x) * norm.unit * scaleX;
    const barY = y_mm + bar.y * barHeightPx * scaleY;
    const barW = bar.width * norm.unit * scaleX;
    const barH = bar.height * barHeightPx * scaleY;

    if (barW < 0.01 || barH < 0.01) continue;

    doc.rect(barX, barY, barW, barH, 'F');
  }

  // Отрисовка цифр
  const fontSize = norm.fontSizeFrac * totalHeightPx * scaleY * 2.83465; // mm to pt
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);
  doc.setTextColor(0, 0, 0);

  for (const digit of norm.digits) {
    const digitX = x_mm + (norm.overhangFrac + digit.xFrac) * norm.unit * scaleX;
    const digitY = y_mm + norm.textYFrac * totalHeightPx * scaleY;

    doc.text(digit.char, digitX, digitY, {
      align: 'center',
      baseline: 'middle',
    });
  }
}
