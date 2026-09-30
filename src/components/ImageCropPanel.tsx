import { useState } from 'react';
import * as fabric from 'fabric';
import { useProjectStore } from '../store/useProjectStore';
import { ImageCropEditor } from './ImageCropEditor';

export function ImageCropPanel() {
  const { selectedObject, editorCanvas } = useProjectStore();
  const [isCropping, setIsCropping] = useState(false);

  const isImage = selectedObject instanceof fabric.FabricImage;

  if (!isImage || !editorCanvas) {
    return null;
  }

  const handleStartCrop = () => {
    setIsCropping(true);
  };

  const handleApply = (croppedImage: fabric.FabricImage) => {
    console.log('ImageCropPanel: обрезка применена');
    setIsCropping(false);
    
    // Сохраняем изменения в store
    const json = editorCanvas.toJSON();
    useProjectStore.getState().setCanvasJSON(json);
  };

  const handleCancel = () => {
    console.log('ImageCropPanel: обрезка отменена');
    setIsCropping(false);
  };

  return (
    <>
      <div className="p-4 border-b border-gray-200">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Обрезка изображения
        </h4>

        {!isCropping ? (
          <button
            onClick={handleStartCrop}
            className="w-full px-3 py-2 bg-blue-50 hover:bg-blue-100 rounded-lg text-sm text-blue-700 transition-colors"
          >
            ✂️ Обрезать изображение
          </button>
        ) : (
          <div className="text-sm text-gray-600">
            Режим обрезки активен...
          </div>
        )}
      </div>

      {isCropping && (
        <ImageCropEditor
          image={selectedObject as fabric.FabricImage}
          canvas={editorCanvas}
          onApply={handleApply}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}
