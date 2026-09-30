import { BarcodeNorm, BarcodeDigit, NormalizedBar } from '../types';
import JsBarcode from 'jsbarcode';

export type BarcodeFormat = 'ean13' | 'itf14';
export type { NormalizedBar, BarcodeDigit, BarcodeNorm } from '../types';

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
 * Преобразует битовую строку в массив штрихов (runs of 1s)
 */
function bitsToBars(bits: string): NormalizedBar[] {
  const bars: NormalizedBar[] = [];
  let i = 0;

  while (i < bits.length) {
    if (bits[i] === '1') {
      const start = i;
      while (i < bits.length && bits[i] === '1') {
        i++;
      }
      const length = i - start;
      bars.push({
        x: start / 95,
        y: 0,
        width: length / 95,
        height: 1,
      });
    } else {
      i++;
    }
  }

  return bars;
}

/**
 * Вычисляет позиции цифр для EAN-13
 */
function computeEan13Digits(code: string): BarcodeDigit[] {
  const digits: BarcodeDigit[] = [];

  // Первая цифра (code[0]) - слева вне штрихов
  digits.push({
    char: code[0],
    xFrac: -3.5 / 95, // 3.5 модуля слева от начала штрихов
  });

  // Левая половина (цифры 2-7, индексы 1-6)
  for (let i = 0; i < 6; i++) {
    digits.push({
      char: code[1 + i],
      xFrac: (6 + 7 * i) / 95, // центр каждого 7-модульного блока
    });
  }

  // Правая половина (цифры 8-13, индексы 7-12)
  for (let j = 0; j < 6; j++) {
    digits.push({
      char: code[7 + j],
      xFrac: (53 + 7 * j) / 95, // центр каждого 7-модульного блока
    });
  }

  return digits;
}

/**
 * Строит BarcodeNorm для EAN-13 детерминированно по стандарту
 */
export function buildEan13Norm(code: string): BarcodeNorm {
  const bits = generateEan13Bits(code);
  const bars = bitsToBars(bits);
  const digits = computeEan13Digits(code);

  // Константы в модулях
  const BAR_H_MODULES = 50;      // высота штрихов
  const FONT_MODULES = 9;        // размер шрифта
  const DIGIT_Y_MODULES = 57;    // позиция цифр (от верха)
  const TOTAL_HEIGHT_MODULES = DIGIT_Y_MODULES + FONT_MODULES; // общая высота с цифрами

  return {
    bars,
    digits,
    textYFrac: DIGIT_Y_MODULES / TOTAL_HEIGHT_MODULES,
    fontSizeFrac: FONT_MODULES / TOTAL_HEIGHT_MODULES,
    overhangFrac: 7 / 95, // запас под первую цифру слева
    unit: 4, // пикселей на модуль при scale=1
    totalHeightModules: TOTAL_HEIGHT_MODULES,
    barHeightModules: BAR_H_MODULES,
  };
}

/**
 * Парсит SVG штрих-кода и возвращает штрихи в пикселях viewBox
 * КРИТИЧНО: учитывает transform родительских <g> элементов
 */
export function parseBarcodeBarsFromSVG(svgString: string): {
  bars: NormalizedBar[];
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

  // Нормализуем к bbox
  const symW = maxX - minX;
  const symH = maxY - minY;

  const bars: NormalizedBar[] = darkRects.map(rect => ({
    x: (rect.x - minX) / symW,
    y: (rect.y - minY) / symH,
    width: rect.width / symW,
    height: rect.height / symH,
  }));

  return {
    bars,
    vbW,
    vbH,
    bbox: { minX, minY, maxX, maxY },
  };
}

/**
 * Строит BarcodeNorm для ITF-14 из SVG
 */
export function buildItf14Norm(svgString: string, code: string): BarcodeNorm {
  if (code.length !== 14 || !/^\d{14}$/.test(code)) {
    throw new Error('ITF-14 код должен содержать ровно 14 цифр');
  }

  const { bars, bbox } = parseBarcodeBarsFromSVG(svgString);
  const symW = bbox.maxX - bbox.minX;
  const symH = bbox.maxY - bbox.minY;

  // Позиции цифр: равномерно распределены
  const digits: BarcodeDigit[] = [];
  for (let i = 0; i < 14; i++) {
    digits.push({
      char: code[i],
      xFrac: (i + 0.5) / 14,
    });
  }

  // Константы (приблизительные, на основе анализа SVG)
  const TOTAL_HEIGHT_MODULES = 70; // включая цифры
  const BAR_H_MODULES = 50;
  const FONT_MODULES = 10;
  const DIGIT_Y_MODULES = 55;

  return {
    bars,
    digits,
    textYFrac: DIGIT_Y_MODULES / TOTAL_HEIGHT_MODULES,
    fontSizeFrac: FONT_MODULES / TOTAL_HEIGHT_MODULES,
    overhangFrac: 0, // ITF-14 не имеет выступающих цифр
    unit: symW, // пикселей на нормализованную единицу
    totalHeightModules: TOTAL_HEIGHT_MODULES,
    barHeightModules: BAR_H_MODULES,
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
 * Добавляет контрольную цифру к штрих-коду
 */
export function addCheckDigit(code: string, format: BarcodeFormat): string {
  if (format === 'ean13' && code.length === 12) {
    // EAN-13: контрольная цифра по модулю 10
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(code[i]);
      sum += digit * (i % 2 === 0 ? 1 : 3);
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return code + checkDigit;
  } else if (format === 'itf14' && code.length === 13) {
    // ITF-14: контрольная цифра по модулю 10
    let sum = 0;
    for (let i = 0; i < 13; i++) {
      const digit = parseInt(code[i]);
      sum += digit * (i % 2 === 0 ? 3 : 1);
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return code + checkDigit;
  }
  return code;
}
