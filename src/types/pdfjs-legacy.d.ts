/**
 * Типы для legacy-сборки pdf.js.
 *
 * У `pdfjs-dist` в пакете один набор деклараций (`types/src/pdf.d.ts`), он
 * описывает API, а legacy-сборка — тот же API, только транспилированный и с
 * core-js-полифилами (нужны браузерам без новых методов Uint8Array: Chrome/Edge
 * до 140, Firefox до 133 — иначе падает `n.toHex is not a function`).
 */
declare module 'pdfjs-dist/legacy/build/pdf.min.mjs' {
  export * from 'pdfjs-dist';
}
