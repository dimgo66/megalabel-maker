import { EMBEDDED_FONTS, styleToCss, FontStyleKey } from '../config/embeddedFonts';

let injected = false;

/**
 * Регистрирует @font-face для шрифтов, встроенных в приложение.
 * Благодаря этому canvas рисует тем же файлом, что и попадёт в PDF,
 * а не системным шрифтом ОС.
 */
export function injectEmbeddedFontFaces(baseUrl: string): void {
  if (injected) return;

  let css = '';
  for (const font of EMBEDDED_FONTS) {
    for (const key of Object.keys(font.files) as FontStyleKey[]) {
      const file = font.files[key]!;
      const { weight, style } = styleToCss(key);
      css +=
        `@font-face{font-family:"${font.family}";` +
        `src:url("${baseUrl}fonts/${file}") format("truetype");` +
        `font-weight:${weight};font-style:${style};font-display:block;}\n`;
    }
  }

  const el = document.createElement('style');
  el.setAttribute('data-embedded-fonts', '');
  el.textContent = css;
  document.head.appendChild(el);
  injected = true;
}

/** Дожидается, пока все встроенные шрифты загружены браузером */
export async function ensureEmbeddedFontsLoaded(): Promise<void> {
  const loads: Promise<unknown>[] = [];
  for (const font of EMBEDDED_FONTS) {
    for (const key of Object.keys(font.files) as FontStyleKey[]) {
      const { weight, style } = styleToCss(key);
      loads.push(
        document.fonts.load(`${style} ${weight} 16px "${font.family}"`).catch(() => [])
      );
    }
  }
  await Promise.all(loads);
}
