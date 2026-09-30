import { jsPDF } from 'jspdf';

// Глобальный флаг для отслеживания инициализации шрифта
let isFontInitialized = false;

/**
 * Инициализирует шрифт с поддержкой кириллицы для jsPDF
 * Загружает шрифт PT Sans из Google Fonts и добавляет его в jsPDF
 */
export async function initializeCyrillicFont(doc: jsPDF): Promise<void> {
  if (isFontInitialized) {
    doc.setFont('PTSans');
    return;
  }

  try {
    // Загружаем шрифт PT Sans Regular из Google Fonts
    const fontUrl = 'https://fonts.gstatic.com/s/ptsans/v17/jizaRExUiTo8FluXgBck.woff2';
    const response = await fetch(fontUrl);
    const fontBuffer = await response.arrayBuffer();
    
    // Конвертируем в base64
    const fontBase64 = arrayBufferToBase64(fontBuffer);
    
    // Добавляем шрифт в jsPDF
    doc.addFileToVFS('PTSans-Regular.woff2', fontBase64);
    doc.addFont('PTSans-Regular.woff2', 'PTSans', 'normal');
    
    isFontInitialized = true;
    doc.setFont('PTSans');
  } catch (error) {
    console.warn('Не удалось загрузить шрифт PT Sans, используем fallback', error);
    // Fallback на стандартный шрифт
    doc.setFont('helvetica');
  }
}

/**
 * Конвертирует ArrayBuffer в base64 строку
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Устанавливает текст с поддержкой кириллицы
 */
export function setCyrllicText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  options?: {
    align?: 'left' | 'center' | 'right';
    baseline?: 'top' | 'middle' | 'bottom' | 'alphabetic';
    maxWidth?: number;
  }
): void {
  // Убеждаемся, что используется шрифт с поддержкой кириллицы
  if (isFontInitialized) {
    doc.setFont('PTSans');
  } else {
    doc.setFont('helvetica');
  }
  
  doc.text(text, x, y, options);
}

/**
 * Проверяет, инициализирован ли шрифт с поддержкой кириллицы
 */
export function isCyrillicFontReady(): boolean {
  return isFontInitialized;
}
