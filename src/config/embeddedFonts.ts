export type FontStyleKey = 'normal' | 'bold' | 'italic' | 'bolditalic';

export interface EmbeddedFont {
  /** CSS font-family, fabric fontFamily и имя шрифта в jsPDF */
  family: string;
  /** Файлы начертаний относительно public/fonts/ (без слэша в начале) */
  files: Partial<Record<FontStyleKey, string>>;
}

/**
 * Шрифты, физически встроенные в приложение (public/fonts).
 *
 * Одни и те же файлы используются и для отрисовки на canvas (@font-face),
 * и для регистрации в jsPDF — это гарантирует, что PDF совпадает с визивигом
 * независимо от ОС пользователя.
 */
export const EMBEDDED_FONTS: EmbeddedFont[] = [
  {
    family: 'Arial',
    files: {
      normal: 'Arial-Regular.ttf',
      bold: 'Arial-Bold.ttf',
      italic: 'Arial-Italic.ttf',
      bolditalic: 'Arial-BoldItalic.ttf',
    },
  },
  {
    family: 'Times New Roman',
    files: {
      normal: 'TimesNewRoman-Regular.ttf',
      bold: 'TimesNewRoman-Bold.ttf',
      italic: 'TimesNewRoman-Italic.ttf',
      bolditalic: 'TimesNewRoman-BoldItalic.ttf',
    },
  },
  {
    family: 'Courier New',
    files: {
      normal: 'CourierNew-Regular.ttf',
      bold: 'CourierNew-Bold.ttf',
      italic: 'CourierNew-Italic.ttf',
      bolditalic: 'CourierNew-BoldItalic.ttf',
    },
  },
  {
    family: 'Georgia',
    files: {
      normal: 'Georgia-Regular.ttf',
      bold: 'Georgia-Bold.ttf',
      italic: 'Georgia-Italic.ttf',
      bolditalic: 'Georgia-BoldItalic.ttf',
    },
  },
  {
    family: 'Verdana',
    files: {
      normal: 'Verdana-Regular.ttf',
      bold: 'Verdana-Bold.ttf',
      italic: 'Verdana-Italic.ttf',
      bolditalic: 'Verdana-BoldItalic.ttf',
    },
  },
  {
    family: 'Tahoma',
    // У Tahoma нет курсива — используем прямые начертания, чтобы PDF
    // оставался в семействе и не уходил в fallback-шрифт.
    files: {
      normal: 'Tahoma-Regular.ttf',
      bold: 'Tahoma-Bold.ttf',
      italic: 'Tahoma-Regular.ttf',
      bolditalic: 'Tahoma-Bold.ttf',
    },
  },
  {
    family: 'Trebuchet MS',
    files: {
      normal: 'TrebuchetMS-Regular.ttf',
      bold: 'TrebuchetMS-Bold.ttf',
      italic: 'TrebuchetMS-Italic.ttf',
      bolditalic: 'TrebuchetMS-BoldItalic.ttf',
    },
  },
  {
    family: 'Roboto',
    files: {
      normal: 'Roboto-Regular.ttf',
      bold: 'Roboto-Bold.ttf',
      italic: 'Roboto-Italic.ttf',
      bolditalic: 'Roboto-BoldItalic.ttf',
    },
  },
  {
    family: 'Roboto Condensed',
    files: {
      normal: 'RobotoCondensed-Regular.ttf',
      bold: 'RobotoCondensed-Bold.ttf',
      italic: 'RobotoCondensed-Italic.ttf',
      bolditalic: 'RobotoCondensed-BoldItalic.ttf',
    },
  },
];

/** Шрифт fallback для неизвестных семейств (всегда встроен) */
export const FALLBACK_FAMILY = 'Roboto Condensed';

/** Переводит ключ начертания в CSS weight/style */
export function styleToCss(style: FontStyleKey): { weight: string; style: string } {
  switch (style) {
    case 'bold':
      return { weight: '700', style: 'normal' };
    case 'italic':
      return { weight: '400', style: 'italic' };
    case 'bolditalic':
      return { weight: '700', style: 'italic' };
    default:
      return { weight: '400', style: 'normal' };
  }
}
