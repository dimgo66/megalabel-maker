import { create } from 'zustand';
import * as fabric from 'fabric';
import { LabelFormat, LabelDesign, ProjectTabEntry, SheetSettings } from '../types';
import { LABEL_FORMATS, getFormatById } from '../config/labelFormats';
import { createEmptyDesign, createDefaultSettings } from '../utils/projectSerializer';
import { FontConfig, LocalFontInfo, FONT_CONFIGS } from '../config/fonts';
import { serializeCanvas, withoutHistory } from '../utils/canvasHelpers';
import { tabDigest } from '../utils/tabDigest';

const EMPTY_CANVAS = { version: '7', objects: [], background: '#FFFFFF' };

/**
 * Уникальный id вкладки. `randomUUID` есть только в защищённом контексте
 * (https/localhost), поэтому нужен запасной составной id — иначе на `file://`
 * все вкладки получили бы один id и переключение сломалось бы.
 */
const newTabId = (): string => {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/** История отмен/повторов конкретной вкладки (только в памяти, в файл не пишется). */
interface TabHistory {
  history: object[];
  historyIndex: number;
}

/**
 * Копия `tabs` с обновлённой записью одной вкладки. Не мутирует входной массив:
 * Zustand сравнивает ссылки, и без копии компоненты не узнали бы об изменении.
 */
function replaceTabEntry(
  tabs: ProjectTabEntry[],
  tabId: string,
  labelDesign: LabelDesign,
  sheetSettings: SheetSettings
): ProjectTabEntry[] {
  const idx = tabs.findIndex(t => t.id === tabId);
  if (idx === -1) return tabs;
  const next = tabs.slice();
  next[idx] = { ...next[idx], labelDesign, sheetSettings };
  return next;
}

/**
 * Снимок активной вкладки перед уходом с неё (переключение, добавление).
 *
 * Данные активной вкладки живут в labelDesign/sheetSettings, но канвас может
 * быть свежее последней записи в историю (редкая правка без события) — поэтому
 * в запись вкладки пишется сериализованное состояние живого канваса, а история
 * отмен сохраняется в tabHistories по id вкладки.
 */
function snapshotActiveTab(
  s: Pick<
    ProjectState,
    'tabs' | 'activeTabId' | 'labelDesign' | 'sheetSettings' | 'editorCanvas' | 'history' | 'historyIndex' | 'tabHistories' | 'tabZooms' | 'editorZoom'
  >
): { tabs: ProjectTabEntry[]; tabHistories: Record<string, TabHistory>; tabZooms: Record<string, number> } {
  const liveDesign =
    s.editorCanvas && s.activeTabId
      ? { ...s.labelDesign, canvasJSON: serializeCanvas(s.editorCanvas) }
      : s.labelDesign;
  const tabs = s.activeTabId
    ? replaceTabEntry(s.tabs, s.activeTabId, liveDesign, s.sheetSettings)
    : s.tabs;
  const tabHistories = { ...s.tabHistories };
  const tabZooms = { ...s.tabZooms };
  if (s.activeTabId) {
    tabHistories[s.activeTabId] = { history: s.history, historyIndex: s.historyIndex };
    // Масштаб остаётся в editorZoom, в снимок пишется копия по id вкладки.
    tabZooms[s.activeTabId] = s.editorZoom;
  }
  return { tabs, tabHistories, tabZooms };
}

/**
 * Вкладка из текущего состояния (для первого снятия снимка, когда список
 * вкладок ещё пуст — стартовая вкладка материализуется лениво).
 */
function makeTabEntry(s: {
  activeTabId: string;
  projectName: string;
  labelDesign: LabelDesign;
  sheetSettings: SheetSettings;
}): ProjectTabEntry {
  return {
    id: s.activeTabId || newTabId(),
    name: s.projectName,
    labelDesign: s.labelDesign,
    sheetSettings: s.sheetSettings,
  };
}

/**
 * Отпечаток активной вкладки «как она выглядит сейчас» — для отметки «сохранена».
 *
 * Живой холст важнее последней записи в стор (как и в snapshotActiveTab): без
 * этого только что сделанная правка не попала бы в отпечаток, и вкладка
 * считалась бы сохранённой.
 */
function digestOfActiveTab(s: {
  tabs: ProjectTabEntry[];
  activeTabId: string;
  projectName: string;
  labelDesign: LabelDesign;
  sheetSettings: SheetSettings;
  editorCanvas: fabric.Canvas | null;
  canvasLoading: boolean;
}): string {
  const liveDesign =
    s.editorCanvas && s.activeTabId && !s.canvasLoading
      ? { ...s.labelDesign, canvasJSON: serializeCanvas(s.editorCanvas) }
      : s.labelDesign;
  const entry = s.tabs.find(t => t.id === s.activeTabId);
  return tabDigest({
    name: entry?.name ?? s.projectName,
    labelDesign: liveDesign,
    sheetSettings: s.sheetSettings,
  });
}

interface ProjectState {
  // Format
  selectedFormat: LabelFormat;
  
  // Design
  labelDesign: LabelDesign;
  
  // Sheet settings
  sheetSettings: SheetSettings;
  
  // Вкладки: каждая — самостоятельная этикетка. Активная вкладка — та,
  // чьи данные лежат в labelDesign/sheetSettings/selectedFormat.
  tabs: ProjectTabEntry[];
  activeTabId: string;
  
  // UI state
  isDirty: boolean;
  projectName: string;
  /**
   * Имя этикетки в последнем сохранённом или открытом файле.
   * '' — файла ещё не было (проект ни разу не сохраняли).
   */
  savedName: string;
  /**
   * Вкладка, название которой ещё не записано в файл под этим именем.
   *
   * Пока это активная вкладка, «Сохранить» идёт путём «Сохранить как»:
   * название в поле — это уже другая этикетка, перезаписывать прежний файл
   * нельзя. Флаг ставится только осознанным переименованием (ввод в поле или
   * переименование активной вкладки), поэтому переключение вкладок его не
   * поднимает.
   */
  pendingNameTabId: string | null;
  /**
   * Имя, под которым каждая вкладка записана в свой файл ('' — не сохранялась).
   *
   * Файл описывает одну этикетку, поэтому «сохранено» — свойство вкладки, а не
   * всего проекта: в памяти сеанса это надо помнить по вкладкам, иначе после
   * переключения или закрытия вкладки поле сравнивало бы название с именем
   * чужого файла. В файл проекта это поле не пишется.
   */
  tabSavedNames: Record<string, string>;
  /**
   * Отпечаток содержимого вкладки на момент её записи или открытия файла.
   * По нему видно, есть ли в вкладке несохранённые правки (закрытие вкладки
   * спрашивает подтверждение именно об этом). В файл не пишется.
   */
  tabSavedDigests: Record<string, string>;
  /**
   * Холст прямо сейчас применяет состояние (переключение вкладки, загрузка
   * файла). Пока флаг поднят, снимать JSON с живого холста нельзя: в файл или
   * автосохранение попал бы недогруженный лист. Источником истины тогда
   * служит canvasJSON из стора.
   */
  canvasLoading: boolean;
  editorZoom: number;
  /**
   * Рабочая зона вокруг этикетки в CSS-пикселях холста.
   *
   * Холст редактора шире этикетки на это поле: на нём видны объекты, рамки
   * выделения и ручки, вышедшие за край. Ставит `LabelCanvas` после пересчёта;
   * `App` по этому значению расставляет лист этикетки и безопасные поля.
   * Свойство редактора, а не этикетки: в проект и JSON не пишется.
   */
  pasteboardPx: number;
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
  
  // История отмен по вкладкам: при переключении вкладки её история прячется
  // сюда, а история новой активной вкладки — достаётся.
  tabHistories: Record<string, TabHistory>;
  
  // Масштаб редактора по вкладкам: у каждой вкладки свой, как и история отмен.
  // Активный масштаб лежит в editorZoom (как раньше), уходящий прячется сюда.
  tabZooms: Record<string, number>;
  
  // PDF sources (исходные байты загруженных PDF для векторного экспорта)
  pdfSources: Record<string, ArrayBuffer>;
  
  // Счётчик внешних загрузок проекта (loadProject/resetProject) — триггер перезагрузки канваса
  loadRevision: number;
  
  // Счётчик фактических перезагрузок канваса (LabelCanvas наращивает его ПОСЛЕ
  // применения состояния). Предпросмотр подписывается на него, чтобы не снять
  // лист до того, как канвас загрузил содержимое новой вкладки.
  canvasContentRevision: number;
  
  // Actions
  setSelectedFormat: (format: LabelFormat) => void;
  setCanvasJSON: (json: object) => void;
  setSheetSettings: (settings: Partial<SheetSettings>) => void;
  setProjectName: (name: string) => void;
  /** Название введено пользователем: этикетка считается новой, пока не сохранена. */
  setProjectNameFromInput: (name: string) => void;
  /**
   * Проект записан в файл.
   * @param savedName имя, под которым он записан (по умолчанию — текущее)
   */
  markSaved: (savedName?: string) => void;
  setCanvasLoading: (loading: boolean) => void;
  resetProject: () => void;
  setEditorZoom: (zoom: number) => void;
  setPasteboardPx: (px: number) => void;
  setPreviewZoom: (zoom: number) => void;
  loadProject: (design: LabelDesign, settings: SheetSettings) => void;
  loadProjectWithTabs: (tabs: ProjectTabEntry[], activeTabId: string) => void;
  /**
   * Загрузить файл в «пустую» активную вкладку: вкладки из файла занимают её
   * место (первая наследует id), соседние вкладки остаются как были.
   */
  loadFileIntoEmptyTab: (tabs: ProjectTabEntry[], activeTabId: string) => void;
  setSelectedObject: (obj: any) => void;
  bumpObjectRevision: () => void;
  setEditorCanvas: (canvas: fabric.Canvas | null) => void;
  
  // Вкладки: создание, переключение, закрытие, переименование
  addTab: () => void;
  switchTab: (tabId: string) => void;
  closeTab: (tabId: string) => void;
  renameTab: (tabId: string, name: string) => void;
  countTabs: () => number;
  /** LabelCanvas вызывает после фактического применения состояния к канвасу. */
  bumpCanvasContentRevision: () => void;
  
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
  
  // Вкладки: одна стартовая вкладка, совпадающая с начальным проектом
  tabs: [],
  activeTabId: '',
  
  // UI state
  isDirty: false,
  projectName: 'Новый проект',
  // Файла ещё нет: первое «Сохранить» и так спрашивает место.
  savedName: '',
  pendingNameTabId: null,
  tabSavedNames: {},
  tabSavedDigests: {},
  canvasLoading: false,
  editorZoom: 2.0,
  // Размер рабочей зоны считает LabelCanvas — здесь только значение по умолчанию
  // до первого пересчёта.
  pasteboardPx: 0,
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
  
  // История отмен по вкладкам (заполняется при переключении)
  tabHistories: {},
  
  // Масштаб редактора по вкладкам (заполняется при переключении)
  tabZooms: {},
  
  // PDF sources
  pdfSources: {},
  
  // Счётчик внешних загрузок проекта
  loadRevision: 0,
  
  // Счётчик фактических применений состояния к канвасу
  canvasContentRevision: 0,
  
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
  
  /**
   * Задать название программно (после сохранения, при загрузке). Название,
   * набранное пользователем, идёт через setProjectNameFromInput.
   */
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
      // Имя — это имя АКТИВНОЙ вкладки: оно же подпись на ярлыке вкладки,
      // поэтому обновляется и в списке вкладок.
      tabs: (() => {
        const s = get();
        if (!s.activeTabId) return s.tabs;
        const idx = s.tabs.findIndex(t => t.id === s.activeTabId);
        if (idx === -1) return s.tabs;
        const next = s.tabs.slice();
        next[idx] = { ...next[idx], name };
        return next;
      })(),
      isDirty: true,
    });
  },

  /**
   * Пользователь ввёл название в поле.
   *
   * Название, отличающееся от имени сохранённого файла, — это уже другая
   * этикетка: «Сохранить» перезаписывать прежний файл не будет, а откроет
   * «Сохранить как». Вернули прежнее название — отметка снимается.
   */
  setProjectNameFromInput: (name: string) => {
    get().setProjectName(name);
    const s = get();
    const pending =
      s.activeTabId !== '' && name.trim() !== s.savedName.trim() ? s.activeTabId : null;
    set({ pendingNameTabId: pending });
  },

  markSaved: (savedName?: string) => {
    const s = get();
    const name = savedName ?? s.projectName;
    const tabId = s.activeTabId;
    const tabSavedNames = { ...s.tabSavedNames };
    const tabSavedDigests = { ...s.tabSavedDigests };
    if (tabId) {
      tabSavedNames[tabId] = name;
      // Отпечаток снимается после записи: именно это содержимое лежит в файле.
      tabSavedDigests[tabId] = digestOfActiveTab(s);
    }
    set({
      isDirty: false,
      savedName: name,
      tabSavedNames,
      tabSavedDigests,
      // Имя записано в файл — «новой» этикетки больше нет.
      pendingNameTabId: null,
    });
  },

  setCanvasLoading: (loading: boolean) => {
    set({ canvasLoading: loading });
  },
  
  resetProject: () => {
    const format = get().selectedFormat;
    // Текущая вкладка — тоже вкладка: сбрасываем только её, соседние не трогаем.
    const currentId = get().activeTabId;
    const tabs = currentId
      ? (() => {
          const idx = get().tabs.findIndex(t => t.id === currentId);
          if (idx === -1) return get().tabs;
          const next = get().tabs.slice();
          next[idx] = {
            id: currentId,
            name: 'Новый проект',
            labelDesign: createEmptyDesign(format.id, 'Новый проект'),
            sheetSettings: createDefaultSettings(),
          };
          return next;
        })()
      : get().tabs;
    // Сброшенная вкладка — новая этикетка: её файл и отпечаток больше не её.
    const tabSavedNames = { ...get().tabSavedNames };
    const tabSavedDigests = { ...get().tabSavedDigests };
    if (currentId) {
      delete tabSavedNames[currentId];
      delete tabSavedDigests[currentId];
    }
    set({
      labelDesign: createEmptyDesign(format.id, 'Новый проект'),
      sheetSettings: createDefaultSettings(),
      projectName: 'Новый проект',
      tabs,
      tabSavedNames,
      tabSavedDigests,
      // Пустая этикетка — это новая этикетка: снимаем привязку к прежнему
      // файлу, чтобы «Сохранить» не записало в него пустую этикетку.
      savedName: '',
      pendingNameTabId: currentId || null,
      isDirty: false,
      history: [],
      historyIndex: -1,
      selectedObject: null,
      // Сигнал LabelCanvas очистить канвас
      loadRevision: get().loadRevision + 1,
    });
  },
  
  setEditorZoom: (zoom: number) => {
    const DEFAULT_ZOOM = 2.0;
    set({ editorZoom: Math.max(DEFAULT_ZOOM, Math.min(10.0, zoom)) });
  },

  /**
   * Ширина рабочей зоны вокруг этикетки (CSS px). Значение ставит LabelCanvas
   * после пересчёта; сравнение с текущим — чтобы не дёргать ре-рендер App на
   * каждом событии холста, когда размер поля не изменился.
   */
  setPasteboardPx: (px: number) => {
    if (get().pasteboardPx === px) return;
    set({ pasteboardPx: px });
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
    const id = newTabId();
    set({
      selectedFormat: format,
      labelDesign: design,
      sheetSettings: settings,
      projectName: design.metadata.name,
      // Только что открытый файл: название этикетки совпадает с именем файла.
      savedName: design.metadata.name,
      pendingNameTabId: null,
      // Файл без вкладок (старый формат) → проект с одной вкладкой.
      tabs: [{ id, name: design.metadata.name, labelDesign: design, sheetSettings: settings }],
      activeTabId: id,
      // Открытый файл — файл этой вкладки; отпечаток снят с его содержимого.
      tabSavedNames: { [id]: design.metadata.name },
      tabSavedDigests: {
        [id]: tabDigest({ name: design.metadata.name, labelDesign: design, sheetSettings: settings }),
      },
      tabHistories: {},
      tabZooms: {},
      isDirty: false,
      // Загруженный проект — это другое состояние: сбрасываем историю и выделение
      history: [],
      historyIndex: -1,
      selectedObject: null,
      // Сигнал LabelCanvas перезагрузить канвас из canvasJSON
      loadRevision: get().loadRevision + 1,
    });
  },
  
  /**
   * Полная загрузка проекта с вкладками. Заменяет список вкладок целиком —
   * это чтение файла, а не правка текущей, поэтому прежние вкладки не
   * смешиваются с новыми.
   */
  loadProjectWithTabs: (tabs: ProjectTabEntry[], activeTabId: string) => {
    const safeTabs = tabs.length > 0 ? tabs : [];
    const first = safeTabs[0];
    if (!first) return;
    const format = getFormatById(first.labelDesign.formatId) || LABEL_FORMATS[0];
    const active =
      safeTabs.find(t => t.id === activeTabId) || first;
    const activeFormat = getFormatById(active.labelDesign.formatId) || format;
    const activeName = active.name || active.labelDesign.metadata.name;
    set({
      selectedFormat: activeFormat,
      labelDesign: active.labelDesign,
      sheetSettings: active.sheetSettings,
      projectName: activeName,
      // Проект только что прочитан из файла — название совпадает с его именем.
      savedName: activeName,
      pendingNameTabId: null,
      tabs: safeTabs,
      activeTabId: active.id,
      // Файл открыт из вкладки active — её и считаем записанной. Остальные
      // вкладки файла на диске не имеют: сохранять их надо в свои файлы.
      tabSavedNames: { [active.id]: activeName },
      tabSavedDigests: Object.fromEntries(
        safeTabs.map(t => [
          t.id,
          tabDigest({ name: t.name, labelDesign: t.labelDesign, sheetSettings: t.sheetSettings }),
        ])
      ),
      tabHistories: {},
      // Масштаб в файле не хранится: все вкладки открываются с базового 2.0
      tabZooms: {},
      editorZoom: 2.0,
      isDirty: false,
      history: [],
      historyIndex: -1,
      selectedObject: null,
      loadRevision: get().loadRevision + 1,
    });
  },
  
  /**
   * Файл загружают, пока активна пустая вкладка (например, только что созданная
   * через «+»). Тогда вкладки из файла занимают её место: первая вкладка файла
   * наследует id пустой, остальные добавляются следом, а соседние вкладки
   * остаются нетронутыми — «Загрузить» не должен стирать чужую работу.
   *
   * Полная замена списка (loadProjectWithTabs) нужна лишь тогда, когда файл
   * открывают «с нуля», поверх единственной стартовой пустой вкладки.
   */
  loadFileIntoEmptyTab: (tabs: ProjectTabEntry[], activeTabId: string) => {
    const s = get();
    const emptyId = s.activeTabId;
    if (!emptyId) return;
    const first = tabs[0];
    if (!first) return;

    // Первая вкладка файла занимает место пустой: наследует её id, чтобы
    // сохранялся порядок ярлыков и никакая другая вкладка не сместилась.
    const rebased = tabs.map((t, i) => (i === 0 ? { ...t, id: emptyId } : t));
    const idx = s.tabs.findIndex(t => t.id === emptyId);
    // Защита от дубля id: если пустую запись вдруг не нашли, она всё равно
    // вычищается из списка — её место занимает вкладка из файла.
    const before =
      idx === -1 ? s.tabs.filter(t => t.id !== emptyId) : s.tabs.slice(0, idx);
    const after = idx === -1 ? [] : s.tabs.slice(idx + 1);

    const active = rebased.find(t => t.id === activeTabId) || rebased[0];
    const activeFormat = getFormatById(active.labelDesign.formatId) || LABEL_FORMATS[0];
    const activeName = active.name || active.labelDesign.metadata.name;

    // История и масштаб пустой вкладки заменяются данными первой вкладки файла;
    // остальные вкладки файла открываются с пустой историей и базовым масштабом.
    const tabHistories: Record<string, TabHistory> = { ...s.tabHistories };
    delete tabHistories[emptyId];
    const tabZooms: Record<string, number> = { ...s.tabZooms };
    delete tabZooms[emptyId];

    // Записана в файл здесь только активная вкладка файла; соседние вкладки
    // (и свои, и из файла) остаются без собственного файла на диске.
    const tabSavedNames: Record<string, string> = { ...s.tabSavedNames };
    delete tabSavedNames[emptyId];
    tabSavedNames[active.id] = activeName;

    const tabSavedDigests: Record<string, string> = { ...s.tabSavedDigests };
    delete tabSavedDigests[emptyId];
    for (const t of rebased) {
      tabSavedDigests[t.id] = tabDigest({
        name: t.name,
        labelDesign: t.labelDesign,
        sheetSettings: t.sheetSettings,
      });
    }

    set({
      selectedFormat: activeFormat,
      labelDesign: active.labelDesign,
      sheetSettings: active.sheetSettings,
      projectName: activeName,
      // Загруженные вкладки — содержимое только что открытого файла.
      savedName: activeName,
      pendingNameTabId: null,
      tabs: [...before, ...rebased, ...after],
      activeTabId: active.id,
      tabSavedNames,
      tabSavedDigests,
      tabHistories,
      tabZooms,
      editorZoom: 2.0,
      // Как и остальные загрузки: состояние считается синхронизированным
      // с только что открытым файлом.
      isDirty: false,
      history: [],
      historyIndex: -1,
      selectedObject: null,
      loadRevision: get().loadRevision + 1,
    });
  },

  /**
   * Добавить новую вкладку с пустой этикеткой того же формата.
   * Текущая вкладка сначала снимается (свежий канвас → запись вкладки),
   * поэтому ничто из несохранённого не теряется.
   */
  addTab: () => {
    const s = get();
    // Лимит вкладок: каждая вкладка держит свою копию дизайна в памяти.
    if (s.tabs.length >= 20) return;

    // Стартовое состояние ещё не оформлено вкладкой (tabs пуст) — не создавать
    // вторую пустую: текущее состояние само становится первой вкладкой.
    if (s.tabs.length === 0 && !s.activeTabId) {
      const id = newTabId();
      const entry: ProjectTabEntry = makeTabEntry({
        activeTabId: id,
        projectName: s.projectName,
        labelDesign: s.labelDesign,
        sheetSettings: s.sheetSettings,
      });
      set({
        tabs: [entry],
        activeTabId: id,
        tabHistories: {},
        tabZooms: {},
        // Только оформление существующего состояния вкладкой: контент не менялся.
        isDirty: s.isDirty,
      });
      return;
    }

    const snap = snapshotActiveTab(s);
    const tabs = snap.tabs;
    const id = newTabId();
    const name = `Этикетка ${tabs.length + 1}`;
    const design = createEmptyDesign(s.selectedFormat.id, name);
    const freshSettings = createDefaultSettings();

    set({
      tabs: [
        ...tabs,
        { id, name, labelDesign: design, sheetSettings: freshSettings },
      ],
      activeTabId: id,
      tabHistories: snap.tabHistories,
      tabZooms: { ...snap.tabZooms, [s.activeTabId]: s.editorZoom },
      // Новая вкладка всегда стартует с базового масштаба
      editorZoom: 2.0,
      projectName: name,
      // У новой этикетки своего файла ещё нет: «Сохранить» спросит имя.
      savedName: '',
      pendingNameTabId: id,
      labelDesign: design,
      sheetSettings: freshSettings,
      selectedFormat: s.selectedFormat,
      history: [],
      historyIndex: -1,
      selectedObject: null,
      isDirty: true,
      loadRevision: get().loadRevision + 1,
    });
  },
  
  /**
   * Переключиться на вкладку. Снимок уходящей вкладки пишется в список, а
   * канвас перезагружается через loadRevision — LabelCanvas применит
   * canvasJSON выбранной вкладки.
   */
  switchTab: (tabId: string) => {
    const s = get();
    if (tabId === s.activeTabId) return;
    const target = s.tabs.find(t => t.id === tabId);
    if (!target) return;

    // snapshotActiveTab уже прячет историю уходящей вкладки в tabHistories.
    const snap = snapshotActiveTab(s);
    const hist = snap.tabHistories[tabId] ?? { history: [], historyIndex: -1 };
    const targetName = target.name || target.labelDesign.metadata.name;
    // У каждой вкладки свой файл: вместе с вкладкой переключается и то, под
    // каким именем она сохранена (иначе «Сохранить» сравнивало бы название с
    // именем файла другой этикетки).
    const savedName = s.tabSavedNames[tabId] ?? '';

    set({
      tabs: snap.tabs,
      tabHistories: snap.tabHistories,
      // Масштаб уходящей вкладки прячется, масштаб целевой достаётся
      // (если его ещё нет — базовый 2.0).
      tabZooms: { ...snap.tabZooms, [s.activeTabId]: s.editorZoom },
      editorZoom: snap.tabZooms[tabId] ?? 2.0,
      activeTabId: tabId,
      projectName: targetName,
      savedName,
      // Вкладка без файла (или с другим названием) — новая: сохранится как новый файл.
      pendingNameTabId: savedName && targetName.trim() === savedName.trim() ? null : tabId,
      labelDesign: target.labelDesign,
      sheetSettings: target.sheetSettings,
      selectedFormat: getFormatById(target.labelDesign.formatId) || LABEL_FORMATS[0],
      history: hist.history,
      historyIndex: hist.historyIndex,
      selectedObject: null,
      // Само переключение контент не меняет: снимок уходящей вкладки уже был
      // отражён в состоянии, isDirty не трогаем.
      loadRevision: get().loadRevision + 1,
    });
  },
  
  /**
   * Закрыть вкладку. Если закрывают активную — активной становится соседняя
   * (следующая, иначе предыдущая). Последнюю вкладку закрыть нельзя: она
   * сбрасывается в пустую этикетку, чтобы редактор всегда что-то показывал.
   */
  closeTab: (tabId: string) => {
    const s = get();
    if (s.tabs.length === 0) {
      // Единственная (ещё не материализованная) вкладка = resetProject.
      get().resetProject();
      return;
    }

    const snap = snapshotActiveTab(s);
    const idx = snap.tabs.findIndex(t => t.id === tabId);
    if (idx === -1) return;

    let nextTabs = snap.tabs.filter(t => t.id !== tabId);
    const nextHistories = { ...snap.tabHistories };
    delete nextHistories[tabId];
    const nextZooms = { ...snap.tabZooms };
    delete nextZooms[tabId];
    // У закрытой вкладки больше нет ни имени в файле, ни отпечатка: её файл
    // остаётся на диске как есть, но перезаписан из другой вкладки не будет
    // (привязка к ручке файла живёт в useProjectFile и снимается по списку вкладок).
    const nextSavedNames = { ...s.tabSavedNames };
    delete nextSavedNames[tabId];
    const nextDigests = { ...s.tabSavedDigests };
    delete nextDigests[tabId];
    // Закрыли вкладку с ещё не сохранённым названием — отметка больше не нужна.
    const pendingNameTabId = s.pendingNameTabId === tabId ? null : s.pendingNameTabId;

    // Закрыли активную — выбираем соседнюю.
    if (tabId === s.activeTabId) {
      const neighbor = nextTabs[Math.min(idx, nextTabs.length - 1)];
      if (!neighbor) {
        // Закрыта последняя вкладка: проект превращается в одну пустую.
        const design = createEmptyDesign(s.selectedFormat.id, 'Новый проект');
        const id = newTabId();
        const fresh: ProjectTabEntry = {
          id,
          name: 'Новый проект',
          labelDesign: design,
          sheetSettings: createDefaultSettings(),
        };
        nextTabs = [fresh];
        set({
          tabs: nextTabs,
          tabHistories: {},
          tabZooms: {},
          activeTabId: id,
          projectName: fresh.name,
          tabSavedNames: {},
          tabSavedDigests: {},
          // Пустая этикетка — новая: прежний файл под неё не подставляется.
          savedName: '',
          pendingNameTabId: id,
          labelDesign: design,
          sheetSettings: fresh.sheetSettings,
          selectedFormat: s.selectedFormat,
          // Свежая пустая этикетка — базовый масштаб
          editorZoom: 2.0,
          history: [],
          historyIndex: -1,
          selectedObject: null,
          isDirty: true,
          loadRevision: get().loadRevision + 1,
        });
        return;
      }

      const activeFormat = getFormatById(neighbor.labelDesign.formatId) || LABEL_FORMATS[0];
      const hist = nextHistories[neighbor.id] ?? { history: [], historyIndex: -1 };
      const neighborName = neighbor.name || neighbor.labelDesign.metadata.name;
      const neighborSaved = nextSavedNames[neighbor.id] ?? '';
      set({
        tabs: nextTabs,
        tabHistories: nextHistories,
        tabZooms: nextZooms,
        activeTabId: neighbor.id,
        projectName: neighborName,
        // Соседняя вкладка могла уже иметь свой файл — поле показывает её имя.
        savedName: neighborSaved,
        pendingNameTabId:
          neighborSaved && neighborName.trim() === neighborSaved.trim() ? null : neighbor.id,
        tabSavedNames: nextSavedNames,
        tabSavedDigests: nextDigests,
        labelDesign: neighbor.labelDesign,
        sheetSettings: neighbor.sheetSettings,
        selectedFormat: activeFormat,
        history: hist.history,
        historyIndex: hist.historyIndex,
        // Масштаб соседней вкладки — её собственный
        editorZoom: nextZooms[neighbor.id] ?? 2.0,
        selectedObject: null,
        // Закрытие вкладки не меняет содержимое оставшихся этикеток (у каждой
        // свой файл), поэтому «несохранённых изменений» оно не создаёт — иначе
        // пользователь жмёт Ctrl+S и сохраняет то, что и так записано.
        loadRevision: get().loadRevision + 1,
      });
      return;
    }

    // Закрыта неактивная — просто удаляем её.
    set({
      tabs: nextTabs,
      tabHistories: nextHistories,
      tabZooms: nextZooms,
      tabSavedNames: nextSavedNames,
      tabSavedDigests: nextDigests,
      pendingNameTabId,
    });
  },
  
  renameTab: (tabId: string, name: string) => {
    const trimmed = name.trim() || 'Без названия';
    const s = get();
    const idx = s.tabs.findIndex(t => t.id === tabId);
    if (idx === -1) return;
    // Имя не изменилось — проект не менялся: без этой проверки любой клик по
    // ярлыку оставлял бы ложные «несохранённые изменения».
    if (s.tabs[idx].name === trimmed) return;

    const next = s.tabs.slice();
    next[idx] = { ...next[idx], name: trimmed };
    const isActive = tabId === s.activeTabId;
    set({
      tabs: next,
      ...(isActive
        ? {
            projectName: trimmed,
            labelDesign: {
              ...s.labelDesign,
              metadata: {
                ...s.labelDesign.metadata,
                name: trimmed,
                updatedAt: new Date().toISOString(),
              },
            },
            // Переименовали текущую этикетку — под этим именем файла ещё нет,
            // значит «Сохранить» должно идти путём «Сохранить как».
            pendingNameTabId: trimmed === s.savedName.trim() ? null : tabId,
          }
        : {}),
      isDirty: true,
    });
  },
  
  countTabs: () => get().tabs.length,
  
  setSelectedObject: (obj: any) => {
    set({ selectedObject: obj });
  },
  
  bumpObjectRevision: () => {
    set((state) => ({ objectRevision: state.objectRevision + 1 }));
  },
  
  bumpCanvasContentRevision: () => {
    set((state) => ({ canvasContentRevision: state.canvasContentRevision + 1 }));
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
    // Холст редактора прозрачный: белый лист этикетки — DOM-слой под холстом,
    // вокруг — рабочая зона. Снимок истории мог сохранить background (старые
    // версии), и без сброса холст стал бы белым целиком.
    editorCanvas.backgroundColor = '';
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
    // См. комментарий в undo: фон холста восстанавливается прозрачным.
    editorCanvas.backgroundColor = '';
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
