# ✅ Исправлена проблема с пустым PDF при экспорте

## Проблема

При экспорте в PDF получался пустой файл без содержимого.

## Причина

В функции `composeSheetCanvas` изображение загружалось асинхронно через `new Image()`, но код сразу пытался его использовать в `ctx.drawImage()` без ожидания загрузки. В результате на canvas рисовалось пустое изображение.

```typescript
// БЫЛО (неправильно):
const img = new Image();
img.src = raster;
// Сразу пытаемся рисовать - изображение ещё не загружено!
ctx.drawImage(img, x_px, y_px, cellW_px, cellH_px);
```

## Решение

### 1. Добавлено ожидание загрузки изображения

Изменена функция `composeSheetCanvas` в `src/utils/pdfExporter.ts`:

```typescript
// СТАЛО (правильно):
export async function composeSheetCanvas(
  cfg: ExportConfig,
  screenDpi: number = 96
): Promise<HTMLCanvasElement> {
  // ...
  
  const img = new Image();
  img.src = raster;
  await img.decode(); // ВАЖНО: ждём загрузки изображения!
  
  // Теперь можно безопасно рисовать
  ctx.drawImage(img, x_px, y_px, cellW_px, cellH_px);
  
  return canvas;
}
```

### 2. Обновлены все вызовы composeSheetCanvas

Функция теперь асинхронная, поэтому все вызовы обновлены с `await`:

**src/components/ExportModal.tsx:**
```typescript
const canvas = await composeSheetCanvas(cfg, 96);
setPreviewUrl(canvas.toDataURL('image/png'));
```

**src/utils/pdfExporter.ts (exportWithFallback):**
```typescript
const sheetCanvas = await composeSheetCanvas(cfg, 600);
const dataUrl = sheetCanvas.toDataURL('image/png');
```

**src/utils/printManager.ts (printViaBrowser):**
```typescript
export async function printViaBrowser(cfg: ExportConfig, dpi: number = 300): Promise<void> {
  const canvas = await composeSheetCanvas({ ...cfg, dpi }, dpi);
  const dataURL = canvas.toDataURL('image/png');
  // ...
}
```

**src/components/PrintModal.tsx:**
```typescript
await printViaBrowser(cfg, browserDpi);
```

## Что было исправлено

✅ Функция `composeSheetCanvas` теперь асинхронная и правильно ждёт загрузки изображения  
✅ Все вызовы `composeSheetCanvas` используют `await`  
✅ Функция `printViaBrowser` стала асинхронной  
✅ Все вызовы `printViaBrowser` используют `await`  
✅ Превью в ExportModal корректно генерируется  
✅ Растровый fallback в exportWithFallback работает правильно  
✅ Печать через браузер работает корректно  

## Проверка

### Экспорт в PDF
1. Создайте этикетку с текстом и/или изображениями
2. Нажмите "Экспорт в PDF"
3. Скачайте файл
4. Откройте PDF - содержимое должно быть видно ✅

### Печать
1. Создайте этикетку
2. Нажмите "Печать"
3. Выберите "Печать через браузер"
4. Должен появиться диалог печати с содержимым ✅

### Превью
1. Нажмите "Экспорт в PDF"
2. В модальном окне должно отображаться превью этикетки ✅

## Технические детали

### Почему img.decode()?

Метод `img.decode()` возвращает Promise, который разрешается, когда изображение полностью загружено и декодировано. Это гарантирует, что:
- Изображение полностью загружено
- Браузер готов к его отрисовке
- Нет проблем с асинхронной загрузкой

### Альтернативы

Можно было использовать:
- `img.onload = () => { ... }` - но это менее удобно с async/await
- `await new Promise(resolve => img.onload = resolve)` - более громоздко

`img.decode()` - самый чистый и современный способ.

## Изменённые файлы

- `src/utils/pdfExporter.ts` - composeSheetCanvas стала async, добавлен await img.decode()
- `src/components/ExportModal.tsx` - добавлен await при вызове composeSheetCanvas
- `src/utils/printManager.ts` - printViaBrowser стала async
- `src/components/PrintModal.tsx` - добавлен await при вызове printViaBrowser

## Результат

✅ PDF экспорт работает корректно  
✅ Печать через браузер работает корректно  
✅ Превью генерируется правильно  
✅ Fallback на растровый экспорт работает  
✅ Проект успешно собирается  

---

**Проблема решена!** PDF файлы теперь содержат корректное содержимое.
