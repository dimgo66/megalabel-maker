# Исправление проблемы с PreviewModal

## Проблема
PreviewModal рендерился дважды - в `Toolbar.tsx` и в `App.tsx`, что вызывало конфликт состояния и приводило к тому, что модальное окно не отображалось корректно.

## Причина
Каждый компонент (Toolbar и App) имел собственное локальное состояние `isPreviewOpen`, `isExportOpen`, `isPrintOpen`. Это приводило к тому, что:
1. При нажатии кнопки в Toolbar обновлялось локальное состояние Toolbar
2. Но модальное окно в App.tsx не реагировало на эти изменения
3. В результате модальное окно не открывалось

## Решение

### 1. Централизация состояния
Состояние модальных окон теперь управляется только в `App.tsx`:
```typescript
const [isPreviewOpen, setIsPreviewOpen] = useState(false);
const [isExportOpen, setIsExportOpen] = useState(false);
const [isPrintOpen, setIsPrintOpen] = useState(false);
```

### 2. Callback Props в Toolbar
Toolbar теперь принимает callback функции для открытия модальных окон:
```typescript
interface ToolbarProps {
  onPreview?: () => void;
  onPrint?: () => void;
  onExport?: () => void;
}

export function Toolbar({ onPreview, onPrint, onExport }: ToolbarProps) {
  // ...
  <button onClick={onPreview}>Предпросмотр</button>
  <button onClick={onPrint}>Печать</button>
  <button onClick={onExport}>PDF</button>
}
```

### 3. Передача callbacks из App
```typescript
<Toolbar 
  onPreview={() => setIsPreviewOpen(true)}
  onPrint={() => setIsPrintOpen(true)}
  onExport={() => setIsExportOpen(true)}
/>
```

### 4. Удаление дублирования
Удалены модальные окна из `Toolbar.tsx`:
- Удалён импорт `PreviewModal`, `ExportModal`, `PrintModal`
- Удалены локальные состояния `isPreviewOpen`, `isExportOpen`, `isPrintOpen`
- Удалены компоненты модальных окон из рендера

## Изменённые файлы

### src/components/Toolbar.tsx
- ✅ Добавлен интерфейс `ToolbarProps` с callback функциями
- ✅ Удалены локальные состояния модальных окон
- ✅ Удалены импорты модальных компонентов
- ✅ Кнопки теперь вызывают callback функции вместо локального setState
- ✅ Удалены компоненты модальных окон из рендера

### src/App.tsx
- ✅ Передаёт callback функции в Toolbar для управления модальными окнами

## Результат

✅ Модальные окна теперь открываются корректно  
✅ Состояние управляется централизованно в App.tsx  
✅ Нет конфликтов между компонентами  
✅ Toolbar стал более переиспользуемым (не зависит от состояния)  
✅ Проект успешно собирается без ошибок  

## Как проверить

1. Нажмите кнопку "👁 Предпросмотр" в тулбаре
2. Должно открыться модальное окно с предпросмотром листа A4
3. В окне должен отображаться лист с сеткой ячеек
4. Содержимое этикетки должно тиражироваться на все ячейки
5. Зум должен работать (кнопки [-] [+], слайдер)
6. Закрытие по кнопке ✕, клавише Esc или клику на фон

## Архитектурные улучшения

### До:
```
App.tsx
  └─ Toolbar.tsx (своё состояние isPreviewOpen)
      └─ PreviewModal (не работает)
  └─ PreviewModal (своё состояние isPreviewOpen)
      └─ Конфликт состояний
```

### После:
```
App.tsx (состояние isPreviewOpen)
  ├─ Toolbar.tsx (callback onPreview)
  │   └─ Кнопка вызывает onPreview
  └─ PreviewModal (использует isPreviewOpen из App)
      └─ Работает корректно
```

## Преимущества нового подхода

1. **Единый источник истины** - состояние в App.tsx
2. **Разделение ответственности** - Toolbar только UI, App управляет состоянием
3. **Переиспользуемость** - Toolbar можно использовать в разных контекстах
4. **Предсказуемость** - нет конфликтов состояний
5. **Тестируемость** - легче тестировать компоненты по отдельности

## Горячие клавиши

Также работают горячие клавиши для открытия модальных окон:
- `Ctrl+Shift+P` - Предпросмотр
- `Ctrl+P` - Печать
- `Ctrl+Shift+E` - Экспорт в PDF

Они управляются через `useHotkeys` в App.tsx и вызывают те же функции `setIsPreviewOpen`, `setIsPrintOpen`, `setIsExportOpen`.
