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
  // Ждём готовности всех шрифтов
  await document.fonts.ready;

  // Вычисляем желаемые размеры в пикселях
  const wishW_px = (format.width_mm / 25.4) * targetDpi;
  const wishH_px = (format.height_mm / 25.4) * targetDpi;

  // КАП памяти: если изображение превышает 60 мегапикселей, снижаем DPI
  const MAX_PIXELS = 60_000_000; // 60 MP
  let dpi = targetDpi;

  if (wishW_px * wishH_px > MAX_PIXELS) {
    const w_in = format.width_mm / 25.4;
    const h_in = format.height_mm / 25.4;
    dpi = Math.floor(Math.sqrt(MAX_PIXELS / (w_in * h_in)));
    console.warn(
      `${targetDpi} DPI превышает 60MP для формата ${format.id} → снижаем до ${dpi} DPI`
    );
  }

  // Вычисляем множитель для canvas.toDataURL
  const canvasWidthPx = editorCanvas.getWidth();
  const targetWidthPx = (format.width_mm / 25.4) * dpi;
  const multiplier = targetWidthPx / canvasWidthPx;

  // Временно скрываем штрих-коды для рендера растра
  const barcodeObjects: fabric.FabricObject[] = [];
  editorCanvas.getObjects().forEach((obj: any) => {
    if (obj.barcodeNorm) {
      barcodeObjects.push(obj);
      obj.set('visible', false);
    }
  });

  // Для круглых этикеток временно убираем фон
  const originalBg = editorCanvas.backgroundColor;
  if (format.shape === 'circle') {
    editorCanvas.backgroundColor = 'transparent';
  }

  editorCanvas.renderAll();

  // Генерируем dataURL
  const dataURL = editorCanvas.toDataURL({
    format: 'png',
    multiplier,
    left: 0,
    top: 0,
    width: canvasWidthPx,
    height: editorCanvas.getHeight(),
  });

  // Восстанавливаем видимость штрих-кодов
  barcodeObjects.forEach((obj) => {
    obj.set('visible', true);
  });

  // Восстанавливаем фон
  if (format.shape === 'circle') {
    editorCanvas.backgroundColor = originalBg;
  }

  editorCanvas.renderAll();

  return dataURL;
}
