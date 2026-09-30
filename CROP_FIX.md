# Исправление обрезки изображений

## Проблема

Обрезка изображений не работала. При нажатии кнопки "Применить" ничего не происходило.

## Причины

### 1. Потеря ссылки на изображение
При входе в режим обрезки прямоугольник обрезки становился активным объектом, что приводило к изменению `selectedObject` в store. Из-за этого `isImage` становился `false`, и проверка в `applyCrop` не проходила.

### 2. Неправильный доступ к элементу изображения
В Fabric.js v6 свойство `_element` может быть недоступно. Нужно использовать другие методы получения элемента изображения.

### 3. Неправильный расчёт размеров
Размеры прямоугольника обрезки не учитывали его масштаб (`scaleX`, `scaleY`).

## Решение

### 1. Сохранение ссылок через useRef
```typescript
const cropRectRef = useRef<fabric.Rect | null>(null);
const imageRef = useRef<fabric.FabricImage | null>(null);
```

Теперь ссылки на изображение и прямоугольник хранятся в ref, а не зависят от `selectedObject`.

### 2. Блокировка изображения при входе в режим обрезки
```typescript
// Делаем изображение неактивным, чтобы не мешало
img.selectable = false;
img.evented = false;
```

Это предотвращает случайное выделение изображения во время обрезки.

### 3. Правильное получение элемента изображения
```typescript
let imgElement: HTMLImageElement | HTMLCanvasElement | undefined;

// В Fabric.js v6 используем разные способы получения элемента
if ((img as any)._element) {
  imgElement = (img as any)._element;
} else if ((img as any).getElement) {
  imgElement = (img as any).getElement();
} else if ((img as any).toCanvasElement) {
  // Если нет прямого доступа к элементу, создаём canvas из изображения
  const srcCanvas = (img as any).toCanvasElement();
  imgElement = srcCanvas;
}
```

### 4. Правильный расчёт размеров с учётом масштаба
```typescript
const cropWidth = (cropRect.width || 0) * (cropRect.scaleX || 1);
const cropHeight = (cropRect.height || 0) * (cropRect.scaleY || 1);
```

### 5. Улучшенная обработка ошибок
Добавлены try-catch блоки и подробные console.log для отладки.

### 6. Правильное завершение режима обрезки
```typescript
const exitCropMode = () => {
  if (!editorCanvas) return;

  // Восстанавливаем доступность изображения
  if (imageRef.current) {
    imageRef.current.selectable = true;
    imageRef.current.evented = true;
  }

  if (cropRectRef.current) {
    editorCanvas.remove(cropRectRef.current);
    cropRectRef.current = null;
  }

  imageRef.current = null;
  setIsCropping(false);
  editorCanvas.renderAll();
};
```

## Изменённые файлы

- `src/components/ImageCropPanel.tsx` - полная переработка компонента

## Тестирование

1. Загрузите изображение на canvas
2. Выберите изображение кликом
3. В правой панели нажмите "✂️ Обрезать изображение"
4. Измените размер и положение рамки обрезки
5. Нажмите "✓ Применить"
6. Изображение должно быть обрезано корректно

Для отладки откройте консоль браузера (F12) - там будут логи процесса обрезки:
- `applyCrop: начинаем обрезку`
- `applyCrop: координаты {...}`
- `applyCrop: элемент изображения получен`
- `applyCrop: создаём новое изображение`
- `applyCrop: обрезка завершена успешно`

## Технические детали

### Почему useRef вместо useState?
- `useRef` не вызывает перерисовку компонента при изменении значения
- Значение обновляется мгновенно
- Подходит для хранения ссылок на объекты Fabric.js

### Почему блокируем изображение?
- Предотвращает случайное выделение во время обрезки
- Упрощает взаимодействие с прямоугольником обрезки
- После завершения режима обрезки доступность восстанавливается

### Обработка разных версий Fabric.js
Код проверяет несколько способов получения элемента изображения:
1. `_element` - прямое свойство (Fabric.js v5 и некоторые версии v6)
2. `getElement()` - метод (Fabric.js v6)
3. `toCanvasElement()` - создание canvas из изображения (запасной вариант)

Это обеспечивает совместимость с разными версиями Fabric.js.
