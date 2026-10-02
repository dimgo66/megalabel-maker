import { create } from 'zustand';
import * as fabric from 'fabric';
import { LabelFormat, LabelDesign, SheetSettings } from '../types';
import { LABEL_FORMATS, getFormatById } from '../config/labelFormats';
import { createEmptyDesign, createDefaultSettings } from '../utils/projectSerializer';
import { FontConfig, LocalFontInfo, FONT_CONFIGS } from '../config/fonts';
import { withoutHistory } from '../utils/canvasHelpers';

const EMPTY_CANVAS = { version: '7', objects: [], background: '#FFFFFF' };

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
  
  // Fonts
  loadedGoogleFonts: string[]; // IDs загруженных Google Fonts
  localFonts: LocalFontInfo[]; // Локальные шрифты
  fontConfigs: FontConfig[]; // Все конфигурации шрифтов
  
  // Selected object (any to avoid fabric type issues)
  selectedObject: any;
  
  // Счётчик изменений выбранного объекта (инкрементируется при object:modified)
  // Нужен т.к. selectedObject — мутабельная ссылка и Zustand не замечает изменений свойств
  objectRevision: number;
  
  // Editor canvas reference
  editorCanvas: fabric.Canvas | null;
  
  // Undo/Redo history
  history: object[];
  historyIndex: number;
  
  // PDF sources (исходные байты загруженных PDF для векторного экспорта)
  pdfSources: Record<string, ArrayBuffer>;
  
  // Счётчик внешних загрузок проекта (loadProject/resetProject) — триггер перезагрузки канваса
  loadRevision: number;
  
  // Actions
  setSelectedFormat: (format: LabelFormat) => void;
  setCanvasJSON: (json: object) => void;
  setSheetSettings: (settings: Partial<SheetSettings>) => void;
  setProjectName: (name: string) => void;
  markSaved: () => void;
  resetProject: () => void;
  setEditorZoom: (zoom: number) => void;
  setPreviewZoom: (zoom: number) => void;
  loadProject: (design: LabelDesign, settings: SheetSettings) => void;
  setSelectedObject: (obj: any) => void;
  bumpObjectRevision: () => void;
  setEditorCanvas: (canvas: fabric.Canvas | null) => void;
  
  // Undo/Redo actions
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: () => boolean;
  canRedo: () => boolean;
  
  // Font actions
  setGoogleFontLoaded: (fontId: string) => void;
  addLocalFont: (font: LocalFontInfo) => void;
  setLocalFonts: (fonts: LocalFontInfo[]) => void;
  setLoadedGoogleFonts: (fontIds: string[]) => void;
  getAvailableFonts: () => FontConfig[];
  
  // PDF source actions
  addPdfSource: (id: string, data: ArrayBuffer) => void;
  getPdfSource: (id: string) => ArrayBuffer | undefined;
}

// Default initial format (both selectedFormat and labelDesign.formatId must match)
const DEFAULT_FORMAT = LABEL_FORMATS.find(f => f.id === '66.7x46_18') || LABEL_FORMATS[0];

export const useProjectStore = create<ProjectState>((set, get) => ({
  // Initial format: 18 labels (66.7×46 мм) — активный шаблон из docs/шаблоны
  selectedFormat: DEFAULT_FORMAT,
  
  // Initial empty design — formatId ДОЛЖЕН совпадать с selectedFormat.id!
  labelDesign: createEmptyDesign(DEFAULT_FORMAT.id, 'Новый проект'),
  
  // Default sheet settings
  sheetSettings: createDefaultSettings(),
  
  // UI state
  isDirty: false,
  projectName: 'Новый проект',
  editorZoom: 2.0,
  previewZoom: 2.0,
  
  // Fonts
  loadedGoogleFonts: [],
  localFonts: [],
  fontConfigs: FONT_CONFIGS,
  
  // Selected object
  selectedObject: null,
  objectRevision: 0,
  
  // Editor canvas reference
  editorCanvas: null,
  
  // Undo/Redo history
  history: [],
  historyIndex: -1,
  
  // PDF sources
  pdfSources: {},
  
  // Счётчик внешних загрузок проекта
  loadRevision: 0,
  
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
    const { history, historyIndex } = get();
    
    // Одинаковое состояние подряд (событие canvas + явный вызов из модалки) в историю не пишем
    const last = history[historyIndex];
    const unchanged = last !== undefined && JSON.stringify(last) === JSON.stringify(json);

    const newHistory = history.slice(0, historyIndex + 1);
    if (!unchanged) newHistory.push(json);
    
    // Ограничиваем историю 50 состояниями
    const maxHistory = 50;
    if (newHistory.length > maxHistory) {
      newHistory.shift();
    }
    
    set({
      labelDesign: {
        ...design,
        canvasJSON: json,
        metadata: {
          ...design.metadata,
          updatedAt: new Date().toISOString(),
        },
      },
      history: newHistory,
      historyIndex: newHistory.length - 1,
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
      history: [],
      historyIndex: -1,
      selectedObject: null,
      // Сигнал LabelCanvas очистить канвас
      loadRevision: get().loadRevision + 1,
    });
  },
  
  setEditorZoom: (zoom: number) => {
    set({ editorZoom: Math.max(0.5, Math.min(10.0, zoom)) });
  },
  
  setPreviewZoom: (zoom: number) => {
    set({ previewZoom: Math.max(0.25, Math.min(3.0, zoom)) });
  },
  
  // Font actions
  setGoogleFontLoaded: (fontId: string) => {
    const current = get().loadedGoogleFonts;
    if (!current.includes(fontId)) {
      set({ loadedGoogleFonts: [...current, fontId] });
    }
  },
  
  addLocalFont: (font: LocalFontInfo) => {
    const current = get().localFonts;
    const exists = current.find(f => f.name === font.name && f.weight === font.weight && f.style === font.style);
    if (!exists) {
      set({ localFonts: [...current, font] });
    }
  },
  
  setLocalFonts: (fonts: LocalFontInfo[]) => {
    set({ localFonts: fonts });
  },
  
  setLoadedGoogleFonts: (fontIds: string[]) => {
    set({ loadedGoogleFonts: fontIds });
  },
  
  getAvailableFonts: () => {
    const { fontConfigs, loadedGoogleFonts, localFonts } = get();
    
    return fontConfigs.map(config => {
      if (config.source === 'system') {
        return { ...config, loaded: true };
      }
      if (config.source === 'google') {
        return { ...config, loaded: loadedGoogleFonts.includes(config.id) };
      }
      if (config.source === 'local') {
        // Проверяем, загружен ли хотя бы один вариант этого шрифта
        const isLoaded = localFonts.some(f => f.name.toLowerCase().includes(config.name.toLowerCase()));
        return { ...config, loaded: isLoaded };
      }
      return config;
    });
  },
  
  loadProject: (design: LabelDesign, settings: SheetSettings) => {
    const format = getFormatById(design.formatId) || LABEL_FORMATS[0];
    set({
      selectedFormat: format,
      labelDesign: design,
      sheetSettings: settings,
      projectName: design.metadata.name,
      isDirty: false,
      // Загруженный проект — это другое состояние: сбрасываем историю и выделение
      history: [],
      historyIndex: -1,
      selectedObject: null,
      // Сигнал LabelCanvas перезагрузить канвас из canvasJSON
      loadRevision: get().loadRevision + 1,
    });
  },
  
  setSelectedObject: (obj: any) => {
    set({ selectedObject: obj });
  },
  
  bumpObjectRevision: () => {
    set((state) => ({ objectRevision: state.objectRevision + 1 }));
  },
  
  setEditorCanvas: (canvas: fabric.Canvas | null) => {
    set({ editorCanvas: canvas });
  },
  
  // Undo/Redo: loadFromJSON асинхронный (Promise), события canvas на время загрузки в историю не пишутся
  undo: async () => {
    const { history, historyIndex, editorCanvas } = get();
    if (historyIndex < 0 || !editorCanvas) return;

    const newIndex = historyIndex - 1;
    const state = newIndex >= 0 ? history[newIndex] : EMPTY_CANVAS;
    await withoutHistory(() => editorCanvas.loadFromJSON(state as any));
    editorCanvas.discardActiveObject();
    editorCanvas.requestRenderAll();
    set({
      historyIndex: newIndex,
      selectedObject: null,
      labelDesign: { ...get().labelDesign, canvasJSON: state },
      isDirty: true,
    });
  },

  redo: async () => {
    const { history, historyIndex, editorCanvas } = get();
    if (historyIndex >= history.length - 1 || !editorCanvas) return;

    const newIndex = historyIndex + 1;
    const state = history[newIndex];
    await withoutHistory(() => editorCanvas.loadFromJSON(state as any));
    editorCanvas.discardActiveObject();
    editorCanvas.requestRenderAll();
    set({
      historyIndex: newIndex,
      selectedObject: null,
      labelDesign: { ...get().labelDesign, canvasJSON: state },
      isDirty: true,
    });
  },

  canUndo: () => get().historyIndex >= 0,

  canRedo: () => {
    const { history, historyIndex } = get();
    return historyIndex < history.length - 1;
  },

  // PDF source methods
  addPdfSource: (id: string, data: ArrayBuffer) => {
    set((state) => ({
      pdfSources: {
        ...state.pdfSources,
        [id]: data,
      },
    }));
  },
  
  getPdfSource: (id: string) => {
    return get().pdfSources[id];
  },
}));
