import type { Canvas, FabricObject } from 'fabric';

/** Кастомные свойства, которые обязаны попадать в JSON (toJSON() их теряет) */
export const CUSTOM_PROPS = [
  'name',
  'barcodeNorm',
  'barcodeFormat',
  'barcodeValue',
  'srcPdfId',
  'srcPdfPage',
  'id',
  'locked',
  'barcodeTextYFrac',
  'barcodeFontSizeFrac',
  'barcodeBaseW',
  'barcodeBaseH',
  // Высота текстового фрейма: fabric пересчитывает height из содержимого,
  // поэтому собственная высота рамки хранится отдельным свойством
  'frameHeight',
  // Признак «высота рамки идёт за текстом» (true/отсутствует) против «высоту
  // задал пользователь» (false). Без него обрезка по рамке съедала вставленный
  // текст: сохранённая высота оставалась прежней, а текст под ней рос.
  'frameAutoHeight',
];

/** Сериализация canvas с кастомными свойствами, без служебных объектов */
export const serializeCanvas = (c: Canvas): any => {
  const json = c.toObject(CUSTOM_PROPS);
  json.objects = (json.objects || []).filter(
    (o: any) => o.name !== 'safeArea' && o.name !== 'safetyMargin'
  );
  return json;
};

/** 1 CSS-пиксель = 25.4/96 мм (размер сцены в редакторе при zoom = 1) */
export const MM_PER_PX = 25.4 / 96;
export const PT_PER_MM = 72 / 25.4;

// Пока > 0, события canvas не пишутся в историю (loadFromJSON, undo/redo, миграции)
let historySuspended = 0;
export const isHistorySuspended = () => historySuspended > 0;
export async function withoutHistory<T>(fn: () => Promise<T> | T): Promise<T> {
  historySuspended++;
  try {
    return await fn();
  } finally {
    historySuspended--;
  }
}

/**
 * Временно скрывает объекты по предикату и сбрасывает viewportTransform.
 * Восстановление гарантировано (finally), в том числе при ошибке.
 */
export async function withHidden<T>(
  canvas: Canvas,
  pred: (o: any) => boolean,
  fn: () => Promise<T> | T
): Promise<T> {
  const hid = canvas.getObjects().filter((o: any) => pred(o) && o.visible);
  hid.forEach((o: FabricObject) => o.set('visible', false));
  const vpt = canvas.viewportTransform.slice() as typeof canvas.viewportTransform;
  canvas.viewportTransform = [1, 0, 0, 1, 0, 0];
  canvas.renderAll();
  try {
    return await fn();
  } finally {
    hid.forEach((o: FabricObject) => o.set('visible', true));
    canvas.viewportTransform = vpt;
    canvas.requestRenderAll();
  }
}

/** Служебные объекты редактора, которых не должно быть в экспорте */
export const isEditorOnly = (o: any) => o.name === 'safeArea' || o.name === 'safetyMargin';

/**
 * Заставляет fabric перерисовать текстовый объект после правки посимвольных
 * стилей (`setSelectionStyles`).
 *
 * Зачем: fabric держит отрисованный объект в собственном кэше-канвасе
 * (`objectCaching` по умолчанию включён). `setSelectionStyles` выставляет
 * только `_forceClearCache`, но НЕ `dirty`. Флаг `_forceClearCache` читается
 * внутри `Text.render`, а `render` вызывает пересчёт размеров лишь тогда, когда
 * кэш уже помечен грязным, — получается замкнутый круг: новый стиль в объекте
 * есть, но на холсте остаётся старая картинка до любой посторонней перерисовки
 * (сдвиг, смена выделения, изменение размера окна).
 *
 * Лечится явной инвалидацией кэша. `initDimensions()` заодно пересчитывает
 * метрики: полужирное начертание шире обычного, поэтому ширина строки и
 * переносы обязаны быть пересчитаны, иначе текст поедет после перерисовки.
 */
export function invalidateTextCache(object: FabricObject | null | undefined): void {
  if (!object) return;
  const text = object as unknown as {
    initDimensions?: () => void;
    dirty?: boolean;
  };
  text.initDimensions?.();
  text.dirty = true;
  object.setCoords();
  object.canvas?.requestRenderAll();
}

/** Размер сцены в базовых координатах (не зависит от зума редактора) */
export const sceneWidth = (c: Canvas) => c.getWidth() / (c.getZoom() || 1);
export const sceneHeight = (c: Canvas) => c.getHeight() / (c.getZoom() || 1);
