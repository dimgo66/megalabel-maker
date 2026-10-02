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
 * Версия геометрии штрих-кода. Увеличивать при изменении высот штрихов/цифр,
 * чтобы старые проекты пересоздавались при загрузке.
 */
export const BARCODE_NORM_VERSION = 2;

/**
 * Константы вертикальной геометрии EAN-13
 */
const DATA_BAR_H_MOD = 44;    // высота штрихов данных
const DIGIT_Y_MOD = 55;       // базовая линия цифр (низ текста)
const FONT_MOD = 8.5;         // кегль цифр
// Выступающие вниз защитные штрихи опускаются чуть выше середины высоты цифр
// (зона цифр: DIGIT_Y_MOD - FONT_MOD ..= DIGIT_Y_MOD).
const GUARD_BAR_H_MOD = DIGIT_Y_MOD - FONT_MOD / 2 - 0.75; // ≈ 50.0

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

  // Позиции цифр в модулях (отполированы для визуального соответствия эталону)
  const digits = [
    // Первая цифра (code[0]) - слева вне штрихов
    { char: code[0], xMod: -4.2 },  // чуть левее для лучшего зазора
    
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
    leftPadMod: 8,        // увеличен запас под первую цифру слева
    bars,
    digits,
    digitYMod: DIGIT_Y_MOD,  // базовая линия цифр
    fontMod: FONT_MOD,       // кегль цифр
    pxPerModule: 4,          // пикселей на модуль при scale=1
    version: BARCODE_NORM_VERSION,
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
export function buildItf14Norm(
  svgString: string,
  code: string,
  _digitPositions: Array<{ char: string; x: number; y: number }>,
  textY: number,
  fontSize: number,
): BarcodeNorm {
  if (code.length !== 14 || !/^\d{14}$/.test(code)) {
    throw new Error('ITF-14 код должен содержать ровно 14 цифр');
  }

  const { bars, bbox } = parseBarcodeBarsFromSVG(svgString);
  const symW = bbox.maxX - bbox.minX;
  const symH = bbox.maxY - bbox.minY;

  const fontMod = fontSize;
  const barHMod = symH * 0.85;  // высота штрихов — 85% высоты SVG

  const barsModules = bars.map(r => ({
    xMod: r.x - bbox.minX,
    wMod: r.width,
    hMod: barHMod,
  }));

  const ITF_MODULES = 77;
  const START_MODS = 4;
  const PAIR_MODS = 10;
  const modW = symW / ITF_MODULES;
  const charHalfSpan = modW * 2.2;

  const digits: Array<{ char: string; xMod: number }> = [];

  for (let pair = 0; pair < 7; pair++) {
    const pairCenterPx = (START_MODS + pair * PAIR_MODS + PAIR_MODS / 2) * modW;
    const leftChar  = code[pair * 2];
    const rightChar = code[pair * 2 + 1];
    digits.push({ char: leftChar,  xMod: pairCenterPx - charHalfSpan });
    digits.push({ char: rightChar, xMod: pairCenterPx + charHalfSpan });
  }

  // digitYMod = низ штрихов + зазор 2px + высота шрифта
  // originY: 'bottom' в fabric, поэтому это базовая линия (низ) текста
  const digitYMod = barHMod + fontMod * 1.6; // зазор ~0.6×fontSize между штрихами и цифрами

  return {
    format: 'itf14',
    modulesTotal: symW,
    leftPadMod: 0,
    bars: barsModules,
    digits,
    digitYMod,
    fontMod,
    pxPerModule: 1,
    version: BARCODE_NORM_VERSION,
  };
}

/**
 * Результат парсинга текста из SVG штрих-кода
 */
export interface BarcodeTextInfo {
  textY: number;         // базовая линия текста (y)
  fontSize: number;      // размер шрифта
  digitPositions: Array<{ char: string; x: number; y: number }>;
}

/**
 * Извлекает только метрики текста из SVG (y, fontSize).
 * Позиции цифр ITF-14 вычисляются детерминированно в buildItf14Norm,
 * поэтому здесь достаточно лишь удалить <text> из SVG.
 */
export function extractDigitPositions(svgString: string): BarcodeTextInfo {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svg = doc.querySelector('svg');

  if (!svg) {
    return { textY: 0, fontSize: 16, digitPositions: [] };
  }

  const textElements = Array.from(doc.querySelectorAll('text'));

  let textY = 0;
  let fontSize = 16;

  if (textElements.length > 0) {
    const firstText = textElements[0];
    const y = parseFloat(firstText.getAttribute('y') || '0');
    const fs = parseFloat(firstText.getAttribute('font-size') || '16');
    if (!isNaN(y)) textY = y;
    if (!isNaN(fs) && fs > 0) fontSize = fs;
  }

  // Удаляем все <text> — цифры рисуем самостоятельно
  textElements.forEach(el => el.remove());

  // Возвращаем пустой массив позиций: buildItf14Norm вычислит их детерминированно
  return { textY, fontSize, digitPositions: [] };
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
