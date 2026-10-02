import { PDFDocument, degrees } from 'pdf-lib';
import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import * as fabric from 'fabric';
import { LabelFormat } from '../types';
import { calculateLayout, mmToPx, gridPitch } from './layoutCalculator';
import { renderSheetSignature } from './sheetSignature';
import { useProjectStore } from '../store/useProjectStore';
import { loadLocalFontsFromDB } from './fontLoader';
import { MM_PER_PX, PT_PER_MM, isEditorOnly, withHidden } from './canvasHelpers';
import { ensureCanvasFonts } from './sheetRenderer';
import { EMBEDDED_FONTS, FALLBACK_FAMILY, FontStyleKey } from '../config/embeddedFonts';

interface Placeholder {
  srcPdfId: string;
  srcPdfPage: number;
  x_mm: number;
  y_mm: number;
  w_mm: number;
  h_mm: number;
  angle: number;
}

export interface ExportConfig {
  format: LabelFormat;
  editorCanvas: fabric.Canvas;
  dpi: number;
  orientation: 'portrait' | 'landscape';
}

/* ───────────── Шрифты для PDF (кириллица) ───────────── */

const fontCache = new Map<string, string>(); // url → base64

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function isTrueType(buf: ArrayBuffer): boolean {
  const v = new DataView(buf);
  const tag = v.getUint32(0);
  return tag === 0x00010000 || tag === 0x74727565; // 'true'
}

async function fetchFallbackFont(file: string): Promise<string> {
  const url = `${import.meta.env.BASE_URL}fonts/${file}`;
  const cached = fontCache.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось загрузить шрифт ${file} (${res.status})`);
  const b64 = toBase64(await res.arrayBuffer());
  fontCache.set(url, b64);
  return b64;
}

/**
 * Регистрирует в jsPDF все встроенные в приложение шрифты (Arial, Times New
 * Roman, Roboto и т.д.) и локальные TTF-шрифты пользователя.
 * Возвращает множество зарегистрированных имён семейств.
 */
async function registerPdfFonts(doc: jsPDF): Promise<Set<string>> {
  const registered = new Set<string>();

  for (const font of EMBEDDED_FONTS) {
    for (const style of Object.keys(font.files) as FontStyleKey[]) {
      const file = font.files[style]!;
      const vfsName = `embedded-${font.family.replace(/\s+/g, '')}-${style}.ttf`;
      doc.addFileToVFS(vfsName, await fetchFallbackFont(file));
      doc.addFont(vfsName, font.family, style);
    }
    registered.add(font.family);
  }

  try {
    const locals = await loadLocalFontsFromDB();
    for (const f of locals) {
      if (!f.data || !isTrueType(f.data)) continue; // OTF/CFF jsPDF не умеет
      const style: FontStyleKey =
        f.weight >= 600 ? (f.style === 'italic' ? 'bolditalic' : 'bold') : f.style === 'italic' ? 'italic' : 'normal';
      const file = `local-${f.name}-${f.weight}-${f.style}.ttf`;
      doc.addFileToVFS(file, toBase64(f.data));
      doc.addFont(file, f.name, style);
      registered.add(f.name);
    }
  } catch (e) {
    console.warn('Локальные шрифты недоступны для PDF:', e);
  }
  return registered;
}

/** Подставляет в SVG только зарегистрированные в PDF шрифты */
function mapSvgFonts(svg: string, registered: Set<string>): string {
  return svg.replace(/font-family="([^"]*)"/g, (_m, raw: string) => {
    const first = raw
      .split(',')[0]
      .replace(/&quot;|&#39;|["']/g, '')
      .trim();
    return `font-family="${registered.has(first) ? first : FALLBACK_FAMILY}"`;
  });
}

/* ───────────── Сцена этикетки → одностраничный PDF ───────────── */

async function buildScenePdf(
  cfg: ExportConfig
): Promise<{ bytes: Uint8Array; placeholders: Placeholder[] }> {
  const { format, editorCanvas } = cfg;
  const placeholders: Placeholder[] = [];
  const baseW = mmToPx(format.width_mm);
  const baseH = mmToPx(format.height_mm);

  await ensureCanvasFonts(editorCanvas);

  editorCanvas.getObjects().forEach((obj: any) => {
    if (!obj.srcPdfId || obj.visible === false) return;
    placeholders.push({
      srcPdfId: obj.srcPdfId,
      srcPdfPage: obj.srcPdfPage || 1,
      x_mm: (obj.left || 0) * MM_PER_PX,
      y_mm: (obj.top || 0) * MM_PER_PX,
      w_mm: (obj.width || 0) * (obj.scaleX || 1) * MM_PER_PX,
      h_mm: (obj.height || 0) * (obj.scaleY || 1) * MM_PER_PX,
      angle: obj.angle || 0,
    });
  });

  // Объекты-PDF рисуются отдельно (векторно), поэтому в сцене их скрываем
  const sceneSvg = await withHidden(
    editorCanvas,
    (o) => !!o.srcPdfId || isEditorOnly(o),
    () =>
      editorCanvas.toSVG({
        width: `${baseW}px`,
        height: `${baseH}px`,
        viewBox: { x: 0, y: 0, width: baseW, height: baseH },
      })
  );

  const tmp = new jsPDF({
    unit: 'mm',
    format: [format.width_mm, format.height_mm],
    orientation: format.width_mm > format.height_mm ? 'landscape' : 'portrait',
    compress: true,
  });
  const registered = await registerPdfFonts(tmp);
  const svgText = mapSvgFonts(sceneSvg, registered);

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:10px;height:10px;overflow:hidden';
  document.body.appendChild(host);

  try {
    const svgEl = new DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement;
    if (svgEl.nodeName.toLowerCase() !== 'svg') throw new Error('Некорректный SVG сцены');
    host.appendChild(svgEl);

    if (format.shape === 'circle') {
      const d = Math.min(format.width_mm, format.height_mm);
      tmp.circle(format.width_mm / 2, format.height_mm / 2, d / 2, null as any);
      tmp.clip();
      tmp.discardPath();
    }

    await svg2pdf(svgEl, tmp, { x: 0, y: 0, width: format.width_mm, height: format.height_mm });
  } finally {
    host.remove();
  }

  const bytes = new Uint8Array(tmp.output('arraybuffer'));
  if (bytes.length < 800) throw new Error('Сцена пуста или слишком мала');
  return { bytes, placeholders };
}

/* ───────────── Итоговый лист A4 (векторный) ───────────── */

export async function exportToVectorPDF(cfg: ExportConfig): Promise<Uint8Array> {
  const { format, orientation } = cfg;
  const { pdfSources } = useProjectStore.getState();

  const { bytes: sceneBytes, placeholders } = await buildScenePdf(cfg);

  const pdfDoc = await PDFDocument.create();
  const pageW = orientation === 'portrait' ? 210 : 297; // мм
  const pageH = orientation === 'portrait' ? 297 : 210;
  const page = pdfDoc.addPage([pageW * PT_PER_MM, pageH * PT_PER_MM]); // pdf-lib работает в pt

  const sceneEmb = (await pdfDoc.embedPdf(sceneBytes))[0];
  const expW = format.width_mm * PT_PER_MM;
  const expH = format.height_mm * PT_PER_MM;
  if (Math.abs(sceneEmb.width - expW) > 2 || Math.abs(sceneEmb.height - expH) > 2) {
    throw new Error(
      `Размер сцены ${sceneEmb.width.toFixed(1)}×${sceneEmb.height.toFixed(1)} pt, ожидалось ${expW.toFixed(1)}×${expH.toFixed(1)}`
    );
  }

  // Встраиваем исходные PDF-страницы (один раз на пару id+страница)
  const embCache = new Map<string, Awaited<ReturnType<typeof pdfDoc.embedPdf>>[number]>();
  for (const ph of placeholders) {
    const key = `${ph.srcPdfId}|${ph.srcPdfPage}`;
    if (embCache.has(key)) continue;
    const src = pdfSources[ph.srcPdfId];
    if (src) embCache.set(key, (await pdfDoc.embedPdf(src, [ph.srcPdfPage - 1]))[0]);
  }

  const layout = calculateLayout(format, orientation);
  const { pitchX_mm, pitchY_mm } = gridPitch(format, layout);
  let index = 0;
  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      if (index++ >= format.count) break;

      // позиция ячейки в мм от края листа: поле + шаг × индекс
      const x = layout.marginLeft_mm + col * pitchX_mm;
      const y = layout.marginTop_mm + row * pitchY_mm;

      page.drawPage(sceneEmb, {
        x: x * PT_PER_MM,
        y: (pageH - y - layout.cellHeight_mm) * PT_PER_MM,
        width: layout.cellWidth_mm * PT_PER_MM,
        height: layout.cellHeight_mm * PT_PER_MM,
      });

      for (const ph of placeholders) {
        const emb = embCache.get(`${ph.srcPdfId}|${ph.srcPdfPage}`);
        if (!emb) continue;
        // fabric вращает по часовой вокруг левого верхнего угла, pdf-lib — против часовой вокруг левого нижнего
        const th = (ph.angle * Math.PI) / 180;
        const blX = x + ph.x_mm - ph.h_mm * Math.sin(th);
        const blY = y + ph.y_mm + ph.h_mm * Math.cos(th);
        page.drawPage(emb, {
          x: blX * PT_PER_MM,
          y: (pageH - blY) * PT_PER_MM,
          width: ph.w_mm * PT_PER_MM,
          height: ph.h_mm * PT_PER_MM,
          rotate: degrees(-ph.angle),
        });
      }
    }
  }

  // Вертикальная подпись названия проекта на свободном месте листа
  // (только для шаблона на 85 этикеток). Растр 600 DPI с прозрачным фоном
  // поверх векторного листа — визуально совпадает с предпросмотром.
  const signature = await renderSheetSignature(
    useProjectStore.getState().projectName,
    format,
    layout,
    orientation,
    600
  );
  if (signature) {
    const sigPng = await pdfDoc.embedPng(signature.canvas.toDataURL('image/png'));
    const { leftMm, topMm, widthMm, heightMm } = signature.placement;
    page.drawImage(sigPng, {
      x: leftMm * PT_PER_MM,
      y: (pageH - topMm - heightMm) * PT_PER_MM,
      width: widthMm * PT_PER_MM,
      height: heightMm * PT_PER_MM,
    });
  }

  return await pdfDoc.save();
}

/** Проверка наличия исходных PDF для вставок */
export function checkPdfSources(canvas: fabric.Canvas): { missing: string[]; total: number } {
  const { pdfSources } = useProjectStore.getState();
  const ids = new Set<string>();
  canvas.getObjects().forEach((o: any) => o.srcPdfId && ids.add(o.srcPdfId));
  const missing = Array.from(ids).filter((id) => !pdfSources[id]);
  return { missing, total: ids.size };
}
