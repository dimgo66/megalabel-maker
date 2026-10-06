/**
 * Непечатная зона лазерного принтера A4.
 *
 * Почему именно так:
 * - Большинство настольных лазерных принтеров A4 не могут печатать вплотную к
 *   краю листа: бумагу держат валики, и первые/последние ~4 мм остаются
 *   недоступными. Для струйных принтеров кромка обычно уже (2–3 мм), но
 *   ориентир берём по худшему случаю — лазерному.
 * - Значение одинаково со всех сторон НАМЕРЕННО: делать таблицу по краям
 *   (у многих моделей нижняя кромка шире верхней) — это уже паспорт конкретной
 *   модели, а приложение не знает, на чём будет печатать пользователь. Одно
 *   честное значение «не размещайте тут важное» полезнее точной, но выдуманной
 *   геометрии чужого принтера.
 * - 4.2 мм — типовая величина из документации настольных лазерных A4-принтеров
 *   (HP LaserJet, Kyocera, Brother): обычно 4.0–4.5 мм по периметру.
 *
 * ГДЕ ЧИТАЕТСЯ: только в окне предпросмотра (`PreviewModal`). Это подсказка для
 * глаз, а не ограничение печати:
 * - в редакторе этикетки оверлея нет — он мешал бы верстать;
 * - `pdfExporter`, `vectorExporter` и `printManager` о константе не знают,
 *   поэтому зона физически не может попасть в PDF или в печать.
 *
 * Менять значение — здесь и только здесь.
 */
export const NON_PRINTABLE_MARGIN_MM = 4.2;

/**
 * SVG-путь рамки-«кольца» по периметру листа: внешний прямоугольник минус
 * внутренний. Вычитание делает `fill-rule="evenodd"` на стороне рендера.
 *
 * Вынесено сюда чистой функцией, а не посчитано внутри компонента, по двум
 * причинам: геометрию можно проверить без монтирования React и без PDF-стека
 * (он тянет браузерные API и в Node не поднимается), и формула живёт рядом с
 * самой константой, которой она управляется.
 *
 * Пути заданы в миллиметрах листа — родительский `<svg>` растягивается на
 * изображение через `preserveAspectRatio="none"`.
 */
export function nonPrintableZonePath(sheetWidth_mm: number, sheetHeight_mm: number): string {
  const gap = NON_PRINTABLE_MARGIN_MM;

  // Округление до 0.001 мм: `210 − 4.2·2` в двоичной плавающей точке даёт
  // 205.79999999999998, и это значение уходит прямо в атрибут `d`. Тысячная
  // миллиметра заведомо ниже разрешения любой печати, зато путь читаем и
  // сравним с ожидаемым в тестах без эпсилонов.
  const round = (value: number) => Math.round(value * 1000) / 1000;

  const innerLeft = round(gap);
  const innerTop = round(gap);
  // max(gap, …) не даёт внутреннему контуру уйти левее/выше внешнего на листе
  // меньше двух непечатных полей: тогда кольцо вырождается в точку, а не в
  // «вывернутый» прямоугольник.
  const innerRight = round(Math.max(gap, sheetWidth_mm - gap));
  const innerBottom = round(Math.max(gap, sheetHeight_mm - gap));

  return (
    `M 0 0 H ${round(sheetWidth_mm)} V ${round(sheetHeight_mm)} H 0 Z ` +
    `M ${innerLeft} ${innerTop} H ${innerRight} V ${innerBottom} H ${innerLeft} Z`
  );
}

/**
 * Проверяет, попадает ли хоть одна этикетка шаблона в непечатную зону.
 *
 * Нужно для предупреждения рядом с легендой: если сетка начинается ближе
 * константы к краю листа, часть этикетки принтер может «съесть». Пользователь
 * должен узнать об этом до печати, а не после.
 *
 * @param layout раскладка листа (`marginLeft_mm`, `marginTop_mm`, размеры ячеек)
 * @param sheetWidth_mm ширина листа в мм с учётом ориентации
 * @param sheetHeight_mm высота листа в мм с учётом ориентации
 * @param pitch шаг сетки (шагX/шагY) — нужен, чтобы найти дальний край сетки
 */
export function labelsReachNonPrintableZone(
  layout: { marginLeft_mm: number; marginTop_mm: number; cols: number; rows: number; cellWidth_mm: number; cellHeight_mm: number },
  pitch: { pitchX_mm: number; pitchY_mm: number },
  sheetWidth_mm: number,
  sheetHeight_mm: number
): boolean {
  const m = NON_PRINTABLE_MARGIN_MM;

  // Границы всей сетки: первая ячейка начинается в margin, каждая следующая —
  // через шаг. Дальний край = начало последней ячейки + её размер.
  const left = layout.marginLeft_mm;
  const top = layout.marginTop_mm;
  const right = layout.marginLeft_mm + (layout.cols - 1) * pitch.pitchX_mm + layout.cellWidth_mm;
  const bottom = layout.marginTop_mm + (layout.rows - 1) * pitch.pitchY_mm + layout.cellHeight_mm;

  return left < m || top < m || right > sheetWidth_mm - m || bottom > sheetHeight_mm - m;
}