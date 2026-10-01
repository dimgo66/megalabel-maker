import { useState, useEffect } from 'react';
import * as fabric from 'fabric';
import { useProjectStore } from '../store/useProjectStore';
import { ImageCropEditor } from './ImageCropEditor';
import { serializeCanvas, sceneWidth, sceneHeight } from '../utils/canvasHelpers';

export function ImagePropertiesPanel() {
  const { selectedObject, editorCanvas } = useProjectStore();
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [left, setLeft] = useState(0);
  const [top, setTop] = useState(0);
  const [angle, setAngle] = useState(0);
  const [keepProportions, setKeepProportions] = useState(true);
  const [originalWidth, setOriginalWidth] = useState(0);
  const [originalHeight, setOriginalHeight] = useState(0);
  const [showCropEditor, setShowCropEditor] = useState(false);

  useEffect(() => {
    if (selectedObject && selectedObject instanceof fabric.FabricImage) {
      const img = selectedObject;
      setWidth(Math.round((img.width || 0) * (img.scaleX || 1)));
      setHeight(Math.round((img.height || 0) * (img.scaleY || 1)));
      setLeft(Math.round(img.left || 0));
      setTop(Math.round(img.top || 0));
      setAngle(Math.round(img.angle || 0));
      setOriginalWidth(img.width || 0);
      setOriginalHeight(img.height || 0);
    }
  }, [selectedObject]);

  const updateProperty = (property: string, value: any) => {
    if (!selectedObject || !(selectedObject instanceof fabric.FabricImage)) return;

    const img = selectedObject;
    img.set(property as any, value);
    img.setCoords();
    img.canvas?.renderAll();
    img.fire('modified');
  };

  const handleWidthChange = (newWidth: number) => {
    if (!selectedObject || !(selectedObject instanceof fabric.FabricImage)) return;

    const img = selectedObject;
    const scaleX = newWidth / (img.width || 1);
    
    if (keepProportions) {
      const scaleY = scaleX;
      img.set({ scaleX, scaleY });
      setHeight(Math.round((img.height || 0) * scaleY));
    } else {
      img.set({ scaleX });
    }
    
    setWidth(newWidth);
    img.setCoords();
    img.canvas?.renderAll();
    img.fire('modified');
  };

  const handleHeightChange = (newHeight: number) => {
    if (!selectedObject || !(selectedObject instanceof fabric.FabricImage)) return;

    const img = selectedObject;
    const scaleY = newHeight / (img.height || 1);
    
    if (keepProportions) {
      const scaleX = scaleY;
      img.set({ scaleX, scaleY });
      setWidth(Math.round((img.width || 0) * scaleX));
    } else {
      img.set({ scaleY });
    }
    
    setHeight(newHeight);
    img.setCoords();
    img.canvas?.renderAll();
    img.fire('modified');
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

  const handleSetAsBackground = () => {
    if (!selectedObject || !(selectedObject instanceof fabric.FabricImage)) return;

    const img = selectedObject;
    const canvas = img.canvas;
    if (!canvas) return;

    // Масштабируем на весь размер канваса
    const canvasWidth = sceneWidth(canvas);
    const canvasHeight = sceneHeight(canvas);
    const imgWidth = img.width || 1;
    const imgHeight = img.height || 1;

    const scaleX = canvasWidth / imgWidth;
    const scaleY = canvasHeight / imgHeight;
    const scale = Math.max(scaleX, scaleY);

    img.set({
      scaleX: scale,
      scaleY: scale,
      left: canvasWidth / 2,
      top: canvasHeight / 2,
      originX: 'center',
      originY: 'center'
    });

    // Перемещаем на задний план
    canvas.sendObjectToBack(img);
    img.setCoords();
    canvas.renderAll();
    img.fire('modified');
  };

  const handleDelete = () => {
    if (!selectedObject) return;
    const canvas = selectedObject.canvas;
    if (!canvas) return;

    canvas.remove(selectedObject);
    canvas.renderAll();
  };

  if (!selectedObject || !(selectedObject instanceof fabric.FabricImage)) {
    return null;
  }

  return (
    <>
    <div className="p-4 border-b border-gray-200">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Изображение
      </h4>

      <div className="space-y-4">
        {/* Размер */}
        <div>
          <label className="block text-xs text-gray-600 mb-2">Размер (px)</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ширина</label>
              <input
                type="number"
                value={width}
                onChange={(e) => handleWidthChange(Number(e.target.value))}
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Высота</label>
              <input
                type="number"
                value={height}
                onChange={(e) => handleHeightChange(Number(e.target.value))}
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 mt-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={keepProportions}
              onChange={(e) => setKeepProportions(e.target.checked)}
              className="rounded"
            />
            Сохранять пропорции
          </label>
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

        {/* Информация */}
        <div className="text-xs text-gray-500 space-y-1">
          <div>Исходный размер: {originalWidth} × {originalHeight} px</div>
        </div>

        {/* Действия */}
        <div className="space-y-2">
          <button
            onClick={() => setShowCropEditor(true)}
            className="w-full px-3 py-2 bg-blue-50 hover:bg-blue-100 rounded-lg text-sm text-blue-700 transition-colors"
          >
            ✂️ Обрезать изображение
          </button>
          <button
            onClick={handleSetAsBackground}
            className="w-full px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors"
          >
            Установить как фон
          </button>
          <button
            onClick={handleDelete}
            className="w-full px-3 py-2 bg-red-50 hover:bg-red-100 rounded-lg text-sm text-red-700 transition-colors"
          >
            Удалить изображение
          </button>
        </div>
      </div>
    </div>

    {/* Редактор обрезки */}
    {showCropEditor && selectedObject instanceof fabric.FabricImage && editorCanvas && (
      <ImageCropEditor
        image={selectedObject}
        canvas={editorCanvas}
        onApply={(cropped) => {
          setShowCropEditor(false);
          // Сохраняем изменения в store
          const json = serializeCanvas(editorCanvas);
          useProjectStore.getState().setCanvasJSON(json);
        }}
        onCancel={() => setShowCropEditor(false)}
      />
    )}
    </>
  );
}
