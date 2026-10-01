import { useState, useEffect } from 'react';
import {
  validateBarcode,
  addCheckDigit,
} from '../utils/barcodeGenerator';
import { buildBarcodeGroup } from '../utils/barcodeObjectFactory';
import { BarcodeFormat } from '../types';
import * as fabric from 'fabric';
import { serializeCanvas, sceneWidth, sceneHeight } from '../utils/canvasHelpers';
import { useProjectStore } from '../store/useProjectStore';

interface BarcodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingObject?: fabric.Group; // Для редактирования существующего штрихкода
}

export function BarcodeModal({ isOpen, onClose, existingObject }: BarcodeModalProps) {
  const { editorCanvas } = useProjectStore();
  
  const [format, setFormat] = useState<BarcodeFormat>('ean13');
  const [code, setCode] = useState('');
  const [fullCode, setFullCode] = useState('');
  const [error, setError] = useState('');

  // Загрузка данных существующего штрихкода
  useEffect(() => {
    if (existingObject) {
      const obj = existingObject as any;
      if (obj.barcodeFormat) setFormat(obj.barcodeFormat);
      if (obj.barcodeValue) {
        setCode(obj.barcodeValue);
        setFullCode(obj.barcodeValue);
      }
    }
  }, [existingObject]);

  // Валидация при изменении кода
  useEffect(() => {
    if (!code || code.trim() === '') {
      setError('');
      setFullCode('');
      return;
    }

    const validation = validateBarcode(code, format);
    if (!validation.valid) {
      setError(validation.error || 'Некорректный код');
      setFullCode('');
      return;
    }

    setError('');
    
    // Добавляем контрольную цифру если нужно
    const finalCode = addCheckDigit(code, format);
    setFullCode(finalCode);
  }, [code, format]);

  const handleAdd = async () => {
    if (!editorCanvas || !fullCode) {
      console.error('handleAdd: отсутствуют необходимые данные');
      return;
    }

    try {
      console.log('handleAdd: начинаем добавление штрихкода');
      
      // Создаём штрих-код через фабрику (все примитивы в единой системе координат)
      const group = buildBarcodeGroup(fullCode, format);
      console.log('handleAdd: штрих-код создан через фабрику');
      
      // Если редактируем существующий объект, заменяем его
      if (existingObject && editorCanvas) {
        const left = existingObject.left || 0;
        const top = existingObject.top || 0;
        const scaleX = existingObject.scaleX || 1;
        const scaleY = existingObject.scaleY || 1;
        
        editorCanvas.remove(existingObject);
        
        group.set({
          left,
          top,
          scaleX,
          scaleY,
        });
        
        editorCanvas.add(group);
        editorCanvas.setActiveObject(group);
        editorCanvas.renderAll();
        
        console.log('handleAdd: штрихкод обновлён');
      } else if (editorCanvas) {
        // Центрируем новый штрихкод
        const canvasWidth = sceneWidth(editorCanvas);
        const canvasHeight = sceneHeight(editorCanvas);
        
        // Масштабируем для вписывания
        const groupWidth = group.width || 1;
        const groupHeight = group.height || 1;
        const scale = Math.min(
          (canvasWidth * 0.7) / groupWidth,
          (canvasHeight * 0.3) / groupHeight
        );
        
        group.set({
          left: canvasWidth / 2,
          top: canvasHeight / 2,
          scaleX: scale,
          scaleY: scale,
          originX: 'center',
          originY: 'center',
        });
        
        editorCanvas.add(group);
        editorCanvas.setActiveObject(group);
        editorCanvas.renderAll();
        
        console.log('handleAdd: штрихкод добавлен');
      }
      
      // Сохраняем изменения
      const json = serializeCanvas(editorCanvas);
      
      // Добавляем кастомные свойства штрихкода в JSON вручную
      if (json.objects) {
        json.objects = json.objects.map((obj: any) => {
          if (obj.barcodeFormat) {
            return {
              ...obj,
              barcodeFormat: obj.barcodeFormat,
              barcodeValue: obj.barcodeValue,
              barcodeNorm: obj.barcodeNorm,
            };
          }
          return obj;
        });
      }
      
      useProjectStore.getState().setCanvasJSON(json);
      
      // Закрываем модалку
      onClose();
      
      // Сбрасываем форму
      setCode('');
      setFullCode('');
    } catch (err) {
      console.error('handleAdd: ошибка добавления штрихкода', err);
      setError('Ошибка добавления штрихкода');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {existingObject ? 'Изменить штрих-код' : 'Добавить штрих-код'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          <div className="space-y-4">
            {/* Формат */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Формат штрихкода
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setFormat('ean13')}
                  className={`flex-1 px-4 py-2 rounded-lg border-2 transition-all ${
                    format === 'ean13'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium">EAN-13</div>
                  <div className="text-xs mt-1">13 цифр (товары)</div>
                </button>
                <button
                  onClick={() => setFormat('itf14')}
                  className={`flex-1 px-4 py-2 rounded-lg border-2 transition-all ${
                    format === 'itf14'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium">ITF-14</div>
                  <div className="text-xs mt-1">14 цифр (коробки)</div>
                </button>
              </div>
            </div>

            {/* Код */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Код штрихкода
                {fullCode && fullCode !== code && (
                  <span className="text-xs text-gray-500 ml-2">
                    (контрольная цифра: {fullCode.slice(-1)})
                  </span>
                )}
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder={format === 'ean13' ? '12 или 13 цифр' : '13 или 14 цифр'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                maxLength={format === 'ean13' ? 13 : 14}
              />
              {error && (
                <p className="text-sm text-red-600 mt-1">{error}</p>
              )}
            </div>

            {/* Информация */}
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="text-xs text-blue-900 space-y-1">
                <div>✓ Векторные штрихи (чёткие при любом масштабе)</div>
                <div>✓ Стандартная раскладка цифр</div>
                <div>✓ Сохраняется в проект</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleAdd}
            disabled={!fullCode || !!error}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {existingObject ? 'Обновить' : 'Добавить'}
          </button>
        </div>
      </div>
    </div>
  );
}
