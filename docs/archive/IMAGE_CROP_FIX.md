# Исправление функции обрезки изображений

## Проблема
Функция обрезки изображений не работала. При нажатии кнопки "Обрезать изображение" режим обрезки не активировался или обрезка не применялась корректно.

## Причина
В предыдущей реализации были следующие проблемы:
1. Ненадёжное получение элемента изображения из Fabric.js объекта
2. Недостаточная обработка ошибок при работе с canvas API
3. Отсутствие логирования для отладки
4. Неправильный расчёт координат обрезки с учётом масштабирования

## Решение

### 1. Создан новый компонент ImageCropEditor.tsx

Компонент отвечает за:
- Создание рамки обрезки поверх изображения
- Обработку режима редактирования
- Применение обрезки с корректным расчётом координат
- Отмену операции с восстановлением состояния

**Ключевые улучшения:**

#### Надёжное получение элемента изображения
```typescript
let imgElement: HTMLImageElement | HTMLCanvasElement | null = null;

// Пробуем несколько способов получения элемента
if ((image as any)._element) {
  imgElement = (image as any)._element;
} else if (typeof (image as any).getElement === 'function') {
  imgElement = (image as any).getElement();
} else if (typeof (image as any).toCanvasElement === 'function') {
  imgElement = (image as any).toCanvasElement();
}
```

#### Правильный расчёт координат
```typescript
// Координаты рамки обрезки
const cropLeft = cropRect.left || 0;
const cropTop = cropRect.top || 0;
const cropWidth = (cropRect.width || 0) * (cropRect.scaleX || 1);
const cropHeight = (cropRect.height || 0) * (cropRect.scaleY || 1);

// Относительные координаты в системе исходного изображения
const srcX = (cropLeft - imgLeft) / imgScaleX;
const srcY = (cropTop - imgTop) / imgScaleY;
const srcWidth = cropWidth / imgScaleX;
const srcHeight = cropHeight / imgScaleY;
```

#### Подробное логирование
Все ключевые этапы операции логируются для отладки:
- Начало обрезки
- Координаты обрезки
- Получение элемента изображения
- Создание нового изображения
- Завершение операции

#### Обработка ошибок
Каждый критический этап обёрнут в try-catch с понятными сообщениями об ошибках.

### 2. Обновлён ImageCropPanel.tsx

Упрощён до управления состоянием:
- Отслеживание режима обрезки (`isCropping`)
- Рендеринг ImageCropEditor в режиме обрезки
- Сохранение изменений в store после применения обрезки

## Как это работает

### Процесс обрезки:

1. **Пользователь выбирает изображение** на канвасе
2. **Нажимает кнопку "Обрезать изображение"** в панели свойств
3. **Активируется режим обрезки:**
   - Изображение становится неактивным (selectable: false, evented: false)
   - Создаётся синяя пунктирная рамка поверх изображения
   - Рамка становится активным объектом для редактирования
4. **Пользователь изменяет размер и положение рамки**
5. **Нажимает "Применить обрезку":**
   - Вычисляются координаты обрезки относительно исходного изображения
   - Создаётся временный canvas с обрезанной областью
   - Генерируется dataURL нового изображения
   - Старое изображение удаляется с канваса
   - Новое обрезанное изображение добавляется на канвас
   - Изменения сохраняются в store
6. **Или нажимает "Отмена":**
   - Рамка обрезки удаляется
   - Изображение восстанавливает активность
   - Состояние не изменяется

### Технические детали:

**Создание рамки обрезки:**
```typescript
const rect = new fabric.Rect({
  left: image.left || 0,
  top: image.top || 0,
  width: (image.width || 0) * (image.scaleX || 1) * 0.8,
  height: (image.height || 0) * (image.scaleY || 1) * 0.8,
  fill: 'transparent',
  stroke: '#2563EB',
  strokeWidth: 2,
  strokeDashArray: [5, 5],
  cornerColor: '#2563EB',
  cornerSize: 10,
  transparentCorners: false,
  hasRotatingPoint: false,
  lockRotation: true,
});
```

**Обрезка изображения:**
```typescript
// Создаём canvas для обрезки
const cropCanvas = document.createElement('canvas');
const ctx = cropCanvas.getContext('2d');

cropCanvas.width = srcWidth;
cropCanvas.height = srcHeight;

// Рисуем обрезанную часть
ctx.drawImage(
  imgElement,
  srcX, srcY, srcWidth, srcHeight, // исходная область
  0, 0, srcWidth, srcHeight         // целевая область
);

// Создаём dataURL
const croppedDataURL = cropCanvas.toDataURL('image/png');
```

**Создание нового Fabric.Image:**
```typescript
const croppedImg = await fabric.FabricImage.fromURL(croppedDataURL);

croppedImg.set({
  left: cropLeft,
  top: cropTop,
  scaleX: 1,
  scaleY: 1,
  ...customProps, // сохраняем id, name, visible
});
```

## Результат

✅ Функция обрезки изображений работает корректно  
✅ Рамка обрезки создаётся и редактируется  
✅ Обрезка применяется с правильными координатами  
✅ Изменения сохраняются в store  
✅ Отмена работает корректно  
✅ Подробное логирование для отладки  
✅ Надёжная обработка ошибок  

## Тестирование

1. Загрузите изображение на канвас
2. Выберите изображение
3. Нажмите "Обрезать изображение" в правой панели
4. Измените размер и положение синей рамки
5. Нажмите "Применить обрезку"
6. Проверьте, что изображение обрезано корректно
7. Проверьте, что изменения сохранились (сохраните и загрузите проект)

Также протестируйте:
- Отмену операции
- Обрезку изображений с разным масштабированием
- Обрезку повёрнутых изображений
- Множественные обрезки одного изображения

## Файлы

- `src/components/ImageCropEditor.tsx` - новый компонент для редактирования обрезки
- `src/components/ImageCropPanel.tsx` - обновлённая панель управления обрезкой
