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

/**
 * Удаление текста из SVG и извлечение информации о позиции текста
 */
export function stripTextFromSVG(svgString: string): {
  svgNoText: string;
  textYFrac: number;
  fontSizeFrac: number;
} {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  
  if (!svg) {
    console.error('stripTextFromSVG: SVG не найден');
    return {
      svgNoText: svgString,
      textYFrac: 0.95,
      fontSizeFrac: 0.16,
    };
  }
  
  // Получаем размеры SVG
  const vb = svg.viewBox?.baseVal;
  const totalH = vb?.height || parseFloat(svg.getAttribute('height') || '0');
  
  // Находим все text элементы
  const textElements = Array.from(doc.querySelectorAll('text'));
  
  let textYFrac = 0.95;
  let fontSizeFrac = 0.16;
  
  if (textElements.length > 0) {
    const firstText = textElements[0];
    const y = parseFloat(firstText.getAttribute('y') || '0');
    const fontSize = parseFloat(firstText.getAttribute('font-size') || '16');
    
    textYFrac = y / totalH;
    fontSizeFrac = fontSize / totalH;
  }
  
  // Удаляем все text элементы
  textElements.forEach(text => text.remove());
  
  // Получаем SVG без текста
  const svgNoText = svg.outerHTML;
  
  return { svgNoText, textYFrac, fontSizeFrac };
}

/**
 * Интерфейс для позиции цифры
 */
export interface DigitPosition {
  char: string;
  xFrac: number;
}

/**
 * Расчёт позиций цифр для штрихкода
 * Использует стандартную геометрию для правильного расположения цифр
 */
export function computeDigitPositions(
  bars: NormalizedBar[],
  format: 'ean13' | 'itf14',
  code: string
): Array<{ char: string; xFrac: number }> {
  if (bars.length === 0) return [];
  
  // Найти границы штрихов (нормализованные 0..1)
  const minX = Math.min(...bars.map(b => b.x));
  const maxX = Math.max(...bars.map(b => b.x + b.width));
  const totalWidth = maxX - minX;
  
  if (format === 'ean13' && code.length === 13) {
    // EAN-13: 95 модулей
    // Структура: защитные(3) + левая половина(42) + центральные(5) + правая(42) + защитные(3)
    // Позиции цифр в модулях от minX:
    
    const module = totalWidth / 95;
    
    const positions = [
      // Первая цифра слева (вне штрихов)
      { char: code[0], xFrac: minX - 3.5 * module / totalWidth },
      
      // Левая половина (цифры 2-7)
      { char: code[1], xFrac: minX + (6.5 * module) / totalWidth },
      { char: code[2], xFrac: minX + (13.5 * module) / totalWidth },
      { char: code[3], xFrac: minX + (20.5 * module) / totalWidth },
      { char: code[4], xFrac: minX + (27.5 * module) / totalWidth },
      { char: code[5], xFrac: minX + (34.5 * module) / totalWidth },
      { char: code[6], xFrac: minX + (41.5 * module) / totalWidth },
      
      // Правая половина (цифры 8-13)
      { char: code[7], xFrac: minX + (53.5 * module) / totalWidth },
      { char: code[8], xFrac: minX + (60.5 * module) / totalWidth },
      { char: code[9], xFrac: minX + (67.5 * module) / totalWidth },
      { char: code[10], xFrac: minX + (74.5 * module) / totalWidth },
      { char: code[11], xFrac: minX + (81.5 * module) / totalWidth },
      { char: code[12], xFrac: minX + (88.5 * module) / totalWidth },
    ];
    
    return positions;
  }
  
  if (format === 'itf14' && code.length === 14) {
    // ITF-14: равномерное распределение 14 цифр
    return code.split('').map((char, i) => ({
      char,
      xFrac: minX + (i + 0.5) * totalWidth / 14
    }));
  }
  
  return [];
}
