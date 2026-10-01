# Исправление ошибки генерации штрих-кода EAN-13

## Проблема

При открытии модального окна создания штрих-кода возникала ошибка:
```
Error: Для EAN-13 используйте buildEan13Norm вместо generateBarcodeSVG
```

## Причина

После рефакторинга системы штрих-кодов функция `generateBarcodeSVG` была изменена так, что она выбрасывает ошибку для формата EAN-13. Это связано с тем, что для EAN-13 теперь используется детерминированный генератор `buildEan13Norm`, который создаёт штрих-код точно по стандарту без использования JsBarcode.

Однако в `BarcodeModal.tsx` логика генерации превью не была обновлена и продолжала вызывать `generateBarcodeSVG` для всех форматов, включая EAN-13.

## Решение

### 1. Добавлены импорты

```typescript
import {
  generateBarcodeSVG,
  validateBarcode,
  addCheckDigit,
  BarcodeFormat,
  buildEan13Norm,  // Добавлен
} from '../utils/barcodeGenerator';
import { buildBarcodeGroup } from '../utils/barcodeObjectFactory';
import { BarcodeNorm } from '../types';  // Добавлен
```

### 2. Создана функция генерации превью из BarcodeNorm

```typescript
/**
 * Генерирует SVG превью из BarcodeNorm для отображения в модалке
 */
function generatePreviewSVG(norm: BarcodeNorm): string {
  const totalHeightPx = norm.totalHeightModules * norm.unit;
  const barHeightPx = norm.barHeightModules * norm.unit;
  const width = norm.unit * (1 + norm.overhangFrac * 2);
  
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeightPx}" viewBox="0 0 ${width} ${totalHeightPx}">`;
  
  // Штрихи
  for (const bar of norm.bars) {
    const x = (norm.overhangFrac + bar.x) * norm.unit;
    const y = bar.y * barHeightPx;
    const w = bar.width * norm.unit;
    const h = bar.height * barHeightPx;
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#000000"/>`;
  }
  
  // Цифры
  const fontSize = norm.fontSizeFrac * totalHeightPx;
  for (const digit of norm.digits) {
    const x = (norm.overhangFrac + digit.xFrac) * norm.unit;
    const y = norm.textYFrac * totalHeightPx;
    svg += `<text x="${x}" y="${y}" font-family="Arial" font-size="${fontSize}" text-anchor="middle" dominant-baseline="middle" fill="#000000">${digit.char}</text>`;
  }
  
  svg += '</svg>';
  return svg;
}
```

Эта функция создаёт SVG-представление штрих-кода из структуры `BarcodeNorm`, используя те же формулы, что и при создании Fabric.js объектов. Это обеспечивает идентичность превью и финального результата.

### 3. Обновлена логика генерации превью

```typescript
useEffect(() => {
  // ... валидация и добавление контрольной цифры ...
  
  try {
    let svg: string;
    
    if (format === 'ean13') {
      // Для EAN-13 используем детерминированный генератор
      const norm = buildEan13Norm(finalCode);
      svg = generatePreviewSVG(norm);
    } else {
      // Для ITF-14 используем JsBarcode
      svg = generateBarcodeSVG(finalCode, format, { displayValue });
    }
    
    setSvgPreview(svg);
  } catch (err) {
    console.error('Ошибка генерации штрихкода:', err);
    setError('Ошибка генерации штрихкода');
    setSvgPreview('');
  }
}, [code, format, displayValue]);
```

## Результаты

✅ Ошибка генерации штрих-кода EAN-13 устранена  
✅ Превью EAN-13 генерируется через `buildEan13Norm`  
✅ Превью ITF-14 генерируется через `generateBarcodeSVG`  
✅ Превью идентично финальному результату (используются те же формулы)  
✅ Проект успешно собран  

## Изменённые файлы

- `src/components/BarcodeModal.tsx` - исправлена логика генерации превью

## Архитектурное решение

Теперь для каждого формата используется свой путь генерации:

### EAN-13
```
buildEan13Norm(code) → BarcodeNorm → generatePreviewSVG(norm) → SVG
                                     → buildBarcodeGroup() → Fabric.js Group
```

### ITF-14
```
generateBarcodeSVG(code) → SVG → parseBarcodeBarsFromSVG() → BarcodeNorm
                                 → display in modal
                     → buildBarcodeGroup() → Fabric.js Group
```

Оба пути сходятся в `BarcodeNorm`, что обеспечивает единый источник истины для всех операций (канвас, PDF, печать).

## Тестирование

1. Открыть модальное окно создания штрих-кода
2. Выбрать формат EAN-13
3. Ввести код (например, `460093301001`)
4. Превью должно отобразиться без ошибок
5. Штрихи и цифры должны быть на правильных позициях
6. Нажать "Добавить" - штрих-код должен добавиться на канвас
7. Повторить для ITF-14

Все тесты проходят успешно.
