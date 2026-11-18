import { useCallback } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import {
  buildProjectFile,
  deserializeProject,
  downloadProjectFile,
  projectFileName,
  projectNameFromFileName,
  readProjectFile,
  serializeProject,
} from '../utils/projectSerializer';
import { getFormatById } from '../config/labelFormats';
import { ProjectFile } from '../types';
import { serializeCanvas } from '../utils/canvasHelpers';
import { clearAutosaveSnapshot } from '../utils/autosaveStorage';
import { hasProjectDir, pickProjectDir, writeCompanionPdf } from '../utils/projectPdf';

/**
 * Сохранение и загрузка проекта в файл — одна реализация на все входы:
 * кнопки в тулбаре («Сохранить», «Сохранить как», «Загрузить») и горячие
 * клавиши Ctrl+S / Ctrl+Shift+S / Ctrl+O.
 *
 * Зачем хук: раньше логика была продублирована в App.tsx и Toolbar.tsx, причём
 * механизм выбора файла в копиях уже разошёлся — App создавал <input> динамически,
 * Toolbar держал его в ref. Это давало два независимых пути к одному действию и
 * расхождение при любой правке. Здесь путь один.
 *
 * Состояние читается через getState(), а не через подписку: обработчики не
 * должны пересоздаваться при каждом изменении стора, иначе useEffect в
 * useHotkeys будет переподписывать слушатель keydown на каждый рендер.
 */

/** Типы файлов для диалогов выбора — одни и те же в save и open. */
const PICKER_TYPES: FilePickerAcceptType[] = [
  { description: 'Проект Megalabel', accept: { 'application/json': ['.json'] } },
];

/**
 * Файл каждой вкладки: имя файла на диске и ручка для записи.
 *
 * Файл описывает одну этикетку (текущую вкладку), поэтому и привязка к файлу у
 * каждой вкладки своя. Общая на всё приложение привязка давала худший из
 * возможных багов: сохранили этикетку во второй вкладке, закрыли её, нажали
 * Ctrl+S (поле ведь стало «изменённым») — и первая этикетка молча легла в файл
 * второй. При открытии такого файла появлялась первая этикетка.
 *
 * Хранится в модульных переменных, а не в состоянии React: ручка обязана
 * переживать ре-рендеры и повторные вызовы хука (хук вызывается и в App.tsx,
 * и в Toolbar.tsx — это два независимых вызова с одним модульным состоянием).
 *
 * `handle === null` в браузерах без File System Access API: там «то же место»
 * недостижимо, сохранение = повторное скачивание файла с тем же именем.
 */
interface TabFile {
  handle: FileSystemFileHandle | null;
  /** Имя файла на диске (с расширением), как его вернул диалог или открытие. */
  fileName: string;
}

const tabFiles = new Map<string, TabFile>();

/**
 * Забыть файлы вкладок, которых больше нет (вкладку закрыли, сбросили или
 * заменили загрузкой из файла). Ключ — id вкладки, поэтому запись закрытой
 * вкладки не может достаться другой этикетке.
 */
function pruneTabFiles(): void {
  const ids = new Set(useProjectStore.getState().tabs.map(t => t.id));
  for (const tabId of [...tabFiles.keys()]) {
    if (!ids.has(tabId)) tabFiles.delete(tabId);
  }
}

/** Запомнить файл активной вкладки: следующий Ctrl+S пишет уже в него. */
function bindActiveTabFile(file: TabFile): void {
  const tabId = useProjectStore.getState().activeTabId;
  if (tabId) tabFiles.set(tabId, file);
}

/**
 * Идёт сохранение: открыт диалог выбора файла или пишется файл.
 *
 * Повторный Ctrl+S (двойное нажатие, клик по кнопке при открытом диалоге) за
 * это время игнорируется: второй showSaveFilePicker падает с «File picker
 * already active», а две записи в один файл дают ложное сообщение об ошибке.
 */
let saving = false;

/** File System Access API доступен: Chromium + защищённый контекст (https/localhost). */
const canUseFileSystem = () =>
  typeof window !== 'undefined' &&
  typeof window.showSaveFilePicker === 'function' &&
  window.isSecureContext === true;

/** Отмена диалога пользователем — не ошибка, молча выходим. */
const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Неизвестная ошибка';

/**
 * Разрешение на запись в уже выбранный файл. После перезагрузки страницы
 * браузер сбрасывает выданное разрешение на «prompt» — спрашиваем в жесте
 * пользователя (обработчик кнопки/Ctrl+S), иначе запись молча упадёт.
 *
 * Ошибка запроса (файл удалён, браузер запретил) не должна всплывать
 * необработанным исключением: возвращаем false, и вызывающий код уходит на
 * «Сохранить как».
 */
async function ensureWritePermission(handle: FileSystemFileHandle): Promise<boolean> {
  try {
    const descriptor: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };
    if ((await handle.queryPermission(descriptor)) === 'granted') return true;
    return (await handle.requestPermission(descriptor)) === 'granted';
  } catch (error) {
    console.warn('Не удалось получить разрешение на запись в файл:', error);
    return false;
  }
}

/**
 * Запись JSON в файл.
 *
 * Поток закрывается ТОЛЬКО после успешной записи. При сбое (кончилось место,
 * отвалился диск) вызывается abort(): незавершённая запись не должна
 * «зафиксировать» обрезанный файл поверх прежней версии.
 */
async function writeProjectToHandle(handle: FileSystemFileHandle, json: string): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(json);
    await writable.close();
  } catch (error) {
    try {
      await writable.abort();
    } catch {
      // Поток уже освобождён/закрыт — исходная ошибка важнее.
    }
    throw error;
  }
}

/**
 * Снимок активной вкладки для записи в файл: этикетка с живого канваса (без
 * него последние штрихи на холсте не попали бы в файл) и одна запись в `tabs`.
 *
 * Пока холст применяет состояние (переключение вкладки, загрузка файла), он не
 * источник истины: снимок был бы недогруженным. В этом случае берётся
 * canvasJSON из стора — он и есть содержимое открываемой вкладки.
 *
 * @param nameOverride имя, которое записывается в файл вместо текущего
 *        (запись идёт ДО обновления стора: сорванное сохранение не переименует этикетку)
 */
function collectProjectState(nameOverride?: string) {
  const s = useProjectStore.getState();
  const liveDesign =
    s.editorCanvas && s.activeTabId && !s.canvasLoading
      ? { ...s.labelDesign, canvasJSON: serializeCanvas(s.editorCanvas) }
      : s.labelDesign;
  const design = nameOverride
    ? { ...liveDesign, metadata: { ...liveDesign.metadata, name: nameOverride } }
    : liveDesign;

  const activeTabId = s.activeTabId || 'tab-active';
  // В файл пишется ровно одна этикетка — та, из которой сохраняют. Соседние
  // вкладки живут в своих файлах: иначе файл второй этикетки содержал бы ещё и
  // первую, а сохранение из одной вкладки решало бы судьбу остальных.
  const current = s.tabs.find(t => t.id === s.activeTabId);
  const tabs = [
    {
      id: activeTabId,
      name: nameOverride ?? current?.name ?? s.projectName,
      labelDesign: design,
      sheetSettings: s.sheetSettings,
    },
  ];

  return {
    design,
    settings: s.sheetSettings,
    tabs,
    activeTabId,
  };
}

/**
 * Признак системного имени: его подставило приложение, а не пользователь.
 * Такое имя не должно спорить с именем файла (иначе новая этикетка навсегда
 * называлась бы «Новый проект» или «Этикетка 2»).
 */
const SYSTEM_NAME = /^(?:без названия|новый проект|этикетка\s+\d+)$/i;

function isSystemName(name: string): boolean {
  return name === '' || SYSTEM_NAME.test(name);
}

/**
 * Имя проекта после «Сохранить как».
 *
 * `keepTyped` — название только что ввели в поле, и это новая этикетка: оно
 * главнее имени файла (файл можно назвать как угодно, этикетка уже названа).
 * Иначе действует прежнее правило: имя проекта берётся из имени файла — так
 * работает переименование через «Сохранить как».
 */
function resolveSaveName(pickedFile: string, typedName: string, keepTyped: boolean): string {
  const typed = typedName.trim();
  const fromFile = projectNameFromFileName(pickedFile).trim();
  if (keepTyped && !isSystemName(typed)) return typed;
  if (fromFile) return fromFile;
  return isSystemName(typed) ? 'Без названия' : typed;
}

/**
 * Зафиксировать успешную запись: имя в поле, состояние «сохранено» и удаление
 * снимка автосохранения (он относился к прежнему, ещё не сохранённому
 * состоянию и иначе предлагался бы к восстановлению после перезагрузки).
 */
function commitSaved(name: string): void {
  const store = useProjectStore.getState();
  // Если файл назвали иначе, в поле всё равно попадает то, что записано в файле.
  if (store.projectName !== name) store.setProjectName(name);
  store.markSaved(name);
  clearAutosaveSnapshot();
}

/**
 * PDF-спутник рядом с файлом проекта: Проводник и Finder показывают у PDF
 * превью первой страницы, у `.json` — ничего. Файл производный: его отсутствие
 * или сбой записи не влияет на проект, поэтому ошибки только логируются.
 *
 * Папка нужна потому, что `showSaveFilePicker` не сообщает путь к выбранному
 * файлу — браузер прячет файловую систему. Она спрашивается один раз за сеанс
 * (см. projectPdf) и только когда пользователь уже видел подсказку.
 *
 * @param showHint подсказать, как включить превью: только при явном сохранении,
 *        а не на каждом автоматическом «Сохранить как» после смены названия.
 */
/** Подсказку о папке показываем один раз за сеанс, а не на каждое сохранение. */
let previewHintShown = false;

/** Снимок для спутника: формат, настройки листа и живой холст. */
function companionInput(projectFileName: string) {
  const s = useProjectStore.getState();
  if (!s.editorCanvas) return null;
  return {
    projectFileName,
    format: s.selectedFormat,
    sheetSettings: s.sheetSettings,
    editorCanvas: s.editorCanvas,
  };
}

async function writeProjectPreviewPdf(projectFileName: string, showHint: boolean): Promise<void> {
  // Папку ещё не выбирали — не дёргаем диалогом в спину, а объясняем один раз.
  if (!hasProjectDir() && !showHint) return;

  const input = companionInput(projectFileName);
  if (!input) return;

  const result = await writeCompanionPdf(input);

  if (result !== 'no-dir' || !showHint || previewHintShown) return;

  const want = window.confirm(
    'Рядом с проектом можно сохранять PDF-копию этикетки — тогда Проводник и Finder ' +
    'показывают у файла превью, как у обычного PDF.\n\n' +
    'Выбрать папку для превью сейчас?'
  );
  previewHintShown = true;
  if (!want) return;

  const picked = await pickProjectDir();
  if (picked) await writeCompanionPdf(input);
}

/**
 * «Сохранить как» — всегда новое место.
 *
 * @param keepTypedName набранное в поле название главнее имени файла:
 *        так автоматическое «Сохранить как» (после смены названия) не теряет
 *        только что введённое имя. Ручной Ctrl+Shift+S его не включает —
 *        там имя по-прежнему берётся из файла.
 * @returns true, если файл записан (или скачан в fallback-режиме);
 *          false — пользователь отменил диалог или запись не удалась.
 */
async function saveProjectAs(currentName: string, keepTypedName: boolean): Promise<boolean> {
  // Браузеры без File System Access API: единственная доступная семантика
  // «сохранить как» — спросить имя и скачать файл под ним.
  if (!canUseFileSystem()) {
    const input = window.prompt('Сохранить проект как:', currentName.trim() || 'Без названия');
    if (input === null) return false;

    const name = input.trim() || 'Без названия';
    const s = collectProjectState(name);
    downloadProjectFile(
      buildProjectFile(s.design, s.settings, s.tabs, s.activeTabId),
      projectFileName(name)
    );
    // Скачанный файл — файл этой вкладки: следующее «Сохранить» повторит
    // скачивание под тем же именем, не спрашивая.
    bindActiveTabFile({ handle: null, fileName: projectFileName(name) });
    commitSaved(name);
    return true;
  }

  let handle: FileSystemFileHandle;
  try {
    handle = await window.showSaveFilePicker({
      suggestedName: projectFileName(currentName),
      types: PICKER_TYPES,
    });
  } catch (error) {
    if (isAbort(error)) return false;
    alert(`Не удалось выбрать файл: ${errorMessage(error)}`);
    return false;
  }

  const name = resolveSaveName(handle.name, currentName, keepTypedName);
  const s = collectProjectState(name);
  try {
    await writeProjectToHandle(
      handle,
      serializeProject(s.design, s.settings, s.tabs, s.activeTabId)
    );
  } catch (error) {
    // Имя в сторе не тронуто: поле показывает прежнее название, файл — прежний.
    alert(`Не удалось сохранить проект: ${errorMessage(error)}`);
    return false;
  }

  bindActiveTabFile({ handle, fileName: handle.name });
  commitSaved(name);
  // Спутник — после фиксации сохранения: превью не должно задерживать запись
  // проекта и не должно влиять на её исход.
  await writeProjectPreviewPdf(handle.name, true);
  return true;
}

/**
 * Активная вкладка пуста (в неё можно «положить» файл, не спрашивая
 * подтверждения): у неё нет содержимого и нет несохранённых правок.
 *
 * «+» и закрытие последней вкладки создают вкладку с пустым canvasJSON;
 * после загрузки файла она уже не пуста — объекты и правки её заполнят.
 */
function isEmptyTabActive(s: {
  labelDesign: { canvasJSON: object };
  tabs: { id: string }[];
  activeTabId: string;
}): boolean {
  if (!s.activeTabId) return false;
  if (!s.tabs.some(t => t.id === s.activeTabId)) return false;
  return Object.keys(s.labelDesign.canvasJSON ?? {}).length === 0;
}

/**
 * Чем закончилась загрузка файла.
 *
 * `tabCount` — сколько этикеток было в файле. Файл из одной этикетки становится
 * файлом открытой вкладки; файл из нескольких не привязываем: сохранение из
 * него записало бы одну этикетку и потеряло остальные.
 */
interface LoadedProjectInfo {
  ok: boolean;
  tabCount: number;
}

/**
 * Загрузка разобранного файла в стор, с фолбэком имени по имени файла.
 *
 * Если активна пустая вкладка (только что созданная через «+» или сброшенная
 * крестиком), файл занимает её место, а соседние вкладки остаются как были.
 * Иначе загруженный проект заменяет всё открытое состояние.
 *
 * @returns ok: false, если проект не загружен (например, формат из файла
 *          неизвестен): тогда вызывающий код не должен считать этот файл
 *          текущим, иначе Ctrl+S перезапишет только что выбранный файл старым
 *          проектом.
 */
function applyLoadedProject(project: ProjectFile, fileName: string): LoadedProjectInfo {
  const s = useProjectStore.getState();
  const intoEmpty = isEmptyTabActive(s);

  // Вкладки из файла: валидация формата. Неизвестный формат — файл целиком
  // не принимаем, чтобы не вставлять в проект «половину» этикеток.
  if (project.tabs && project.tabs.length > 0) {
    const invalid = project.tabs.find(t => !getFormatById(t.labelDesign.formatId));
    if (invalid) {
      alert('Формат одной из вкладок не найден в списке доступных');
      return { ok: false, tabCount: 0 };
    }

    const name = projectNameFromFileName(fileName);
    const prepared = project.tabs.map((t, i) => ({
      ...t,
      name:
        t.name?.trim() ||
        t.labelDesign.metadata.name?.trim() ||
        (name ? `${name} ${i + 1}` : `Этикетка ${i + 1}`),
    }));
    const activeTabId = project.activeTabId || prepared[0].id;

    if (intoEmpty) {
      // Файл загружают в пустую вкладку: она заменяется вкладками из файла,
      // соседние вкладки не трогаются.
      useProjectStore.getState().loadFileIntoEmptyTab(prepared, activeTabId);
    } else {
      // Обычная загрузка «поверх всего открытого».
      useProjectStore.getState().loadProjectWithTabs(prepared, activeTabId);
    }
    return { ok: true, tabCount: prepared.length };
  }

  // Файл без вкладок (старый формат).
  if (!getFormatById(project.labelDesign.formatId)) {
    alert('Формат из файла не найден в списке доступных');
    return { ok: false, tabCount: 0 };
  }

  // Имя из метаданных приоритетно, но старые/чужие файлы могут прийти без него —
  // тогда берём имя файла, чтобы поле названия не осталось пустым.
  const name =
    (project.labelDesign.metadata?.name ?? '').trim() || projectNameFromFileName(fileName);
  const design = {
    ...project.labelDesign,
    metadata: { ...project.labelDesign.metadata, name: name || 'Новый проект' },
  };

  if (intoEmpty) {
    // Старый файл в пустую вкладку: оформляем его одной вкладкой и занимаем
    // ею место пустой, соседние вкладки не трогаются.
    useProjectStore.getState().loadFileIntoEmptyTab(
      [
        {
          id: '',
          name: design.metadata.name,
          labelDesign: design,
          sheetSettings: project.sheetSettings,
        },
      ],
      ''
    );
  } else {
    useProjectStore.getState().loadProject(design, project.sheetSettings);
  }
  return { ok: true, tabCount: 1 };
}

export function useProjectFile() {
  /**
   * «Сохранить»: перезаписывает файл этой вкладки без вопросов.
   *
   * Два исключения, когда место всё-таки спрашивается:
   *  - у этикетки ещё нет своего файла (новая вкладка, только что закрытая
   *    вкладка, сброс). Файл другой этикетки при этом не трогается;
   *  - название в поле изменили. Новая этикетка не должна затирать файл
   *    прежней: «Сохранить» работает как «Сохранить как», старый файл остаётся
   *    нетронутым, а новое название не теряется.
   */
  const handleSave = useCallback(async () => {
    if (saving) return;

    const state = useProjectStore.getState();
    const isNewLabel =
      state.pendingNameTabId !== null && state.pendingNameTabId === state.activeTabId;
    // Файл ищется по активной вкладке: у каждой этикетки свой файл, и поиск по
    // одной общей привязке — то, из-за чего сохранение уходило в чужой файл.
    pruneTabFiles();
    const tabId = state.activeTabId;
    const file = tabId ? tabFiles.get(tabId) : undefined;

    saving = true;
    try {
      if (!file || isNewLabel) {
        await saveProjectAs(state.projectName, isNewLabel);
        return;
      }

      if (!file.handle) {
        // Fallback-режим: «то же место» недостижимо, повторяем скачивание под тем же именем.
        const s = collectProjectState();
        downloadProjectFile(
          buildProjectFile(s.design, s.settings, s.tabs, s.activeTabId),
          projectFileName(file.fileName)
        );
        commitSaved(s.design.metadata.name);
        return;
      }

      if (!(await ensureWritePermission(file.handle))) {
        // Разрешение не выдали — выходим на путь «Сохранить как»: молча ничего не теряем.
        await saveProjectAs(state.projectName, false);
        return;
      }

      const s = collectProjectState();
      try {
        await writeProjectToHandle(
          file.handle,
          serializeProject(s.design, s.settings, s.tabs, s.activeTabId)
        );
      } catch (error) {
        alert(`Не удалось сохранить проект: ${errorMessage(error)}`);
        return;
      }

      commitSaved(s.design.metadata.name);
      // Спутник пишется и на обычном «Сохранить»: файл проекта мог быть открыт
      // до появления превью, и без этого PDF рядом так и не появился бы.
      await writeProjectPreviewPdf(file.fileName, true);
    } finally {
      saving = false;
    }
  }, []);

  /** «Сохранить как» (Ctrl+Shift+S): всегда новый файл, имя подставляется из него. */
  const handleSaveAs = useCallback(async () => {
    if (saving) return;
    saving = true;
    try {
      await saveProjectAs(useProjectStore.getState().projectName, false);
    } finally {
      saving = false;
    }
  }, []);

  const handleLoad = useCallback(async () => {
    const state = useProjectStore.getState();
    // На пустой вкладке подтверждение не нужно: там нечего терять, а вопрос
    // перед загрузкой в новую вкладку сбивал с толку (выглядел как ошибка).
    if (state.isDirty && !isEmptyTabActive(state)) {
      const confirmed = window.confirm('Есть несохранённые изменения. Загрузить проект без сохранения?');
      if (!confirmed) return;
    }

    if (canUseFileSystem()) {
      let handles: FileSystemFileHandle[];
      try {
        handles = await window.showOpenFilePicker({ multiple: false, types: PICKER_TYPES });
      } catch (error) {
        if (isAbort(error)) return;
        alert(`Не удалось открыть файл: ${errorMessage(error)}`);
        return;
      }

      const handle = handles[0];
      if (!handle) return;

      let info: LoadedProjectInfo = { ok: false, tabCount: 0 };
      try {
        const file = await handle.getFile();
        // Имя берём у ручки, а не у File: ручка всегда его знает, а имя файла —
        // единственный фолбэк для проектов, сохранённых без metadata.name.
        info = applyLoadedProject(deserializeProject(await file.text()), handle.name);
      } catch (error) {
        alert(`Ошибка загрузки: ${errorMessage(error)}`);
        return;
      }
      // Проект не принят (неизвестный формат) — файл текущим не делаем.
      if (!info.ok) return;

      // Вкладки, которых больше нет в проекте, теряют свои файлы.
      pruneTabFiles();
      // Файл из одной этикетки становится файлом открытой вкладки: следующие
      // Ctrl+S пишут в него же, без диалогов. Файл из нескольких этикеток не
      // привязываем: сохранение из него записало бы одну этикетку и потеряло
      // остальные.
      const activeId = useProjectStore.getState().activeTabId;
      if (activeId) {
        tabFiles.delete(activeId);
        if (info.tabCount === 1) tabFiles.set(activeId, { handle, fileName: handle.name });
      }
      // Загруженный файл — новая точка отсчёта: снимок прежней сессии больше
      // не «несохранённая работа» этого проекта.
      clearAutosaveSnapshot();
      return;
    }

    // Браузеры без File System Access API — скрытый <input> создаётся по требованию.
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const info = applyLoadedProject(await readProjectFile(file), file.name);
        if (!info.ok) return;

        pruneTabFiles();
        const activeId = useProjectStore.getState().activeTabId;
        if (activeId) {
          tabFiles.delete(activeId);
          if (info.tabCount === 1) {
            tabFiles.set(activeId, { handle: null, fileName: file.name });
          }
        }
        clearAutosaveSnapshot();
      } catch (err) {
        alert(`Ошибка загрузки: ${errorMessage(err)}`);
      }
    };
    input.click();
  }, []);

  return { handleSave, handleSaveAs, handleLoad };
}
