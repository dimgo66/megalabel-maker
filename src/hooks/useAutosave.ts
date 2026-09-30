import { useEffect, useState } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { serializeProject, deserializeProject } from '../utils/projectSerializer';

const AUTOSAVE_KEY = 'label-maker-autosave';
const AUTOSAVE_INTERVAL = 30000; // 30 секунд

export function useAutosave() {
  const { isDirty, labelDesign, sheetSettings } = useProjectStore();
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const [hasAutosave, setHasAutosave] = useState(false);

  // Проверяем наличие автосохранения при загрузке
  useEffect(() => {
    const autosave = localStorage.getItem(AUTOSAVE_KEY);
    if (autosave) {
      setHasAutosave(true);
      setShowRestoreBanner(true);
    }
  }, []);

  // Автосохранение каждые 30 секунд при наличии изменений
  useEffect(() => {
    if (!isDirty) return;

    const interval = setInterval(() => {
      try {
        const json = serializeProject(labelDesign, sheetSettings);
        localStorage.setItem(AUTOSAVE_KEY, json);
        console.log('Автосохранение выполнено');
      } catch (error) {
        console.error('Ошибка автосохранения:', error);
      }
    }, AUTOSAVE_INTERVAL);

    return () => clearInterval(interval);
  }, [isDirty, labelDesign, sheetSettings]);

  // Восстановление из автосохранения
  const restoreAutosave = () => {
    try {
      const autosave = localStorage.getItem(AUTOSAVE_KEY);
      if (!autosave) return;

      const project = deserializeProject(autosave);
      useProjectStore.getState().loadProject(project.labelDesign, project.sheetSettings);
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

  return {
    showRestoreBanner,
    hasAutosave,
    restoreAutosave,
    discardAutosave,
  };
}
