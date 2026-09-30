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
