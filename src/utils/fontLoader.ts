import { FontConfig, LocalFontInfo } from '../config/fonts';

// IndexedDB для хранения локальных шрифтов
const DB_NAME = 'MegalabelFontsDB';
const STORE_NAME = 'localFonts';

// Инициализация IndexedDB
async function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'name' });
      }
    };
  });
}

// Сохранение локального шрифта в IndexedDB
async function saveLocalFontToDB(fontInfo: LocalFontInfo & { data: ArrayBuffer }): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(fontInfo);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Загрузка всех локальных шрифтов из IndexedDB
export async function loadLocalFontsFromDB(): Promise<(LocalFontInfo & { data: ArrayBuffer })[]> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  } catch (error) {
    console.error('Failed to load fonts from IndexedDB:', error);
    return [];
  }
}

// Извлечение имени шрифта из имени файла
function extractFontName(fileName: string): string {
  // Убрать расширение
  let name = fileName.replace(/\.(ttf|otf|woff|woff2)$/i, '');
  // Убрать слова начертания
  name = name.replace(/[-_]?(Bold|Italic|BoldItalic|Regular|Light|Medium|SemiBold|ExtraBold|Black|Thin|Italic)/gi, '').trim();
  // Заменить дефисы и подчёркивания на пробелы
  name = name.replace(/[-_]/g, ' ').trim();
  // Убрать лишние пробелы
  name = name.replace(/\s+/g, ' ');
  return name || 'Custom Font';
}

// Определение начертания по имени файла
function extractFontStyle(fileName: string): { weight: number; style: 'normal' | 'italic' } {
  const name = fileName.toLowerCase();
  
  let weight = 400;
  let style: 'normal' | 'italic' = 'normal';
  
  // Определяем стиль
  if (name.includes('bolditalic') || name.includes('bold-italic') || name.includes('bold_italic')) {
    weight = 700;
    style = 'italic';
  } else if (name.includes('italic') || name.includes('italic')) {
    weight = 400;
    style = 'italic';
  } else if (name.includes('bold')) {
    weight = 700;
    style = 'normal';
  } else if (name.includes('light')) {
    weight = 300;
    style = 'normal';
  } else if (name.includes('medium')) {
    weight = 500;
    style = 'normal';
  } else if (name.includes('semibold') || name.includes('semi-bold')) {
    weight = 600;
    style = 'normal';
  }
  
  return { weight, style };
}

// Загрузка Google Font
export async function loadGoogleFont(fontConfig: FontConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    // Проверить, не загружен ли уже
    if (document.querySelector(`link[href="${fontConfig.googleUrl}"]`)) {
      resolve();
      return;
    }
    
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = fontConfig.googleUrl!;
    
    link.onload = () => {
      document.fonts.ready.then(() => {
        // Сохранить в localStorage
        const loadedFonts = JSON.parse(localStorage.getItem('loadedGoogleFonts') || '[]');
        if (!loadedFonts.includes(fontConfig.id)) {
          loadedFonts.push(fontConfig.id);
          localStorage.setItem('loadedGoogleFonts', JSON.stringify(loadedFonts));
        }
        resolve();
      });
    };
    
    link.onerror = () => reject(new Error(`Failed to load font: ${fontConfig.name}`));
    
    document.head.appendChild(link);
  });
}

// Загрузка локальных шрифтов с компьютера
export async function loadLocalFonts(files: File[]): Promise<LocalFontInfo[]> {
  const results: LocalFontInfo[] = [];
  
  for (const file of files) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const fontFamily = extractFontName(file.name);
      const { weight, style } = extractFontStyle(file.name);
      
      const fontFace = new FontFace(fontFamily, arrayBuffer, {
        weight: String(weight),
        style: style,
      });
      
      await fontFace.load();
      document.fonts.add(fontFace);
      
      const fontInfo: LocalFontInfo = {
        name: fontFamily,
        weight,
        style,
        loaded: true,
      };
      
      // Сохранить в IndexedDB
      await saveLocalFontToDB({ ...fontInfo, data: arrayBuffer });
      
      results.push(fontInfo);
    } catch (error) {
      console.error(`Failed to load font from file ${file.name}:`, error);
    }
  }
  
  return results;
}

// Восстановление локальных шрифтов из IndexedDB при загрузке страницы
export async function restoreLocalFonts(): Promise<LocalFontInfo[]> {
  const savedFonts = await loadLocalFontsFromDB();
  const results: LocalFontInfo[] = [];
  
  for (const fontData of savedFonts) {
    try {
      const fontFace = new FontFace(fontData.name, fontData.data, {
        weight: String(fontData.weight),
        style: fontData.style,
      });
      
      await fontFace.load();
      document.fonts.add(fontFace);
      
      results.push({
        name: fontData.name,
        weight: fontData.weight,
        style: fontData.style,
        loaded: true,
      });
    } catch (error) {
      console.error(`Failed to restore font ${fontData.name}:`, error);
    }
  }
  
  return results;
}

// Проверка, загружен ли шрифт
export function isFontLoaded(fontFamily: string): boolean {
  return document.fonts.check(`16px "${fontFamily}"`);
}

// Получение списка загруженных Google Fonts из localStorage
export function getLoadedGoogleFontsFromStorage(): string[] {
  try {
    return JSON.parse(localStorage.getItem('loadedGoogleFonts') || '[]');
  } catch {
    return [];
  }
}
