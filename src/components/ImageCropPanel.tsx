import { useState, useEffect } from 'react';
import * as fabric from 'fabric';
import { useProjectStore } from '../store/useProjectStore';

export function ImageCropPanel() {
  const { selectedObject, editorCanvas } = useProjectStore();
  const [isCropping, setIsCropping] = useState(false);
  const [cropRect, setCropRect] = useState<fabric.Rect | null>(null);

  const isImage = selectedObject instanceof fabric.FabricImage;

  useEffect(() => {
    // Сбрасываем режим обрезки при выборе другого объекта
    if (!isImage && isCropping) {
      exitCropMode();
    }
  }, [selectedObject, isImage, isCropping]);

  const enterCropMode = () => {
    if (!editorCanvas || !selectedObject || !isImage) return;

    const img = selectedObject as fabric.FabricImage;
    
    // Создаём прямоугольник обрезки поверх изображения
    const rect = new fabric.Rect({
      left: img.left || 0,
      top: img.top || 0,
      width: (img.width || 0) * (img.scaleX || 1),
      height: (img.height || 0) * (img.scaleY || 1),
      fill: 'rgba(0, 123, 255, 0.2)',
      stroke: '#007bff',
      strokeWidth: 2,
      strokeDashArray: [5, 5],
      cornerColor: '#007bff',
      cornerSize: 10,
      transparentCorners: false,
      hasRotatingPoint: false,
      lockRotation: true,
    });

    editorCanvas.add(rect);
    editorCanvas.setActiveObject(rect);
    editorCanvas.renderAll();
    
    setCropRect(rect);
    setIsCropping(true);
  };

  const applyCrop = () => {
    if (!editorCanvas || !selectedObject || !cropRect || !isImage) return;

    const img = selectedObject as fabric.FabricImage;
    
    // Получаем координаты обрезки
    const cropLeft = cropRect.left || 0;
    const cropTop = cropRect.top || 0;
    const cropWidth = cropRect.width || 0;
    const cropHeight = cropRect.height || 0;

    // Вычисляем относительные координаты относительно изображения
    const imgLeft = img.left || 0;
    const imgTop = img.top || 0;
    const imgScaleX = img.scaleX || 1;
    const imgScaleY = img.scaleY || 1;

    const relLeft = (cropLeft - imgLeft) / imgScaleX;
    const relTop = (cropTop - imgTop) / imgScaleY;
    const relWidth = cropWidth / imgScaleX;
    const relHeight = cropHeight / imgScaleY;

    // Создаём временный canvas для обрезки
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    if (!tempCtx || !img._element) {
      console.error('Не удалось получить контекст canvas или элемент изображения');
      return;
    }

    tempCanvas.width = relWidth;
    tempCanvas.height = relHeight;

    // Рисуем обрезанную часть изображения
    tempCtx.drawImage(
      img._element as HTMLImageElement,
      relLeft,
      relTop,
      relWidth,
      relHeight,
      0,
      0,
      relWidth,
      relHeight
    );

    // Создаём новое изображение из обрезанного canvas
    const croppedDataUrl = tempCanvas.toDataURL('image/png');
    
    fabric.FabricImage.fromURL(croppedDataUrl).then((croppedImg) => {
      // Заменяем старое изображение новым
      const left = cropLeft;
      const top = cropTop;

      // Удаляем старое изображение и прямоугольник обрезки
      editorCanvas.remove(img);
      editorCanvas.remove(cropRect);

      // Добавляем новое обрезанное изображение
      croppedImg.set({
        left,
        top,
        scaleX: 1,
        scaleY: 1,
      });

      editorCanvas.add(croppedImg);
      editorCanvas.setActiveObject(croppedImg);
      editorCanvas.renderAll();

      // Сохраняем изменения
      const json = editorCanvas.toJSON();
      useProjectStore.getState().setCanvasJSON(json);

      // Завершаем режим обрезки ПОСЛЕ создания нового изображения
      setCropRect(null);
      setIsCropping(false);
    }).catch((error) => {
      console.error('Ошибка при обрезке изображения:', error);
      alert('Не удалось обрезать изображение');
      exitCropMode();
    });
  };

  const exitCropMode = () => {
    if (!editorCanvas) return;

    if (cropRect) {
      editorCanvas.remove(cropRect);
      setCropRect(null);
    }

    setIsCropping(false);
    editorCanvas.renderAll();
  };

  if (!isImage) {
    return null;
  }

  return (
    <div className="p-4 border-b border-gray-200">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Обрезка изображения
      </h4>

      {!isCropping ? (
        <button
          onClick={enterCropMode}
          className="w-full px-3 py-2 bg-blue-50 hover:bg-blue-100 rounded-lg text-sm text-blue-700 transition-colors"
        >
          ✂️ Обрезать изображение
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-600">
            Измените размер и положение рамки обрезки, затем нажмите "Применить"
          </p>
          <div className="flex gap-2">
            <button
              onClick={applyCrop}
              className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm text-white transition-colors"
            >
              ✓ Применить
            </button>
            <button
              onClick={exitCropMode}
              className="flex-1 px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm text-gray-700 transition-colors"
            >
              ✕ Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
