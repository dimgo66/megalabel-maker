import { useState, useEffect, useMemo, useRef } from 'react';
import { IText } from 'fabric';
import { useProjectStore } from '../store/useProjectStore';
import { serializeCanvas, invalidateTextCache } from '../utils/canvasHelpers';
import {
  fitTextToLabel,
  fitOptionsFromStore,
  normalizeText,
  sanitizePastedFragment,
  whenPastedTextInserted,
} from '../utils/textFitter';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronDown,
} from './icons';

export function TextPanel() {
  const { selectedObject, objectRevision } = useProjectStore();
  const [text, setText] = useState('');
  const [fontSize, setFontSize] = useState(14);
  const [fontFamily, setFontFamily] = useState('Roboto Condensed');
  const [fontWeight, setFontWeight] = useState('normal');
  const [fontStyle, setFontStyle] = useState('normal');
  const [underline, setUnderline] = useState(false);
  const [textTransform, setTextTransform] = useState<'none' | 'uppercase' | 'lowercase'>('none');
  const [textAlign, setTextAlign] = useState('left');
  const [lineHeight, setLineHeight] = useState(1.2);
  const [angle, setAngle] = useState(0);
  const [hasSelection, setHasSelection] = useState(false);
  const [showSpecialChars, setShowSpecialChars] = useState(false);

  // Ссылка на поле ввода: нужна, чтобы при сбое синхронизации перенести в
  // объект именно то, что видит пользователь.
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Список шрифтов для <select>. Подписка на конкретные срезы стора, а не
  // getState() прямо в рендере: иначе только что загруженный Google-шрифт не
  // появлялся бы в списке до следующего перерендера панели. Сам расчёт
  // переиспользует стор-метод getAvailableFonts() — один источник правды о том,
  // какие шрифты доступны; useMemo держит ссылку стабильной между рендерами.
  const fontConfigs = useProjectStore(s => s.fontConfigs);
  const loadedGoogleFonts = useProjectStore(s => s.loadedGoogleFonts);
  const localFonts = useProjectStore(s => s.localFonts);
  const availableFonts = useMemo(
    () => useProjectStore.getState().getAvailableFonts(),
    [fontConfigs, loadedGoogleFonts, localFonts]
  );

  /** Опции селектора, сгруппированные по источнику шрифта. */
  const fontGroups = useMemo(() => {
    const groups = [
      {
        label: 'Системные',
        options: availableFonts
          .filter(f => f.loaded && f.source === 'system')
          .map(f => ({ key: f.id, value: f.name, label: f.name })),
      },
      {
        label: 'Google Fonts',
        options: availableFonts
          .filter(f => f.loaded && f.source === 'google')
          .map(f => ({ key: f.id, value: f.name, label: f.name })),
      },
      {
        label: 'С компьютера',
        options: localFonts.map((f, idx) => ({
          key: `local-${idx}`,
          value: f.name,
          label: `${f.name}${f.weight !== 400 || f.style === 'italic' ? ` (${f.weight} ${f.style})` : ''}`,
        })),
      },
    ];
    // Пустые группы не рендерим: <optgroup> без опций оставлял бы висящий заголовок.
    return groups.filter(g => g.options.length > 0);
  }, [availableFonts, localFonts]);


  const SPECIAL_CHARS = [
    { label: '©', title: 'Copyright' },
    { label: '®', title: 'Registered' },
    { label: '™', title: 'Trademark' },
    { label: '°', title: 'Градус' },
    { label: '±', title: 'Плюс-минус' },
    { label: '×', title: 'Умножение' },
    { label: '÷', title: 'Деление' },
    { label: '≈', title: 'Приблизительно' },
    { label: '≠', title: 'Не равно' },
    { label: '≤', title: 'Меньше или равно' },
    { label: '≥', title: 'Больше или равно' },
    { label: '½', title: 'Одна вторая' },
    { label: '¼', title: 'Одна четверть' },
    { label: '¾', title: 'Три четверти' },
    { label: '№', title: 'Номер' },
    { label: '§', title: 'Параграф' },
    { label: '•', title: 'Точка-маркер' },
    { label: '→', title: 'Стрелка вправо' },
    { label: '←', title: 'Стрелка влево' },
    { label: '↑', title: 'Стрелка вверх' },
    { label: '↓', title: 'Стрелка вниз' },
    { label: '↔', title: 'Стрелка в обе стороны' },
    { label: '★', title: 'Звезда' },
    { label: '☆', title: 'Звезда (контур)' },
    { label: '✓', title: 'Галочка' },
    { label: '✗', title: 'Крестик' },
    { label: '♻', title: 'Переработка' },
    { label: '⚠', title: 'Предупреждение' },
    { label: '€', title: 'Евро' },
    { label: '£', title: 'Фунт' },
    { label: '¥', title: 'Йена' },
    { label: '₽', title: 'Рубль' },
    { label: '—', title: 'Тире' },
    { label: '–', title: 'Короткое тире' },
    { label: '«', title: 'Кавычка открывающая' },
    { label: '»', title: 'Кавычка закрывающая' },
  ];

  // Синхронизация с выбранным объектом (при смене объекта или objectRevision)
  useEffect(() => {
    if (selectedObject && (selectedObject.type === 'i-text' || selectedObject.type === 'textbox')) {
      setText(selectedObject.text || '');
      setFontSize(selectedObject.fontSize || 14);
      setFontFamily(selectedObject.fontFamily || 'Roboto Condensed');
      setFontWeight(selectedObject.fontWeight || 'normal');
      setFontStyle(selectedObject.fontStyle || 'normal');
      setUnderline(!!(selectedObject as any).underline);
      setTextTransform(((selectedObject as any).textTransform || 'none') as 'none' | 'uppercase' | 'lowercase');
      setTextAlign(selectedObject.textAlign || 'left');
      setLineHeight(selectedObject.lineHeight || 1.2);
      setAngle(selectedObject.angle || 0);

      const textObj = selectedObject as IText;
      setHasSelection(textObj.selectionStart !== textObj.selectionEnd);
    }
  }, [selectedObject, objectRevision]);

  // Прямая подписка на события Fabric canvas.
  // object:scaling — обновляем fontSize в реальном времени (пока тянут рамку).
  // object:modified — обновляем после отпускания (нормализованное значение).
  useEffect(() => {
    const syncFromObj = (e: any) => {
      const obj = e.target;
      if (!obj || (obj.type !== 'i-text' && obj.type !== 'textbox')) return;
      if (obj !== selectedObject) return;

      // При масштабировании fontSize ещё не нормализован — вычисляем визуальный размер
      const scaleX = obj.scaleX ?? 1;
      const scaleY = obj.scaleY ?? 1;
      const scale = (scaleX + scaleY) / 2;
      const visualFontSize = Math.round((obj.fontSize ?? 14) * scale);

      setFontSize(visualFontSize);
      setAngle(Math.round(obj.angle ?? 0));
    };

    const syncFromObjAfterModify = (e: any) => {
      const obj = e.target;
      if (!obj || (obj.type !== 'i-text' && obj.type !== 'textbox')) return;
      if (obj !== selectedObject) return;

      // После нормализации scaleX уже === 1, читаем чистый fontSize
      setFontSize(obj.fontSize ?? 14);
      setAngle(Math.round(obj.angle ?? 0));
      setText(obj.text || '');
      setFontFamily(obj.fontFamily || 'Roboto Condensed');
      setFontWeight(obj.fontWeight || 'normal');
      setFontStyle(obj.fontStyle || 'normal');
      setUnderline(!!(obj as any).underline);
      setTextTransform(((obj as any).textTransform || 'none') as 'none' | 'uppercase' | 'lowercase');
      setTextAlign(obj.textAlign || 'left');
      setLineHeight(obj.lineHeight || 1.2);
    };

    const canvas = (window as any).__fabricCanvas;
    if (!canvas) return;

    canvas.on('object:scaling', syncFromObj);
    canvas.on('object:rotating', syncFromObj);
    canvas.on('object:modified', syncFromObjAfterModify);

    return () => {
      canvas.off('object:scaling', syncFromObj);
      canvas.off('object:rotating', syncFromObj);
      canvas.off('object:modified', syncFromObjAfterModify);
    };
  }, [selectedObject]);

  // Обновление объекта на канвасе
  const updateObject = (property: string, value: any) => {
    if (!selectedObject) return;

    selectedObject.set(property, value);
    // `set()` у текста сам помечает кэш грязным только для свойств вёрстки;
    // для остальных (например, поворота) инвалидация нужна явная.
    invalidateTextCache(selectedObject);
    selectedObject.canvas?.renderAll();

    // Триггерим событие для сохранения
    selectedObject.fire('modified');
  };

  /**
   * Применение стиля к выделенному тексту или ко всему объекту.
   *
   * `setSelectionStyles` не помечает кэш объекта грязным (см.
   * `invalidateTextCache`), поэтому без явной инвалидации новое начертание
   * появлялось бы только после посторонней перерисовки.
   */
  const applyStyleToSelection = (property: string, value: any) => {
    if (!selectedObject) return;

    const textObj = selectedObject as IText;

    if (textObj.selectionStart !== textObj.selectionEnd) {
      const styles: any = {};
      styles[property] = value;
      textObj.setSelectionStyles(styles);
    } else {
      textObj.set(property, value);
    }

    invalidateTextCache(textObj);
    textObj.canvas?.renderAll();
    textObj.fire('modified');
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    updateObject('text', value);
  };

  /**
   * Подгонка текста выделенного объекта под этикетку + запись в историю.
   * Общая точка для обоих исходов вставки (текст дошёл до объекта сам или его
   * пришлось дописать).
   */
  const fitSelectedText = () => {
    const store = useProjectStore.getState();
    const obj = store.selectedObject;
    if (!obj || (obj.type !== 'i-text' && obj.type !== 'textbox')) return;

    const normalized = normalizeText(obj.text ?? '');
    if (normalized !== obj.text) obj.set('text', normalized);

    const result = fitTextToLabel(obj, fitOptionsFromStore());
    obj.canvas?.renderAll();

    // Объект мог быть пересоздан как Textbox — панель обязана переключиться
    // на новый экземпляр, иначе следующие правки уйдут в «мёртвый» объект.
    store.setSelectedObject(result.object);
    store.bumpObjectRevision();

    // Холст берём у объекта, а если его там нет — из стора: после замены
    // объекта ссылка на канвас появляется только по факту добавления, и
    // состояние проекта не должно от этого зависеть.
    const canvas = (result.object.canvas ?? store.editorCanvas) as any;
    if (canvas) {
      store.setCanvasJSON(serializeCanvas(canvas));
    }
    setText(result.object.text ?? '');

    if (result.overflow) {
      alert('Текст не помещается в этикетку: кегль уменьшен до минимального');
    }
  };

  /**
   * Вставка в поле «Текст» панели.
   *
   * Браузер вставляет текст в textarea сам, React обновляет объект через
   * onChange. Ждать приходится, а не подгонять сразу: порядок «браузер вставил
   * → React обновил объект» не гарантирован относительно нашего вызова, и без
   * ожидания подгонка считала бы старый текст и решала, что всё помещается.
   */
  const handleTextPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const fragment = sanitizePastedFragment(e.clipboardData?.getData('text/plain') ?? '');
    if (!fragment) return;

    whenPastedTextInserted({
      readText: () => {
        const obj = useProjectStore.getState().selectedObject;
        if (!obj || (obj.type !== 'i-text' && obj.type !== 'textbox')) return null;
        return String(obj.text ?? '');
      },
      fragment,
      onInserted: fitSelectedText,
      onMissing: () => {
        // Объект не получил вставленное: переносим в него текущее значение поля.
        const store = useProjectStore.getState();
        const obj = store.selectedObject;
        const typed = textareaRef.current?.value;
        if (obj && typeof typed === 'string') {
          obj.set('text', typed);
        }
        fitSelectedText();
      },
    });
  };

  const handleFontSizeChange = (value: number) => {
    setFontSize(value);
    applyStyleToSelection('fontSize', value);
  };

  const handleFontFamilyChange = (value: string) => {
    setFontFamily(value);
    applyStyleToSelection('fontFamily', value);
  };

  const handleFontWeightChange = () => {
    const newWeight = fontWeight === 'normal' ? 'bold' : 'normal';
    setFontWeight(newWeight);
    applyStyleToSelection('fontWeight', newWeight);
  };

  const handleFontStyleChange = () => {
    const newStyle = fontStyle === 'normal' ? 'italic' : 'normal';
    setFontStyle(newStyle);
    applyStyleToSelection('fontStyle', newStyle);
  };

  const handleUnderlineChange = () => {
    const newUnderline = !underline;
    setUnderline(newUnderline);
    applyStyleToSelection('underline', newUnderline);
  };

  const handleTextTransformChange = (transform: 'none' | 'uppercase' | 'lowercase') => {
    if (!selectedObject) return;
    const obj = selectedObject as IText & { _originalText?: string };

    const selStart = obj.selectionStart ?? 0;
    const selEnd = obj.selectionEnd ?? 0;
    const hasSelection = selStart !== selEnd;
    const currentText = obj.text || '';

    if (hasSelection) {
      // Применяем только к выделенному фрагменту
      const before = currentText.slice(0, selStart);
      const selected = currentText.slice(selStart, selEnd);
      const after = currentText.slice(selEnd);

      const transformedSlice =
        transform === 'uppercase'
          ? selected.toUpperCase()
          : transform === 'lowercase'
            ? selected.toLowerCase()
            : selected;

      const newText = before + transformedSlice + after;
      obj.set('text', newText);
      // Восстанавливаем выделение после изменения
      obj.selectionStart = selStart;
      obj.selectionEnd = selEnd;
      setText(newText);
      // Не меняем состояние textTransform — оно отражает режим всего объекта
    } else {
      // Применяем ко всему тексту
      const newTransform = textTransform === transform ? 'none' : transform;
      setTextTransform(newTransform);

      if (newTransform !== 'none') {
        if (!obj._originalText) obj._originalText = currentText;
      }
      const source = obj._originalText || currentText;
      const displayText =
        newTransform === 'uppercase'
          ? source.toUpperCase()
          : newTransform === 'lowercase'
            ? source.toLowerCase()
            : source;

      obj.set('text', displayText);
      setText(displayText);
    }

    obj.setCoords();
    obj.canvas?.renderAll();
    obj.fire('modified');
  };

  const handleInsertSpecialChar = (char: string) => {
    if (!selectedObject) return;
    const obj = selectedObject as IText;
    const start = obj.selectionStart ?? (obj.text?.length ?? 0);
    const currentText = obj.text || '';
    const newText = currentText.slice(0, start) + char + currentText.slice(obj.selectionEnd ?? start);
    obj.set('text', newText);
    setText(newText);
    obj.selectionStart = start + char.length;
    obj.selectionEnd = start + char.length;
    obj.setCoords();
    obj.canvas?.renderAll();
    obj.fire('modified');
  };

  const handleTextAlignChange = (align: string) => {
    setTextAlign(align);
    updateObject('textAlign', align);
  };

  const handleLineHeightChange = (value: number) => {
    setLineHeight(value);
    updateObject('lineHeight', value);
  };

  const handleAngleChange = (value: number) => {
    setAngle(value);
    updateObject('angle', value);
  };

  if (!selectedObject || (selectedObject.type !== 'i-text' && selectedObject.type !== 'textbox')) {
    return null;
  }

  return (
    <div className="p-4 border-b border-gray-200">
      <h4 className="type-group mb-3">
        Текст
        {hasSelection && (
          <span className="ml-2 text-blue-600 normal-case font-normal">(выделено)</span>
        )}
      </h4>

      <div className="space-y-4">
        {/* Текст */}
        <div>
          <label htmlFor="text-panel-text" className="block text-xs text-gray-600 mb-1">Текст:</label>
          <textarea
            id="text-panel-text"
            name="text-panel-text"
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onPaste={handleTextPaste}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={3}
          />
        </div>

        {/* Шрифт.
            Список собирается из подписки на стор, а не из getState() прямо в
            рендере: раньше только что загруженный Google-шрифт не появлялся в
            списке до следующего перерендера панели. Опции сгруппированы по
            источнику, и каждой задана своя гарнитура — в Chrome/Edge/Firefox
            выпадающий список показывает начертания (Safari стиль опций
            игнорирует, деградация безвредна). */}
        <div>
          <label htmlFor="text-panel-font-family" className="block text-xs text-gray-600 mb-1">Шрифт:</label>
          <select
            id="text-panel-font-family"
            name="text-panel-font-family"
            value={fontFamily}
            onChange={(e) => handleFontFamilyChange(e.target.value)}
            className="w-full"
          >
            {fontGroups.map(group => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map(option => (
                  <option key={option.key} value={option.value} style={{ fontFamily: option.value }}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Размер шрифта */}
        <div>
          <label htmlFor="text-panel-font-size" className="block text-xs text-gray-600 mb-1">Размер: {fontSize} pt</label>
          <div className="flex items-center gap-2">
            <input
              id="text-panel-font-size"
              name="text-panel-font-size"
              type="number"
              min="4"
              max="200"
              value={fontSize}
              onChange={(e) => handleFontSizeChange(Number(e.target.value))}
              className="w-20"
            />
            <input
              id="text-panel-font-size-range"
              name="text-panel-font-size-range"
              type="range"
              min="4"
              max="200"
              value={fontSize}
              onChange={(e) => handleFontSizeChange(Number(e.target.value))}
              className="flex-1"
              aria-label="Размер шрифта (ползунок)"
            />
          </div>
        </div>

        {/* Начертание */}
        <div>
          <label className="block text-xs text-gray-600 mb-1">
            Начертание:
            {hasSelection && <span className="text-blue-600 ml-1">(к выделенному)</span>}
          </label>
          <div className="flex gap-2">
            <button
              onClick={handleFontWeightChange}
              aria-label="Жирный"
              aria-pressed={fontWeight === 'bold'}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-all duration-200 ${
                fontWeight === 'bold'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              B
            </button>
            <button
              onClick={handleFontStyleChange}
              aria-label="Курсив"
              aria-pressed={fontStyle === 'italic'}
              className={`flex-1 px-3 py-2 rounded-lg text-sm italic transition-all duration-200 ${
                fontStyle === 'italic'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              I
            </button>
            <button
              onClick={handleUnderlineChange}
              aria-label="Подчёркивание"
              aria-pressed={underline}
              className={`flex-1 px-3 py-2 rounded-lg text-sm underline transition-all duration-200 ${
                underline
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              U
            </button>
          </div>

          {/* Регистр */}
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => handleTextTransformChange('uppercase')}
              aria-label="Прописные"
              aria-pressed={textTransform === 'uppercase'}
              title="Все прописные (UPPERCASE)"
              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 ${
                textTransform === 'uppercase'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              AA
            </button>
            <button
              onClick={() => handleTextTransformChange('lowercase')}
              aria-label="Строчные"
              aria-pressed={textTransform === 'lowercase'}
              title="Все строчные (lowercase)"
              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 ${
                textTransform === 'lowercase'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              aa
            </button>
            <button
              onClick={() => handleTextTransformChange('none')}
              aria-label="Как есть"
              aria-pressed={textTransform === 'none'}
              title="Без изменения регистра"
              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all duration-200 ${
                textTransform === 'none'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Aa
            </button>
          </div>
        </div>

        {/* Выравнивание */}
        <div>
          <label className="block text-xs text-gray-600 mb-1">Выравнивание:</label>
          <div className="flex gap-2" role="group" aria-label="Выравнивание текста">
            <button
              onClick={() => handleTextAlignChange('left')}
              aria-label="По левому краю"
              aria-pressed={textAlign === 'left'}
              className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                textAlign === 'left'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <AlignLeft size={16} className="mx-auto" />
            </button>
            <button
              onClick={() => handleTextAlignChange('center')}
              aria-label="По центру"
              aria-pressed={textAlign === 'center'}
              className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                textAlign === 'center'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <AlignCenter size={16} className="mx-auto" />
            </button>
            <button
              onClick={() => handleTextAlignChange('right')}
              aria-label="По правому краю"
              aria-pressed={textAlign === 'right'}
              className={`flex-1 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                textAlign === 'right'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <AlignRight size={16} className="mx-auto" />
            </button>
          </div>
        </div>

        {/* Межстрочный интервал */}
        <div>
          <label htmlFor="text-panel-line-height" className="block text-xs text-gray-600 mb-1">Межстрочный: {lineHeight.toFixed(2)}</label>
          <input
            id="text-panel-line-height"
            name="text-panel-line-height"
            type="range"
            min="0.5"
            max="3.0"
            step="0.05"
            value={lineHeight}
            onChange={(e) => handleLineHeightChange(Number(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Спецсимволы */}
        <div>
          <button
            onClick={() => setShowSpecialChars(!showSpecialChars)}
            className={`w-full text-left text-xs font-semibold uppercase tracking-wide mb-2 px-2 py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1.5 ${
              showSpecialChars
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <ChevronDown size={14} className="shrink-0" />
            <span>Спецсимволы</span>
          </button>
          {showSpecialChars && (
            <div className="grid grid-cols-6 gap-1">
              {SPECIAL_CHARS.map((sc) => (
                <button
                  key={sc.label}
                  title={sc.title}
                  onClick={() => handleInsertSpecialChar(sc.label)}
                  className="flex items-center justify-center h-8 w-full rounded-md text-sm bg-gray-100 hover:bg-blue-100 hover:text-blue-700 transition-all duration-150 font-mono"
                >
                  {sc.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Поворот */}
        <div>
          <label htmlFor="text-panel-angle" className="block text-xs text-gray-600 mb-1">Поворот: {angle}°</label>
          <input
            id="text-panel-angle"
            name="text-panel-angle"
            type="range"
            min="0"
            max="360"
            step="1"
            value={angle}
            onChange={(e) => handleAngleChange(Number(e.target.value))}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}
