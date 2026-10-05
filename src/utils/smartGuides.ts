/**
 * Динамические направляющие (Smart Guides / Snapping).
 *
 * При перемещении объекта показываем линии выравнивания:
 *  - по центру холста (горизонталь и вертикаль)
 *  - по левому/правому/верхнему/нижнему краям холста
 *  - по центрам и краям других объектов
 *
 * Snap-притяжение: когда объект приближается к линии ближе SNAP_THRESHOLD пикселей,
 * он «прилипает» точно к линии.
 */

import type { Canvas, FabricObject } from 'fabric';
import { sceneWidth, sceneHeight } from './canvasHelpers';

/** Порог прилипания в экранных пикселях */
const SNAP_THRESHOLD = 8;

export interface GuideLine {
  /** 'h' — горизонтальная линия (y = pos), 'v' — вертикальная (x = pos) */
  orientation: 'h' | 'v';
  /** Координата линии в пикселях холста (до zoom) */
  pos: number;
}

interface ObjectBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

/**
 * Свежие границы объекта в координатах сцены.
 *
 * Почему не `getBoundingRect()`. Он читает кэш `aCoords`, а fabric поднимает
 * `object:moving` ВНУТРИ `dragHandler` — до того, как `_performTransformAction`
 * вызовет `target.setCoords()`. Значит в обработчике кэш описывает позицию
 * ПРЕДЫДУЩЕГО кадра, и решение о прилипании принимается по устаревшей позиции:
 * объект прыгает к направляющей, посчитанной от старого места, на следующем
 * кадре «передумывает» и возвращается назад. Это и есть дёрганье.
 *
 * `calcACoords()` считает координаты из текущих left/top/angle и кэш не трогает.
 * `getCoords()` устроен ровно так же (`this.aCoords || calcACoords()`), поэтому
 * при свежем кэше результат совпадает с `getBoundingRect()` до пикселя —
 * меняется только актуальность, не геометрия.
 */
function getBounds(obj: FabricObject): ObjectBounds {
  const c = obj.calcACoords();
  const xs = [c.tl.x, c.tr.x, c.br.x, c.bl.x];
  const ys = [c.tl.y, c.tr.y, c.br.y, c.bl.y];
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return {
    left,
    top,
    right,
    bottom,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  };
}

export interface SnapResult {
  guides: GuideLine[];
  deltaX: number;
  deltaY: number;
}

/**
 * Ближайший источник выравнивания по одной оси.
 * @returns смещение к источнику и сам источник, либо null — ничего в пороге
 */
function nearestSnap(
  sources: number[],
  points: number[],
  threshold: number
): { delta: number; pos: number } | null {
  let bestDelta = Infinity;
  let bestPos = 0;
  for (const src of sources) {
    for (const pt of points) {
      const d = src - pt;
      const abs = Math.abs(d);
      if (abs < threshold && abs < Math.abs(bestDelta)) {
        bestDelta = d;
        bestPos = src;
      }
    }
  }
  return bestDelta === Infinity ? null : { delta: bestDelta, pos: bestPos };
}

/**
 * Вычисляет направляющие и snap-смещение для перемещаемого объекта.
 *
 * @param canvas  Fabric canvas
 * @param moving  Объект, который перемещается
 * @returns Список видимых направляющих и предлагаемое snap-смещение (delta в px холста)
 */
export function calcSnapGuides(canvas: Canvas, moving: FabricObject): SnapResult {
  const zoom = canvas.getZoom() || 1;
  // Размер сцены берём тем же способом, что и остальной код проекта: при
  // не-единичном viewportTransform деление canvas.width на зум даёт неверную
  // геометрию, и направляющие по краям холста встают мимо.
  const canvasW = sceneWidth(canvas);
  const canvasH = sceneHeight(canvas);
  const threshold = SNAP_THRESHOLD / zoom; // перевод в координаты холста

  const movingB = getBounds(moving);

  /** Ключевые X-точки перемещаемого объекта */
  const mxPoints = [movingB.left, movingB.centerX, movingB.right];
  /** Ключевые Y-точки перемещаемого объекта */
  const myPoints = [movingB.top, movingB.centerY, movingB.bottom];

  /** Источники snap по X: left/center/right холста + те же точки других объектов */
  const snapXSources: number[] = [0, canvasW / 2, canvasW];
  /** Источники snap по Y */
  const snapYSources: number[] = [0, canvasH / 2, canvasH];

  // Добавляем края/центры других объектов
  const others = canvas.getObjects().filter(o => o !== moving && o.visible !== false);
  for (const obj of others) {
    const b = getBounds(obj);
    snapXSources.push(b.left, b.centerX, b.right);
    snapYSources.push(b.top, b.centerY, b.bottom);
  }

  const snapX = nearestSnap(snapXSources, mxPoints, threshold);
  const snapY = nearestSnap(snapYSources, myPoints, threshold);

  const guides: GuideLine[] = [];
  if (snapX) guides.push({ orientation: 'v', pos: snapX.pos });
  if (snapY) guides.push({ orientation: 'h', pos: snapY.pos });

  return {
    guides,
    deltaX: snapX ? snapX.delta : 0,
    deltaY: snapY ? snapY.delta : 0,
  };
}

/**
 * Совпадают ли два набора направляющих.
 *
 * Нужно, чтобы не дёргать React-рендер на каждом кадре перетаскивания: пока
 * объект едет внутри одной зоны прилипания, набор направляющих не меняется, и
 * новый массив в состоянии означал бы лишний ре-рендер SVG шестьдесят раз в
 * секунду — ровно там, где важна плавность.
 */
export function sameGuides(a: GuideLine[], b: GuideLine[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].orientation !== b[i].orientation || a[i].pos !== b[i].pos) return false;
  }
  return true;
}
