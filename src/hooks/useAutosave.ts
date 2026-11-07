import { useEffect, useState } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { serializeProject, deserializeProject } from '../utils/projectSerializer';
import { serializeCanvas } from '../utils/canvasHelpers';
import {
  readAutosaveSnapshot,
  writeAutosaveSnapshot,
  clearAutosaveSnapshot,
  AUTOSAVE_CLEARED_EVENT,
} from '../utils/autosaveStorage';

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
  const isDirty = useProjectStore(state => state.isDirty);
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const [hasAutosave, setHasAutosave] = useState(false);
  const [autosaveWarning, setAutosaveWarning] = useState<string | null>(null);

  // Проверяем наличие автосохранения при загрузке
  useEffect(() => {
    if (readAutosaveSnapshot()) {
      setHasAutosave(true);
      setShowRestoreBanner(true);
    }
  }, []);

  // Снимок стёрт извне (проект сохранили в файл или загрузили из файла) —
  // баннер «Найден несохранённый проект» больше не актуален.
  useEffect(() => {
    const handleCleared = () => {
      setShowRestoreBanner(false);
      setHasAutosave(false);
    };
    window.addEventListener(AUTOSAVE_CLEARED_EVENT, handleCleared);
    return () => window.removeEventListener(AUTOSAVE_CLEARED_EVENT, handleCleared);
  }, []);

  // Автосохранение каждые 30 секунд, пока проект изменён.
  //
  // Состояние читается из стора В МОМЕНТ срабатывания, а не через подписку.
  // Раньше эффект зависел от labelDesign/tabs/sheetSettings и перезапускал
  // таймер на каждую правку: при непрерывной работе 30 секунд тишины так и не
  // наступало, и автосохранение не срабатывало вовсе.
  useEffect(() => {
    if (!isDirty) return;

    const saveSnapshot = () => {
      const s = useProjectStore.getState();
      if (!s.isDirty) return;
      // Холст применяет новое состояние (переключение вкладки, загрузка) —
      // снимок с него был бы недогруженным. Пропускаем такт: следующий будет
      // уже после загрузки.
      if (s.canvasLoading) return;

      try {
        const liveDesign =
          s.editorCanvas && s.activeTabId
            ? { ...s.labelDesign, canvasJSON: serializeCanvas(s.editorCanvas) }
            : s.labelDesign;
        const snapshotTabs =
          s.activeTabId && s.tabs.length > 0
            ? s.tabs.map(t =>
                t.id === s.activeTabId
                  ? { ...t, labelDesign: liveDesign, sheetSettings: s.sheetSettings }
                  : t
              )
            : s.tabs;
        const json = serializeProject(
          liveDesign,
          s.sheetSettings,
          snapshotTabs,
          s.activeTabId
        );

        if (json.length > AUTOSAVE_MAX_CHARS) {
          setAutosaveWarning(TOO_BIG_WARNING);
          return;
        }

        writeAutosaveSnapshot(json);
        setAutosaveWarning(null);
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
    };

    const interval = window.setInterval(saveSnapshot, AUTOSAVE_INTERVAL);
    return () => window.clearInterval(interval);
  }, [isDirty]);

  // Восстановление из автосохранения
  const restoreAutosave = () => {
    try {
      const autosave = readAutosaveSnapshot();
      if (!autosave) {
        // Снимка уже нет (его стёрло сохранение в файл) — просто убираем баннер.
        setShowRestoreBanner(false);
        setHasAutosave(false);
        return;
      }

      const project = deserializeProject(autosave);
      if (project.tabs && project.tabs.length > 0) {
        useProjectStore
          .getState()
          .loadProjectWithTabs(project.tabs, project.activeTabId || project.tabs[0].id);
      } else {
        useProjectStore.getState().loadProject(project.labelDesign, project.sheetSettings);
      }
      clearAutosaveSnapshot();
      setShowRestoreBanner(false);
      setHasAutosave(false);
    } catch (error) {
      console.error('Ошибка восстановления:', error);
      alert('Ошибка восстановления автосохранения');
    }
  };

  // Удаление автосохранения
  const discardAutosave = () => {
    clearAutosaveSnapshot();
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
