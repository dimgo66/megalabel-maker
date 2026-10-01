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

/** Размер сцены в базовых координатах (не зависит от зума редактора) */
export const sceneWidth = (c: Canvas) => c.getWidth() / (c.getZoom() || 1);
export const sceneHeight = (c: Canvas) => c.getHeight() / (c.getZoom() || 1);
