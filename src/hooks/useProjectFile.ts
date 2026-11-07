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
 * Текущий файл проекта и его имя.
 *
 * Хранится в модульных переменных, а не в состоянии React: ручка обязана
 * переживать ре-рендеры и повторные вызовы хука (хук вызывается и в App.tsx,
 * и в Toolbar.tsx — это два независимых вызова с одним модульным состоянием).
 *
 * `handle === null` в браузерах без File System Access API: там «то же место»
 * недостижимо, сохранение = скачивание с тем же именем, а `savedOnce` отделяет
 * первое сохранение (спрашиваем имя) от последующих (без вопросов).
 */
let saveTarget: FileSystemFileHandle | null = null;
let savedOnce = false;

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
 * Полный снимок стора для записи в файл: активная вкладка с живым канвасом
 * (без него последние штрихи на холсте не попали бы в файл) плюс все вкладки.
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
  // Активная вкладка снимается из живого канваса; остальные — как есть.
  const tabs = s.activeTabId
    ? s.tabs.map(t =>
        t.id === s.activeTabId
          ? {
              ...t,
              name: nameOverride ?? t.name,
              labelDesign: design,
              sheetSettings: s.sheetSettings,
            }
          : t
      )
    : [
        {
          id: activeTabId,
          name: nameOverride ?? s.projectName,
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
    savedOnce = true;
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

  saveTarget = handle;
  savedOnce = true;
  commitSaved(name);
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
 * Загрузка разобранного файла в стор, с фолбэком имени по имени файла.
 *
 * Если активна пустая вкладка (только что созданная через «+» или сброшенная
 * крестиком), файл занимает её место, а соседние вкладки остаются как были.
 * Иначе загруженный проект заменяет всё открытое состояние.
 *
 * @returns false, если проект не загружен (например, формат из файла неизвестен):
 *          тогда вызывающий код не должен считать этот файл текущим, иначе
 *          Ctrl+S перезапишет только что выбранный файл старым проектом.
 */
function applyLoadedProject(project: ProjectFile, fileName: string): boolean {
  const s = useProjectStore.getState();
  const intoEmpty = isEmptyTabActive(s);

  // Вкладки из файла: валидация формата. Неизвестный формат — файл целиком
  // не принимаем, чтобы не вставлять в проект «половину» этикеток.
  if (project.tabs && project.tabs.length > 0) {
    const invalid = project.tabs.find(t => !getFormatById(t.labelDesign.formatId));
    if (invalid) {
      alert('Формат одной из вкладок не найден в списке доступных');
      return false;
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
    return true;
  }

  // Файл без вкладок (старый формат).
  if (!getFormatById(project.labelDesign.formatId)) {
    alert('Формат из файла не найден в списке доступных');
    return false;
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
  return true;
}

export function useProjectFile() {
  /**
   * «Сохранить»: перезаписывает текущий файл тем же именем без вопросов.
   *
   * Два исключения, когда место всё-таки спрашивается:
   *  - файла ещё нет (первое сохранение);
   *  - название в поле изменили. Новая этикетка не должна затирать файл
   *    прежней: «Сохранить» работает как «Сохранить как», старый файл остаётся
   *    нетронутым, а новое название не теряется.
   */
  const handleSave = useCallback(async () => {
    if (saving) return;

    const state = useProjectStore.getState();
    const isNewLabel =
      state.pendingNameTabId !== null && state.pendingNameTabId === state.activeTabId;

    saving = true;
    try {
      if (!savedOnce || isNewLabel) {
        await saveProjectAs(state.projectName, isNewLabel);
        return;
      }

      if (!saveTarget) {
        // Fallback-режим: «то же место» недостижимо, повторяем скачивание под тем же именем.
        const s = collectProjectState();
        downloadProjectFile(
          buildProjectFile(s.design, s.settings, s.tabs, s.activeTabId),
          projectFileName(s.design.metadata.name)
        );
        commitSaved(s.design.metadata.name);
        return;
      }

      if (!(await ensureWritePermission(saveTarget))) {
        // Разрешение не выдали — выходим на путь «Сохранить как»: молча ничего не теряем.
        await saveProjectAs(state.projectName, false);
        return;
      }

      const s = collectProjectState();
      try {
        await writeProjectToHandle(
          saveTarget,
          serializeProject(s.design, s.settings, s.tabs, s.activeTabId)
        );
      } catch (error) {
        alert(`Не удалось сохранить проект: ${errorMessage(error)}`);
        return;
      }

      commitSaved(s.design.metadata.name);
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

      let loaded = false;
      try {
        const file = await handle.getFile();
        // Имя берём у ручки, а не у File: ручка всегда его знает, а имя файла —
        // единственный фолбэк для проектов, сохранённых без metadata.name.
        loaded = applyLoadedProject(deserializeProject(await file.text()), handle.name);
      } catch (error) {
        alert(`Ошибка загрузки: ${errorMessage(error)}`);
        return;
      }
      // Проект не принят (неизвестный формат) — файл текущим не делаем.
      if (!loaded) return;

      // Файл открыт — следующие Ctrl+S пишут в него же, без диалогов.
      saveTarget = handle;
      savedOnce = true;
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
        if (applyLoadedProject(await readProjectFile(file), file.name)) {
          savedOnce = true;
          clearAutosaveSnapshot();
        }
      } catch (err) {
        alert(`Ошибка загрузки: ${errorMessage(err)}`);
      }
    };
    input.click();
  }, []);

  return { handleSave, handleSaveAs, handleLoad };
}
