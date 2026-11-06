import * as fabric from 'fabric';
import { BarcodeNorm, BarcodeFormat } from '../types';
import {
  BARCODE_NORM_VERSION,
  buildEan13Norm,
  buildItf14Norm,
  generateBarcodeSVG,
  extractDigitPositions,
  normalizeBarcodeCode,
} from './barcodeGenerator';

/**
 * Фабрика для создания векторного объекта штрих-кода из BarcodeNorm
 * Единый источник истины для канваса, PDF и печати
 */
export function buildBarcodeGroup(
  code: string,
  format: BarcodeFormat,
  options: { displayValue?: boolean } = {}
): fabric.Group {
  // 1. Нормализуем код: полный, с верной контрольной цифрой. Для EAN-13 это
  // исправляет коды без контрольной и с неверной, для ITF-14 ещё и не даёт
  // JsBarcode бросить исключение на битой контрольной.
  const normalized = normalizeBarcodeCode(code, format);

  // 2. Строим BarcodeNorm
  let norm: BarcodeNorm;
  
  if (format === 'ean13') {
    // EAN-13: детерминированная генерация по стандарту
    norm = buildEan13Norm(normalized);
  } else {
    // ITF-14: генерируем SVG через JsBarcode, извлекаем позиции цифр до удаления текста
    const svg = generateBarcodeSVG(normalized, format, options);
    const { digitPositions, textY, fontSize } = extractDigitPositions(svg);
    norm = buildItf14Norm(svg, normalized, digitPositions, textY, fontSize);
  }

  const px = norm.pxPerModule;

  // 3. Создаём штрихи как fabric.Rect в пикселях
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

  // 4. Создаём цифры как fabric.Text
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

  // 5. Объединяем все примитивы в одну группу
  const group = new fabric.Group([...barRects, ...digitTexts], {
    originX: 'left',
    originY: 'top',
    selectable: true,
    evented: true,
  });

  // 6. САМОПРОВЕРКА
  // Ширина группы в fabric — это bbox содержимого: к штрихам добавляется
  // пол-пикселя strokeWidth и цифры слева. Поэтому сверяем не ширину группы,
  // а правый край штрихов с modulesTotal — это и есть корректность символа.
  const barsRight = Math.max(...norm.bars.map(b => b.xMod + b.wMod));

  console.assert(
    Math.abs(barsRight - norm.modulesTotal) <= 0.5,
    `buildBarcodeGroup: правый край штрихов ${barsRight} не соответствует modulesTotal ${norm.modulesTotal}`
  );

  console.assert(
    norm.bars.length >= 20,
    `buildBarcodeGroup: слишком мало штрихов (${norm.bars.length})`
  );

  // 7. Устанавливаем кастомные свойства для сериализации
  (group as any).name = 'Штрих-код';
  (group as any).barcodeFormat = format;
  (group as any).barcodeValue = normalized;
  (group as any).barcodeNorm = norm; // ЕДИНЫЙ источник истины

  return group;
}

/**
 * Устарел ли объект штрих-кода: норма отсутствует или создана генератором
 * прежней версии (в том числе с неверной таблицей чётности EAN-13).
 * Устаревшие объекты при загрузке проекта и вставке из библиотеки
 * пересоздаются заново из кода.
 */
export function isOutdatedBarcode(obj: Partial<fabric.FabricObject> | null | undefined): boolean {
  const o = obj as any;
  return !!o && !!o.barcodeValue && !!o.barcodeFormat &&
    (!o.barcodeNorm || o.barcodeNorm.version !== BARCODE_NORM_VERSION);
}

/**
 * Пересоздаёт устаревший штрих-код через фабрику, сохраняя позицию, масштаб,
 * поворот и точку привязки. Возвращает null, если объект не штрих-код или
 * (без `force`) его норма актуальна.
 *
 * originX/originY копируются намеренно: группа из модалки/библиотеки может
 * быть привязана центром, и сброс к left/top сдвинул бы её на полразмера.
 */
export function recreateBarcodeObject(
  obj: fabric.FabricObject,
  options: { force?: boolean } = {}
): fabric.Group | null {
  const src = obj as any;
  if (!src.barcodeValue || !src.barcodeFormat) return null;
  if (!options.force && !isOutdatedBarcode(src)) return null;

  const group = buildBarcodeGroup(src.barcodeValue, src.barcodeFormat);
  group.set({
    left: src.left ?? 0,
    top: src.top ?? 0,
    scaleX: src.scaleX ?? 1,
    scaleY: src.scaleY ?? 1,
    angle: src.angle ?? 0,
    originX: src.originX ?? 'left',
    originY: src.originY ?? 'top',
  });
  group.setCoords();
  return group;
}
