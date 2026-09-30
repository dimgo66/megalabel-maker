import * as fabric from 'fabric';
import { LabelFormat } from '../types';

/**
 * Рендер этикетки на заданном DPI с автокапом памяти
 * @param editorCanvas - канвас редактора
 * @param format - формат этикетки
 * @param targetDpi - целевой DPI (по умолчанию 1200)
 * @returns dataURL PNG изображения
 */
export async function renderLabelAtDpi(
  editorCanvas: fabric.Canvas,
  format: LabelFormat,
  targetDpi: number = 1200
): Promise<string> {
  // Явная загрузка всех используемых шрифтов
  const usedFonts = new Set<string>();
  editorCanvas.getObjects().forEach((obj: any) => {
    if (obj.fontFamily) usedFonts.add(obj.fontFamily);
    if (obj.type === 'i-text' || obj.type === 'textbox') {
      const fontFamily = obj.fontFamily || 'Arial';
      usedFonts.add(fontFamily);
    }
  });
  
  await Promise.all(
    Array.from(usedFonts).map(f => document.fonts.load(`16px "${f}"`))
  );
  
  // Пересчитываем текст после загрузки шрифтов
  editorCanvas.getObjects().forEach((obj: any) => {
    if (obj.type === 'i-text' || obj.type === 'textbox') {
      obj.dirty = true;
      if (obj.initDimensions) obj.initDimensions();
    }
  });
  editorCanvas.requestRenderAll();

  // Вычисляем желаемые размеры в пикселях
  const wishW_px = (format.width_mm / 25.4) * targetDpi;
  const wishH_px = (format.height_mm / 25.4) * targetDpi;

  // КАП памяти: если изображение превышает 16 мегапикселей, снижаем DPI
  // Safari iOS режет canvas около 16.7 МП
  const MAX_PIXELS = 16_000_000; // 16 MP
  const MAX_SIDE = 16384; // Максимальная сторона canvas
  let dpi = targetDpi;

  if (wishW_px * wishH_px > MAX_PIXELS) {
    const w_in = format.width_mm / 25.4;
    const h_in = format.height_mm / 25.4;
    dpi = Math.floor(Math.sqrt(MAX_PIXELS / (w_in * h_in)));
    console.warn(
      `${targetDpi} DPI превышает 16MP для формата ${format.id} → снижаем до ${dpi} DPI`
    );
  }

  // Дополнительная проверка на максимальную сторону
  const finalW_px = (format.width_mm / 25.4) * dpi;
  const finalH_px = (format.height_mm / 25.4) * dpi;
  if (finalW_px > MAX_SIDE || finalH_px > MAX_SIDE) {
    const scale = MAX_SIDE / Math.max(finalW_px, finalH_px);
    dpi = Math.floor(dpi * scale);
    console.warn(
      `Размер превышает ${MAX_SIDE}px → снижаем DPI до ${dpi}`
    );
  }

  // Вычисляем множитель для canvas.toDataURL
  const canvasWidthPx = editorCanvas.getWidth();
  const targetWidthPx = (format.width_mm / 25.4) * dpi;
  const multiplier = targetWidthPx / canvasWidthPx;

  // Сохраняем viewport transform
  const originalViewportTransform = editorCanvas.viewportTransform;
  editorCanvas.viewportTransform = [1, 0, 0, 1, 0, 0];

  // Собираем объекты для временного скрытия
  const objectsToHide: fabric.FabricObject[] = [];
  const originalStates: Map<fabric.FabricObject, any> = new Map();

  editorCanvas.getObjects().forEach((obj: any) => {
    // Скрываем штрих-коды
    if (obj.barcodeNorm) {
      objectsToHide.push(obj);
      originalStates.set(obj, { visible: obj.visible });
      obj.set('visible', false);
    }
    
    // Скрываем красные зоны безопасных полей (если есть)
    if (obj.name === 'safeArea' || obj.name === 'safetyMargin') {
      objectsToHide.push(obj);
      originalStates.set(obj, { visible: obj.visible });
      obj.set('visible', false);
    }
  });

  // Для круглых этикеток временно убираем фон
  const originalBg = editorCanvas.backgroundColor;
  if (format.shape === 'circle') {
    editorCanvas.backgroundColor = 'transparent';
  }

  editorCanvas.renderAll();

  try {
    // Генерируем dataURL
    const dataURL = editorCanvas.toDataURL({
      format: 'png',
      multiplier,
      left: 0,
      top: 0,
      width: canvasWidthPx,
      height: editorCanvas.getHeight(),
    });

    return dataURL;
  } finally {
    // ВСЕГДА восстанавливаем состояние, даже при ошибке
    objectsToHide.forEach((obj) => {
      const state = originalStates.get(obj);
      if (state) {
        obj.set('visible', state.visible);
      }
    });

    // Восстанавливаем фон
    if (format.shape === 'circle') {
      editorCanvas.backgroundColor = originalBg;
    }

    // Восстанавливаем viewport transform
    editorCanvas.viewportTransform = originalViewportTransform;

    editorCanvas.renderAll();
  }
}
