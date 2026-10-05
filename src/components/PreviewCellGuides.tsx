/**
 * Контуры ячеек выбранного шаблона — разметка только для предпросмотра.
 *
 * Слой живёт в DOM поверх растрового листа и никогда не попадает ни в PDF,
 * ни в печать: `pdfExporter`, `vectorExporter` и `printManager` собирают лист
 * заново из раскладки и об этом компоненте не знают. Дополнительно слой
 * помечен `preview-only` и скрыт в `@media print` (см. print.css) — на случай
 * печати самой страницы средствами браузера.
 *
 * Геометрия приходит в миллиметрах листа: родительский <svg> растянут на
 * изображение через preserveAspectRatio="none", поэтому все числа здесь —
 * физические размеры этикеток, а не пиксели экрана.
 */

export interface GuideCell {
  /** левый край ячейки, мм от левого края листа */
  x: number;
  /** верхний край ячейки, мм от верхнего края листа */
  y: number;
  /** ширина ячейки, мм */
  w: number;
  /** высота ячейки, мм */
  h: number;
}

/**
 * Цвет — тот же синий, что у направляющих выравнивания в редакторе: на листе
 * он читается как «геометрия шаблона», а красный остаётся за безопасным полем
 * («опасная зона»). Семантика двух оверлеев не смешивается.
 *
 * Толщина и пунктир заданы в ПИКСЕЛЯХ экрана, а не в миллиметрах: слой
 * растягивается на изображение через preserveAspectRatio="none", поэтому
 * миллиметровая обводка сжималась бы вместе с зумом и на «Вписать» (лист
 * ~485 px) превращалась в полупрозрачную грязь. `non-scaling-stroke`
 * заставляет браузер считать обводку в экранных единицах — линия остаётся
 * ровно такой же чёткой на любом масштабе.
 */
const GUIDE_COLOR = '#2563EB';
const GUIDE_OPACITY = 0.55;
/** Ширина линии — в экранных px (см. векторный эффект ниже) */
const GUIDE_PX = 1;
/** Штрих 4 px / пропуск 4 px: пунктир различим и не превращается в линию */
const GUIDE_DASH = '4 4';

/**
 * Угловые засечки — сплошные, поверх пунктира. Пунктир задаёт форму, засечки
 * фиксируют реальный угол ячейки: именно по ним видно, куда попадёт рез.
 */
const PIN_COLOR = '#1D4ED8';
const PIN_OPACITY = 0.9;
/** Ширина засечки, экранные px */
const PIN_PX = 1.5;
/** Длина плеча засечки, мм */
const PIN_LENGTH_MM = 3.2;
/** Отступ засечки внутрь ячейки — чтобы она не спорила с пунктиром на углу */
const PIN_INSET_MM = 0.6;

/** Угловая засечка: два плеча вдоль сторон ячейки. */
function corner(x: number, y: number, dx: number, dy: number): string {
  const d = PIN_INSET_MM;
  const l = PIN_LENGTH_MM;
  const px = x + dx * d;
  const py = y + dy * d;
  // Горизонтальное плечо уходит внутрь по X, вертикальное — внутрь по Y
  return `M ${px} ${py} h ${dx * l} M ${px} ${py} v ${dy * l}`;
}

/** Прямоугольная ячейка: пунктирный контур + четыре угловые засечки. */
function RectCell({ cell }: { cell: GuideCell }) {
  const { x, y, w, h } = cell;
  const x2 = x + w;
  const y2 = y + h;

  return (
    <>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill="none"
        stroke={GUIDE_COLOR}
        strokeOpacity={GUIDE_OPACITY}
        strokeWidth={GUIDE_PX}
        strokeDasharray={GUIDE_DASH}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={
          corner(x, y, 1, 1) +
          ' ' +
          corner(x2, y, -1, 1) +
          ' ' +
          corner(x2, y2, -1, -1) +
          ' ' +
          corner(x, y2, 1, -1)
        }
        fill="none"
        stroke={PIN_COLOR}
        strokeOpacity={PIN_OPACITY}
        strokeWidth={PIN_PX}
        vectorEffect="non-scaling-stroke"
      />
    </>
  );
}

/**
 * Круглая ячейка: окружность обводится целиком (у неё нет углов), а засечки
 * стоят на четырёх полюсах и идут внутрь по радиусу — так видно диаметр.
 */
function CircleCell({ cell }: { cell: GuideCell }) {
  const { x, y, w, h } = cell;
  const r = Math.min(w, h) / 2;
  const cx = x + w / 2;
  const cy = y + h / 2;

  const from = r - PIN_INSET_MM;
  // У крошечной ячейки засечки схлопнулись бы в точку — тогда остаётся пунктир
  const showPins = r > PIN_INSET_MM + PIN_LENGTH_MM;

  return (
    <>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={GUIDE_COLOR}
        strokeOpacity={GUIDE_OPACITY}
        strokeWidth={GUIDE_PX}
        strokeDasharray={GUIDE_DASH}
        vectorEffect="non-scaling-stroke"
      />
      {showPins && (
        <path
          d={
            `M ${cx} ${cy - from} v ${-PIN_LENGTH_MM} ` +
            `M ${cx} ${cy + from} v ${PIN_LENGTH_MM} ` +
            `M ${cx - from} ${cy} h ${-PIN_LENGTH_MM} ` +
            `M ${cx + from} ${cy} h ${PIN_LENGTH_MM}`
          }
          fill="none"
          stroke={PIN_COLOR}
          strokeOpacity={PIN_OPACITY}
          strokeWidth={PIN_PX}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </>
  );
}

interface PreviewCellGuidesProps {
  cells: GuideCell[];
  /** Круглая форма этикетки — окружность вместо прямоугольника. */
  circle: boolean;
}

export function PreviewCellGuides({ cells, circle }: PreviewCellGuidesProps) {
  if (cells.length === 0) return null;

  return (
    <g className="preview-only preview-cell-guides" aria-hidden="true">
      {cells.map((cell, i) =>
        circle ? <CircleCell key={i} cell={cell} /> : <RectCell key={i} cell={cell} />
      )}
    </g>
  );
}
