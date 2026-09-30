import * as fabric from 'fabric';
import {
  generateBarcodeSVG,
  stripTextFromSVG,
  parseBarcodeBars,
  computeDigitPositions,
  BarcodeFormat,
} from './barcodeGenerator';

/**
 * Фабрика для создания векторного объекта штрих-кода
 * Собирает все примитивы (штрихи и цифры) в ЕДИНОЙ системе координат
 * без вложенных групп, что предотвращает проблемы с раскладкой
 */
export function buildBarcodeGroup(
  code: string,
  format: BarcodeFormat,
  options: {
    displayValue?: boolean;
  } = {}
): fabric.Group {
  // 1. Генерируем SVG с текстом (для правильной геометрии защитных штрихов)
  const svg = generateBarcodeSVG(code, format, { displayValue: true });

  // 2. Удаляем текст из SVG и получаем метаданные о позиции текста
  const { svgNoText, textYFrac, fontSizeFrac } = stripTextFromSVG(svg);

  // 3. Парсим штрихи из SVG без текста
  const bars = parseBarcodeBars(svgNoText);

  // 4. Получаем базовые размеры из SVG
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgNoText, 'image/svg+xml');
  const svgElement = doc.querySelector('svg');

  const baseW = parseFloat(svgElement?.getAttribute('width') || '200');
  const baseH = parseFloat(svgElement?.getAttribute('height') || '100');

  // 5. Создаём штрихи как Rect в единой системе координат (origin left/top)
  const barRects = bars.map((b) => {
    return new fabric.Rect({
      left: b.x * baseW,
      top: b.y * baseH,
      width: b.width * baseW,
      height: b.height * baseH,
      fill: '#000000',
      originX: 'left',
      originY: 'top',
      selectable: false,
      evented: false,
      objectCaching: false,
    });
  });

  // 6. Рассчитываем позиции цифр
  const positions = computeDigitPositions(bars, format, code);

  // 7. Создаём цифры как Text в той же системе координат
  const digitTexts = positions.map((p) => {
    return new fabric.Text(p.char, {
      left: p.xFrac * baseW,
      top: textYFrac * baseH,
      fontSize: fontSizeFrac * baseH,
      fontFamily: 'Arial',
      fill: '#000000',
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
      objectCaching: false,
    });
  });

  // 8. Объединяем ВСЕ примитивы в ОДНУ группу (без вложенности)
  const group = new fabric.Group([...barRects, ...digitTexts], {
    originX: 'left',
    originY: 'top',
    selectable: true,
    evented: true,
  });

  // 9. Устанавливаем кастомные свойства для сериализации
  (group as any).name = 'Штрих-код';
  (group as any).barcodeFormat = format;
  (group as any).barcodeValue = code;
  (group as any).barcodeBars = bars;
  (group as any).barcodeSVG = svgNoText;
  (group as any).barcodeTextYFrac = textYFrac;
  (group as any).barcodeFontSizeFrac = fontSizeFrac;
  (group as any).barcodeBaseW = baseW;
  (group as any).barcodeBaseH = baseH;

  return group;
}
