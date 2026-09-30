import * as pdfjsLib from 'pdfjs-dist';

// Установить локальный воркер через new URL для Vite
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface PdfPageResult {
  canvas: HTMLCanvasElement;
  pageCount: number;
  pageNumber: number;
}

/**
 * Загрузка PDF файла как изображения
 * @param file - PDF файл
 * @param pageNumber - номер страницы (по умолчанию 1)
 * @param scale - масштаб рендеринга (по умолчанию 3 для высокого качества)
 */
export async function loadPdfAsImage(
  file: File,
  pageNumber: number = 1,
  scale: number = 3
): Promise<PdfPageResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    if (pageNumber < 1 || pageNumber > pdf.numPages) {
      throw new Error(`Неверный номер страницы: ${pageNumber}. PDF содержит ${pdf.numPages} страниц`);
    }
    
    const page = await pdf.getPage(pageNumber);
    
    // Масштаб для высокого качества (эквивалент 300 DPI)
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) {
      throw new Error('Не удалось получить контекст canvas');
    }
    
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    await page.render({
      canvasContext: context as any,
      viewport: viewport
    } as any).promise;
    
    return {
      canvas,
      pageCount: pdf.numPages,
      pageNumber
    };
  } catch (error) {
    console.error('Ошибка загрузки PDF:', error);
    throw error;
  }
}

/**
 * Получить миниатюры всех страниц PDF
 * @param file - PDF файл
 * @param scale - масштаб миниатюр (по умолчанию 1)
 */
export async function getPdfPageThumbnails(
  file: File,
  scale: number = 1
): Promise<HTMLCanvasElement[]> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    const thumbnails: HTMLCanvasElement[] = [];
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale });
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      if (!context) {
        throw new Error('Не удалось получить контекст canvas');
      }
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      await page.render({
        canvasContext: context as any,
        viewport: viewport
      } as any).promise;
      
      thumbnails.push(canvas);
    }
    
    return thumbnails;
  } catch (error) {
    console.error('Ошибка создания миниатюр PDF:', error);
    throw error;
  }
}
