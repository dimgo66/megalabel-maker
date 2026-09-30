import { PDFDocument, degrees } from 'pdf-lib';
import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import * as fabric from 'fabric';
import { LabelFormat } from '../types';
import { calculateLayout } from './layoutCalculator';
import { useProjectStore } from '../store/useProjectStore';

interface Placeholder {
  srcPdfId: string;
  srcPdfPage: number;
  x_mm: number;
  y_mm: number;
  w_mm: number;
  h_mm: number;
  angle: number;
}

interface ScenePdfResult {
  bytes: Uint8Array;
  placeholders: Placeholder[];
}

export interface ExportConfig {
  format: LabelFormat;
  editorCanvas: fabric.Canvas;
  dpi: number;
  orientation: 'portrait' | 'landscape';
}

/**
 * Нормализация шрифтов в SVG для совместимости с svg2pdf
 */
function normalizeSvgFonts(svgString: string): string {
  return svgString.replace(/font-family="[^"]*"/g, 'font-family="helvetica"');
}

/**
 * Построение временного PDF сцены этикетки
 */
async function buildScenePdf(cfg: ExportConfig): Promise<ScenePdfResult> {
  const { format, editorCanvas } = cfg;
  const placeholders: Placeholder[] = [];
  
  const mmPerPx = format.width_mm / editorCanvas.getWidth();
  
  // 1. Запоминаем и скрываем объекты с srcPdfId
  const pdfObjects: fabric.FabricObject[] = [];
  editorCanvas.getObjects().forEach((obj: any) => {
    if (obj.srcPdfId) {
      pdfObjects.push(obj);
      placeholders.push({
        srcPdfId: obj.srcPdfId,
        srcPdfPage: obj.srcPdfPage || 1,
        x_mm: (obj.left || 0) * mmPerPx,
        y_mm: (obj.top || 0) * mmPerPx,
        w_mm: (obj.width || 0) * (obj.scaleX || 1) * mmPerPx,
        h_mm: (obj.height || 0) * (obj.scaleY || 1) * mmPerPx,
        angle: obj.angle || 0,
      });
      obj.set('visible', false);
    }
  });
  
  editorCanvas.renderAll();
  
  // 2. Экспортируем сцену в SVG
  const sceneSvg = editorCanvas.toSVG();
  const normalizedSvg = normalizeSvgFonts(sceneSvg);
  
  // Preflight проверка
  console.log('SVG length:', normalizedSvg.length);
  if (!/<(rect|text|image|path)/.test(normalizedSvg)) {
    throw new Error('canvas.toSVG() вернул пустую сцену');
  }
  
  // 3. Создаём временный jsPDF размером с ячейку
  const tmp = new jsPDF({
    unit: 'mm',
    format: [format.width_mm, format.height_mm],
  });
  
  // 4. ВАЖНО: Прикрепляем SVG к DOM для корректной работы svg2pdf
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:10px;height:10px;overflow:hidden';
  document.body.appendChild(host);
  
  try {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(normalizedSvg, 'image/svg+xml');
    const svgEl = svgDoc.documentElement;
    
    // Прикрепляем к DOM
    host.appendChild(svgEl);
    
    // Для круглых этикеток создаём клип
    if (format.shape === 'circle') {
      try {
        const w = format.width_mm;
        const h = format.height_mm;
        tmp.circle(w / 2, h / 2, w / 2, 'S');
        tmp.clip();
      } catch (clipError) {
        console.warn('Не удалось создать клип для круглой этикетки, продолжаем без него');
      }
    }
    
    // 5. Конвертируем SVG в PDF через svg2pdf (ОБЯЗАТЕЛЬНО с await!)
    await svg2pdf(svgEl, tmp, {
      x: 0,
      y: 0,
      width: format.width_mm,
      height: format.height_mm,
    });
  } finally {
    // Всегда удаляем хост из DOM
    host.remove();
  }
  
  // 6. Восстанавливаем видимость объектов
  pdfObjects.forEach((obj) => {
    obj.set('visible', true);
  });
  editorCanvas.renderAll();
  
  // 7. Получаем байты временного PDF
  const bytes = new Uint8Array(tmp.output('arraybuffer'));
  
  // Preflight проверка размера
  if (bytes.length < 800) {
    throw new Error('Сцена пуста или слишком мала');
  }
  
  return { bytes, placeholders };
}

/**
 * Экспорт в векторный PDF с использованием pdf-lib
 */
export async function exportToVectorPDF(cfg: ExportConfig): Promise<Uint8Array> {
  const { format, orientation } = cfg;
  const { pdfSources } = useProjectStore.getState();
  
  // 1. Строим сцену этикетки
  const { bytes: sceneBytes, placeholders } = await buildScenePdf(cfg);
  
  // 2. Создаём итоговый PDF документ
  const pdfDoc = await PDFDocument.create();
  
  // Размеры листа A4 (без хардкода!)
  const pageWidth = orientation === 'portrait' ? 210 : 297;
  const pageHeight = orientation === 'portrait' ? 297 : 210;
  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  
  // 3. Встраиваем сцену этикетки
  const sceneEmb = (await pdfDoc.embedPdf(sceneBytes))[0];
  
  // Preflight проверка размеров
  console.log('scene page:', sceneEmb.width, sceneEmb.height);
  const expectedWidthPt = format.width_mm * 2.8346;
  const expectedHeightPt = format.height_mm * 2.8346;
  console.assert(
    Math.abs(sceneEmb.width - expectedWidthPt) < 2,
    `Ширина сцены ${sceneEmb.width} не соответствует ожидаемой ${expectedWidthPt}`
  );
  console.assert(
    Math.abs(sceneEmb.height - expectedHeightPt) < 2,
    `Высота сцены ${sceneEmb.height} не соответствует ожидаемой ${expectedHeightPt}`
  );
  
  // 4. Кэшируем встраивания PDF источников
  const embCache: Record<string, any> = {};
  const uniquePdfIds = new Set(placeholders.map(ph => `${ph.srcPdfId}_${ph.srcPdfPage}`));
  
  for (const key of uniquePdfIds) {
    const [srcPdfId, pageStr] = key.split('_');
    const pageNum = parseInt(pageStr);
    const sourceBytes = pdfSources[srcPdfId];
    
    if (sourceBytes) {
      const emb = (await pdfDoc.embedPdf(sourceBytes, [pageNum - 1]))[0];
      embCache[key] = emb;
    }
  }
  
  // 5. Рассчитываем раскладку и рисуем ячейки с учётом ориентации
  const layout = calculateLayout(format, orientation);
  
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      const cellIndex = row * layout.cols + col;
      if (cellIndex >= format.count) break;
      
      // Позиция ячейки в мм (верхний левый угол)
      const x = layout.marginLeft_mm + col * (layout.cellWidth_mm + layout.gapX_mm);
      const y = layout.marginTop_mm + row * (layout.cellHeight_mm + layout.gapY_mm);
      
      // Preflight проверка первой ячейки
      if (row === 0 && col === 0) {
        const y_pdf = pageHeight - y - layout.cellHeight_mm;
        console.assert(
          x >= 0 && x + layout.cellWidth_mm <= pageWidth,
          `X координата ячейки выходит за пределы страницы: ${x} + ${layout.cellWidth_mm} > ${pageWidth}`
        );
        console.assert(
          y_pdf >= 0 && y_pdf + layout.cellHeight_mm <= pageHeight,
          `Y координата ячейки выходит за пределы страницы: ${y_pdf} + ${layout.cellHeight_mm} > ${pageHeight}`
        );
      }
      
      // Рисуем сцену этикетки в ячейке
      // pdf-lib использует координаты от нижнего левого угла
      page.drawPage(sceneEmb, {
        x,
        y: pageHeight - y - layout.cellHeight_mm,
        width: layout.cellWidth_mm,
        height: layout.cellHeight_mm,
      });
      
      // Рисуем вставки PDF в запомненные позиции
      for (const ph of placeholders) {
        const key = `${ph.srcPdfId}_${ph.srcPdfPage}`;
        const emb = embCache[key];
        
        if (emb) {
          page.drawPage(emb, {
            x: x + ph.x_mm,
            y: pageHeight - (y + ph.y_mm + ph.h_mm),
            width: ph.w_mm,
            height: ph.h_mm,
            rotate: degrees(ph.angle),
          });
        }
      }
    }
  }
  
  // 6. Сохраняем итоговый PDF
  return await pdfDoc.save();
}

/**
 * Проверка наличия всех PDF источников
 */
export function checkPdfSources(canvas: fabric.Canvas): { missing: string[]; total: number } {
  const { pdfSources } = useProjectStore.getState();
  const pdfIds = new Set<string>();
  
  canvas.getObjects().forEach((obj: any) => {
    if (obj.srcPdfId) {
      pdfIds.add(obj.srcPdfId);
    }
  });
  
  const missing: string[] = [];
  pdfIds.forEach(id => {
    if (!pdfSources[id]) {
      missing.push(id);
    }
  });
  
  return { missing: Array.from(missing), total: pdfIds.size };
}
