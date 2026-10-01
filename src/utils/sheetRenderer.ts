import * as fabric from 'fabric';
import { LabelFormat } from '../types';
import { mmToPx } from './layoutCalculator';
import { isEditorOnly, withHidden } from './canvasHelpers';

const MAX_PIXELS = 16_000_000; // Safari iOS режет canvas около 16.7 МП
const MAX_SIDE = 16384;

/** Загружает все шрифты, используемые на canvas, и пересчитывает текст */
export async function ensureCanvasFonts(canvas: fabric.Canvas): Promise<void> {
  const fonts = new Set<string>();
  canvas.getObjects().forEach((o: any) => {
    if (o.fontFamily) fonts.add(o.fontFamily);
  });
  await Promise.all(
    Array.from(fonts).map((f) => document.fonts.load(`16px "${f}"`).catch(() => [])
    )
  );
  canvas.getObjects().forEach((o: any) => {
    if (o.fontFamily) {
      o.dirty = true;
      o.initDimensions?.();
    }
  });
}

/**
 * Растровый рендер этикетки на заданном DPI с капом по памяти.
 * Не зависит от зума редактора: размеры берутся из формата, а не из canvas.
 */
export async function renderLabelAtDpi(
  editorCanvas: fabric.Canvas,
  format: LabelFormat,
  targetDpi: number = 300
): Promise<string> {
  await ensureCanvasFonts(editorCanvas);

  const baseW = mmToPx(format.width_mm);
  const baseH = mmToPx(format.height_mm);
  const w_in = format.width_mm / 25.4;
  const h_in = format.height_mm / 25.4;

  let dpi = targetDpi;
  if (w_in * dpi * h_in * dpi > MAX_PIXELS) dpi = Math.floor(Math.sqrt(MAX_PIXELS / (w_in * h_in)));
  if (Math.max(w_in, h_in) * dpi > MAX_SIDE) dpi = Math.floor(MAX_SIDE / Math.max(w_in, h_in));
  if (dpi < targetDpi) console.warn(`DPI снижен ${targetDpi} → ${dpi} (лимит памяти canvas)`);

  const multiplier = (w_in * dpi) / baseW;
  const originalBg = editorCanvas.backgroundColor;
  if (format.shape === 'circle') editorCanvas.backgroundColor = 'transparent';

  try {
    return await withHidden(editorCanvas, isEditorOnly, () =>
      editorCanvas.toDataURL({
        format: 'png',
        multiplier,
        left: 0,
        top: 0,
        width: baseW,
        height: baseH,
        enableRetinaScaling: false,
      })
    );
  } finally {
    editorCanvas.backgroundColor = originalBg;
    editorCanvas.requestRenderAll();
  }
}
