/**
 * Load Myriad Pro (or any custom) font files into the browser.
 * Uses the FontFace API to register fonts dynamically.
 */

const loadedFonts = new Set<string>();

/**
 * Detect font family name from file
 */
function getFontFamilyFromFile(file: File): string {
  // Extract family name from filename (remove extension, replace hyphens/underscores)
  const name = file.name.replace(/\.(ttf|otf|woff|woff2)$/i, '');
  // Convert "MyriadPro-Regular" -> "Myriad Pro Regular"
  return name
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim() || 'Custom Font';
}

/**
 * Determine font style/weight from filename
 */
function getFontStyle(file: File): { weight: string; style: string } {
  const name = file.name.toLowerCase();
  
  let weight = '400';
  let style = 'normal';
  
  if (name.includes('bolditalic') || name.includes('bold-italic') || name.includes('bold_italic')) {
    weight = '700';
    style = 'italic';
  } else if (name.includes('bold')) {
    weight = '700';
    style = 'normal';
  } else if (name.includes('lightitalic') || name.includes('light-italic')) {
    weight = '300';
    style = 'italic';
  } else if (name.includes('light')) {
    weight = '300';
    style = 'normal';
  } else if (name.includes('mediumitalic') || name.includes('medium-italic')) {
    weight = '500';
    style = 'italic';
  } else if (name.includes('medium')) {
    weight = '500';
    style = 'normal';
  } else if (name.includes('semibold') || name.includes('semi-bold')) {
    weight = '600';
    style = 'normal';
  } else if (name.includes('italic')) {
    weight = '400';
    style = 'italic';
  } else if (name.includes('regular')) {
    weight = '400';
    style = 'normal';
  }
  
  return { weight, style };
}

/**
 * Load font files and register them with the browser
 */
export async function loadMyriadPro(files: File[]): Promise<{ loaded: string[]; errors: string[] }> {
  const loaded: string[] = [];
  const errors: string[] = [];

  for (const file of files) {
    try {
      const family = getFontFamilyFromFile(file);
      const { weight, style } = getFontStyle(file);
      
      const arrayBuffer = await file.arrayBuffer();
      const fontFace = new FontFace(family, arrayBuffer, {
        weight,
        style,
        display: 'swap',
      });

      await fontFace.load();
      document.fonts.add(fontFace);
      
      const fontKey = `${family} ${weight} ${style}`;
      if (!loadedFonts.has(fontKey)) {
        loadedFonts.add(fontKey);
        loaded.push(family);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Failed to load ${file.name}: ${message}`);
    }
  }

  return { loaded, errors };
}

/**
 * Check if a specific font is available
 */
export function isFontLoaded(fontFamily: string): boolean {
  return Array.from(loadedFonts).some(key => key.startsWith(fontFamily));
}

/**
 * Get list of all loaded font families
 */
export function getLoadedFontFamilies(): string[] {
  const families = new Set<string>();
  loadedFonts.forEach(key => {
    const family = key.split(' ')[0];
    families.add(family);
  });
  return Array.from(families);
}

/**
 * Inject a CSS @font-face rule for the loaded fonts (useful for PDF generation)
 */
export function getFontCSSRules(): string {
  // FontFace API fonts are already available in the document
  // This returns a CSS string that can be used in PDF generation
  return Array.from(loadedFonts)
    .map(key => {
      const parts = key.split(' ');
      const family = parts[0];
      const weight = parts[1] || '400';
      const style = parts[2] || 'normal';
      return `/* Font loaded: ${family} weight=${weight} style=${style} */`;
    })
    .join('\n');
}
