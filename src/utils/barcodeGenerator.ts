import JsBarcode from 'jsbarcode';
import * as fabric from 'fabric';

export interface NormalizedBar {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BarcodeFormat = 'ean13' | 'itf14';

/**
 * Генерация SVG штрихкода
 */
export function generateBarcodeSVG(
  code: string,
  format: BarcodeFormat,
  options: {
    displayValue?: boolean;
    width?: number;
    height?: number;
  } = {}
): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  
  JsBarcode(svg, code, {
    format: format === 'ean13' ? 'EAN13' : 'ITF14',
    displayValue: options.displayValue ?? true,
    width: options.width ?? 2,
    height: options.height ?? 80,
    lineColor: '#000000',
    background: '#FFFFFF',
    margin: 10,
    fontSize: 16,
    font: 'Arial',
  });
  
  return svg.outerHTML;
}

/**
 * Парсинг SVG-строки и извлечение нормализованных штрихов
 */
export function parseBarcodeBars(svgString: string): NormalizedBar[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  
  if (!svg) {
    console.error('parseBarcodeBars: SVG не найден');
    return [];
  }
  
  // Получаем размеры SVG
  const vb = svg.viewBox?.baseVal;
  const totalW = vb?.width || parseFloat(svg.getAttribute('width') || '0');
  const totalH = vb?.height || parseFloat(svg.getAttribute('height') || '0');
  
  if (totalW === 0 || totalH === 0) {
    console.error('parseBarcodeBars: некорректные размеры SVG');
    return [];
  }
  
  // Находим все rect элементы (штрихи)
  const rects = Array.from(doc.querySelectorAll('rect'));
  
  console.log(`parseBarcodeBars: найдено ${rects.length} rect элементов`);
  
  // Фильтруем белые прямоугольники (фон) и нормализуем координаты
  const bars: NormalizedBar[] = rects
    .filter(r => {
      const fill = r.getAttribute('fill');
      const style = r.getAttribute('style') || '';
      
      // Исключаем белые прямоугольники (фон)
      if (fill === '#ffffff' || fill === '#FFFFFF' || fill === 'white') {
        return false;
      }
      if (style.includes('fill:#ffffff') || style.includes('fill:#FFFFFF') || style.includes('fill:white')) {
        return false;
      }
      
      return true;
    })
    .map(r => {
      const x = parseFloat(r.getAttribute('x') || '0');
      const y = parseFloat(r.getAttribute('y') || '0');
      const width = parseFloat(r.getAttribute('width') || '0');
      const height = parseFloat(r.getAttribute('height') || '0');
      
      return {
        x: x / totalW,
        y: y / totalH,
        width: width / totalW,
        height: height / totalH,
      };
    });
  
  console.log(`parseBarcodeBars: после фильтрации ${bars.length} штрихов`);
  
  return bars;
}

/**
 * Загрузка SVG штрихкода в Fabric.js как векторную группу
 */
export async function loadBarcodeIntoFabric(svgString: string): Promise<fabric.Group> {
  return new Promise((resolve, reject) => {
    fabric.loadSVGFromString(svgString).then((result) => {
      const objects = result.objects.filter(obj => obj !== null) as fabric.FabricObject[];
      
      if (objects.length === 0) {
        reject(new Error('Не удалось загрузить SVG штрихкод'));
        return;
      }
      
      // Создаём группу из всех объектов
      const group = new fabric.Group(objects, {
        originX: 'left',
        originY: 'top',
      });
      
      resolve(group);
    }).catch((error) => {
      console.error('loadBarcodeIntoFabric: ошибка загрузки SVG', error);
      reject(error);
    });
  });
}

/**
 * Валидация кода штрихкода
 */
export function validateBarcode(code: string, format: BarcodeFormat): { valid: boolean; error?: string } {
  if (!code || code.trim() === '') {
    return { valid: false, error: 'Код не может быть пустым' };
  }
  
  const cleanCode = code.replace(/\s/g, '');
  
  if (format === 'ean13') {
    if (!/^\d{12,13}$/.test(cleanCode)) {
      return { valid: false, error: 'EAN-13 должен содержать 12 или 13 цифр' };
    }
  } else if (format === 'itf14') {
    if (!/^\d{13,14}$/.test(cleanCode)) {
      return { valid: false, error: 'ITF-14 должен содержать 13 или 14 цифр' };
    }
  }
  
  return { valid: true };
}

/**
 * Добавление контрольной цифры, если она отсутствует
 */
export function addCheckDigit(code: string, format: BarcodeFormat): string {
  const cleanCode = code.replace(/\s/g, '');
  
  if (format === 'ean13' && cleanCode.length === 12) {
    // Добавляем контрольную цифру для EAN-13
    const digits = cleanCode.split('').map(Number);
    let sum = 0;
    
    for (let i = 0; i < 12; i++) {
      sum += digits[i] * (i % 2 === 0 ? 1 : 3);
    }
    
    const checkDigit = (10 - (sum % 10)) % 10;
    return cleanCode + checkDigit;
  }
  
  if (format === 'itf14' && cleanCode.length === 13) {
    // Добавляем контрольную цифру для ITF-14
    const digits = cleanCode.split('').map(Number);
    let sum = 0;
    
    for (let i = 0; i < 13; i++) {
      sum += digits[i] * (i % 2 === 0 ? 3 : 1);
    }
    
    const checkDigit = (10 - (sum % 10)) % 10;
    return cleanCode + checkDigit;
  }
  
  return cleanCode;
}
