import { useState, useEffect } from 'react';
import * as fabric from 'fabric';

interface ImageCropEditorProps {
  image: fabric.FabricImage;
  canvas: fabric.Canvas;
  onApply: (croppedImage: fabric.FabricImage) => void;
  onCancel: () => void;
}

export function ImageCropEditor({ image, canvas, onApply, onCancel }: ImageCropEditorProps) {
  const [cropRect, setCropRect] = useState<fabric.Rect | null>(null);

  useEffect(() => {
    // Создать рамку обрезки поверх изображения
    const rect = new fabric.Rect({
      left: image.left || 0,
      top: image.top || 0,
      width: (image.width || 0) * (image.scaleX || 1) * 0.8,
      height: (image.height || 0) * (image.scaleY || 1) * 0.8,
      fill: 'transparent',
      stroke: '#2563EB',
      strokeWidth: 2,
      strokeDashArray: [5, 5],
      cornerColor: '#2563EB',
      cornerSize: 10,
      transparentCorners: false,
      hasRotatingPoint: false,
      lockRotation: true,
    });

    (rect as any).name = 'cropRect';

    // Делаем изображение неактивным
    image.selectable = false;
    image.evented = false;

    canvas.add(rect);
    canvas.setActiveObject(rect);
    canvas.renderAll();
    setCropRect(rect);

    return () => {
      if (rect && canvas) {
        canvas.remove(rect);
      }
      // Восстанавливаем изображение
      if (image) {
        image.selectable = true;
        image.evented = true;
      }
    };
  }, [image, canvas]);

  const handleApply = async () => {
    if (!cropRect) {
      console.error('handleApply: cropRect не определён');
      return;
    }

    console.log('handleApply: начинаем обрезку');

    // Получаем координаты рамки обрезки
    const cropLeft = cropRect.left || 0;
    const cropTop = cropRect.top || 0;
    const cropWidth = (cropRect.width || 0) * (cropRect.scaleX || 1);
    const cropHeight = (cropRect.height || 0) * (cropRect.scaleY || 1);

    // Вычисляем относительные координаты относительно изображения
    const imgLeft = image.left || 0;
    const imgTop = image.top || 0;
    const imgScaleX = image.scaleX || 1;
    const imgScaleY = image.scaleY || 1;

    // Координаты в системе координат исходного изображения (без масштабирования)
    const srcX = (cropLeft - imgLeft) / imgScaleX;
    const srcY = (cropTop - imgTop) / imgScaleY;
    const srcWidth = cropWidth / imgScaleX;
    const srcHeight = cropHeight / imgScaleY;

    console.log('handleApply: координаты обрезки', {
      cropLeft,
      cropTop,
      cropWidth,
      cropHeight,
      srcX,
      srcY,
      srcWidth,
      srcHeight,
    });

    // Проверяем валидность координат
    if (srcWidth <= 0 || srcHeight <= 0) {
      console.error('handleApply: невалидные размеры обрезки');
      alert('Невалидные размеры обрезки');
      return;
    }

    // Создаём canvas для обрезки
    const cropCanvas = document.createElement('canvas');
    const ctx = cropCanvas.getContext('2d');

    if (!ctx) {
      console.error('handleApply: не удалось получить контекст canvas');
      return;
    }

    cropCanvas.width = srcWidth;
    cropCanvas.height = srcHeight;

    // Получаем элемент изображения
    let imgElement: HTMLImageElement | HTMLCanvasElement | null = null;

    // В Fabric.js v6 пробуем разные способы
    if ((image as any)._element) {
      imgElement = (image as any)._element;
      console.log('handleApply: используем _element');
    } else if (typeof (image as any).getElement === 'function') {
      imgElement = (image as any).getElement();
      console.log('handleApply: используем getElement()');
    } else if (typeof (image as any).toCanvasElement === 'function') {
      // Если нет прямого доступа, создаём canvas из изображения
      imgElement = (image as any).toCanvasElement();
      console.log('handleApply: используем toCanvasElement()');
    }

    if (!imgElement) {
      console.error('handleApply: не удалось получить элемент изображения');
      alert('Не удалось получить данные изображения для обрезки');
      return;
    }

    console.log('handleApply: элемент изображения получен', imgElement);

    // Рисуем обрезанную часть
    try {
      ctx.drawImage(
        imgElement,
        srcX,
        srcY,
        srcWidth,
        srcHeight, // исходная область
        0,
        0,
        srcWidth,
        srcHeight // целевая область
      );
    } catch (error) {
      console.error('handleApply: ошибка при рисовании', error);
      alert('Ошибка при обрезке изображения');
      return;
    }

    // Создаём dataURL из обрезанного canvas
    const croppedDataURL = cropCanvas.toDataURL('image/png');
    console.log('handleApply: создаём новое изображение из dataURL');

    try {
      // Загружаем новое изображение
      const croppedImg = await fabric.FabricImage.fromURL(croppedDataURL);

      // Сохраняем кастомные свойства
      const customProps = {
        id: (image as any).id,
        name: (image as any).name,
        visible: image.visible,
      };

      // Удаляем рамку обрезки и старое изображение
      canvas.remove(cropRect);
      canvas.remove(image);

      // Настраиваем новое изображение
      croppedImg.set({
        left: cropLeft,
        top: cropTop,
        scaleX: 1,
        scaleY: 1,
        ...customProps,
      });

      // Добавляем на канвас
      canvas.add(croppedImg);
      canvas.setActiveObject(croppedImg);
      canvas.renderAll();

      console.log('handleApply: обрезка завершена успешно');

      // Вызываем callback
      onApply(croppedImg);
    } catch (error) {
      console.error('handleApply: ошибка при создании изображения', error);
      alert('Не удалось создать обрезанное изображение');
    }
  };

  const handleCancel = () => {
    if (cropRect) {
      canvas.remove(cropRect);
    }
    // Восстанавливаем изображение
    image.selectable = true;
    image.evented = true;
    canvas.renderAll();
    onCancel();
  };

  return (
    <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-white p-4 rounded-lg shadow-xl z-50 border border-gray-200">
      <div className="flex gap-2">
        <button onClick={handleApply} className="btn btn-primary">
          ✓ Применить обрезку
        </button>
        <button onClick={handleCancel} className="btn btn-secondary">
          ✕ Отмена
        </button>
      </div>
      <p className="text-sm text-gray-600 mt-2">
        Перемещайте и изменяйте размер синей рамки для обрезки
      </p>
    </div>
  );
}
