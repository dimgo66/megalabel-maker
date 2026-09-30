import { useState, useEffect } from 'react';
import { IText } from 'fabric';
import { useProjectStore } from '../store/useProjectStore';

export function TextPanel() {
  const { selectedObject } = useProjectStore();
  const [text, setText] = useState('');
  const [fontSize, setFontSize] = useState(14);
  const [fontFamily, setFontFamily] = useState('Arial');
  const [fontWeight, setFontWeight] = useState('normal');
  const [fontStyle, setFontStyle] = useState('normal');
  const [textAlign, setTextAlign] = useState('left');
  const [lineHeight, setLineHeight] = useState(1.2);
  const [charSpacing, setCharSpacing] = useState(0);
  const [angle, setAngle] = useState(0);

  // Синхронизация с выбранным объектом
  useEffect(() => {
    if (selectedObject && (selectedObject.type === 'i-text' || selectedObject.type === 'textbox')) {
      setText(selectedObject.text || '');
      setFontSize(selectedObject.fontSize || 14);
      setFontFamily(selectedObject.fontFamily || 'Arial');
      setFontWeight(selectedObject.fontWeight || 'normal');
      setFontStyle(selectedObject.fontStyle || 'normal');
      setTextAlign(selectedObject.textAlign || 'left');
      setLineHeight(selectedObject.lineHeight || 1.2);
      setCharSpacing(selectedObject.charSpacing || 0);
      setAngle(selectedObject.angle || 0);
    }
  }, [selectedObject]);

  // Обновление объекта на канвасе
  const updateObject = (property: string, value: any) => {
    if (!selectedObject) return;
    
    selectedObject.set(property, value);
    selectedObject.canvas?.renderAll();
    
    // Триггерим событие для сохранения
    selectedObject.canvas?.trigger('object:modified', { target: selectedObject });
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    updateObject('text', value);
  };

  const handleFontSizeChange = (value: number) => {
    setFontSize(value);
    updateObject('fontSize', value);
  };

  const handleFontFamilyChange = (value: string) => {
    setFontFamily(value);
    updateObject('fontFamily', value);
  };

  const handleFontWeightChange = () => {
    const newWeight = fontWeight === 'normal' ? 'bold' : 'normal';
    setFontWeight(newWeight);
    updateObject('fontWeight', newWeight);
  };

  const handleFontStyleChange = () => {
    const newStyle = fontStyle === 'normal' ? 'italic' : 'normal';
    setFontStyle(newStyle);
    updateObject('fontStyle', newStyle);
  };

  const handleTextAlignChange = (align: string) => {
    setTextAlign(align);
    updateObject('textAlign', align);
  };

  const handleLineHeightChange = (value: number) => {
    setLineHeight(value);
    updateObject('lineHeight', value);
  };

  const handleCharSpacingChange = (value: number) => {
    setCharSpacing(value);
    updateObject('charSpacing', value);
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
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Текст</h4>
      
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
            <option value="Arial">Arial</option>
            <option value="Myriad Pro">Myriad Pro</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
            <option value="Georgia">Georgia</option>
            <option value="Verdana">Verdana</option>
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
          <label className="block text-xs text-gray-600 mb-1">Начертание:</label>
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
          <label className="block text-xs text-gray-600 mb-1">Межстрочный: {lineHeight.toFixed(1)}</label>
          <input
            type="range"
            min="0.8"
            max="3.0"
            step="0.1"
            value={lineHeight}
            onChange={(e) => handleLineHeightChange(Number(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Межбуквенный интервал */}
        <div>
          <label className="block text-xs text-gray-600 mb-1">Межбуквенный: {charSpacing}</label>
          <input
            type="range"
            min="-2"
            max="20"
            step="0.5"
            value={charSpacing}
            onChange={(e) => handleCharSpacingChange(Number(e.target.value))}
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
