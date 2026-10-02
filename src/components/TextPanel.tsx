import { useState, useEffect } from 'react';
import { IText, Textbox } from 'fabric';
import { useProjectStore } from '../store/useProjectStore';

export function TextPanel() {
  const { selectedObject } = useProjectStore();
  const [text, setText] = useState('');
  const [fontSize, setFontSize] = useState(14);
  const [fontFamily, setFontFamily] = useState('Roboto Condensed');
  const [fontWeight, setFontWeight] = useState('normal');
  const [fontStyle, setFontStyle] = useState('normal');
  const [textAlign, setTextAlign] = useState('left');
  const [lineHeight, setLineHeight] = useState(1.2);
  const [angle, setAngle] = useState(0);
  const [hasSelection, setHasSelection] = useState(false);

  // Синхронизация с выбранным объектом
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
      
      // Проверяем наличие выделения
      const textObj = selectedObject as IText;
      setHasSelection(textObj.selectionStart !== textObj.selectionEnd);
    }
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
    
    // Если есть выделение, применяем только к выделенному тексту
    if (textObj.selectionStart !== textObj.selectionEnd) {
      const styles: any = {};
      styles[property] = value;
      textObj.setSelectionStyles(styles);
    } else {
      // Иначе применяем ко всему объекту
      textObj.set(property, value);
    }
    
    textObj.setCoords();
    textObj.canvas?.renderAll();
    
    // Триггерим событие для сохранения через fire
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
          <label className="block text-xs text-gray-600 mb-1">Текст:</label>
          <textarea
            value={text}
            onChange={handleTextChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={3}
          />
        </div>

        {/* Шрифт */}
        <div>
          <label className="block text-xs text-gray-600 mb-1">Шрифт:</label>
          <select
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
          <label className="block text-xs text-gray-600 mb-1">Размер: {fontSize} pt</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="4"
              max="200"
              value={fontSize}
              onChange={(e) => handleFontSizeChange(Number(e.target.value))}
              className="w-20"
            />
            <input
              type="range"
              min="4"
              max="200"
              value={fontSize}
              onChange={(e) => handleFontSizeChange(Number(e.target.value))}
              className="flex-1"
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
          <div className="flex gap-2">
            <button
              onClick={() => handleTextAlignChange('left')}
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
          <label className="block text-xs text-gray-600 mb-1">Межстрочный: {lineHeight.toFixed(2)}</label>
          <input
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
          <label className="block text-xs text-gray-600 mb-1">Поворот: {angle}°</label>
          <input
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
