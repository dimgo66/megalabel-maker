import { useEffect, useState } from 'react';
import { Toolbar } from './components/Toolbar';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { LabelCanvas } from './components/LabelCanvas';
import { PreviewModal } from './components/PreviewModal';
import { useProjectStore } from './store/useProjectStore';
import { useHotkeys } from './hooks/useHotkeys';
import { useAutosave } from './hooks/useAutosave';
import { serializeProject, downloadProjectFile, readProjectFile } from './utils/projectSerializer';
import { LABEL_FORMATS, getFormatById } from './config/labelFormats';
import { mmToPx } from './utils/layoutCalculator';
import { restoreLocalFonts, getLoadedGoogleFontsFromStorage, loadGoogleFont } from './utils/fontLoader';
import { injectEmbeddedFontFaces, ensureEmbeddedFontsLoaded } from './utils/embeddedFontLoader';
import { FONT_CONFIGS } from './config/fonts';
import './styles/print.css';

function App() {
  const {
    selectedFormat,
    sheetSettings,
    editorZoom,
    setEditorZoom,
    markSaved,
    loadProject,
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

  const handleSave = () => {
    const state = useProjectStore.getState();
    const json = serializeProject(state.labelDesign, state.sheetSettings);
    const project = JSON.parse(json);
    downloadProjectFile(project, `${state.projectName}.labelproj.json`);
    markSaved();
  };

  const handleLoad = () => {
    const state = useProjectStore.getState();
    if (state.isDirty) {
      const confirmed = confirm('Есть несохранённые изменения. Загрузить проект без сохранения?');
      if (!confirmed) return;
    }
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.labelproj.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const project = await readProjectFile(file);
        const format = getFormatById(project.labelDesign.formatId);
        if (format) {
          loadProject(project.labelDesign, project.sheetSettings);
        } else {
          alert('Формат из файла не найден в списке доступных');
        }
      } catch (err) {
        alert(`Ошибка загрузки: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
      }
    };
    input.click();
  };

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
            <span className="text-sm font-semibold text-gray-900">Редактор этикетки</span>
            <div className="flex items-center gap-2">
              {selectedFormat.shape === 'circle' && (
                <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded font-medium">
                  ⚪ Круг
                </span>
              )}
              {/* Zoom controls */}
              <div className="flex items-center gap-1 ml-2">
                <span className="text-xs text-gray-500 mr-1 select-none">Масштаб:</span>
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
                  className="w-7 h-7 flex items-center justify-center rounded border border-gray-300 bg-gray-50 text-gray-700 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-base leading-none"
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
              {/* Безопасные поля - визуализация */}
              {sheetSettings.safetyMargin_mm > 0 && (
                <>
                  {selectedFormat.shape === 'circle' ? (
                    // Для круглых этикеток - круглая безопасная зона
                    <div
                      className="absolute border-2 border-dashed border-red-400/60 rounded-full pointer-events-none z-10"
                      style={{
                        top: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px`,
                        left: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px`,
                        right: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px`,
                        bottom: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px`,
                      }}
                    />
                  ) : (
                    // Для прямоугольных этикеток - прямоугольная безопасная зона
                    <>
                      {/* Верхняя безопасная зона */}
                      <div
                        className="absolute top-0 left-0 right-0 bg-red-500/10 pointer-events-none z-10"
                        style={{ height: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px` }}
                      />
                      {/* Нижняя безопасная зона */}
                      <div
                        className="absolute bottom-0 left-0 right-0 bg-red-500/10 pointer-events-none z-10"
                        style={{ height: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px` }}
                      />
                      {/* Левая безопасная зона */}
                      <div
                        className="absolute top-0 left-0 bottom-0 bg-red-500/10 pointer-events-none z-10"
                        style={{ width: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px` }}
                      />
                      {/* Правая безопасная зона */}
                      <div
                        className="absolute top-0 right-0 bottom-0 bg-red-500/10 pointer-events-none z-10"
                        style={{ width: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px` }}
                      />
                      {/* Пунктирная рамка безопасной зоны */}
                      <div
                        className="absolute border-2 border-dashed border-red-400/60 pointer-events-none z-10"
                        style={{
                          top: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px`,
                          left: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px`,
                          right: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px`,
                          bottom: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom}px`,
                        }}
                      />
                      {/* Подпись размера безопасного поля */}
                      <div
                        className="absolute text-xs text-red-500/80 font-medium pointer-events-none z-10"
                        style={{
                          top: `${mmToPx(sheetSettings.safetyMargin_mm / 2) * editorZoom - 6}px`,
                          left: `${mmToPx(sheetSettings.safetyMargin_mm) * editorZoom + 4}px`,
                        }}
                      >
                        ↕ {sheetSettings.safetyMargin_mm} мм
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Fabric.js Canvas */}
              <LabelCanvas />
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
