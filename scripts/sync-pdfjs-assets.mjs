/**
 * Копирует статические ассеты pdf.js из node_modules в public/pdfjs.
 *
 * Зачем: PDF-страницы с JPEG2000 (JPX), JBIG2, ICC-профилями и CJK-шрифтами
 * декодируются wasm-модулями и таблицами CMap. Без этих файлов pdf.js молча
 * теряет изображения (OpenJPEG failed to initialize) или рисует пустые глифы.
 *
 * Запускается автоматически перед dev/build (predev/prebuild), поэтому файлы
 * в репозитории не хранятся и не устаревают при обновлении pdfjs-dist.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = join(root, 'node_modules', 'pdfjs-dist');
const dstRoot = join(root, 'public', 'pdfjs');
const DIRS = ['wasm', 'cmaps', 'standard_fonts', 'iccs'];

const versionFile = join(srcRoot, 'package.json');
if (!existsSync(versionFile)) {
  console.warn('[pdfjs] node_modules/pdfjs-dist не найден — пропускаю копирование ассетов');
  process.exit(0);
}

const version = JSON.parse(readFileSync(versionFile, 'utf8')).version ?? 'unknown';
const marker = join(dstRoot, '.version');

if (existsSync(marker) && readFileSync(marker, 'utf8').trim() === version) {
  process.exit(0);
}

mkdirSync(dstRoot, { recursive: true });
for (const dir of DIRS) {
  const from = join(srcRoot, dir);
  if (!existsSync(from)) {
    console.warn(`[pdfjs] нет каталога ${dir} — пропускаю`);
    continue;
  }
  cpSync(from, join(dstRoot, dir), { recursive: true });
}
writeFileSync(marker, `${version}\n`);
console.log(`[pdfjs] ассеты ${DIRS.join(', ')} скопированы (pdfjs-dist ${version})`);
