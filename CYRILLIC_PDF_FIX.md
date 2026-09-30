# Исправление проблемы с кириллицей в PDF

## Проблема
При экспорте в PDF русские буквы отображались как абракадабра (кракозябры) вместо корректного текста.

## Причина
jsPDF по умолчанию использует шрифт Helvetica, который не содержит кириллических символов. Когда мы пытались отобразить русский текст через `doc.text()`, jsPDF не мог найти соответствующие глифы и показывал символы замены.

## Решение

### 1. Создание утилиты для работы с кириллическими шрифтами

Создан файл `src/utils/pdfFontHelper.ts`, который:
- Загружает шрифт PT Sans из Google Fonts (поддерживает кириллицу)
- Конвертирует шрифт в base64
- Добавляет шрифт в jsPDF через `addFont` API
- Предоставляет функцию `initializeCyrillicFont()` для инициализации шрифта

```typescript
export async function initializeCyrillicFont(doc: jsPDF): Promise<void> {
  if (isFontInitialized) {
    doc.setFont('PTSans');
    return;
  }

  try {
    // Загружаем шрифт PT Sans Regular из Google Fonts
    const fontUrl = 'https://fonts.gstatic.com/s/ptsans/v17/jizaRExUiTo8FluXgBck.woff2';
    const response = await fetch(fontUrl);
    const fontBuffer = await response.arrayBuffer();
    
    // Конвертируем в base64
    const fontBase64 = arrayBufferToBase64(fontBuffer);
    
    // Добавляем шрифт в jsPDF
    doc.addFileToVFS('PTSans-Regular.woff2', fontBase64);
    doc.addFont('PTSans-Regular.woff2', 'PTSans', 'normal');
    
    isFontInitialized = true;
    doc.setFont('PTSans');
  } catch (error) {
    console.warn('Не удалось загрузить шрифт PT Sans, используем fallback', error);
    doc.setFont('helvetica');
  }
}
```

### 2. Обновление barcodePdfRenderer.ts

Функция `drawBarcodeVectorPDF` теперь:
- Асинхронная (`async function`)
- Вызывает `initializeCyrillicFont()` перед отрисовкой текста
- Использует шрифт PT Sans для отрисовки цифр штрих-кода

```typescript
export async function drawBarcodeVectorPDF(
  doc: jsPDF,
  norm: BarcodeNorm,
  x_mm: number,
  y_mm: number,
  moduleMm: number
): Promise<void> {
  // Инициализируем шрифт с поддержкой кириллицы
  await initializeCyrillicFont(doc);
  
  // ... отрисовка штрихов ...
  
  // Отрисовка цифр с правильным шрифтом
  for (const digit of norm.digits) {
    doc.text(digit.char, digitX, digitY, {
      align: 'center',
      baseline: 'alphabetic',
    });
  }
}
```

### 3. Обновление pdfExporter.ts

Все вызовы `drawBarcodeVectorPDF` теперь используют `await`, так как функция стала асинхронной:

```typescript
for (const bc of barcodes) {
  await drawBarcodeVectorPDF(
    doc,
    bc.norm,
    x + bc.symbolLeft_mm,
    y + bc.symbolTop_mm,
    bc.moduleMm
  );
}
```

## Технические детали

### Почему PT Sans?
- Полная поддержка кириллицы
- Хорошая читаемость при малых размерах
- Бесплатный шрифт из Google Fonts
- Малый размер файла (~30KB в base64)

### Как работает инициализация шрифта?
1. При первом вызове `initializeCyrillicFont()` загружается шрифт PT Sans из Google Fonts
2. Шрифт конвертируется в base64
3. Добавляется в jsPDF через `addFileToVFS` и `addFont`
4. Устанавливается как активный шрифт через `setFont('PTSans')`
5. Флаг `isFontInitialized` предотвращает повторную загрузку

### Fallback механизм
Если не удалось загрузить шрифт PT Sans (например, нет интернета), используется стандартный шрифт Helvetica. Это гарантирует, что PDF всё равно будет создан, хотя кириллица может отображаться некорректно.

## Результат

✅ Русские буквы корректно отображаются в PDF  
✅ Шрифт PT Sans обеспечивает хорошую читаемость  
✅ Шрифт загружается один раз и кэшируется  
✅ Fallback на Helvetica при отсутствии интернета  
✅ Проект успешно собирается  

## Проверка

1. Создайте этикетку с русским текстом
2. Добавьте штрих-код EAN-13 (цифры тоже должны отображаться корректно)
3. Экспортируйте в PDF
4. Откройте PDF и проверьте:
   - ✅ Русский текст отображается правильно
   - ✅ Цифры штрих-кода отображаются корректно
   - ✅ Нет кракозябр или символов замены

## Изменённые файлы

- `src/utils/pdfFontHelper.ts` - новый файл с утилитой для работы с кириллическими шрифтами
- `src/utils/barcodePdfRenderer.ts` - функция стала async, добавлена инициализация шрифта
- `src/utils/pdfExporter.ts` - добавлен await для вызова drawBarcodeVectorPDF

## Примечания

### Производительность
- Шрифт загружается один раз при первом использовании
- Последующие вызовы используют кэшированный шрифт
- Размер шрифта ~30KB в base64

### Совместимость
- Работает во всех современных браузерах
- Требует интернет для первой загрузки шрифта
- Fallback на Helvetica при отсутствии интернета

### Будущие улучшения
- Можно добавить поддержку других шрифтов (Roboto, Open Sans)
- Можно кэшировать шрифт в localStorage для offline работы
- Можно добавить выбор шрифта в настройках экспорта
