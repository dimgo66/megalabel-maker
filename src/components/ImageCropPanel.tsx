import { useState, useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { useProjectStore } from '../store/useProjectStore';

export function ImageCropPanel() {
  const { selectedObject, editorCanvas } = useProjectStore();
  const [isCropping, setIsCropping] = useState(false);
  const cropRectRef = useRef<fabric.Rect | null>(null);
  const imageRef = useRef<fabric.FabricImage | null>(null);

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
    
    // Сохраняем ссылку на изображение
    imageRef.current = img;
    
    // Вычисляем размеры изображения с учётом масштаба
    const imgWidth = (img.width || 0) * (img.scaleX || 1);
    const imgHeight = (img.height || 0) * (img.scaleY || 1);
    
    // Создаём прямоугольник обрезки поверх изображения
    const rect = new fabric.Rect({
      left: img.left || 0,
      top: img.top || 0,
      width: imgWidth,
      height: imgHeight,
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

    // Делаем изображение неактивным, чтобы не мешало
    img.selectable = false;
    img.evented = false;

    editorCanvas.add(rect);
    editorCanvas.setActiveObject(rect);
    editorCanvas.renderAll();
    
    cropRectRef.current = rect;
    setIsCropping(true);
  };

  const applyCrop = async () => {
    if (!editorCanvas || !imageRef.current || !cropRectRef.current) {
      console.error('applyCrop: отсутствуют необходимые объекты');
      return;
    }

    const img = imageRef.current;
    const cropRect = cropRectRef.current;
    
    console.log('applyCrop: начинаем обрезку');
    
    // Получаем координаты обрезки
    const cropLeft = cropRect.left || 0;
    const cropTop = cropRect.top || 0;
    const cropWidth = (cropRect.width || 0) * (cropRect.scaleX || 1);
    const cropHeight = (cropRect.height || 0) * (cropRect.scaleY || 1);

    // Вычисляем относительные координаты относительно изображения
    const imgLeft = img.left || 0;
    const imgTop = img.top || 0;
    const imgScaleX = img.scaleX || 1;
    const imgScaleY = img.scaleY || 1;

    const relLeft = (cropLeft - imgLeft) / imgScaleX;
    const relTop = (cropTop - imgTop) / imgScaleY;
    const relWidth = cropWidth / imgScaleX;
    const relHeight = cropHeight / imgScaleY;

    console.log('applyCrop: координаты', { relLeft, relTop, relWidth, relHeight });

    // Создаём временный canvas для обрезки
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    if (!tempCtx) {
      console.error('applyCrop: не удалось получить контекст canvas');
      return;
    }

    tempCanvas.width = relWidth;
    tempCanvas.height = relHeight;

    // Получаем элемент изображения
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
    
    if (!imgElement) {
      console.error('applyCrop: не удалось получить элемент изображения');
      alert('Не удалось получить данные изображения для обрезки');
      return;
    }

    console.log('applyCrop: элемент изображения получен', imgElement);

    // Рисуем обрезанную часть изображения
    try {
      tempCtx.drawImage(
        imgElement,
        relLeft,
        relTop,
        relWidth,
        relHeight,
        0,
        0,
        relWidth,
        relHeight
      );
    } catch (error) {
      console.error('applyCrop: ошибка при рисовании', error);
      alert('Ошибка при обрезке изображения');
      return;
    }

    // Создаём новое изображение из обрезанного canvas
    const croppedDataUrl = tempCanvas.toDataURL('image/png');
    
    console.log('applyCrop: создаём новое изображение');
    
    try {
      const croppedImg = await fabric.FabricImage.fromURL(croppedDataUrl);
      
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

      console.log('applyCrop: обрезка завершена успешно');

      // Завершаем режим обрезки
      cropRectRef.current = null;
      imageRef.current = null;
      setIsCropping(false);
    } catch (error) {
      console.error('applyCrop: ошибка при создании изображения', error);
      alert('Не удалось создать обрезанное изображение');
      exitCropMode();
    }
  };

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

  if (!isImage && !isCropping) {
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
