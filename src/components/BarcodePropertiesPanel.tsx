import { useState, useEffect } from 'react';
import * as fabric from 'fabric';
import { useProjectStore } from '../store/useProjectStore';
import { BarcodeModal } from './BarcodeModal';
import {
  generateBarcodeSVG,
  parseBarcodeBars,
  loadBarcodeIntoFabric,
  stripTextFromSVG,
  computeDigitPositions,
  BarcodeFormat,
} from '../utils/barcodeGenerator';

export function BarcodePropertiesPanel() {
  const { selectedObject, editorCanvas } = useProjectStore();
  const [showEditModal, setShowEditModal] = useState(false);
  const [left, setLeft] = useState(0);
  const [top, setTop] = useState(0);
  const [angle, setAngle] = useState(0);

  // Проверяем, является ли выбранный объект штрихкодом
  const isBarcode = selectedObject && (selectedObject as any).barcodeValue;

  useEffect(() => {
    if (selectedObject && isBarcode) {
      setLeft(Math.round(selectedObject.left || 0));
      setTop(Math.round(selectedObject.top || 0));
      setAngle(Math.round(selectedObject.angle || 0));
    }
  }, [selectedObject, isBarcode]);

  const updateProperty = (property: string, value: any) => {
    if (!selectedObject) return;

    selectedObject.set(property as any, value);
    selectedObject.setCoords();
    selectedObject.canvas?.renderAll();
    selectedObject.fire('modified');
  };

  const handleLeftChange = (value: number) => {
    setLeft(value);
    updateProperty('left', value);
  };

  const handleTopChange = (value: number) => {
    setTop(value);
    updateProperty('top', value);
  };

  const handleAngleChange = (value: number) => {
    setAngle(value);
    updateProperty('angle', value);
  };

  const handleDelete = () => {
    if (!selectedObject || !editorCanvas) return;
    editorCanvas.remove(selectedObject);
    editorCanvas.renderAll();
  };

  const handleRecreate = async () => {
    if (!selectedObject || !editorCanvas) return;
    
    const barcodeData = selectedObject as any;
    const format: BarcodeFormat = barcodeData.barcodeFormat;
    const code: string = barcodeData.barcodeValue;
    
    if (!format || !code) {
      alert('Не удалось получить данные штрих-кода');
      return;
    }
    
    try {
      // Сохраняем позицию и масштаб старого объекта
      const left = selectedObject.left || 0;
      const top = selectedObject.top || 0;
      const scaleX = selectedObject.scaleX || 1;
      const scaleY = selectedObject.scaleY || 1;
      const angle = selectedObject.angle || 0;
      
      // Генерируем новый SVG с текстом (для правильной геометрии)
      const svgWithText = generateBarcodeSVG(code, format, { displayValue: true });
      
      // Удаляем текст из SVG
      const { svgNoText, textYFrac, fontSizeFrac } = stripTextFromSVG(svgWithText);
      
      // Парсим штрихи
      const bars = parseBarcodeBars(svgNoText);
      
      // Загружаем SVG без текста в Fabric
      const barsGroup = await loadBarcodeIntoFabric(svgNoText);
      
      // Рассчитываем позиции цифр
      const positions = computeDigitPositions(bars, format, code);
      
      // Создаём цифры как отдельные fabric.Text объекты
      const groupWidth = barsGroup.width || 1;
      const groupHeight = barsGroup.height || 1;
      
      const digitObjects = positions.map(p => new fabric.Text(p.char, {
        fontFamily: 'Arial',
        fontSize: fontSizeFrac * groupHeight,
        fill: '#000000',
        originX: 'center',
        originY: 'center',
        left: p.xFrac * groupWidth,
        top: (textYFrac - fontSizeFrac * 0.35) * groupHeight,
        selectable: false,
        evented: false,
      }));
      
      // Объединяем штрихи и цифры в одну группу
      const newGroup = new fabric.Group([barsGroup, ...digitObjects], {
        originX: 'left',
        originY: 'top',
      });
      
      // Устанавливаем кастомные свойства
      (newGroup as any).barcodeFormat = format;
      (newGroup as any).barcodeValue = code;
      (newGroup as any).barcodeBars = bars;
      (newGroup as any).barcodeSVG = svgNoText;
      (newGroup as any).barcodeTextYFrac = textYFrac;
      (newGroup as any).barcodeFontSizeFrac = fontSizeFrac;
      (newGroup as any).name = 'Штрих-код';
      
      // Восстанавливаем позицию и масштаб
      newGroup.set({
        left,
        top,
        scaleX,
        scaleY,
        angle,
      });
      
      // Удаляем старый объект и добавляем новый
      editorCanvas.remove(selectedObject);
      editorCanvas.add(newGroup);
      editorCanvas.setActiveObject(newGroup);
      editorCanvas.renderAll();
      
      // Сохраняем изменения
      const json = editorCanvas.toJSON();
      if (json.objects) {
        json.objects = json.objects.map((obj: any) => {
          if (obj.barcodeFormat) {
            return {
              ...obj,
              barcodeFormat: obj.barcodeFormat,
              barcodeValue: obj.barcodeValue,
              barcodeBars: obj.barcodeBars,
              barcodeSVG: obj.barcodeSVG,
              barcodeTextYFrac: obj.barcodeTextYFrac,
              barcodeFontSizeFrac: obj.barcodeFontSizeFrac,
            };
          }
          return obj;
        });
      }
      useProjectStore.getState().setCanvasJSON(json);
      
      alert('Штрих-код пересоздан успешно');
    } catch (error) {
      console.error('Ошибка пересоздания штрих-кода:', error);
      alert('Не удалось пересоздать штрих-код');
    }
  };

  if (!isBarcode) {
    return null;
  }

  const barcodeData = selectedObject as any;

  return (
    <>
      <div className="p-4 border-b border-gray-200">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Штрих-код (вектор)
        </h4>

        <div className="space-y-4">
          {/* Информация */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600">Формат:</span>
              <span className="text-sm font-medium text-gray-900">
                {barcodeData.barcodeFormat === 'ean13' ? 'EAN-13' : 'ITF-14'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600">Код:</span>
              <span className="text-sm font-mono font-medium text-gray-900">
                {barcodeData.barcodeValue}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600">Штрихов:</span>
              <span className="text-sm font-medium text-gray-900">
                {barcodeData.barcodeBars?.length || 0}
              </span>
            </div>
          </div>

          {/* Позиция */}
          <div>
            <label className="block text-xs text-gray-600 mb-2">Позиция (px)</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">X</label>
                <input
                  type="number"
                  value={left}
                  onChange={(e) => handleLeftChange(Number(e.target.value))}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Y</label>
                <input
                  type="number"
                  value={top}
                  onChange={(e) => handleTopChange(Number(e.target.value))}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                />
              </div>
            </div>
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

          {/* Действия */}
          <div className="space-y-2">
            <button
              onClick={() => setShowEditModal(true)}
              className="w-full px-3 py-2 bg-blue-50 hover:bg-blue-100 rounded-lg text-sm text-blue-700 transition-colors"
            >
              ✏️ Изменить код
            </button>
            <button
              onClick={handleRecreate}
              className="w-full px-3 py-2 bg-amber-50 hover:bg-amber-100 rounded-lg text-sm text-amber-700 transition-colors"
              title="Пересоздать штрих-код с правильным отображением цифр"
            >
              🔄 Пересоздать штрих-код
            </button>
            <button
              onClick={handleDelete}
              className="w-full px-3 py-2 bg-red-50 hover:bg-red-100 rounded-lg text-sm text-red-700 transition-colors"
            >
              🗑️ Удалить штрих-код
            </button>
          </div>

          {/* Подсказка */}
          <div className="flex items-start gap-2 pt-2 border-t border-gray-200">
            <span className="text-blue-600 text-sm">💡</span>
            <p className="text-xs text-gray-600 leading-relaxed">
              Штрих-код векторный — идеально чёткий при любом масштабе и в PDF
            </p>
          </div>
        </div>
      </div>

      {/* Модальное окно для редактирования */}
      <BarcodeModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        existingObject={selectedObject as fabric.Group}
      />
    </>
  );
}
