import { jsPDF } from 'jspdf';
import * as fabric from 'fabric';
import { LabelFormat } from '../types';
import { calculateLayout } from './layoutCalculator';
import { renderLabelAtDpi } from './sheetRenderer';
import { gridPitch } from './layoutCalculator';
import { renderSheetSignature } from './sheetSignature';
import { useProjectStore } from '../store/useProjectStore';

export interface ExportConfig {
  format: LabelFormat;
  editorCanvas: fabric.Canvas;
  dpi: number;
  orientation: 'portrait' | 'landscape';
}

/** Растровый лист A4 (превью, печать через браузер, fallback). Штрих-коды входят в растр. */
export async function composeSheetCanvas(
  cfg: ExportConfig,
  screenDpi: number = 96
): Promise<HTMLCanvasElement> {
  const { format, editorCanvas, orientation } = cfg;

  const sheetW_mm = orientation === 'portrait' ? 210 : 297;
  const sheetH_mm = orientation === 'portrait' ? 297 : 210;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round((sheetW_mm / 25.4) * screenDpi);
  canvas.height = Math.round((sheetH_mm / 25.4) * screenDpi);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Не удалось получить контекст canvas');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const layout = calculateLayout(format, orientation);

  // Растр одной этикетки в разрешении листа (не выше 1200 DPI)
  const img = new Image();
  img.src = await renderLabelAtDpi(editorCanvas, format, Math.min(Math.max(screenDpi, 96), 1200));
  await img.decode();

  const k = screenDpi / 25.4; // px на мм
  const { pitchX_mm, pitchY_mm } = gridPitch(format, layout);
  let index = 0;
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      if (index++ >= format.count) break;
      // позиция ячейки в мм от края листа: поле + шаг × индекс
      const x = (layout.marginLeft_mm + col * pitchX_mm) * k;
      const y = (layout.marginTop_mm + row * pitchY_mm) * k;
      const w = layout.cellWidth_mm * k;
      const h = layout.cellHeight_mm * k;

      if (format.shape === 'circle') {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, x, y, w, h);
        ctx.restore();
      } else {
        ctx.drawImage(img, x, y, w, h);
      }
    }
  }

  // Вертикальная подпись названия проекта на свободном месте листа
  // (только для шаблона на 85 этикеток). Не попадает на ячейки и в край листа.
  const signature = await renderSheetSignature(
    useProjectStore.getState().projectName,
    format,
    layout,
    orientation,
    screenDpi
  );
  if (signature) {
    const { leftMm, topMm, widthMm, heightMm } = signature.placement;
    ctx.drawImage(
      signature.canvas,
      leftMm * k,
      topMm * k,
      widthMm * k,
      heightMm * k
    );
  }

  return canvas;
}

/** Векторный PDF; при ошибке — растровый лист 600 DPI */
export async function exportWithFallback(cfg: ExportConfig): Promise<{
  pdfBytes: Uint8Array;
  isVector: boolean;
  error?: string;
}> {
  try {
    const { exportToVectorPDF } = await import('./vectorExporter');
    return { pdfBytes: await exportToVectorPDF(cfg), isVector: true };
  } catch (error) {
    console.error('VECTOR PATH FAILED, fallback to raster', error);

    const { orientation } = cfg;
    const pageW = orientation === 'portrait' ? 210 : 297;
    const pageH = orientation === 'portrait' ? 297 : 210;
    const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true });
    const sheet = await composeSheetCanvas(cfg, 600);
    pdf.addImage(sheet.toDataURL('image/png'), 'PNG', 0, 0, pageW, pageH);

    return {
      pdfBytes: new Uint8Array(pdf.output('arraybuffer')),
      isVector: false,
      error: error instanceof Error ? error.message : 'Неизвестная ошибка',
    };
  }
}
