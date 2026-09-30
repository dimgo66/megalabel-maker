import * as fabric from 'fabric';
import { BarcodeNorm, BarcodeFormat } from '../types';
import { buildEan13Norm, buildItf14Norm, generateBarcodeSVG, stripTextFromSVG } from './barcodeGenerator';

/**
 * Фабрика для создания векторного объекта штрих-кода из BarcodeNorm
 * Единый источник истины для канваса, PDF и печати
 */
export function buildBarcodeGroup(
  code: string,
  format: BarcodeFormat,
  options: { displayValue?: boolean } = {}
): fabric.Group {
  // 1. Строим BarcodeNorm
  let norm: BarcodeNorm;
  
  if (format === 'ean13') {
    // EAN-13: детерминированная генерация по стандарту
    norm = buildEan13Norm(code);
  } else {
    // ITF-14: генерируем SVG через JsBarcode, парсим с учётом transform
    const svg = generateBarcodeSVG(code, format, options);
    const { svgNoText } = stripTextFromSVG(svg);
    norm = buildItf14Norm(svgNoText, code);
  }

  const px = norm.pxPerModule;

  // 2. Создаём штрихи как fabric.Rect в пикселях
  const barRects = norm.bars.map((b) => {
    return new fabric.Rect({
      left: (norm.leftPadMod + b.xMod) * px,
      top: 0,
      width: b.wMod * px,  // ВАЖНО: без leftPadMod
      height: b.hMod * px,  // используем индивидуальную высоту штриха
      fill: '#000000',
      originX: 'left',
      originY: 'top',
      selectable: false,
      evented: false,
      objectCaching: false,
    });
  });

  // 3. Создаём цифры как fabric.Text
  const digitTexts = norm.digits.map((d) => {
    return new fabric.Text(d.char, {
      left: (norm.leftPadMod + d.xMod) * px,
      top: norm.digitYMod * px,
      fontSize: norm.fontMod * px,
      fontFamily: 'Arial',
      fill: '#000000',
      originX: 'center',
      originY: 'bottom',
      selectable: false,
      evented: false,
      objectCaching: false,
    });
  });

  // 4. Объединяем все примитивы в одну группу
  const group = new fabric.Group([...barRects, ...digitTexts], {
    originX: 'left',
    originY: 'top',
    selectable: true,
    evented: true,
  });

  // 5. САМОПРОВЕРКА
  const expectedWidth = (norm.leftPadMod + norm.modulesTotal) * px;
  const actualWidth = group.width || 0;
  if (Math.abs(actualWidth - expectedWidth) > 2) {
    console.warn(`buildBarcodeGroup: ширина группы ${actualWidth} не соответствует ожидаемой ${expectedWidth}`);
  }

  if (norm.bars.length < 20) {
    console.warn(`buildBarcodeGroup: слишком мало штрихов (${norm.bars.length})`);
  }

  // 6. Устанавливаем кастомные свойства для сериализации
  (group as any).name = 'Штрих-код';
  (group as any).barcodeFormat = format;
  (group as any).barcodeValue = code;
  (group as any).barcodeNorm = norm; // ЕДИНЫЙ источник истины

  return group;
}
