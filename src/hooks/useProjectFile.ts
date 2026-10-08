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
 */
async function ensureWritePermission(handle: FileSystemFileHandle): Promise<boolean> {
  const descriptor: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };
  if ((await handle.queryPermission(descriptor)) === 'granted') return true;
  return (await handle.requestPermission(descriptor)) === 'granted';
}

async function writeProjectToHandle(handle: FileSystemFileHandle, json: string): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(json);
  } finally {
    await writable.close();
  }
}

/**
 * «Сохранить как» — всегда новое место и (при успехе) новое имя проекта.
 *
 * Имя пишется в стор ДО сериализации: файл обязан содержать то же имя, что
 * видно в поле, иначе после перезагрузки страницы проект «потеряет» название.
 *
 * @returns true, если файл записан (или скачан в fallback-режиме);
 *          false — пользователь отменил диалог.
 */
/**
 * Полный снимок стора для записи в файл: активная вкладка с живым канвасом
 * (без него последние штрихи на холсте не попали бы в файл) плюс все вкладки.
 */
function collectProjectState() {
  const s = useProjectStore.getState();
  const liveDesign =
    s.editorCanvas && s.activeTabId
      ? { ...s.labelDesign, canvasJSON: serializeCanvas(s.editorCanvas) }
      : s.labelDesign;
  // Активная вкладка снимается из живого канваса; остальные — как есть.
  const tabs = s.activeTabId
    ? s.tabs.map(t =>
        t.id === s.activeTabId
          ? { ...t, labelDesign: liveDesign, sheetSettings: s.sheetSettings }
          : t
      )
    : [
        {
          id: s.activeTabId || 'tab-active',
          name: s.projectName,
          labelDesign: liveDesign,
          sheetSettings: s.sheetSettings,
        },
      ];
  return {
    design: liveDesign,
    settings: s.sheetSettings,
    tabs,
    activeTabId: s.activeTabId || tabs[0].id,
  };
}

async function saveProjectAs(currentName: string): Promise<boolean> {
  // Браузеры без File System Access API: единственная доступная семантика
  // «сохранить как» — спросить имя и скачать файл под ним.
  if (!canUseFileSystem()) {
    const input = window.prompt('Сохранить проект как:', currentName || 'Без названия');
    if (input === null) return false;

    const name = input.trim() || 'Без названия';
    useProjectStore.getState().setProjectName(name);

    const s = collectProjectState();
    downloadProjectFile(buildProjectFile(s.design, s.settings, s.tabs, s.activeTabId), projectFileName(name));
    useProjectStore.getState().markSaved();
    savedOnce = true;
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

  const name = projectNameFromFileName(handle.name) || 'Без названия';
  useProjectStore.getState().setProjectName(name);

  const s = collectProjectState();
  try {
    await writeProjectToHandle(
      handle,
      serializeProject(s.design, s.settings, s.tabs, s.activeTabId)
    );
  } catch (error) {
    alert(`Не удалось сохранить проект: ${errorMessage(error)}`);
    return false;
  }

  saveTarget = handle;
  savedOnce = true;
  useProjectStore.getState().markSaved();
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
  const name = project.labelDesign.metadata.name.trim() || projectNameFromFileName(fileName);
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
   * «Сохранить»: без вопросов перезаписывает текущий файл тем же именем.
   * Место спрашивается ровно один раз — при первом сохранении проекта.
   */
  const handleSave = useCallback(async () => {
    const state = useProjectStore.getState();

    if (!savedOnce) {
      await saveProjectAs(state.projectName);
      return;
    }

    if (!saveTarget) {
      // Fallback-режим: «то же место» недостижимо, повторяем скачивание под тем же именем.
      const s = collectProjectState();
      downloadProjectFile(
        buildProjectFile(s.design, s.settings, s.tabs, s.activeTabId),
        projectFileName(s.design.metadata.name)
      );
      useProjectStore.getState().markSaved();
      return;
    }

    if (!(await ensureWritePermission(saveTarget))) {
      // Разрешение не выдали — выходим на путь «Сохранить как»: молча ничего не теряем.
      await saveProjectAs(state.projectName);
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

    useProjectStore.getState().markSaved();
  }, []);

  /** «Сохранить как» (Ctrl+Shift+S): всегда новый файл, имя подставляется из него. */
  const handleSaveAs = useCallback(async () => {
    await saveProjectAs(useProjectStore.getState().projectName);
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
        loaded = applyLoadedProject(deserializeProject(await file.text()), file.name);
      } catch (error) {
        alert(`Ошибка загрузки: ${errorMessage(error)}`);
        return;
      }
      // Проект не принят (неизвестный формат) — файл текущим не делаем.
      if (!loaded) return;

      // Файл открыт — следующие Ctrl+S пишут в него же, без диалогов.
      saveTarget = handle;
      savedOnce = true;
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
        }
      } catch (err) {
        alert(`Ошибка загрузки: ${errorMessage(err)}`);
      }
    };
    input.click();
  }, []);

  return { handleSave, handleSaveAs, handleLoad };
}
