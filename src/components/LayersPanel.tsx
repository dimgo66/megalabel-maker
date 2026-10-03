import { useEffect, useState } from 'react';
import * as fabric from 'fabric';
import { useProjectStore } from '../store/useProjectStore';
import {
  ArrowDown,
  ArrowUp,
  BarcodeIcon,
  Eye,
  EyeOff,
  ImageIcon,
  Lock,
  Package,
  Square,
  Type as TypeIcon,
  Unlock,
  X,
} from './icons';

interface LayersPanelProps {
  canvas: fabric.Canvas | null;
}

interface LayerItem {
  index: number;      // индекс в canvas.getObjects()
  name: string;
  type: 'text' | 'image' | 'group' | 'other';
  visible: boolean;
  locked: boolean;
  object: fabric.FabricObject;
}

export function LayersPanel({ canvas }: LayersPanelProps) {
  const [layers, setLayers] = useState<LayerItem[]>([]);

  // selectedObject из store — прямая ссылка на fabric-объект
  const selectedObject = useProjectStore((s) => s.selectedObject);

  /** Перестраивает список слоёв по текущему состоянию холста */
  const buildLayers = (c: fabric.Canvas): LayerItem[] => {
    return [...c.getObjects()]
      .reverse()
      .map((obj, revIdx) => ({
        index: revIdx,
        name: (obj as any).name || getDefaultName(obj, c.getObjects().indexOf(obj)),
        type: getObjectType(obj),
        visible: obj.visible !== false,
        locked: (obj as any).locked || false,
        object: obj,
      }));
  };

  useEffect(() => {
    if (!canvas) return;

    const updateLayers = () => setLayers(buildLayers(canvas));

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
      group: 'Штрих-код',
      other: 'Объект',
    };
    return `${typeNames[type] || 'Объект'} ${index + 1}`;
  };

  const getObjectType = (obj: fabric.FabricObject): 'text' | 'image' | 'group' | 'other' => {
    if (obj instanceof fabric.IText || obj instanceof fabric.Textbox) return 'text';
    if (obj instanceof fabric.FabricImage) return 'image';
    if (obj instanceof fabric.Group) return 'group';
    return 'other';
  };

  // Иконка типа объекта. Возвращает компонент (не строку-глиф): раньше здесь
  // были 𝐓 / 🖼 / ▣ / ◉ / ▦ — символы из разных блоков Unicode, разной
  // толщины и без общей метрики. Теперь один набор 24×24 с обводкой 2.
  const getTypeIcon = (type: string, obj: fabric.FabricObject) => {
    // Штрих-код — группа с barcodeValue
    if (type === 'group' && (obj as any).barcodeValue) return BarcodeIcon;
    const map: Record<string, typeof Square> = {
      text: TypeIcon,
      image: ImageIcon,
      group: Package,
      other: Square,
    };
    return map[type] || Square;
  };

  const handleLayerClick = (layer: LayerItem) => {
    if (!canvas) return;
    canvas.setActiveObject(layer.object);
    canvas.renderAll();
    useProjectStore.getState().setSelectedObject(layer.object);
  };

  const handleMoveUp = (layer: LayerItem) => {
    if (!canvas) return;
    canvas.bringObjectForward(layer.object);
    canvas.renderAll();
    // fabric не генерирует событие при смене z-порядка — обновляем вручную
    setLayers(buildLayers(canvas));
  };

  const handleMoveDown = (layer: LayerItem) => {
    if (!canvas) return;
    canvas.sendObjectBackwards(layer.object);
    canvas.renderAll();
    setLayers(buildLayers(canvas));
  };

  const handleToggleVisibility = (layer: LayerItem) => {
    if (!canvas) return;
    layer.object.set('visible', !layer.visible);
    canvas.renderAll();
    // Форсируем ре-рендер панели
    setLayers((prev) =>
      prev.map((l) =>
        l.object === layer.object ? { ...l, visible: !layer.visible } : l
      )
    );
  };

  const handleToggleLock = (layer: LayerItem) => {
    if (!canvas) return;
    const isLocked = !(layer.object as any).locked;
    (layer.object as any).locked = isLocked;
    layer.object.set({
      selectable: !isLocked,
      evented: !isLocked,
      hasControls: !isLocked,
    });
    canvas.renderAll();
    setLayers((prev) =>
      prev.map((l) =>
        l.object === layer.object ? { ...l, locked: isLocked } : l
      )
    );
  };

  const handleDelete = (layer: LayerItem) => {
    if (!canvas) return;
    canvas.remove(layer.object);
    canvas.renderAll();
  };

  if (layers.length === 0) {
    return (
      <div className="p-4 border-b border-gray-200 text-center text-gray-500 text-sm">
        Нет объектов на канвасе
      </div>
    );
  }

  return (
    <div className="p-3 border-b border-gray-200">
      <h4 className="type-group mb-2">
        Слои ({layers.length})
      </h4>
      <div className="space-y-1">
        {layers.map((layer, i) => {
          const isSelected = selectedObject === layer.object;
          return (
            <div
              key={i}
              onClick={() => handleLayerClick(layer)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all ${
                isSelected
                  ? 'bg-blue-50 border border-blue-400 shadow-sm'
                  : 'bg-gray-50 hover:bg-gray-100 border border-transparent'
              }`}
            >
              {/* Цветной индикатор выделения */}
              <div
                className={`w-1.5 h-5 rounded-full shrink-0 transition-colors ${
                  isSelected ? 'bg-blue-500' : 'bg-gray-200'
                }`}
              />

              {/* Иконка типа. Убран font-mono: он подбирался под символьные
                  глифы, а SVG-иконке моноширинный шрифт не нужен. */}
              <span
                className={`w-4 flex items-center justify-center shrink-0 ${
                  isSelected ? 'text-blue-700' : 'text-gray-500'
                }`}
              >
                {(() => {
                  const TypeGlyph = getTypeIcon(layer.type, layer.object);
                  return <TypeGlyph size={14} />;
                })()}
              </span>

              {/* Название */}
              <span
                className={`flex-1 text-xs truncate ${
                  isSelected ? 'text-blue-800 font-semibold' : 'text-gray-700'
                } ${!layer.visible ? 'opacity-40 line-through' : ''}`}
              >
                {layer.name}
              </span>

              {/* Кнопки управления */}
              <div className="flex items-center gap-0.5 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); handleMoveUp(layer); }}
                  className="w-5 h-5 flex items-center justify-center hover:bg-gray-200 rounded text-gray-500"
                  title="Переместить вверх"
                  aria-label={`Переместить «${layer.name}» вверх`}
                ><ArrowUp size={12} /></button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleMoveDown(layer); }}
                  className="w-5 h-5 flex items-center justify-center hover:bg-gray-200 rounded text-gray-500"
                  title="Переместить вниз"
                  aria-label={`Переместить «${layer.name}» вниз`}
                ><ArrowDown size={12} /></button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggleVisibility(layer); }}
                  className={`w-5 h-5 flex items-center justify-center rounded ${
                    layer.visible ? 'hover:bg-gray-200 text-gray-600' : 'bg-gray-200 text-gray-600'
                  }`}
                  title={layer.visible ? 'Скрыть' : 'Показать'}
                  aria-label={layer.visible ? `Скрыть «${layer.name}»` : `Показать «${layer.name}»`}
                >
                  {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggleLock(layer); }}
                  className={`w-5 h-5 flex items-center justify-center rounded ${
                    layer.locked ? 'bg-amber-100 text-amber-800' : 'hover:bg-gray-200 text-gray-500'
                  }`}
                  title={layer.locked ? 'Разблокировать' : 'Заблокировать'}
                  aria-label={layer.locked ? `Разблокировать «${layer.name}»` : `Заблокировать «${layer.name}»`}
                >
                  {layer.locked ? <Lock size={12} /> : <Unlock size={12} />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(layer); }}
                  className="w-5 h-5 flex items-center justify-center hover:bg-red-100 rounded text-gray-500 hover:text-red-700"
                  title="Удалить"
                  aria-label={`Удалить «${layer.name}»`}
                ><X size={12} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
