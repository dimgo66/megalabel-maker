import { useEffect, useState } from 'react';
import * as fabric from 'fabric';
import { useProjectStore } from '../store/useProjectStore';
import { CollapsibleSection } from './CollapsibleSection';
import {
  ArrowDown,
  ArrowUp,
  BarcodeIcon,
  Clipboard,
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

  /**
   * Полная пересборка списка слоёв — единственная точка входа.
   * Нужна там, где fabric не генерирует событие (смена z-порядка), а также
   * как обработчик событий холста.
   *
   * Не заменяет точечные `setLayers(prev => prev.map(...))` для видимости и
   * замка: те меняют одно поле у одного слоя и пересборкой были бы лишней
   * работой с потерей ссылок на объекты.
   */
  const syncLayers = (c: fabric.Canvas | null) => {
    if (!c) return;
    setLayers(buildLayers(c));
  };

  useEffect(() => {
    if (!canvas) return;

    const updateLayers = () => syncLayers(canvas);

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
    syncLayers(canvas);
  };

  const handleMoveDown = (layer: LayerItem) => {
    if (!canvas) return;
    canvas.sendObjectBackwards(layer.object);
    canvas.renderAll();
    syncLayers(canvas);
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

  // Слои спрятаны в раскрывающуюся секцию: список занимал всю высоту панели и
  // вытеснял свойства объекта. Бейдж с числом остаётся видимым и в свёрнутом
  // виде, поэтому о содержимом листа известно без раскрытия.
  return (
    <CollapsibleSection
      title="Слои"
      icon={<Clipboard size={16} />}
      badge={<span className="type-meta font-normal">{layers.length}</span>}
      className="border-b border-gray-200"
      contentClassName="px-4 pb-4"
    >
      {layers.length === 0 ? (
        <div className="type-meta text-center py-3 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          Чистый лист
        </div>
      ) : (
        <div className="space-y-0.5">
          {layers.map((layer, i) => {
            const isSelected = selectedObject === layer.object;
            return (
              <div
                key={i}
                onClick={() => handleLayerClick(layer)}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-blue-50 border border-blue-400 shadow-sm'
                    : 'bg-gray-50 hover:bg-gray-100 border border-transparent'
                }`}
              >
                {/* Цветной индикатор выделения */}
                <div
                  className={`w-1 h-4 rounded-full shrink-0 transition-colors ${
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
                    return <TypeGlyph size={13} />;
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

                {/* Кнопки управления.
                    Высота строки ужата по требованию: было py-1.5 и кнопки
                    24px (≈34px на строку), стало py-1 и кнопки 20px (≈28px).
                    Тач-цель кнопок теперь меньше рекомендованных 24px — это
                    осознанный размен: вся строка кликабельна (выделяет слой),
                    у каждой кнопки есть title и aria-label. Имя слоя при этом
                    не страдает: кнопки вернулись к 20px, как было до UI-полировки. */}
                <div className="flex items-center gap-0 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); handleMoveUp(layer); }}
                    className="w-5 h-5 flex items-center justify-center hover:bg-gray-200 rounded text-gray-500"
                    title="Переместить вверх"
                    aria-label={`Переместить «${layer.name}» вверх`}
                  ><ArrowUp size={11} /></button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleMoveDown(layer); }}
                    className="w-5 h-5 flex items-center justify-center hover:bg-gray-200 rounded text-gray-500"
                    title="Переместить вниз"
                    aria-label={`Переместить «${layer.name}» вниз`}
                  ><ArrowDown size={11} /></button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggleVisibility(layer); }}
                    className={`w-5 h-5 flex items-center justify-center rounded ${
                      layer.visible ? 'hover:bg-gray-200 text-gray-600' : 'bg-gray-200 text-gray-600'
                    }`}
                    title={layer.visible ? 'Скрыть' : 'Показать'}
                    aria-label={layer.visible ? `Скрыть «${layer.name}»` : `Показать «${layer.name}»`}
                  >
                    {layer.visible ? <Eye size={11} /> : <EyeOff size={11} />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggleLock(layer); }}
                    className={`w-5 h-5 flex items-center justify-center rounded ${
                      layer.locked ? 'bg-amber-100 text-amber-800' : 'hover:bg-gray-200 text-gray-500'
                    }`}
                    title={layer.locked ? 'Разблокировать' : 'Заблокировать'}
                    aria-label={layer.locked ? `Разблокировать «${layer.name}»` : `Заблокировать «${layer.name}»`}
                  >
                    {layer.locked ? <Lock size={11} /> : <Unlock size={11} />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(layer); }}
                    className="w-5 h-5 flex items-center justify-center hover:bg-red-100 rounded text-gray-500 hover:text-red-700"
                    title="Удалить"
                    aria-label={`Удалить «${layer.name}»`}
                  ><X size={11} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </CollapsibleSection>
  );
}
