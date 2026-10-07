import { LabelDesign, SheetSettings, ProjectFile } from '../types';

const APP_VERSION = '1.0.0';

/**
 * Расширение файла проекта. Одно место правды для записи и разбора имён.
 *
 * Именно `.json`, без приставки `.labelproj`: пользователю нужен файл, который
 * открывается любым редактором и не обрастает двойным хвостом в диалоге
 * сохранения. Имя проекта уже видно в поле названия, дублировать его в имени
 * файла незачем. Старые файлы `.labelproj.json` продолжают открываться — они
 * всё равно оканчиваются на `.json` (см. `projectNameFromFileName`).
 */
export const PROJECT_FILE_EXTENSION = '.json';

/**
 * Собирает объект проекта. Отдельно от `serializeProject`, потому что одна и та
 * же структура нужна и строкой (запись в выбранный файл), и объектом
 * (`downloadProjectFile` в браузерах без File System Access API).
 */
export function buildProjectFile(design: LabelDesign, settings: SheetSettings): ProjectFile {
  return {
    appVersion: APP_VERSION,
    labelDesign: design,
    sheetSettings: settings,
  };
}

/**
 * Serialize project to JSON string
 */
export function serializeProject(design: LabelDesign, settings: SheetSettings): string {
  return JSON.stringify(buildProjectFile(design, settings), null, 2);
}

/**
 * Имя проекта → безопасное имя файла. Windows запрещает \ / : * ? " < > |
 * и точку в конце; пустое имя заменяется на «Без названия», иначе файл
 * получил бы имя «.json».
 */
export function sanitizeFileBaseName(name: string): string {
  const cleaned = (name || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '')
    .slice(0, 120);
  return cleaned || 'Без названия';
}

/**
 * Имя проекта → имя файла проекта.
 *
 * Расширение не удваивается и проверяется без учёта регистра: пользователь
 * мог ввести «Этикетки.JSON» или «Этикетки.labelproj.json» — во втором случае
 * хвост `.labelproj` тоже снимается, иначе имя файла осталось бы с приставкой,
 * от которой мы как раз избавляемся.
 */
export function projectFileName(name: string): string {
  // Порядок важен: сначала снимается ПОЛНЫЙ старый хвост `.labelproj.json`,
  // иначе от него осталась бы приставка `.labelproj` перед новым `.json`.
  const base = sanitizeFileBaseName(name)
    .replace(/\.labelproj\.json$/i, '')
    .replace(/\.json$/i, '')
    .replace(/\.labelproj$/i, '');
  return base ? `${base}${PROJECT_FILE_EXTENSION}` : `Без названия${PROJECT_FILE_EXTENSION}`;
}

/** Имя файла проекта → имя проекта (расширение снимается). */
export function projectNameFromFileName(fileName: string): string {
  return fileName
    .replace(/\.labelproj\.json$/i, '')
    .replace(/\.json$/i, '')
    .trim();
}

/**
 * Deserialize project from JSON string
 */
export function deserializeProject(json: string): ProjectFile {
  try {
    const project = JSON.parse(json) as ProjectFile;

    // Validate structure
    if (!project.appVersion || !project.labelDesign || !project.sheetSettings) {
      throw new Error('Invalid project file structure');
    }

    if (!project.labelDesign.version || !project.labelDesign.formatId) {
      throw new Error('Invalid label design data');
    }

    if (!project.sheetSettings.orientation) {
      throw new Error('Invalid sheet settings');
    }

    return project;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('File is not a valid JSON');
    }
    throw error;
  }
}

/**
 * Download project file to user's computer
 */
export function downloadProjectFile(project: ProjectFile, filename?: string): void {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename || projectFileName(project.labelDesign.metadata.name);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Read project file from File object.
 *
 * Принимаем любое `.json`: и новые файлы, и старые `.labelproj.json` — они
 * оканчиваются на `.json`, поэтому отдельная ветка не нужна.
 */
export function readProjectFile(file: File): Promise<ProjectFile> {
  return new Promise((resolve, reject) => {
    if (!file.name.toLowerCase().endsWith(PROJECT_FILE_EXTENSION)) {
      reject(new Error('Ожидается файл проекта .json'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const project = deserializeProject(content);
        resolve(project);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    reader.readAsText(file);
  });
}

/**
 * Create a new empty LabelDesign
 */
export function createEmptyDesign(formatId: string, name: string = 'Untitled'): LabelDesign {
  const now = new Date().toISOString();
  return {
    version: 1,
    formatId,
    canvasJSON: {},
    metadata: {
      name,
      createdAt: now,
      updatedAt: now,
      customFonts: [],
    },
  };
}

/**
 * Безопасное поле нового проекта, мм.
 *
 * Совпадает с аварийным отступом в `textFitter` (`DEFAULT_INSET_MM`), который
 * применяется, когда безопасные поля выключены нулём: при значении по умолчанию
 * вставка текста и подгонка кегля идут по одной и той же зоне.
 */
export const DEFAULT_SAFETY_MARGIN_MM = 1;

/**
 * Create default SheetSettings
 */
export function createDefaultSettings(): SheetSettings {
  return {
    orientation: 'portrait',
    showCutLines: true,
    mirrorPrint: false,
    safetyMargin_mm: DEFAULT_SAFETY_MARGIN_MM,
  };
}
