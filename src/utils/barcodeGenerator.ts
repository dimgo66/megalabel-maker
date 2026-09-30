import JsBarcode from 'jsbarcode';
import { BarcodeNorm, BarcodeFormat } from '../types';

// EAN-13: стандартные таблицы кодирования
// L-коды (для нечётных цифр в левой половине)
const L_CODES = [
  '0001101', // 0
  '0011001', // 1
  '0010011', // 2
  '0111101', // 3
  '0100011', // 4
  '0110001', // 5
  '0101111', // 6
  '0111011', // 7
  '0110111', // 8
  '0001011', // 9
];

// R-коды (для правой половины)
const R_CODES = [
  '1110010', // 0
  '1100110', // 1
  '1101100', // 2
  '1000010', // 3
  '1011100', // 4
  '1001110', // 5
  '1010000', // 6
  '1000100', // 7
  '1001000', // 8
  '1110100', // 9
];

// G-коды = reverse(R) (для чётных цифр в левой половине)
const G_CODES = R_CODES.map(code => code.split('').reverse().join(''));

// Таблица чётности по первой цифре
const PARITY = [
  'LLLLLL', // 0
  'LLGLGG', // 1
  'LGLGLG', // 2
  'LGLLGG', // 3
  'GGLLLG', // 4
  'GLLLGG', // 5
  'GLGGLG', // 6
  'GLGLGG', // 7
  'GGLGLG', // 8
  'GGLLGG', // 9
];

/**
 * Генерирует 95-битную строку для EAN-13
 */
function generateEan13Bits(code: string): string {
  if (code.length !== 13 || !/^\d{13}$/.test(code)) {
    throw new Error('EAN-13 код должен содержать ровно 13 цифр');
  }

  const firstDigit = parseInt(code[0]);
  const parity = PARITY[firstDigit];

  let bits = '101'; // start guard

  // Левая половина (цифры 2-7, индексы 1-6)
  for (let i = 0; i < 6; i++) {
    const digit = parseInt(code[1 + i]);
    const parityType = parity[i];
    
    if (parityType === 'L') {
      bits += L_CODES[digit];
    } else {
      bits += G_CODES[digit];
    }
  }

  bits += '01010'; // center guard

  // Правая половина (цифры 8-13, индексы 7-12)
  for (let j = 0; j < 6; j++) {
    const digit = parseInt(code[7 + j]);
    bits += R_CODES[digit];
  }

  bits += '101'; // end guard

  if (bits.length !== 95) {
    throw new Error(`Ошибка генерации EAN-13: ожидалось 95 бит, получено ${bits.length}`);
  }

  return bits;
}

/**
 * Константы вертикальной геометрии EAN-13
 */
const DATA_BAR_H_MOD = 44;    // высота штрихов данных
const GUARD_BAR_H_MOD = 53;   // высота защитных штрихов (длиннее, входят в зону цифр)

/**
 * Зоны защитных штрихов (модули символа 0..95)
 */
const GUARD_ZONES = [
  [0, 3],     // start guard
  [45, 50],   // center guard
  [92, 95],   // end guard
];

/**
 * Проверяет, находится ли штрих полностью в зоне защитного штриха
 */
function isGuardBar(xMod: number, wMod: number): boolean {
  const endMod = xMod + wMod;
  return GUARD_ZONES.some(([zoneStart, zoneEnd]) => {
    return xMod >= zoneStart && endMod <= zoneEnd;
  });
}

/**
 * Преобразует битовую строку в массив штрихов в модулях с высотой
 */
function bitsToBarsModules(bits: string): Array<{ xMod: number; wMod: number; hMod: number }> {
  const bars: Array<{ xMod: number; wMod: number; hMod: number }> = [];
  let i = 0;

  while (i < bits.length) {
    if (bits[i] === '1') {
      const start = i;
      while (i < bits.length && bits[i] === '1') {
        i++;
      }
      const length = i - start;
      const hMod = isGuardBar(start, length) ? GUARD_BAR_H_MOD : DATA_BAR_H_MOD;
      bars.push({ xMod: start, wMod: length, hMod });
    } else {
      i++;
    }
  }

  return bars;
}

/**
 * Строит BarcodeNorm для EAN-13 детерминированно по стандарту
 * Все значения в МОДУЛЯХ, не в долях!
 */
export function buildEan13Norm(code: string): BarcodeNorm {
  const bits = generateEan13Bits(code);
  const bars = bitsToBarsModules(bits);

  // Позиции цифр в модулях
  const digits = [
    // Первая цифра (code[0]) - слева вне штрихов
    { char: code[0], xMod: -3.5 },
    
    // Левая половина (цифры 2-7, индексы 1-6)
    { char: code[1], xMod: 6.5 },
    { char: code[2], xMod: 13.5 },
    { char: code[3], xMod: 20.5 },
    { char: code[4], xMod: 27.5 },
    { char: code[5], xMod: 34.5 },
    { char: code[6], xMod: 41.5 },
    
    // Правая половина (цифры 8-13, индексы 7-12)
    { char: code[7], xMod: 53.5 },
    { char: code[8], xMod: 60.5 },
    { char: code[9], xMod: 67.5 },
    { char: code[10], xMod: 74.5 },
    { char: code[11], xMod: 81.5 },
    { char: code[12], xMod: 88.5 },
  ];

  return {
    format: 'ean13',
    modulesTotal: 95,
    leftPadMod: 7,        // запас под первую цифру слева
    bars,
    digits,
    digitYMod: 56,        // базовая линия цифр в модулях (плотнее к штрихам)
    fontMod: 9,           // кегль цифр в модулях
    pxPerModule: 4,       // пикселей на модуль при scale=1
  };
}

/**
 * Парсит SVG штрих-кода и возвращает штрихи в пикселях viewBox
 * КРИТИЧНО: учитывает transform родительских <g> элементов
 */
export function parseBarcodeBarsFromSVG(svgString: string): {
  bars: Array<{ x: number; y: number; width: number; height: number }>;
  vbW: number;
  vbH: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
} {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svg = doc.querySelector('svg');

  if (!svg) {
    throw new Error('SVG не найден');
  }

  // Получаем viewBox
  const viewBox = svg.getAttribute('viewBox');
  if (!viewBox) {
    throw new Error('viewBox не найден в SVG');
  }

  const [, , vbW, vbH] = viewBox.split(' ').map(parseFloat);

  // Рекурсивно собираем все <rect> с учётом transform
  const allRects: Array<{ x: number; y: number; width: number; height: number; fill: string }> = [];

  function collectRects(element: Element, parentTransform: { tx: number; ty: number; sx: number; sy: number }) {
    // Получаем transform этого элемента
    const transformAttr = element.getAttribute('transform');
    let currentTransform = { ...parentTransform };

    if (transformAttr) {
      // Парсим transform (упрощённо: только translate и scale)
      const translateMatch = transformAttr.match(/translate\(([^,]+),\s*([^)]+)\)/);
      if (translateMatch) {
        currentTransform.tx += parseFloat(translateMatch[1]);
        currentTransform.ty += parseFloat(translateMatch[2]);
      }

      const scaleMatch = transformAttr.match(/scale\(([^,)]+)(?:,\s*([^)]+))?\)/);
      if (scaleMatch) {
        const sx = parseFloat(scaleMatch[1]);
        const sy = scaleMatch[2] ? parseFloat(scaleMatch[2]) : sx;
        currentTransform.sx *= sx;
        currentTransform.sy *= sy;
      }
    }

    // Обрабатываем <rect>
    if (element.tagName === 'rect') {
      const x = parseFloat(element.getAttribute('x') || '0');
      const y = parseFloat(element.getAttribute('y') || '0');
      const width = parseFloat(element.getAttribute('width') || '0');
      const height = parseFloat(element.getAttribute('height') || '0');
      const fill = element.getAttribute('fill') || '#000000';

      // Применяем transform
      const transformedX = x * currentTransform.sx + currentTransform.tx;
      const transformedY = y * currentTransform.sy + currentTransform.ty;
      const transformedWidth = width * currentTransform.sx;
      const transformedHeight = height * currentTransform.sy;

      allRects.push({
        x: transformedX,
        y: transformedY,
        width: transformedWidth,
        height: transformedHeight,
        fill,
      });
    }

    // Рекурсивно обрабатываем дочерние элементы
    for (const child of Array.from(element.children)) {
      collectRects(child, currentTransform);
    }
  }

  collectRects(svg, { tx: 0, ty: 0, sx: 1, sy: 1 });

  // Фильтруем только тёмные прямоугольники (штрихи)
  const darkRects = allRects.filter(rect => {
    // Проверяем fill
    const fill = rect.fill.toLowerCase();
    
    // Пропускаем белые/светлые
    if (fill === '#ffffff' || fill === '#fff' || fill === 'white' || fill === 'none') {
      return false;
    }

    // Проверяем яркость (упрощённо)
    if (fill.startsWith('#')) {
      const hex = fill.slice(1);
      if (hex.length === 3) {
        const r = parseInt(hex[0] + hex[0], 16);
        const g = parseInt(hex[1] + hex[1], 16);
        const b = parseInt(hex[2] + hex[2], 16);
        const brightness = (r + g + b) / 3;
        return brightness < 128;
      } else if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        const brightness = (r + g + b) / 3;
        return brightness < 128;
      }
    }

    // По умолчанию считаем тёмным
    return true;
  });

  // Вычисляем bbox
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const rect of darkRects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }

  return {
    bars: darkRects,
    vbW,
    vbH,
    bbox: { minX, minY, maxX, maxY },
  };
}

/**
 * Строит BarcodeNorm для ITF-14 из SVG
 * Все значения в модулях (px для ITF-14)
 */
export function buildItf14Norm(svgString: string, code: string): BarcodeNorm {
  if (code.length !== 14 || !/^\d{14}$/.test(code)) {
    throw new Error('ITF-14 код должен содержать ровно 14 цифр');
  }

  const { bars, bbox } = parseBarcodeBarsFromSVG(svgString);
  const symW = bbox.maxX - bbox.minX;
  const symH = bbox.maxY - bbox.minY;

  // Константы (приблизительные, на основе анализа SVG)
  const barHMod = symH * 0.7; // высота штрихов
  const digitYMod = symH * 0.85; // позиция цифр
  const fontMod = symH * 0.15; // размер шрифта

  // Конвертируем в модули (для ITF-14 модуль = 1 px)
  // Все штрихи ITF-14 имеют одинаковую высоту
  const barsModules = bars.map(r => ({
    xMod: r.x - bbox.minX,
    wMod: r.width,
    hMod: barHMod,
  }));

  // Позиции цифр: равномерно распределены
  const digits = [];
  for (let i = 0; i < 14; i++) {
    digits.push({
      char: code[i],
      xMod: (i + 0.5) * symW / 14,
    });
  }

  return {
    format: 'itf14',
    modulesTotal: symW,
    leftPadMod: 0,
    bars: barsModules,
    digits,
    digitYMod,
    fontMod,
    pxPerModule: 1, // для ITF-14 модуль = 1 px
  };
}

/**
 * Удаляет текст из SVG и возвращает информацию о позиции текста
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
    return {
      svgNoText: svgString,
      textYFrac: 0.95,
      fontSizeFrac: 0.16,
    };
  }

  // Получаем viewBox
  const viewBox = svg.getAttribute('viewBox');
  const [, , , vbH] = viewBox ? viewBox.split(' ').map(parseFloat) : [0, 0, 100, 100];

  // Находим все <text> элементы
  const textElements = Array.from(doc.querySelectorAll('text'));

  let textYFrac = 0.95;
  let fontSizeFrac = 0.16;

  if (textElements.length > 0) {
    const firstText = textElements[0];
    const y = parseFloat(firstText.getAttribute('y') || '0');
    const fontSize = parseFloat(firstText.getAttribute('font-size') || '16');

    textYFrac = y / vbH;
    fontSizeFrac = fontSize / vbH;
  }

  // Удаляем все <text> элементы
  textElements.forEach(el => el.remove());

  const svgNoText = svg.outerHTML;

  return { svgNoText, textYFrac, fontSizeFrac };
}

/**
 * Генерирует SVG для штрих-кода (используется только для ITF-14)
 */
export function generateBarcodeSVG(
  code: string,
  format: 'ean13' | 'itf14',
  options: { displayValue?: boolean } = {}
): string {
  // Для EAN-13 не используем JsBarcode, генерируем детерминированно
  if (format === 'ean13') {
    throw new Error('Для EAN-13 используйте buildEan13Norm вместо generateBarcodeSVG');
  }

  // Для ITF-14 используем JsBarcode
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  
  JsBarcode(svg, code, {
    format: 'ITF14',
    displayValue: options.displayValue ?? true,
    width: 2,
    height: 80,
    lineColor: '#000000',
    background: '#FFFFFF',
    margin: 10,
    fontSize: 16,
    font: 'Arial',
  });

  return svg.outerHTML;
}

/**
 * Валидация штрих-кода
 */
export function validateBarcode(code: string, format: BarcodeFormat): { valid: boolean; error?: string } {
  if (format === 'ean13') {
    if (!/^\d{12,13}$/.test(code)) {
      return { valid: false, error: 'EAN-13 должен содержать 12 или 13 цифр' };
    }
  } else if (format === 'itf14') {
    if (!/^\d{13,14}$/.test(code)) {
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
