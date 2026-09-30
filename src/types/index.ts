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

// Штрих-коды: единая нормализованная структура
export interface BarcodeDigit {
  char: string;
  xFrac: number; // xFrac в 0..1 символа, первая цифра может быть < 0
}

export interface NormalizedBar {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BarcodeNorm {
  bars: NormalizedBar[];        // нормализованы к символу (95 модулей EAN / bbox ITF), x 0..1
  digits: BarcodeDigit[];       // в той же нормализации символа
  textYFrac: number;            // вертикаль цифр (доли от высоты символа)
  fontSizeFrac: number;         // размер шрифта цифр (доли от высоты символа)
  overhangFrac: number;         // насколько левее символа выступает первая цифра (доли ширины символа)
  unit: number;                 // пикселей на 1 нормализованную единицу при scale=1
  totalHeightModules: number;   // общая высота символа в модулях (включая цифры)
  barHeightModules: number;     // высота штрихов в модулях
}

export type BarcodeFormat = 'ean13' | 'itf14';
