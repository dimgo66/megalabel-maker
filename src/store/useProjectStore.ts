import { create } from 'zustand';
import { LabelFormat, LabelDesign, SheetSettings } from '../types';
import { LABEL_FORMATS } from '../config/labelFormats';
import { createEmptyDesign, createDefaultSettings } from '../utils/projectSerializer';

interface ProjectState {
  // Format
  selectedFormat: LabelFormat;
  
  // Design
  labelDesign: LabelDesign;
  
  // Sheet settings
  sheetSettings: SheetSettings;
  
  // UI state
  isDirty: boolean;
  projectName: string;
  editorZoom: number;
  previewZoom: number;
  
  // Loaded fonts
  loadedFonts: string[];
  
  // Selected object (any to avoid fabric type issues)
  selectedObject: any;
  
  // Actions
  setSelectedFormat: (format: LabelFormat) => void;
  setCanvasJSON: (json: object) => void;
  setSheetSettings: (settings: Partial<SheetSettings>) => void;
  setProjectName: (name: string) => void;
  markSaved: () => void;
  resetProject: () => void;
  setEditorZoom: (zoom: number) => void;
  setPreviewZoom: (zoom: number) => void;
  addLoadedFont: (fontName: string) => void;
  loadProject: (design: LabelDesign, settings: SheetSettings) => void;
  setSelectedObject: (obj: any) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  // Initial format: first in the list (210×297 / 1 шт)
  selectedFormat: LABEL_FORMATS[0],
  
  // Initial empty design
  labelDesign: createEmptyDesign(LABEL_FORMATS[0].id, 'Новый проект'),
  
  // Default sheet settings
  sheetSettings: createDefaultSettings(),
  
  // UI state
  isDirty: false,
  projectName: 'Новый проект',
  editorZoom: 2.0,
  previewZoom: 2.0,
  
  // Loaded fonts
  loadedFonts: [],
  
  // Selected object
  selectedObject: null,
  
  // Actions
  setSelectedFormat: (format: LabelFormat) => {
    const design = get().labelDesign;
    set({
      selectedFormat: format,
      labelDesign: {
        ...design,
        formatId: format.id,
        metadata: {
          ...design.metadata,
          updatedAt: new Date().toISOString(),
        },
      },
      isDirty: true,
    });
  },
  
  setCanvasJSON: (json: object) => {
    const design = get().labelDesign;
    set({
      labelDesign: {
        ...design,
        canvasJSON: json,
        metadata: {
          ...design.metadata,
          updatedAt: new Date().toISOString(),
        },
      },
      isDirty: true,
    });
  },
  
  setSheetSettings: (settings: Partial<SheetSettings>) => {
    set({
      sheetSettings: {
        ...get().sheetSettings,
        ...settings,
      },
      isDirty: true,
    });
  },
  
  setProjectName: (name: string) => {
    const design = get().labelDesign;
    set({
      projectName: name,
      labelDesign: {
        ...design,
        metadata: {
          ...design.metadata,
          name,
          updatedAt: new Date().toISOString(),
        },
      },
      isDirty: true,
    });
  },
  
  markSaved: () => {
    set({ isDirty: false });
  },
  
  resetProject: () => {
    const format = get().selectedFormat;
    set({
      labelDesign: createEmptyDesign(format.id, 'Новый проект'),
      projectName: 'Новый проект',
      isDirty: false,
    });
  },
  
  setEditorZoom: (zoom: number) => {
    set({ editorZoom: Math.max(0.5, Math.min(10.0, zoom)) });
  },
  
  setPreviewZoom: (zoom: number) => {
    set({ previewZoom: Math.max(0.25, Math.min(3.0, zoom)) });
  },
  
  addLoadedFont: (fontName: string) => {
    const current = get().loadedFonts;
    if (!current.includes(fontName)) {
      const design = get().labelDesign;
      set({
        loadedFonts: [...current, fontName],
        labelDesign: {
          ...design,
          metadata: {
            ...design.metadata,
            customFonts: [...design.metadata.customFonts, fontName],
          },
        },
      });
    }
  },
  
  loadProject: (design: LabelDesign, settings: SheetSettings) => {
    const format = LABEL_FORMATS.find(f => f.id === design.formatId) || LABEL_FORMATS[0];
    set({
      selectedFormat: format,
      labelDesign: design,
      sheetSettings: settings,
      projectName: design.metadata.name,
      isDirty: false,
    });
  },
  
  setSelectedObject: (obj: any) => {
    set({ selectedObject: obj });
  },
}));
