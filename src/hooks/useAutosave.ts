import { useEffect, useState } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { serializeProject, deserializeProject } from '../utils/projectSerializer';
import { serializeCanvas } from '../utils/canvasHelpers';

const AUTOSAVE_KEY = 'label-maker-autosave';
const AUTOSAVE_INTERVAL = 30000; // 30 секунд
/**
 * localStorage даёт ~5 МБ на домен, а JSON проекта с вставленным PDF (растр
 * страницы в base64) легко перекрывает этот лимит. Такой снапшот не пытаемся
 * записать: пользователь получает честное предупреждение вместо тихого сбоя.
 */
const AUTOSAVE_MAX_CHARS = 4_500_000;

const TOO_BIG_WARNING =
  'Автосохранение пропущено: проект с крупными изображениями не помещается в хранилище браузера. ' +
  'Сохраните проект в файл (Ctrl+S), чтобы не потерять работу.';

export function useAutosave() {
  const { isDirty, labelDesign, sheetSettings, tabs, activeTabId, editorCanvas } = useProjectStore();
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const [hasAutosave, setHasAutosave] = useState(false);
  const [autosaveWarning, setAutosaveWarning] = useState<string | null>(null);

  // Проверяем наличие автосохранения при загрузке
  useEffect(() => {
    const autosave = localStorage.getItem(AUTOSAVE_KEY);
    if (autosave) {
      setHasAutosave(true);
      setShowRestoreBanner(true);
    }
  }, []);

  // Автосохранение каждые 30 секунд при наличии изменений.
  // Сохраняются ВСЕ вкладки: активная — с живым канвасом, остальные — как есть.
  useEffect(() => {
    if (!isDirty) return;

    const interval = setInterval(() => {
      try {
        const liveDesign =
          editorCanvas && activeTabId
            ? { ...labelDesign, canvasJSON: serializeCanvas(editorCanvas) }
            : labelDesign;
        const snapshotTabs =
          activeTabId && tabs.length > 0
            ? tabs.map(t =>
                t.id === activeTabId
                  ? { ...t, labelDesign: liveDesign, sheetSettings }
                  : t
              )
            : tabs;
        const json = serializeProject(
          liveDesign,
          sheetSettings,
          snapshotTabs,
          activeTabId
        );

        if (json.length > AUTOSAVE_MAX_CHARS) {
          setAutosaveWarning(TOO_BIG_WARNING);
          return;
        }

        localStorage.setItem(AUTOSAVE_KEY, json);
        setAutosaveWarning(null);
        console.log('Автосохранение выполнено');
      } catch (error) {
        const isQuota =
          error instanceof DOMException &&
          (error.name === 'QuotaExceededError' ||
            error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
            error.code === 22);
        if (isQuota) {
          setAutosaveWarning(TOO_BIG_WARNING);
          return;
        }
        console.error('Ошибка автосохранения:', error);
      }
    }, AUTOSAVE_INTERVAL);

    return () => clearInterval(interval);
  }, [isDirty, labelDesign, sheetSettings, tabs, activeTabId, editorCanvas]);

  // Восстановление из автосохранения
  const restoreAutosave = () => {
    try {
      const autosave = localStorage.getItem(AUTOSAVE_KEY);
      if (!autosave) return;

      const project = deserializeProject(autosave);
      if (project.tabs && project.tabs.length > 0) {
        useProjectStore
          .getState()
          .loadProjectWithTabs(project.tabs, project.activeTabId || project.tabs[0].id);
      } else {
        useProjectStore.getState().loadProject(project.labelDesign, project.sheetSettings);
      }
      localStorage.removeItem(AUTOSAVE_KEY);
      setShowRestoreBanner(false);
      setHasAutosave(false);
    } catch (error) {
      console.error('Ошибка восстановления:', error);
      alert('Ошибка восстановления автосохранения');
    }
  };

  // Удаление автосохранения
  const discardAutosave = () => {
    localStorage.removeItem(AUTOSAVE_KEY);
    setShowRestoreBanner(false);
    setHasAutosave(false);
  };

  const dismissAutosaveWarning = () => setAutosaveWarning(null);

  return {
    showRestoreBanner,
    hasAutosave,
    restoreAutosave,
    discardAutosave,
    autosaveWarning,
    dismissAutosaveWarning,
  };
}
