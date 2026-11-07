/**
 * Плотность растрового превью PDF на холсте редактора.
 *
 * Превью вставленного PDF всегда растр (fabric не рисует страницу векторно),
 * поэтому его битмап должен быть не реже экрана: базовые координаты сцены —
 * 96 dpi, реальная плотность на экране = 96 · зум · devicePixelRatio.
 * Ниже 288 dpi превью мылит уже на дефолтном зуме 200%.
 *
 * Верхняя граница задаётся не только разумным максимумом (1200 dpi), но и
 * бюджетом памяти: страница A4 при 900 dpi — это 78 Мпикс (≈300 МБ RGBA) и
 * гарантированный подвис браузера. Поэтому для крупных страниц плотность
 * подрезается под MAX_PREVIEW_PIXELS.
 */

export const PREVIEW_DPI_MIN = 288;
export const PREVIEW_DPI_MAX = 1200;

/** Бюджет на один битмап превью: 24 Мпикс ≈ 96 МБ RGBA. */
const MAX_PREVIEW_PIXELS = 24_000_000;

function screenDpr(): number {
  return typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
}

/**
 * @param zoom — зум редактора (1 = 96 dpi сцены, 10 — максимум)
 * @param pageWidthMm — ширина страницы PDF; без неё действует только общий потолок
 * @param pageHeightMm — высота страницы PDF
 */
export function previewDpiFor(
  zoom: number = 1,
  pageWidthMm?: number,
  pageHeightMm?: number
): number {
  const wanted = 96 * Math.max(zoom, 1) * screenDpr();
  let cap = PREVIEW_DPI_MAX;

  if (pageWidthMm && pageHeightMm) {
    const areaIn2 = (pageWidthMm / 25.4) * (pageHeightMm / 25.4);
    if (areaIn2 > 0) {
      cap = Math.min(cap, Math.sqrt(MAX_PREVIEW_PIXELS / areaIn2));
    }
  }

  return Math.round(Math.max(PREVIEW_DPI_MIN, Math.min(wanted, cap)));
}
