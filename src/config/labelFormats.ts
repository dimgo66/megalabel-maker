import { LabelFormat } from '../types';
import { SheetGeometry, geometryFromMargins } from '../utils/layoutCalculator';

// ══════════════════════════════════════════════════════════════════════════
// АКТИВНЫЕ ШАБЛОНЫ — точные размеры/отступы из .doc-файлов (docs/шаблоны).
// Раскладка рассчитана из геометрии документа: поля страницы, шаг сетки,
// размер ячейки (см. _tools/doc_geometry_report.txt).
// ══════════════════════════════════════════════════════════════════════════
const GEOMETRY_PRESETS: Record<string, SheetGeometry> = {
  // ── 73571-99-34.doc: A4, поля 269/709 tw, клетка 5755 tw (шаг), ряд 1928 tw ──
  // этикетка 99×34, шаг 101.51×34.01, отступ 4.74/12.51 (симметрично: rest 4.74/1.1)
  '99x34_16': geometryFromMargins(4.74, 12.51, 99.0, 34.0, 2, 8, 101.51, 34.01),
  // ── 73572-66-7-46.doc: поля 167/595 tw, клетка 3895 tw, ряд 2608 tw ──
  // этикетка 66.7×46, шаг 68.70×46.00, отступ 2.95/10.50 (rest 2.95/0.5)
  '66.7x46_18': geometryFromMargins(2.95, 10.5, 66.7, 46.0, 3, 6, 68.7, 46.0),
  // ── 73622-105-57.doc: поля 0/340 tw, клетка 5953 tw = 105.00, ряд 3232 tw ──
  // этикетка 105×57 вплотную (шаг = ширине: 2×105 = 210 ровно), отступ 0/6.00
  '105x57_10': geometryFromMargins(0.0, 6.0, 105.0, 57.0, 2, 5, 105.0, 57.01),
  // ── 73642-52-5-35.doc: поля 0/482 tw, клетка 2977 tw, ряд 1985 tw ──
  // этикетка 52.5×35 вплотную (шаг = ширине: 4×52.5 = 210 ровно), отступ 0/8.50
  '52.5x35_32': geometryFromMargins(0.0, 8.5, 52.5, 35.0, 4, 8, 52.5, 35.01),
  // ── 73649-38-16-9.doc: поля 567/275 tw, клетка 2155 tw = 38.01, ряд 958 tw ──
  // этикетка 38×16.9 вплотную (шаг 38.01), отступ 10.00/4.85 (rest 9.96/4.85)
  '38x16.9_85': geometryFromMargins(10.0, 4.85, 38.0, 16.9, 5, 17, 38.01, 16.9),
  // ── 73581-d-60-12.doc: круг ⌀60 на «шахматной» сетке Word ──
  // широкие ячейки 2410 tw, разделители 1361 tw → шаг 3771 tw = 66.52 мм по X и Y;
  // центры кругов: 2137 tw = 37.70 мм от левого края, 2719 tw = 47.96 мм от верха
  // → отступ первой этикетки 7.70/17.96. 3 колонки × 4 ряда = 12 шт
  'd60_circle_12': geometryFromMargins(7.7, 17.96, 60.0, 60.0, 3, 4, 66.52, 66.52),
};

// ── Активные шаблоны (только они доступны в селекторе) ─────────────────────
export const LABEL_FORMATS: LabelFormat[] = [
  {
    id: '105x57_10', name: '105×57 мм / 10 шт', width_mm: 105, height_mm: 57,
    count: 10, shape: 'rect', layout: GEOMETRY_PRESETS['105x57_10'],
  },
  {
    id: '99x34_16', name: '99×34 мм / 16 шт', width_mm: 99, height_mm: 34,
    count: 16, shape: 'rect', layout: GEOMETRY_PRESETS['99x34_16'],
  },
  {
    id: '66.7x46_18', name: '66.7×46 мм / 18 шт', width_mm: 66.7, height_mm: 46,
    count: 18, shape: 'rect', layout: GEOMETRY_PRESETS['66.7x46_18'],
  },
  {
    id: 'd60_circle_12', name: '⌀60 мм / 12 шт (круг)', width_mm: 60, height_mm: 60,
    count: 12, shape: 'circle', layout: GEOMETRY_PRESETS['d60_circle_12'],
  },
  {
    id: '52.5x35_32', name: '52.5×35 мм / 32 шт', width_mm: 52.5, height_mm: 35,
    count: 32, shape: 'rect', layout: GEOMETRY_PRESETS['52.5x35_32'],
  },
  {
    id: '38x16.9_85', name: '38×16.9 мм / 85 шт', width_mm: 38, height_mm: 16.9,
    count: 85, shape: 'rect', layout: GEOMETRY_PRESETS['38x16.9_85'],
  },
];

// ── Деактивированные шаблоны (временно недоступны в селекторе) ─────────────
// Возвращаются в работу простой заменой LABEL_FORMATS = INACTIVE_LABEL_FORMATS
// или переносом нужных записей в активный список. Геометрия листа для них
// будет рассчитана автоматически (авто-раскладка по центру листа A4).
export const INACTIVE_LABEL_FORMATS: LabelFormat[] = [
  { id: '210x297_1', name: '210×297 мм / 1 шт', width_mm: 210, height_mm: 297, count: 1, shape: 'rect' },
  { id: '210x148_2', name: '210×148 мм / 2 шт', width_mm: 210, height_mm: 148, count: 2, shape: 'rect' },
  { id: '105x148_4', name: '105×148 мм / 4 шт', width_mm: 105, height_mm: 148, count: 4, shape: 'rect' },
  { id: '105x99_6', name: '105×99 мм / 6 шт', width_mm: 105, height_mm: 99, count: 6, shape: 'rect' },
  { id: '105x70_8', name: '105×70 мм / 8 шт', width_mm: 105, height_mm: 70, count: 8, shape: 'rect' },
  { id: '105x74_8', name: '105×74 мм / 8 шт', width_mm: 105, height_mm: 74, count: 8, shape: 'rect' },
  { id: '99.1x57_10', name: '99.1×57 мм / 10 шт', width_mm: 99.1, height_mm: 57, count: 10, shape: 'rect' },
  { id: '105x48_12', name: '105×48 мм / 12 шт', width_mm: 105, height_mm: 48, count: 12, shape: 'rect' },
  { id: '70x67.7_12', name: '70×67.7 мм / 12 шт', width_mm: 70, height_mm: 67.7, count: 12, shape: 'rect' },
  { id: '99.1x42.3_12', name: '99.1×42.3 мм / 12 шт', width_mm: 99.1, height_mm: 42.3, count: 12, shape: 'rect' },
  { id: '105x42.4_14', name: '105×42.4 мм / 14 шт', width_mm: 105, height_mm: 42.4, count: 14, shape: 'rect' },
  { id: '99.1x38.1_14', name: '99.1×38.1 мм / 14 шт', width_mm: 99.1, height_mm: 38.1, count: 14, shape: 'rect' },
  { id: '70x57_15', name: '70×57 мм / 15 шт', width_mm: 70, height_mm: 57, count: 15, shape: 'rect' },
  { id: '105x37_16', name: '105×37 мм / 16 шт', width_mm: 105, height_mm: 37, count: 16, shape: 'rect' },
  { id: '70x49.5_18', name: '70×49.5 мм / 18 шт', width_mm: 70, height_mm: 49.5, count: 18, shape: 'rect' },
  { id: '63.5x38.1_21', name: '63.5×38.1 мм / 21 шт', width_mm: 63.5, height_mm: 38.1, count: 21, shape: 'rect' },
  { id: '70x42.3_21', name: '70×42.3 мм / 21 шт', width_mm: 70, height_mm: 42.3, count: 21, shape: 'rect' },
  { id: '63.5x33.9_24', name: '63.5×33.9 мм / 24 шт', width_mm: 63.5, height_mm: 33.9, count: 24, shape: 'rect' },
  { id: '64.6x33.8_24', name: '64.6×33.8 мм / 24 шт', width_mm: 64.6, height_mm: 33.8, count: 24, shape: 'rect' },
  { id: '70x33.8_24', name: '70×33.8 мм / 24 шт', width_mm: 70, height_mm: 33.8, count: 24, shape: 'rect' },
  { id: '70x35_24', name: '70×35 мм / 24 шт', width_mm: 70, height_mm: 35, count: 24, shape: 'rect' },
  { id: '70x36_24', name: '70×36 мм / 24 шт', width_mm: 70, height_mm: 36, count: 24, shape: 'rect' },
  { id: '70x37_24', name: '70×37 мм / 24 шт', width_mm: 70, height_mm: 37, count: 24, shape: 'rect' },
  { id: '63.5x29.6_27', name: '63.5×29.6 мм / 27 шт', width_mm: 63.5, height_mm: 29.6, count: 27, shape: 'rect' },
  { id: '70x32_27', name: '70×32 мм / 27 шт', width_mm: 70, height_mm: 32, count: 27, shape: 'rect' },
  { id: '70x28.5_30', name: '70×28.5 мм / 30 шт', width_mm: 70, height_mm: 28.5, count: 30, shape: 'rect' },
  { id: '50x28.5_40', name: '50×28.5 мм / 40 шт', width_mm: 50, height_mm: 28.5, count: 40, shape: 'rect' },
  { id: '52.5x29.7_40', name: '52.5×29.7 мм / 40 шт', width_mm: 52.5, height_mm: 29.7, count: 40, shape: 'rect' },
  { id: '67x20.5_42', name: '67×20.5 мм / 42 шт', width_mm: 67, height_mm: 20.5, count: 42, shape: 'rect' },
  { id: '45.7x21.2_48', name: '45.7×21.2 мм / 48 шт', width_mm: 45.7, height_mm: 21.2, count: 48, shape: 'rect' },
  { id: '70x16.9_51', name: '70×16.9 мм / 51 шт', width_mm: 70, height_mm: 16.9, count: 51, shape: 'rect' },
  { id: '48.5x20.5_56', name: '48.5×20.5 мм / 56 шт', width_mm: 48.5, height_mm: 20.5, count: 56, shape: 'rect' },
  { id: '52.5x21.2_56', name: '52.5×21.2 мм / 56 шт', width_mm: 52.5, height_mm: 21.2, count: 56, shape: 'rect' },
  { id: '38x23.5_60', name: '38×23.5 мм / 60 шт', width_mm: 38, height_mm: 23.5, count: 60, shape: 'rect' },
  { id: '48.5x19_60', name: '48.5×19 мм / 60 шт', width_mm: 48.5, height_mm: 19, count: 60, shape: 'rect' },
  { id: '48.5x16.9_64', name: '48.5×16.9 мм / 64 шт', width_mm: 48.5, height_mm: 16.9, count: 64, shape: 'rect' },
  { id: '38x21.2_65', name: '38×21.2 мм / 65 шт', width_mm: 38, height_mm: 21.2, count: 65, shape: 'rect' },
  { id: '38x19_75', name: '38×19 мм / 75 шт', width_mm: 38, height_mm: 19, count: 75, shape: 'rect' },
  { id: '35.6x16.9_80', name: '35.6×16.9 мм / 80 шт', width_mm: 35.6, height_mm: 16.9, count: 80, shape: 'rect' },
  { id: '25.4x10_189', name: '25.4×10 мм / 189 шт', width_mm: 25.4, height_mm: 10, count: 189, shape: 'rect' },
  { id: '18x12_230', name: '18×12 мм / 230 шт', width_mm: 18, height_mm: 12, count: 230, shape: 'rect' },
];

export function getFormatById(id: string): LabelFormat | undefined {
  return LABEL_FORMATS.find(f => f.id === id) ?? INACTIVE_LABEL_FORMATS.find(f => f.id === id);
}