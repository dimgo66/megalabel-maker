import { ExportConfig, composeSheetCanvas, exportWithFallback } from './pdfExporter';

/**
 * Печать через PDF-окно (рекомендуемый способ - векторный с fallback)
 */
export async function printViaPdfWindow(cfg: ExportConfig): Promise<{ isVector: boolean; error?: string }> {
  const { pdfBytes, isVector, error } = await exportWithFallback(cfg);
  const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  const printWindow = window.open(url);
  if (!printWindow) {
    URL.revokeObjectURL(url);
    throw new Error('Не удалось открыть окно печати. Проверьте настройки блокировки всплывающих окон.');
  }

  // Очищаем URL после закрытия окна
  printWindow.addEventListener('afterprint', () => {
    URL.revokeObjectURL(url);
  });
  
  return { isVector, error };
}

/**
 * Печать через браузер (растр)
 */
export async function printViaBrowser(cfg: ExportConfig, dpi: number = 300): Promise<void> {
  // Создаём canvas с нужным DPI
  const canvas = await composeSheetCanvas({ ...cfg, dpi }, dpi);
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
