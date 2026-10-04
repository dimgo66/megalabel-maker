import { useCallback } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { serializeProject, downloadProjectFile, readProjectFile } from '../utils/projectSerializer';
import { getFormatById } from '../config/labelFormats';

/**
 * Сохранение и загрузка проекта в файл — одна реализация на оба входа:
 * кнопки в тулбаре и горячие клавиши Ctrl+S / Ctrl+O.
 *
 * Зачем хук: раньше логика была продублирована в App.tsx и Toolbar.tsx, причём
 * механизм выбора файла в копиях уже разошёлся — App создавал <input> динамически,
 * Toolbar держал его в ref. Это давало два независимых пути к одному действию и
 * расхождение при любой правке. Здесь один путь: скрытый <input> создаётся по
 * требованию, поэтому разметке вызывающего компонента ничего не нужно.
 *
 * Состояние читается через getState(), а не через подписку: обработчики не
 * должны пересоздаваться при каждом изменении стора, иначе useEffect в
 * useHotkeys будет переподписывать слушатель keydown на каждый рендер.
 */
export function useProjectFile() {
  const handleSave = useCallback(() => {
    const state = useProjectStore.getState();
    const json = serializeProject(state.labelDesign, state.sheetSettings);
    downloadProjectFile(JSON.parse(json), `${state.projectName}.labelproj.json`);
    useProjectStore.getState().markSaved();
  }, []);

  const handleLoad = useCallback(() => {
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
        if (!format) {
          alert('Формат из файла не найден в списке доступных');
          return;
        }
        useProjectStore.getState().loadProject(project.labelDesign, project.sheetSettings);
      } catch (err) {
        alert(`Ошибка загрузки: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
      }
    };
    input.click();
  }, []);

  return { handleSave, handleLoad };
}
