# Исправление отображения цифр под штрихкодом EAN-13

## Проблема

Цифры под штрихкодом EAN-13 отображались сбитыми группами без равномерных промежутков вместо стандартной раскладки.

### Причина

1. **На канвасе**: Fabric.js ломает текстовые элементы SVG от JsBarcode при `loadSVGFromString` — теряются позиции и межсимвольные интервалы.
2. **В PDF**: строка цифр печаталась целиком через `doc.text(align:'center')` без привязки к знакоблокам.

## Решение

Полностью отказаться от текста JsBarcode. Рисовать цифры **самостоятельно** — по одной на рассчитанных позициях, одинаково на канвасе и в PDF.

## Внесённые изменения

### 1. Утилиты расчёта позиций цифр (`src/utils/barcodeGenerator.ts`)

Добавлены новые функции:

#### `stripTextFromSVG(svgString)`
- Удаляет все `<text>` элементы из SVG
- Запоминает позицию и размер шрифта первого `<text>` элемента
- Возвращает: `{ svgNoText, textYFrac, fontSizeFrac }`

#### `computeEAN13DigitPositions(bars, code)`
Рассчитывает позиции цифр для EAN-13 согласно стандарту:
- **Первая цифра** (индекс 0): слева вне штрихов (`minX - 3.5 * module`)
- **Цифры 2-7** (индексы 1-6): под левой половиной (`minX + (6.5 + 7*i) * module`)
- **Цифры 8-13** (индексы 7-12): под правой половиной (`minX + (53.5 + 7*j) * module`)

Геометрия EAN-13: 95 модулей

#### `computeITF14DigitPositions(bars, code)`
Рассчитывает позиции цифр для ITF-14:
- Все 14 цифр равномерно распределены по ширине
- Позиция цифры k: `minX + (k + 0.5) * (maxX - minX) / 14`

#### `computeDigitPositions(bars, format, code)`
Диспетчер для выбора нужной функции расчёта позиций.

### 2. Обновление создания штрихкода (`src/components/BarcodeModal.tsx`)

Изменена логика создания штрихкода:

```typescript
// 1. Генерируем SVG с текстом (для правильной геометрии)
const svg = generateBarcodeSVG(code, format, { displayValue: true });

// 2. Удаляем текст из SVG
const { svgNoText, textYFrac, fontSizeFrac } = stripTextFromSVG(svg);

// 3. Парсим штрихи из SVG без текста
const bars = parseBarcodeBars(svgNoText);

// 4. Загружаем SVG без текста в Fabric
const barsGroup = await loadBarcodeIntoFabric(svgNoText);

// 5. Рассчитываем позиции цифр
const positions = computeDigitPositions(bars, format, fullCode);

// 6. Создаём цифры как отдельные fabric.Text объекты
const digitObjects = positions.map(p => new fabric.Text(p.char, {
  fontFamily: 'Arial',
  fontSize: fontSizeFrac * groupHeight,
  fill: '#000000',
  originX: 'center',
  originY: 'center',
  left: p.xFrac * groupWidth,
  top: (textYFrac - fontSizeFrac * 0.35) * groupHeight,
  selectable: false,
  evented: false,
}));

// 7. Объединяем штрихи и цифры в одну группу
const fullGroup = new fabric.Group([barsGroup, ...digitObjects], {
  barcodeFormat: format,
  barcodeValue: fullCode,
  barcodeBars: bars,
  barcodeSVG: svgNoText,
  barcodeTextYFrac: textYFrac,
  barcodeFontSizeFrac: fontSizeFrac,
});
```

### 3. Обновление сохранения в JSON (`src/components/LabelCanvas.tsx`)

Добавлены новые поля для сохранения:
- `barcodeTextYFrac` - доля Y для текста
- `barcodeFontSizeFrac` - доля размера шрифта

### 4. Обновление PDF рендеринга (`src/utils/barcodePdfRenderer.ts`)

Изменена функция `drawBarcodeVectorPDF`:
- Добавлены параметры `format`, `value`, `textYFrac`, `fontSizeFrac`
- Реализована поцифровая отрисовка текста:

```typescript
if (format && value && bars.length > 0) {
  const positions = computeDigitPositions(bars, format, value);
  const fontPt = fontSizeFrac * h_mm * 2.83465;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontPt);
  doc.setTextColor(0, 0, 0);
  
  for (const p of positions) {
    const charX = x_mm + p.xFrac * w_mm;
    const charY = y_mm + (textYFrac - fontSizeFrac * 0.35) * h_mm;
    doc.text(p.char, charX, charY, { align: 'center', baseline: 'middle' });
  }
}
```

### 5. Кнопка пересоздания для старых проектов (`src/components/BarcodePropertiesPanel.tsx`)

Добавлена функция `handleRecreate`:
- Удаляет старый объект с канваса
- Пересоздаёт штрихкод заново из `barcodeValue` по новой схеме
- Сохраняет позицию, масштаб и поворот
- Обновляет JSON канваса

Добавлена кнопка "🔄 Пересоздать штрих-код" в UI.

## Результат

### На канвасе EAN-13:
✅ Первая цифра слева ВНЕ штрихов  
✅ 6 цифр равномерно под левой половиной  
✅ 6 цифр равномерно под правой половиной  
✅ Каждая цифра по центру своего знакоблока  
✅ Группа со штрихкодом и цифрами выделяется и перемещается целиком  

### На канвасе ITF-14:
✅ Все 14 цифр равномерно по ширине  

### В PDF:
✅ Та же раскладка, что и на канвасе  
✅ Цифры векторные, чёткие при любом зуме  
✅ Цифры не выходят за границы этикетки  

### Миграция старых проектов:
✅ Кнопка "Пересоздать штрих-код" чинит старые проекты  
✅ Не нужно вручную повторный вводить код  

## Тестирование

1. Создайте новый штрихкод EAN-13 с кодом `4600051000057`
2. Убедитесь, что цифры расположены правильно:
   - Первая цифра `4` слева вне штрихов
   - Цифры `600051` равномерно под левой половиной
   - Цифры `000057` равномерно под правой половиной
3. Увеличьте зум - цифры остаются чёткими
4. Сохраните проект, загрузите снова - раскладка сохраняется
5. Нажмите "Пересоздать штрих-код" - штрихкод пересоздаётся корректно

## Файлы изменены

- `src/utils/barcodeGenerator.ts` - добавлены функции расчёта позиций
- `src/components/BarcodeModal.tsx` - обновлена логика создания штрихкода
- `src/components/LabelCanvas.tsx` - добавлены новые поля в JSON
- `src/utils/barcodePdfRenderer.ts` - обновлена отрисовка в PDF
- `src/components/BarcodePropertiesPanel.tsx` - добавлена кнопка пересоздания
