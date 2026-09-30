import { jsPDF } from 'jspdf';
import { BarcodeNorm } from '../types';

/**
 * Отрисовка векторного штрих-кода в PDF из BarcodeNorm
 * Все координаты в модулях, конвертируются в мм через moduleMm
 */
export function drawBarcodeVectorPDF(
  doc: jsPDF,
  norm: BarcodeNorm,
  x_mm: number,
  y_mm: number,
  moduleMm: number  // размер одного модуля в мм
): void {
  const px = norm.pxPerModule;

  // Отрисовка штрихов
  doc.setFillColor(0, 0, 0);
  
  for (const bar of norm.bars) {
    const barX = x_mm + (norm.leftPadMod + bar.xMod) * moduleMm;
    const barY = y_mm;
    const barW = bar.wMod * moduleMm;
    const barH = norm.barHMod * moduleMm;

    if (barW < 0.01 || barH < 0.01) continue;

    doc.rect(barX, barY, barW, barH, 'F');
  }

  // Отрисовка цифр
  const fontSize = norm.fontMod * moduleMm * 2.83465; // mm to pt
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);
  doc.setTextColor(0, 0, 0);

  for (const digit of norm.digits) {
    const digitX = x_mm + (norm.leftPadMod + digit.xMod) * moduleMm;
    const digitY = y_mm + norm.digitYMod * moduleMm;

    doc.text(digit.char, digitX, digitY, {
      align: 'center',
      baseline: 'alphabetic',
    });
  }
}
