import { useProjectStore } from '../store/useProjectStore';
import {
  isHistorySuspended,
  serializeCanvas,
  setObjectPositionLocked,
} from '../utils/canvasHelpers';
import { Lock, Unlock } from './icons';

/**
 * Строка «объект + закрепление позиции» в начале панели «Свойства».
 *
 * Зачем отдельно от замка слоя: в «Слоях» замок делает объект недоступным
 * целиком (его даже не выделить), а здесь нужен другой режим — объект выделяется
 * и правится (текст, кегль, штрих-код), но не сдвигается мышью и стрелками.
 * Ровно та же пара, что «Заблокировать» и «Заблокировать позицию» в InDesign.
 *
 * До появления кнопки закрепить позицию можно было только через слой, а слой
 * после перезагрузки проекта замок терял (fabric не сериализует selectable),
 * поэтому закрепление восстанавливается в applyStateToCanvas.
 */
export function ObjectPositionLock() {
  const selectedObject = useProjectStore((s) => s.selectedObject);
  // Подписка на ревизию: после переключения замка панель обязана перерисоваться,
  // а ссылка на объект при этом не меняется.
  useProjectStore((s) => s.objectRevision);

  if (!selectedObject) return null;

  const canvas = (window as any).__fabricCanvas;
  // Множественное выделение сюда не относится: fabric двигает детей через
  // ActiveSelection, и замок одного объекта не остановит общую рамку.
  if (canvas?.getActiveObjects?.().length > 1) return null;

  const object = selectedObject as any;
  if (object.locked) return null; // объект заперт целиком — двигать и так нельзя

  const positionLocked = !!object.positionLocked;
  const name = object.name || defaultName(object);

  const handleToggle = () => {
    setObjectPositionLocked(object, !positionLocked);
    const store = useProjectStore.getState();
    store.bumpObjectRevision();
    // Закрепление — часть проекта: без записи в canvasJSON оно не попадёт ни в
    // файл, ни в автосохранение.
    if (!isHistorySuspended() && canvas) {
      store.setCanvasJSON(serializeCanvas(canvas));
    }
  };

  return (
    <div className="px-4 py-3 border-b border-gray-200">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="type-group truncate">{name}</div>
          <div className="type-meta truncate">
            {positionLocked ? 'Не сдвигается мышью' : 'Защита от случайного сдвига'}
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          aria-pressed={positionLocked}
          title={positionLocked ? 'Снять закрепление позиции' : 'Закрепить позицию объекта'}
          className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-xs font-medium transition-colors ${
            positionLocked
              ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          {positionLocked ? <Lock size={13} /> : <Unlock size={13} />}
          <span>{positionLocked ? 'Закреплено' : 'Закрепить'}</span>
        </button>
      </div>
    </div>
  );
}

/** Человекочитаемый тип объекта для подписи, когда у него нет имени. */
function defaultName(object: any): string {
  switch (object?.type) {
    case 'textbox':
    case 'i-text':
      return 'Текст';
    case 'image':
      return 'Изображение';
    case 'group':
      return object?.barcodeValue ? 'Штрих-код' : 'Группа';
    default:
      return 'Объект';
  }
}
