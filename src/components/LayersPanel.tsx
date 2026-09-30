import { useState, useEffect } from 'react';
import * as fabric from 'fabric';

interface LayersPanelProps {
  canvas: fabric.Canvas | null;
}

interface LayerItem {
  id: string;
  name: string;
  type: 'text' | 'image' | 'group' | 'other';
  visible: boolean;
  locked: boolean;
  object: fabric.FabricObject;
}

export function LayersPanel({ canvas }: LayersPanelProps) {
  const [layers, setLayers] = useState<LayerItem[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);

  useEffect(() => {
    if (!canvas) return;

    const updateLayers = () => {
      const objects = canvas.getObjects();
      const newLayers: LayerItem[] = objects.map((obj, index) => {
        const id = (obj as any).id || `obj_${index}`;
        const name = (obj as any).name || getDefaultName(obj, index);
        const type = getObjectType(obj);
        
        return {
          id,
          name,
          type,
          visible: obj.visible !== false,
          locked: (obj as any).locked || false,
          object: obj
        };
      });
      
      setLayers(newLayers.reverse()); // Верхний слой первый
      
      const activeObject = canvas.getActiveObject();
      if (activeObject) {
        setSelectedLayerId((activeObject as any).id || null);
      } else {
        setSelectedLayerId(null);
      }
    };

    updateLayers();

    canvas.on('object:added', updateLayers);
    canvas.on('object:removed', updateLayers);
    canvas.on('object:modified', updateLayers);
    canvas.on('selection:created', updateLayers);
    canvas.on('selection:updated', updateLayers);
    canvas.on('selection:cleared', updateLayers);

    return () => {
      canvas.off('object:added', updateLayers);
      canvas.off('object:removed', updateLayers);
      canvas.off('object:modified', updateLayers);
      canvas.off('selection:created', updateLayers);
      canvas.off('selection:updated', updateLayers);
      canvas.off('selection:cleared', updateLayers);
    };
  }, [canvas]);

  const getDefaultName = (obj: fabric.FabricObject, index: number): string => {
    const type = getObjectType(obj);
    const typeNames: Record<string, string> = {
      text: 'Текст',
      image: 'Изображение',
      group: 'Группа',
      other: 'Объект'
    };
    return `${typeNames[type] || 'Объект'} ${index + 1}`;
  };

  const getObjectType = (obj: fabric.FabricObject): 'text' | 'image' | 'group' | 'other' => {
    if (obj instanceof fabric.IText || obj instanceof fabric.Textbox) {
      return 'text';
    } else if (obj instanceof fabric.FabricImage) {
      return 'image';
    } else if (obj instanceof fabric.Group) {
      return 'group';
    }
    return 'other';
  };

  const getTypeIcon = (type: string): string => {
    const icons: Record<string, string> = {
      text: '📝',
      image: '🖼️',
      group: '📦',
      other: '⚪'
    };
    return icons[type] || '⚪';
  };

  const handleLayerClick = (layer: LayerItem) => {
    if (!canvas) return;
    canvas.setActiveObject(layer.object);
    canvas.renderAll();
    setSelectedLayerId(layer.id);
  };

  const handleMoveUp = (layer: LayerItem) => {
    if (!canvas) return;
    canvas.bringObjectForward(layer.object);
    canvas.renderAll();
  };

  const handleMoveDown = (layer: LayerItem) => {
    if (!canvas) return;
    canvas.sendObjectBackwards(layer.object);
    canvas.renderAll();
  };

  const handleToggleVisibility = (layer: LayerItem) => {
    if (!canvas) return;
    layer.object.set('visible', !layer.visible);
    canvas.renderAll();
  };

  const handleToggleLock = (layer: LayerItem) => {
    if (!canvas) return;
    const isLocked = !(layer.object as any).locked;
    (layer.object as any).locked = isLocked;
    layer.object.set({
      selectable: !isLocked,
      evented: !isLocked,
      hasControls: !isLocked
    });
    canvas.renderAll();
  };

  const handleDelete = (layer: LayerItem) => {
    if (!canvas) return;
    canvas.remove(layer.object);
    canvas.renderAll();
  };

  if (layers.length === 0) {
    return (
      <div className="p-4 text-center text-gray-400 text-sm">
        Нет объектов на канвасе
      </div>
    );
  }

  return (
    <div className="p-4">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Слои ({layers.length})
      </h4>
      <div className="space-y-1">
        {layers.map((layer) => (
          <div
            key={layer.id}
            onClick={() => handleLayerClick(layer)}
            className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
              selectedLayerId === layer.id
                ? 'bg-blue-50 border border-blue-200'
                : 'bg-gray-50 hover:bg-gray-100 border border-transparent'
            }`}
          >
            <span className="text-sm">{getTypeIcon(layer.type)}</span>
            <span className="flex-1 text-sm text-gray-700 truncate">{layer.name}</span>
            
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMoveUp(layer);
                }}
                className="w-6 h-6 flex items-center justify-center text-xs hover:bg-gray-200 rounded"
                title="Переместить вверх"
              >
                ↑
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMoveDown(layer);
                }}
                className="w-6 h-6 flex items-center justify-center text-xs hover:bg-gray-200 rounded"
                title="Переместить вниз"
              >
                ↓
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleVisibility(layer);
                }}
                className={`w-6 h-6 flex items-center justify-center text-xs rounded ${
                  layer.visible ? 'hover:bg-gray-200' : 'bg-gray-300'
                }`}
                title={layer.visible ? 'Скрыть' : 'Показать'}
              >
                {layer.visible ? '👁' : '🚫'}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleLock(layer);
                }}
                className={`w-6 h-6 flex items-center justify-center text-xs rounded ${
                  layer.locked ? 'bg-yellow-100' : 'hover:bg-gray-200'
                }`}
                title={layer.locked ? 'Разблокировать' : 'Заблокировать'}
              >
                {layer.locked ? '🔒' : '🔓'}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(layer);
                }}
                className="w-6 h-6 flex items-center justify-center text-xs hover:bg-red-100 rounded"
                title="Удалить"
              >
                🗑️
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
