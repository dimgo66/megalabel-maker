import { jsPDF } from 'jspdf';
import { ExportConfig, exportToPDF, composeSheetCanvas } from './pdfExporter';

/**
 * Печать через PDF-окно (рекомендуемый способ)
 */
export async function printViaPdfWindow(cfg: ExportConfig): Promise<void> {
  const doc = await exportToPDF(cfg);
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);

  const printWindow = window.open(url);
  if (!printWindow) {
    throw new Error('Не удалось открыть окно печати. Проверьте настройки блокировки всплывающих окон.');
  }

  // Очищаем URL после закрытия окна
  printWindow.addEventListener('afterprint', () => {
    URL.revokeObjectURL(url);
  });
}

/**
 * Печать через браузер (растр)
 */
export function printViaBrowser(cfg: ExportConfig, dpi: number = 300): void {
  // Создаём canvas с нужным DPI
  const canvas = composeSheetCanvas({ ...cfg, dpi }, dpi);
  const dataURL = canvas.toDataURL('image/png');

  // Находим или создаём контейнер для печати
  let printArea = document.getElementById('direct-print-area');
  if (!printArea) {
    printArea = document.createElement('div');
    printArea.id = 'direct-print-area';
    document.body.appendChild(printArea);
  }

  // Очищаем и добавляем изображение
  printArea.innerHTML = '';
  const img = document.createElement('img');
  img.src = dataURL;
  img.style.width = '210mm';
  img.style.height = '297mm';
  printArea.appendChild(img);

  // Печатаем
  window.print();

  // Очищаем после печати
  const cleanup = () => {
    printArea!.innerHTML = '';
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup);
}
