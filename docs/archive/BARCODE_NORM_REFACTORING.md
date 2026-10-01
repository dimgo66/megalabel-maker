# Переработка системы штрих-кодов: единый источник истины BarcodeNorm

## Проблема

Штрихи EAN-13 слипались в сплошной чёрный блок слева с тонкими белыми щелями. Причина - смешение систем координат:
- `parseBarcodeBars` нормализовал к полной ширине SVG (включая поля и transform)
- Цифры считались по minX..maxX штрихов
- Пропорции расходились

## Решение

Создана единая нормализованная структура `BarcodeNorm`, которая является единственным источником истины для:
- Канваса (Fabric.js)
- PDF экспорта
- Печати

## Архитектура

### BarcodeNorm

```typescript
interface BarcodeNorm {
  bars: NormalizedBar[];        // штрихи, нормализованные к символу (0..1)
  digits: BarcodeDigit[];       // цифры в той же нормализации
  textYFrac: number;            // вертикаль цифр (доли от высоты)
  fontSizeFrac: number;         // размер шрифта (доли от высоты)
  overhangFrac: number;         // выступ первой цифры слева
  unit: number;                 // пикселей на нормализованную единицу
  totalHeightModules: number;   // общая высота в модулях
  barHeightModules: number;     // высота штрихов в модулях
}
```

### Правило отображения

```
bboxLeft (канвас px) соответствует нормализованной x = -overhangFrac
норм x=0 (левый край символа) = bboxLeft + overhangFrac * unit * scaleX
ширина символа в px = unit * scaleX
точка цифры/штриха: px = bboxLeft + (overhangFrac + xFrac) * unit * scaleX
mm = px * mmPerPx
```

## Детерминированный генератор EAN-13

### Стандарт EAN-13 (95 модулей)

```
Start guard: 101 (3 модуля)
Левая половина: 6 цифр × 7 модулей = 42 модуля
Center guard: 01010 (5 модулей)
Правая половина: 6 цифр × 7 модулей = 42 модуля
End guard: 101 (3 модуля)
Итого: 3 + 42 + 5 + 42 + 3 = 95 модулей
```

### Таблицы кодирования

**L-коды** (нечётные цифры в левой половине):
```
0: 0001101  1: 0011001  2: 0010011  3: 0111101  4: 0100011
5: 0110001  6: 0101111  7: 0111011  8: 0110111  9: 0001011
```

**R-коды** (правая половина):
```
0: 1110010  1: 1100110  2: 1101100  3: 1000010  4: 1011100
5: 1001110  6: 1010000  7: 1000100  8: 1001000  9: 1110100
```

**G-коды** = reverse(R) (чётные цифры в левой половине)

**Таблица чётности** по первой цифре:
```
0: LLLLLL  1: LLGLGG  2: LGLGLG  3: LGLLGG  4: GGLLLG
5: GLLLGG  6: GLGGLG  7: GLGLGG  8: GGLGLG  9: GGLLGG
```

### Позиции цифр

- Первая цифра (code[0]): `xFrac = -3.5/95` (слева вне штрихов)
- Левая половина (code[1..6]): `xFrac = (6 + 7*i)/95` для i=0..5
- Правая половина (code[7..12]): `xFrac = (53 + 7*j)/95` для j=0..5

### Реализация

```typescript
function generateEan13Bits(code: string): string {
  const firstDigit = parseInt(code[0]);
  const parity = PARITY[firstDigit];
  
  let bits = '101'; // start guard
  
  // Левая половина
  for (let i = 0; i < 6; i++) {
    const digit = parseInt(code[1 + i]);
    const parityType = parity[i];
    bits += (parityType === 'L') ? L_CODES[digit] : G_CODES[digit];
  }
  
  bits += '01010'; // center guard
  
  // Правая половина
  for (let j = 0; j < 6; j++) {
    const digit = parseInt(code[7 + j]);
    bits += R_CODES[digit];
  }
  
  bits += '101'; // end guard
  
  return bits; // 95 бит
}
```

## Исправленный парсер ITF-14

### Ключевые улучшения

1. **Учёт transform**: рекурсивно накапливает transform всех родительских `<g>` элементов
2. **Фильтрация по яркости**: оставляет только тёмные прямоугольники (яркость < 128)
3. **Нормализация к bbox**: штрихи нормализуются к границам штрихов, а не к viewBox

```typescript
function collectRects(element: Element, parentTransform: Transform) {
  // Парсим transform этого элемента
  const transformAttr = element.getAttribute('transform');
  let currentTransform = { ...parentTransform };
  
  if (transformAttr) {
    // Обрабатываем translate и scale
    const translateMatch = transformAttr.match(/translate\(([^,]+),\s*([^)]+)\)/);
    if (translateMatch) {
      currentTransform.tx += parseFloat(translateMatch[1]);
      currentTransform.ty += parseFloat(translateMatch[2]);
    }
    
    const scaleMatch = transformAttr.match(/scale\(([^,)]+)(?:,\s*([^)]+))?\)/);
    if (scaleMatch) {
      currentTransform.sx *= parseFloat(scaleMatch[1]);
      currentTransform.sy *= scaleMatch[2] ? parseFloat(scaleMatch[2]) : parseFloat(scaleMatch[1]);
    }
  }
  
  // Применяем transform к <rect>
  if (element.tagName === 'rect') {
    const transformedX = x * currentTransform.sx + currentTransform.tx;
    const transformedY = y * currentTransform.sy + currentTransform.ty;
    // ...
  }
  
  // Рекурсивно обрабатываем дочерние элементы
  for (const child of Array.from(element.children)) {
    collectRects(child, currentTransform);
  }
}
```

## Фабрика объектов

### Обновлённая buildBarcodeGroup

```typescript
export function buildBarcodeGroup(
  code: string,
  format: BarcodeFormat,
  options: { displayValue?: boolean } = {}
): fabric.Group {
  // 1. Строим BarcodeNorm
  let norm: BarcodeNorm;
  
  if (format === 'ean13') {
    norm = buildEan13Norm(code); // детерминированно
  } else {
    const svg = generateBarcodeSVG(code, format, options);
    const { svgNoText } = stripTextFromSVG(svg);
    norm = buildItf14Norm(svgNoText, code); // парсер с transform
  }

  // 2. Вычисляем размеры
  const TOTAL_HEIGHT_PX = norm.totalHeightModules * norm.unit;
  const BAR_HEIGHT_PX = norm.barHeightModules * norm.unit;

  // 3. Создаём штрихи
  const barRects = norm.bars.map((b) => {
    return new fabric.Rect({
      left: (norm.overhangFrac + b.x) * norm.unit,
      top: 0,
      width: b.width * norm.unit,
      height: BAR_HEIGHT_PX,
      fill: '#000000',
      originX: 'left',
      originY: 'top',
      selectable: false,
      evented: false,
    });
  });

  // 4. Создаём цифры
  const digitTexts = norm.digits.map((d) => {
    return new fabric.Text(d.char, {
      left: (norm.overhangFrac + d.xFrac) * norm.unit,
      top: norm.textYFrac * TOTAL_HEIGHT_PX,
      fontSize: norm.fontSizeFrac * TOTAL_HEIGHT_PX,
      fontFamily: 'Arial',
      fill: '#000000',
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
    });
  });

  // 5. Объединяем в группу
  const group = new fabric.Group([...barRects, ...digitTexts], {
    originX: 'left',
    originY: 'top',
    selectable: true,
    evented: true,
  });

  // 6. Сохраняем barcodeNorm
  (group as any).barcodeNorm = norm; // ЕДИНЫЙ источник истины

  return group;
}
```

## Обновлённые компоненты

### LabelCanvas.tsx

**Сохранение в JSON:**
```typescript
objects = objects.map((obj: any) => {
  if (obj.barcodeNorm) {
    return {
      ...obj,
      barcodeFormat: obj.barcodeFormat,
      barcodeValue: obj.barcodeValue,
      barcodeNorm: obj.barcodeNorm, // сохраняем целиком
    };
  }
  return obj;
});
```

**Миграция старых проектов:**
```typescript
const oldBarcodeObjects = objects.filter((obj: any) => 
  obj.barcodeValue && obj.barcodeFormat && !obj.barcodeNorm
);

for (const oldObj of oldBarcodeObjects) {
  const newGroup = buildBarcodeGroup(value, format);
  newGroup.set({ left, top, scaleX, scaleY, angle });
  canvas.remove(oldObj);
  canvas.add(newGroup);
}
```

### pdfExporter.ts

**Сбор штрих-кодов:**
```typescript
export function collectBarcodes(canvas, format): BarcodePlacement[] {
  canvas.getObjects().forEach((obj: any) => {
    if (obj.barcodeNorm) {
      const norm = obj.barcodeNorm as BarcodeNorm;
      
      // Вычисляем позицию в мм
      const symbolLeft_mm = (obj.left + norm.overhangFrac * norm.unit * obj.scaleX) * mmPerPx;
      const symbolWidth_mm = norm.unit * obj.scaleX * mmPerPx;
      const symbolTop_mm = obj.top * mmPerPx;
      const totalHeight_mm = totalHeightPx * obj.scaleY * mmPerPx;
      
      barcodes.push({ norm, symbolLeft_mm, symbolWidth_mm, symbolTop_mm, totalHeight_mm });
    }
  });
}
```

**Отрисовка:**
```typescript
for (const bc of barcodes) {
  drawBarcodeVectorPDF(
    doc,
    bc.norm,
    x + bc.symbolLeft_mm,
    y + bc.symbolTop_mm,
    bc.symbolWidth_mm,
    bc.totalHeight_mm
  );
}
```

### barcodePdfRenderer.ts

**Отрисовка штрихов:**
```typescript
for (const bar of norm.bars) {
  const barX = x_mm + (norm.overhangFrac + bar.x) * norm.unit * scaleX;
  const barY = y_mm + bar.y * barHeightPx * scaleY;
  const barW = bar.width * norm.unit * scaleX;
  const barH = bar.height * barHeightPx * scaleY;
  
  doc.rect(barX, barY, barW, barH, 'F');
}
```

**Отрисовка цифр:**
```typescript
for (const digit of norm.digits) {
  const digitX = x_mm + (norm.overhangFrac + digit.xFrac) * norm.unit * scaleX;
  const digitY = y_mm + norm.textYFrac * totalHeightPx * scaleY;
  
  doc.text(digit.char, digitX, digitY, {
    align: 'center',
    baseline: 'middle',
  });
}
```

## Результаты

### EAN-13
✅ Штрихи занимают ВСЮ ширину символа (не слипаются)  
✅ Пробелы белые и читаемые  
✅ Первая цифра слева вне штрихов  
✅ 6 цифр ровно под левой половиной  
✅ 6 цифр ровно под правой половиной  
✅ Зум 400%: штрихи резкие, края ровные  

### ITF-14
✅ 14 цифр равномерно  
✅ Штрихи не слипаются (парсер с transform)  

### Миграция
✅ Старые проекты автоматически чинятся при загрузке  
✅ Кнопка "🔄 Пересоздать штрих-код" работает  

### Единый источник истины
✅ Канвас == PDF == печать  
✅ Все используют одну и ту же структуру BarcodeNorm  
✅ Никаких расхождений в раскладке  

## Изменённые файлы

- `src/types/index.ts` - добавлены BarcodeNorm, BarcodeDigit, BarcodeFormat
- `src/utils/barcodeGenerator.ts` - полная переработка: buildEan13Norm, buildItf14Norm, исправленный парсер
- `src/utils/barcodeObjectFactory.ts` - переписан на BarcodeNorm
- `src/utils/barcodePdfRenderer.ts` - переписан на BarcodeNorm
- `src/utils/pdfExporter.ts` - переписан на BarcodeNorm
- `src/components/LabelCanvas.tsx` - сохранение barcodeNorm + миграция

## Заключение

Проблема со слипанием штрихов полностью решена. Создана единая нормализованная структура BarcodeNorm, которая используется везде: на канвасе, в PDF экспорте и в печати. EAN-13 генерируется детерминированно по стандарту, ITF-14 парсится с учётом transform. Старые проекты автоматически мигрируются.
