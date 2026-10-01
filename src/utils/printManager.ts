import { ExportConfig, composeSheetCanvas, exportWithFallback } from './pdfExporter';
import { getSheetDimensions } from './layoutCalculator';

/**
 * Печать векторного PDF: PDF открывается в скрытом iframe и сразу вызывается диалог печати.
 * Если браузер не даёт печатать из iframe — открываем PDF в новой вкладке.
 */
export async function printViaPdfWindow(cfg: ExportConfig): Promise<{ isVector: boolean; error?: string }> {
  const { pdfBytes, isVector, error } = await exportWithFallback(cfg);
  const url = URL.createObjectURL(new Blob([pdfBytes as BlobPart], { type: 'application/pdf' }));

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
  iframe.src = url;

  const cleanup = () => {
    setTimeout(() => {
      iframe.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  };

  await new Promise<void>((resolve) => {
    iframe.onload = () => {
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          if (!window.open(url)) {
            throw new Error('Не удалось открыть окно печати. Проверьте блокировку всплывающих окон.');
          }
        }
        resolve();
      }, 400);
    };
    document.body.appendChild(iframe);
  });
  cleanup();

  return { isVector, error };
}

/** Печать через браузер (растр, 300 DPI) */
export async function printViaBrowser(cfg: ExportConfig): Promise<void> {
  const canvas = await composeSheetCanvas({ ...cfg, dpi: 300 }, 300);
  const { width, height } = getSheetDimensions(cfg.orientation);

  let area = document.getElementById('direct-print-area');
  if (!area) {
    area = document.createElement('div');
    area.id = 'direct-print-area';
    document.body.appendChild(area);
  }
  area.innerHTML = '';
  const img = document.createElement('img');
  img.src = canvas.toDataURL('image/png');
  img.style.width = `${width}mm`;
  img.style.height = `${height}mm`;
  area.appendChild(img);
  await img.decode();

  const style = document.createElement('style');
  style.textContent = `@page { size: A4 ${cfg.orientation}; margin: 0 }`;
  document.head.appendChild(style);

  const cleanup = () => {
    area!.innerHTML = '';
    style.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
