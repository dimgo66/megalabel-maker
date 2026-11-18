import type { Canvas, FabricObject } from 'fabric';
import { mmToPx } from './layoutCalculator';

/**
 * Рабочая зона (pasteboard) вокруг этикетки.
 *
 * Холст редактора больше этикетки: вокруг неё есть поле, на котором видны
 * объекты, вышедшие за край, их рамки выделения и ручки. Без такого поля ручки
 * объекта, который больше этикетки, физически не нарисовать и не поймать
 * мышью — fabric рисует контролы только внутри холста.
 *
 * Размер поля считается по фактическому выходу объектов за этикетку: рамка
 * шириной в две этикетки должна быть видна целиком, а не «насколько хватило
 * фиксированного отступа». Пересчёт идёт после правок, а не во время
 * перетаскивания: изменение размеров холста посреди трансформации сдвигает
 * координаты под курсором.
 */

/** Минимальное поле вокруг этикетки, мм — новый объект не упирается в край. */
export const PASTEBOARD_MIN_MM = 8;

/**
 * Запас на ручки и «воздух» сверх выхода объекта: контролы fabric выступают за
 * рамку, и без запаса ручка упирается в край холста. Доля от меньшей стороны
 * этикетки нужна, чтобы поле не было «впритык» и объект можно было тянуть
 * дальше, не дожидаясь пересчёта.
 */
const PASTEBOARD_PAD_PX = 18;
const PASTEBOARD_HEADROOM_RATIO = 0.18;

/**
 * Потолок поля на сторону, CSS px: холст с полем — это пиксели в памяти, и при
 * зуме 1000% лишние 2000 px по каждой стороне уже опасны.
 */
export const PASTEBOARD_MAX_PX = 900;

/**
 * Размер рабочей зоны в CSS-пикселях холста.
 *
 * @param canvas  холст редактора (размеры объектов берутся в координатах сцены)
 * @param labelW  ширина этикетки в координатах сцены
 * @param labelH  высота этикетки в координатах сцены
 * @param zoom    масштаб редактора
 */
export function computePasteboardPx(
  canvas: Canvas,
  labelW: number,
  labelH: number,
  zoom: number
): number {
  let overflow = 0;

  for (const obj of canvas.getObjects() as FabricObject[]) {
    if ((obj as { visible?: boolean }).visible === false) continue;
    const box = obj.getBoundingRect();
    // Выход за каждую из четырёх границ; отрицательные значения — объект внутри.
    overflow = Math.max(
      overflow,
      -box.left,
      box.left + box.width - labelW,
      -box.top,
      box.top + box.height - labelH
    );
  }

  const headroom = Math.max(PASTEBOARD_PAD_PX / Math.max(zoom, 0.01), Math.min(labelW, labelH) * PASTEBOARD_HEADROOM_RATIO);
  const scenePx = Math.max(mmToPx(PASTEBOARD_MIN_MM), Math.max(0, overflow) + headroom);

  // Округление до целого: дробный размер поля даёт полупрозрачные линии сетки
  // и лишние пересчёты при каждом изменении на доли пикселя.
  return Math.min(PASTEBOARD_MAX_PX, Math.round(scenePx * zoom));
}
