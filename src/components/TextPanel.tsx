import { useState, useEffect } from 'react';
import { IText } from 'fabric';
import { useProjectStore } from '../store/useProjectStore';

export function TextPanel() {
  const { selectedObject, objectRevision } = useProjectStore();
  const [text, setText] = useState('');
  const [fontSize, setFontSize] = useState(14);
  const [fontFamily, setFontFamily] = useState('Roboto Condensed');
  const [fontWeight, setFontWeight] = useState('normal');
  const [fontStyle, setFontStyle] = useState('normal');
  const [textAlign, setTextAlign] = useState('left');
  const [lineHeight, setLineHeight] = useState(1.2);
  const [angle, setAngle] = useState(0);
  const [hasSelection, setHasSelection] = useState(false);

  // Синхронизация с выбранным объектом (при смене объекта или objectRevision)
  useEffect(() => {
    if (selectedObject && (selectedObject.type === 'i-text' || selectedObject.type === 'textbox')) {
      setText(selectedObject.text || '');
      setFontSize(selectedObject.fontSize || 14);
      setFontFamily(selectedObject.fontFamily || 'Roboto Condensed');
      setFontWeight(selectedObject.fontWeight || 'normal');
      setFontStyle(selectedObject.fontStyle || 'normal');
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
    selectedObject.setCoords();
    selectedObject.canvas?.renderAll();

    // Триггерим событие для сохранения
    selectedObject.fire('modified');
  };

  // Применение стиля к выделенному тексту или ко всему объекту
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

    textObj.setCoords();
    textObj.canvas?.renderAll();
    textObj.fire('modified');
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    updateObject('text', value);
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
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
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
            value={text}
            onChange={handleTextChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={3}
          />
        </div>

        {/* Шрифт */}
        <div>
          <label htmlFor="text-panel-font-family" className="block text-xs text-gray-600 mb-1">Шрифт:</label>
          <select
            id="text-panel-font-family"
            name="text-panel-font-family"
            value={fontFamily}
            onChange={(e) => handleFontFamilyChange(e.target.value)}
            className="w-full"
          >
            {/* Системные шрифты */}
            {useProjectStore.getState().getAvailableFonts()
              .filter(f => f.loaded && f.source === 'system')
              .map(font => (
                <option key={font.id} value={font.name}>
                  {font.name}
                </option>
              ))}

            {/* Google Fonts */}
            {useProjectStore.getState().getAvailableFonts()
              .filter(f => f.loaded && f.source === 'google')
              .map(font => (
                <option key={font.id} value={font.name}>
                  {font.name}
                </option>
              ))}

            {/* Локальные шрифты */}
            {useProjectStore.getState().localFonts.map((font, idx) => (
              <option key={`local-${idx}`} value={font.name}>
                {font.name} {font.weight !== 400 || font.style === 'italic' ? `(${font.weight} ${font.style})` : ''}
              </option>
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
              ←
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
              ↕
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
              →
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
