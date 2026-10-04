import { useEffect, useState } from 'react';
import { Toolbar } from './components/Toolbar';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { LabelCanvas } from './components/LabelCanvas';
import { PreviewModal } from './components/PreviewModal';
import { useProjectStore } from './store/useProjectStore';
import { useHotkeys } from './hooks/useHotkeys';
import { useProjectFile } from './hooks/useProjectFile';
import { useAutosave } from './hooks/useAutosave';
import { mmToPx } from './utils/layoutCalculator';
import { restoreLocalFonts, getLoadedGoogleFontsFromStorage, loadGoogleFont } from './utils/fontLoader';
import { injectEmbeddedFontFaces, ensureEmbeddedFontsLoaded } from './utils/embeddedFontLoader';
import { Circle, MoveVertical } from './components/icons';
import { FONT_CONFIGS } from './config/fonts';
import './styles/print.css';

function App() {
  const {
    selectedFormat,
    sheetSettings,
    editorZoom,
    setEditorZoom,
    setLoadedGoogleFonts,
    setLocalFonts,
    setGoogleFontLoaded,
  } = useProjectStore();

  const DEFAULT_ZOOM = 2.0;
  const zoomPercent = Math.round((editorZoom / DEFAULT_ZOOM) * 100);

  const handleZoomIn = () => setEditorZoom(Math.min(10.0, editorZoom + 0.5));
  const handleZoomReset = () => setEditorZoom(DEFAULT_ZOOM);

  // Восстановление шрифтов при загрузке страницы
  useEffect(() => {
    const restoreFonts = async () => {
      // Встроенные шрифты (Arial, Times New Roman, Roboto и др.) — первыми,
      // чтобы canvas и PDF использовали одни и те же файлы
      injectEmbeddedFontFaces(import.meta.env.BASE_URL);
      await ensureEmbeddedFontsLoaded();

      // Восстановить Google Fonts
      const savedGoogleFonts = getLoadedGoogleFontsFromStorage();
      if (savedGoogleFonts.length > 0) {
        setLoadedGoogleFonts(savedGoogleFonts);
        // Загрузить CSS для каждого шрифта
        for (const fontId of savedGoogleFonts) {
          const fontConfig = FONT_CONFIGS.find(f => f.id === fontId);
          if (fontConfig && fontConfig.googleUrl) {
            try {
              await loadGoogleFont(fontConfig);
              setGoogleFontLoaded(fontId);
            } catch (error) {
              console.error(`Failed to restore Google Font ${fontId}:`, error);
            }
          }
        }
      }
      
      // Восстановить локальные шрифты из IndexedDB
      const restoredLocalFonts = await restoreLocalFonts();
      if (restoredLocalFonts.length > 0) {
        setLocalFonts(restoredLocalFonts);
      }
    };
    
    restoreFonts();
  }, []);

  // Сохранение и загрузка проекта — общая реализация с кнопками тулбара
  const { handleSave, handleLoad } = useProjectFile();

  const { undo, redo } = useProjectStore();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const { showRestoreBanner, restoreAutosave, discardAutosave } = useAutosave();

  useHotkeys({
    onSave: handleSave,
    onLoad: handleLoad,
    onUndo: undo,
    onRedo: redo,
    // Ctrl+Shift+P, Ctrl+P, Ctrl+Shift+E — все открывают единый предпросмотр
    onPreview: () => setIsPreviewOpen(prev => !prev),
    onPrint: () => setIsPreviewOpen(true),
    onExport: () => setIsPreviewOpen(true),
  });

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Toolbar */}
      <Toolbar
        onPreview={() => setIsPreviewOpen(true)}
      />

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel */}
        <LeftPanel />

        {/* Center - Canvas */}
        <main className="flex-1 flex flex-col overflow-hidden bg-gray-100">
          {/* Canvas header */}
          <div className="h-12 bg-white border-b border-gray-200 flex items-center px-6 justify-between shrink-0">
            <span className="type-region">Редактор этикетки</span>
            <div className="flex items-center gap-2">
              {selectedFormat.shape === 'circle' && (
                <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded font-medium flex items-center gap-1">
                  <Circle size={11} />
                  <span>Круг</span>
                </span>
              )}
              {/* Zoom controls */}
              <div className="flex items-center gap-1 ml-2">
                <span className="type-meta mr-1 select-none">Масштаб:</span>
                <button
                  onClick={handleZoomReset}
                  disabled={editorZoom === DEFAULT_ZOOM}
                  title="Сбросить масштаб (100%)"
                  className="text-xs px-2 py-1 rounded border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-mono"
                >
                  {zoomPercent}%
                </button>
                <button
                  onClick={handleZoomIn}
                  disabled={editorZoom >= 10.0}
                  title="Увеличить (Ctrl+колесо мыши)"
                  className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 bg-gray-50 text-gray-700 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-base leading-none"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Canvas area with safety margins overlay */}
          <div className="flex-1 flex items-center justify-center overflow-auto p-8">
            <div
              className={`bg-white shadow-xl flex items-center justify-center relative overflow-hidden shrink-0 ${
                selectedFormat.shape === 'circle' ? 'rounded-full' : 'rounded-lg border border-gray-300'
              }`}
              style={{
                width: `${mmToPx(selectedFormat.width_mm) * editorZoom}px`,
                height: `${mmToPx(selectedFormat.height_mm) * editorZoom}px`,
                flexShrink: 0,
                ...(selectedFormat.shape === 'circle' ? { boxShadow: '0 0 0 2px #d1d5db, 0 10px 15px -3px rgba(0, 0, 0, 0.1)' } : {}),
              }}
            >
              {/* Fabric.js Canvas.
                  ВАЖНО: LabelCanvas изолирован в собственном div. fabric.js
                  заменяет <canvas> своей обёрткой (canvas-container) и переносит
                  canvas внутрь, поэтому React теряет контроль над реальным
                  родителем canvas. Если условно рендерить соседей рядом, React при
                  вставке вызывает insertBefore(узел, canvasNode) — а canvasNode уже
                  не ребёнок этого контейнера, отсюда NotFoundError: Failed to
                  execute 'insertBefore' и пустой экран. Внутри изолирующего div
                  React-детей не трогает, поэтому конфликт невозможен. */}
              <div className="absolute inset-0">
                <LabelCanvas />
              </div>

              {/* Безопасные поля - визуализация.
                  Контейнер смонтирован ВСЕГДА (не условно): меняется только его
                  внутреннее содержимое, а число React-соседей canvas остаётся
                  неизменным. */}
              <div className="absolute inset-0 z-10 pointer-events-none">
                {sheetSettings.safetyMargin_mm > 0 && (() => {
                  const marginPx = mmToPx(sheetSettings.safetyMargin_mm) * editorZoom;
                  const w = mmToPx(selectedFormat.width_mm) * editorZoom;
                  const h = mmToPx(selectedFormat.height_mm) * editorZoom;
                  const isCircle = selectedFormat.shape === 'circle';
                  const innerW = Math.max(0, w - marginPx * 2);
                  const innerH = Math.max(0, h - marginPx * 2);
                  const innerR = Math.max(0, Math.min(w, h) / 2 - marginPx);

                  // Безопасное поле как МАСКА.
                  // SVG заливает ВСЮ этикетку, а внутри безопасной зоны вырезает
                  // «окно» через <mask> (чёрная фигура = прозрачность). Поэтому
                  // содержимое за пределами поля реально перекрывается, независимо
                  // от box-shadow и обрезки родителя. Слой pointer-events-none —
                  // канвас под маской остаётся интерактивным.
                  return (
                    <>
                      <svg
                        className="absolute inset-0 w-full h-full pointer-events-none"
                        viewBox={`0 0 ${w} ${h}`}
                        preserveAspectRatio="none"
                      >
                        <defs>
                          <mask id="safety-mask-hole">
                            <rect x="0" y="0" width={w} height={h} fill="#fff" />
                            {isCircle ? (
                              <circle cx={w / 2} cy={h / 2} r={innerR} fill="#000" />
                            ) : (
                              <rect
                                x={marginPx}
                                y={marginPx}
                                width={innerW}
                                height={innerH}
                                fill="#000"
                              />
                            )}
                          </mask>
                          {/* Диагональная штриховка закрытой зоны */}
                          <pattern
                            id="safety-mask-hatch"
                            patternUnits="userSpaceOnUse"
                            width="8"
                            height="8"
                            patternTransform="rotate(45)"
                          >
                            <rect width="8" height="8" fill="rgba(71, 85, 105, 0.35)" />
                            <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(51, 65, 85, 0.55)" strokeWidth="4" />
                          </pattern>
                        </defs>
                        <rect
                          x="0"
                          y="0"
                          width={w}
                          height={h}
                          fill="url(#safety-mask-hatch)"
                          mask="url(#safety-mask-hole)"
                        />
                      </svg>

                      {/* Контур безопасного поля */}
                      <div
                        className={`absolute border-2 border-dashed border-red-400/80 ${
                          isCircle ? 'rounded-full' : ''
                        }`}
                        style={{ inset: `${marginPx}px` }}
                      />

                      {/* Подпись размера безопасного поля */}
                      <div
                        className="absolute text-xs text-red-600 font-medium whitespace-nowrap flex items-center gap-1"
                        style={{
                          top: `${marginPx / 2 - 6}px`,
                          left: `${marginPx + 4}px`,
                        }}
                      >
                        <MoveVertical size={11} />
                        <span>{sheetSettings.safetyMargin_mm} мм</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </main>

        {/* Right panel */}
        <RightPanel />
      </div>

      {/* Preview Modal (предпросмотр + печать + сохранение PDF) */}
      <PreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
      />

      {/* Autosave Restore Banner */}
      {showRestoreBanner && (
        <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-6 py-4 rounded-lg shadow-xl z-50 flex items-center gap-4">
          <span>Найден несохранённый проект. Восстановить?</span>
          <button
            onClick={restoreAutosave}
            className="px-4 py-2 bg-white text-blue-600 rounded-lg font-medium hover:bg-blue-50"
          >
            Восстановить
          </button>
          <button
            onClick={discardAutosave}
            className="px-4 py-2 bg-blue-700 text-white rounded-lg font-medium hover:bg-blue-800"
          >
            Удалить
          </button>
        </div>
      )}

      {/* Direct Print Area */}
      <div id="direct-print-area" />
    </div>
  );
}

export default App;
