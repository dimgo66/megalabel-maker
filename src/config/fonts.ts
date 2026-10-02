export interface FontConfig {
  id: string;
  name: string;
  source: 'system' | 'google' | 'local';
  weights: number[];
  styles: ('normal' | 'italic')[];
  cyrillic: boolean;
  loaded: boolean;
  googleUrl?: string;
  recommended?: boolean;
}

export interface LocalFontInfo {
  name: string;
  weight: number;
  style: 'normal' | 'italic';
  loaded: boolean;
  data?: ArrayBuffer; // Для сохранения в IndexedDB
}

// Системные шрифты (доступны сразу)
const SYSTEM_FONTS: FontConfig[] = [
  {
    id: 'roboto-condensed',
    name: 'Roboto Condensed',
    source: 'system',
    weights: [400, 700],
    styles: ['normal', 'italic'],
    cyrillic: true,
    loaded: true,
    recommended: true,
  },
  {
    id: 'arial',
    name: 'Arial',
    source: 'system',
    weights: [400, 700],
    styles: ['normal', 'italic'],
    cyrillic: true,
    loaded: true,
  },
  {
    id: 'times-new-roman',
    name: 'Times New Roman',
    source: 'system',
    weights: [400, 700],
    styles: ['normal', 'italic'],
    cyrillic: true,
    loaded: true,
  },
  {
    id: 'courier-new',
    name: 'Courier New',
    source: 'system',
    weights: [400, 700],
    styles: ['normal', 'italic'],
    cyrillic: true,
    loaded: true,
  },
  {
    id: 'georgia',
    name: 'Georgia',
    source: 'system',
    weights: [400, 700],
    styles: ['normal', 'italic'],
    cyrillic: true,
    loaded: true,
  },
  {
    id: 'verdana',
    name: 'Verdana',
    source: 'system',
    weights: [400, 700],
    styles: ['normal', 'italic'],
    cyrillic: true,
    loaded: true,
  },
  {
    id: 'tahoma',
    name: 'Tahoma',
    source: 'system',
    weights: [400, 700],
    styles: ['normal', 'italic'],
    cyrillic: true,
    loaded: true,
  },
  {
    id: 'trebuchet-ms',
    name: 'Trebuchet MS',
    source: 'system',
    weights: [400, 700],
    styles: ['normal', 'italic'],
    cyrillic: true,
    loaded: true,
  },
  {
    id: 'roboto',
    name: 'Roboto',
    source: 'system',
    weights: [400, 500, 700],
    styles: ['normal', 'italic'],
    cyrillic: true,
    loaded: true,
  },
];

// Google Fonts с кириллицей
const GOOGLE_FONTS: FontConfig[] = [
  {
    id: 'inter',
    name: 'Inter',
    source: 'google',
    weights: [400, 500, 600, 700],
    styles: ['normal', 'italic'],
    cyrillic: true,
    loaded: false,
    googleUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter:ital,wght@1,400;1,500;1,600;1,700&display=swap',
  },
  {
    id: 'open-sans',
    name: 'Open Sans',
    source: 'google',
    weights: [400, 500, 600, 700],
    styles: ['normal', 'italic'],
    cyrillic: true,
    loaded: false,
    googleUrl: 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&family=Open+Sans:ital,wght@1,400;1,500;1,600;1,700&display=swap',
  },
  {
    id: 'pt-sans',
    name: 'PT Sans',
    source: 'google',
    weights: [400, 700],
    styles: ['normal', 'italic'],
    cyrillic: true,
    loaded: false,
    googleUrl: 'https://fonts.googleapis.com/css2?family=PT+Sans:wght@400;700&family=PT+Sans:ital,wght@1,400;1,700&display=swap',
  },
  {
    id: 'pt-serif',
    name: 'PT Serif',
    source: 'google',
    weights: [400, 700],
    styles: ['normal', 'italic'],
    cyrillic: true,
    loaded: false,
    googleUrl: 'https://fonts.googleapis.com/css2?family=PT+Serif:wght@400;700&family=PT+Serif:ital,wght@1,400;1,700&display=swap',
  },
  {
    id: 'montserrat',
    name: 'Montserrat',
    source: 'google',
    weights: [400, 500, 600, 700],
    styles: ['normal', 'italic'],
    cyrillic: true,
    loaded: false,
    googleUrl: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Montserrat:ital,wght@1,400;1,500;1,600;1,700&display=swap',
  },
  {
    id: 'rubik',
    name: 'Rubik',
    source: 'google',
    weights: [400, 500, 600, 700],
    styles: ['normal', 'italic'],
    cyrillic: true,
    loaded: false,
    googleUrl: 'https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700&family=Rubik:ital,wght@1,400;1,500;1,600;1,700&display=swap',
  },
  {
    id: 'manrope',
    name: 'Manrope',
    source: 'google',
    weights: [400, 500, 600, 700],
    styles: ['normal'],
    cyrillic: true,
    loaded: false,
    googleUrl: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap',
  },
  {
    id: 'golos-text',
    name: 'Golos Text',
    source: 'google',
    weights: [400, 500, 600, 700],
    styles: ['normal'],
    cyrillic: true,
    loaded: false,
    googleUrl: 'https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&display=swap',
  },
  {
    id: 'onest',
    name: 'Onest',
    source: 'google',
    weights: [400, 500, 600, 700],
    styles: ['normal'],
    cyrillic: true,
    loaded: false,
    googleUrl: 'https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&display=swap',
  },
  {
    id: 'exo-2',
    name: 'Exo 2',
    source: 'google',
    weights: [400, 500, 600, 700],
    styles: ['normal', 'italic'],
    cyrillic: true,
    loaded: false,
    googleUrl: 'https://fonts.googleapis.com/css2?family=Exo+2:wght@400;500;600;700&family=Exo+2:ital,wght@1,400;1,500;1,600;1,700&display=swap',
  },
  {
    id: 'play',
    name: 'Play',
    source: 'google',
    weights: [400, 700],
    styles: ['normal'],
    cyrillic: true,
    loaded: false,
    googleUrl: 'https://fonts.googleapis.com/css2?family=Play:wght@400;700&display=swap',
  },
  {
    id: 'ubuntu',
    name: 'Ubuntu',
    source: 'google',
    weights: [400, 500, 700],
    styles: ['normal', 'italic'],
    cyrillic: true,
    loaded: false,
    googleUrl: 'https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&family=Ubuntu:ital,wght@1,400;1,500;1,700&display=swap',
  },
  {
    id: 'noto-sans',
    name: 'Noto Sans',
    source: 'google',
    weights: [400, 500, 600, 700],
    styles: ['normal', 'italic'],
    cyrillic: true,
    loaded: false,
    googleUrl: 'https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&family=Noto+Sans:ital,wght@1,400;1,500;1,600;1,700&display=swap',
  },
  {
    id: 'jost',
    name: 'Jost',
    source: 'google',
    weights: [400, 500, 600, 700],
    styles: ['normal', 'italic'],
    cyrillic: true,
    loaded: false,
    googleUrl: 'https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&family=Jost:ital,wght@1,400;1,500;1,600;1,700&display=swap',
  },
  {
    id: 'ibm-plex-sans',
    name: 'IBM Plex Sans',
    source: 'google',
    weights: [400, 500, 600, 700],
    styles: ['normal', 'italic'],
    cyrillic: true,
    loaded: false,
    googleUrl: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Sans:ital,wght@1,400;1,500;1,600;1,700&display=swap',
  },
  {
    id: 'alegreya',
    name: 'Alegreya',
    source: 'google',
    weights: [400, 500, 700],
    styles: ['normal', 'italic'],
    cyrillic: true,
    loaded: false,
    googleUrl: 'https://fonts.googleapis.com/css2?family=Alegreya:wght@400;500;700&family=Alegreya:ital,wght@1,400;1,500;1,700&display=swap',
  },
  {
    id: 'source-sans-3',
    name: 'Source Sans 3',
    source: 'google',
    weights: [400, 500, 600, 700],
    styles: ['normal', 'italic'],
    cyrillic: true,
    loaded: false,
    googleUrl: 'https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700&family=Source+Sans+3:ital,wght@1,400;1,500;1,600;1,700&display=swap',
  },
];

// Myriad Pro (загружается с компьютера)
const LOCAL_FONTS: FontConfig[] = [
  {
    id: 'myriad-pro',
    name: 'Myriad Pro',
    source: 'local',
    weights: [400, 700],
    styles: ['normal', 'italic'],
    cyrillic: true,
    loaded: false,
    recommended: true,
  },
];

// Все доступные шрифты
export const FONT_CONFIGS: FontConfig[] = [
  ...SYSTEM_FONTS,
  ...GOOGLE_FONTS,
  ...LOCAL_FONTS,
];

// Получить шрифт по ID
export function getFontById(id: string): FontConfig | undefined {
  return FONT_CONFIGS.find(f => f.id === id);
}

// Получить все шрифты по категории
export function getFontsBySource(source: 'system' | 'google' | 'local'): FontConfig[] {
  return FONT_CONFIGS.filter(f => f.source === source);
}
