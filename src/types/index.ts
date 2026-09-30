export interface LabelFormat {
  id: string;
  name: string;
  width_mm: number;
  height_mm: number;
  count: number;
  shape: 'rect' | 'circle';
}

export interface LayoutResult {
  cols: number;
  rows: number;
  marginTop_mm: number;
  marginLeft_mm: number;
  gapX_mm: number;
  gapY_mm: number;
  cellWidth_mm: number;
  cellHeight_mm: number;
}

export interface LabelDesign {
  version: number;
  formatId: string;
  canvasJSON: object;
  metadata: {
    name: string;
    createdAt: string;
    updatedAt: string;
    customFonts: string[];
  };
}

export interface SheetSettings {
  orientation: 'portrait' | 'landscape';
  showCutLines: boolean;
  mirrorPrint: boolean;
  safetyMargin_mm: number;
}

export interface ProjectFile {
  appVersion: string;
  labelDesign: LabelDesign;
  sheetSettings: SheetSettings;
}

// Штрих-коды: единая структура в модулях
export interface BarcodeNorm {
  format: 'ean13' | 'itf14';
  modulesTotal: number;     // EAN-13: 95. ITF-14: ширина символа в px из парсера
  leftPadMod: number;       // запас слева под первую цифру: EAN-13: 7, ITF-14: 0
  bars: Array<{ xMod: number; wMod: number }>;      // x и ширина В МОДУЛЯХ от начала символа
  digits: Array<{ char: string; xMod: number }>;    // центры цифр В МОДУЛЯХ (первая может быть < 0)
  barHMod: number;          // высота штрихов в модулях: EAN-13: 50
  digitYMod: number;        // базовая линия цифр в модулях: EAN-13: 57
  fontMod: number;          // кегль цифр в модулях: EAN-13: 9
  pxPerModule: number;      // 4 (константа масштаба группы при scale=1)
}

export type BarcodeFormat = 'ean13' | 'itf14';
