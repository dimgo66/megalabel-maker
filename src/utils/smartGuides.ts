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

function getBounds(obj: FabricObject): ObjectBounds {
  const rect = obj.getBoundingRect();
  return {
    left: rect.left,
    top: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    centerX: rect.left + rect.width / 2,
    centerY: rect.top + rect.height / 2,
  };
}

export interface SnapResult {
  guides: GuideLine[];
  deltaX: number;
  deltaY: number;
}

/**
 * Вычисляет направляющие и snap-смещение для перемещаемого объекта.
 *
 * @param canvas  Fabric canvas
 * @param moving  Объект, который перемещается
 * @returns Список видимых направляющих и предлагаемое snap-смещение (delta в px холста)
 */
export function calcSnapGuides(canvas: Canvas, moving: FabricObject): SnapResult {
  const zoom = canvas.getZoom();
  const canvasW = (canvas.width ?? 0) / zoom;
  const canvasH = (canvas.height ?? 0) / zoom;
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

  // Ищем ближайший snap по X
  let bestDX = Infinity;
  let snapX: number | null = null;
  for (const src of snapXSources) {
    for (const pt of mxPoints) {
      const d = src - pt;
      if (Math.abs(d) < threshold && Math.abs(d) < Math.abs(bestDX)) {
        bestDX = d;
        snapX = src;
      }
    }
  }

  // Ищем ближайший snap по Y
  let bestDY = Infinity;
  let snapY: number | null = null;
  for (const src of snapYSources) {
    for (const pt of myPoints) {
      const d = src - pt;
      if (Math.abs(d) < threshold && Math.abs(d) < Math.abs(bestDY)) {
        bestDY = d;
        snapY = src;
      }
    }
  }

  const guides: GuideLine[] = [];
  if (snapX !== null) guides.push({ orientation: 'v', pos: snapX });
  if (snapY !== null) guides.push({ orientation: 'h', pos: snapY });

  return {
    guides,
    deltaX: snapX !== null ? bestDX : 0,
    deltaY: snapY !== null ? bestDY : 0,
  };
}
