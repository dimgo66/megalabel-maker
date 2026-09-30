import { LabelDesign, SheetSettings, ProjectFile } from '../types';

const APP_VERSION = '1.0.0';

/**
 * Serialize project to JSON string
 */
export function serializeProject(design: LabelDesign, settings: SheetSettings): string {
  const project: ProjectFile = {
    appVersion: APP_VERSION,
    labelDesign: design,
    sheetSettings: settings,
  };
  return JSON.stringify(project, null, 2);
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
  a.download = filename || `${project.labelDesign.metadata.name || 'label-design'}.labelproj.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Read project file from File object
 */
export function readProjectFile(file: File): Promise<ProjectFile> {
  return new Promise((resolve, reject) => {
    if (!file.name.endsWith('.labelproj.json') && !file.name.endsWith('.json')) {
      reject(new Error('Invalid file format. Expected .labelproj.json'));
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
 * Create default SheetSettings
 */
export function createDefaultSettings(): SheetSettings {
  return {
    orientation: 'portrait',
    showCutLines: true,
    mirrorPrint: false,
    safetyMargin_mm: 2,
  };
}
