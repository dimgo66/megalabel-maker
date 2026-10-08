import { create } from 'zustand';
import * as fabric from 'fabric';
import { LabelFormat, LabelDesign, ProjectTabEntry, SheetSettings } from '../types';
import { LABEL_FORMATS, getFormatById } from '../config/labelFormats';
import { createEmptyDesign, createDefaultSettings } from '../utils/projectSerializer';
import { FontConfig, LocalFontInfo, FONT_CONFIGS } from '../config/fonts';
import { serializeCanvas, withoutHistory } from '../utils/canvasHelpers';

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
  markSaved: () => void;
  resetProject: () => void;
  setEditorZoom: (zoom: number) => void;
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
  
  markSaved: () => {
    set({ isDirty: false });
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
    set({
      labelDesign: createEmptyDesign(format.id, 'Новый проект'),
      sheetSettings: createDefaultSettings(),
      projectName: 'Новый проект',
      tabs,
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
      // Файл без вкладок (старый формат) → проект с одной вкладкой.
      tabs: [{ id, name: design.metadata.name, labelDesign: design, sheetSettings: settings }],
      activeTabId: id,
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
    set({
      selectedFormat: activeFormat,
      labelDesign: active.labelDesign,
      sheetSettings: active.sheetSettings,
      projectName: active.name || active.labelDesign.metadata.name,
      tabs: safeTabs,
      activeTabId: active.id,
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

    // История и масштаб пустой вкладки заменяются данными первой вкладки файла;
    // остальные вкладки файла открываются с пустой историей и базовым масштабом.
    const tabHistories: Record<string, TabHistory> = { ...s.tabHistories };
    delete tabHistories[emptyId];
    const tabZooms: Record<string, number> = { ...s.tabZooms };
    delete tabZooms[emptyId];

    set({
      selectedFormat: activeFormat,
      labelDesign: active.labelDesign,
      sheetSettings: active.sheetSettings,
      projectName: active.name || active.labelDesign.metadata.name,
      tabs: [...before, ...rebased, ...after],
      activeTabId: active.id,
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

    set({
      tabs: snap.tabs,
      tabHistories: snap.tabHistories,
      // Масштаб уходящей вкладки прячется, масштаб целевой достаётся
      // (если его ещё нет — базовый 2.0).
      tabZooms: { ...snap.tabZooms, [s.activeTabId]: s.editorZoom },
      editorZoom: snap.tabZooms[tabId] ?? 2.0,
      activeTabId: tabId,
      projectName: target.name || target.labelDesign.metadata.name,
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
      set({
        tabs: nextTabs,
        tabHistories: nextHistories,
        tabZooms: nextZooms,
        activeTabId: neighbor.id,
        projectName: neighbor.name || neighbor.labelDesign.metadata.name,
        labelDesign: neighbor.labelDesign,
        sheetSettings: neighbor.sheetSettings,
        selectedFormat: activeFormat,
        history: hist.history,
        historyIndex: hist.historyIndex,
        // Масштаб соседней вкладки — её собственный
        editorZoom: nextZooms[neighbor.id] ?? 2.0,
        selectedObject: null,
        // Список вкладок изменился (удалена запись) — проект действительно
        // изменился, помечаем грязным.
        isDirty: true,
        loadRevision: get().loadRevision + 1,
      });
      return;
    }

    // Закрыта неактивная — просто удаляем её.
    set({ tabs: nextTabs, tabHistories: nextHistories, tabZooms: nextZooms, isDirty: true });
  },
  
  renameTab: (tabId: string, name: string) => {
    const trimmed = name.trim() || 'Без названия';
    set((state) => {
      const idx = state.tabs.findIndex(t => t.id === tabId);
      if (idx === -1) return {};
      const next = state.tabs.slice();
      next[idx] = { ...next[idx], name: trimmed };
      const is_active = tabId === state.activeTabId;
      return {
        tabs: next,
        ...(is_active
          ? {
              projectName: trimmed,
              labelDesign: {
                ...state.labelDesign,
                metadata: { ...state.labelDesign.metadata, name: trimmed },
              },
            }
          : {}),
        isDirty: true,
      };
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
