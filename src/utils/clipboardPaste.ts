import * as fabric from 'fabric';
import { CUSTOM_PROPS, sceneHeight, sceneWidth, serializeCanvas, withoutHistory } from './canvasHelpers';
import { ensureTextFrame, syncFrameGeometry } from './textFitter';
import { isOutdatedBarcode, recreateBarcodeObject } from './barcodeObjectFactory';
import { mmToPx } from './layoutCalculator';
import { useProjectStore } from '../store/useProjectStore';
import {
  createClipboardToken,
  putClipboardEntry,
  type ClipboardEntry,
  writeClipboardMarker,
} from './objectClipboard';

/**
 * Копирование и вставка объектов этикетки, в том числе между вкладками.
 *
 * Копирование обязано работать при переключении вкладок: каждая вкладка
 * перезагружает холст из своего `canvasJSON` (`loadRevision`), поэтому «взять с
 * холста» после переключения уже нечего. Отсюда два требования:
 *   • снимок объектов делается в момент Ctrl+C и живёт в памяти приложения
 *     (`objectClipboard`), а не на холсте;
 *   • вставка восстанавливает объекты из JSON, а не клонирует живые —
 *     клонировать можно только то, что ещё лежит на холсте.
 */

/** Смещение копии при вставке в той же вкладке, px сцены (≈2.6 мм). */
const SAME_TAB_OFFSET = 10;

/** Сколько ждём, пока холст применит вкладку после переключения, мс. */
const CANVAS_IDLE_TIMEOUT = 3000;
const CANVAS_IDLE_STEP = 40;

/**
 * Сколько раз текущий буфер уже вставили в каждую вкладку: ключ — «токен
 * копирования + id вкладки».
 *
 * Зачем: повторная вставка того же объекта ложилась бы ровно на предыдущую
 * копию. Две одинаковые копии друг под другом неотличимы, и это читается как
 * «вставка не сработала». Поэтому каждая следующая вставка в ту же вкладку
 * сдвигается ещё на шаг. При новом копировании токен новый — счёт начинается
 * с нуля.
 */
const pasteCounts = new Map<string, number>();

/** Прямоугольник в координатах сцены (без учёта зума редактора). */
interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Копирует или вырезает выделенные объекты.
 *
 * Возвращает true, если событие обработано: вызывающий код обязан вызвать
 * `preventDefault`, иначе браузер ещё и положит в буфер выделение страницы.
 *
 * Порядок шагов принципиален: сначала метка в системный буфер, потом запись
 * объектов и только потом удаление при вырезании. Браузер может не дать
 * записать буфер — тогда вырезание отменяется целиком, потому что вставить
 * объекты было бы нечем.
 */
export function copySelectionToClipboard(
  canvas: fabric.Canvas,
  data: DataTransfer | null | undefined,
  mode: 'copy' | 'cut'
): boolean {
  // В режиме правки текста выделен не объект, а символы внутри него: копирование
  // текста остаётся браузеру (и его штатному пути в fabric).
  const objects = canvas.getActiveObjects().filter(obj => !(obj as any).isEditing);
  if (objects.length === 0) return false;

  const token = createClipboardToken();
  if (!writeClipboardMarker(data, token)) return false;

  putClipboardEntry({
    token,
    sourceTabId: useProjectStore.getState().activeTabId ?? '',
    objects: objects.map(objectToClipboardJSON),
  });

  if (mode === 'cut') {
    // Одно действие в истории на всё вырезание: удаление идёт без записи
    // истории, а итоговое состояние фиксируется одним setCanvasJSON.
    withoutHistory(() => {
      objects.forEach(obj => canvas.remove(obj));
      canvas.discardActiveObject();
    });
    canvas.requestRenderAll();

    const store = useProjectStore.getState();
    store.setSelectedObject(null);
    store.setCanvasJSON(serializeCanvas(canvas));
  }

  return true;
}

/**
 * Снимок объекта для буфера обмена — с координатами в системе холста.
 *
 * Зачем поправка: у объекта, выделенного вместе с другими (ActiveSelection),
 * `left/top` выражаются в координатах выделения, а не холста: fabric при входе
 * в выделение «вычитает» его трансформ, чтобы рисовать группу целиком. Если
 * сохранить такое `left/top`, копия при вставке встанет не на своё место —
 * уедет к левому верхнему углу тем сильнее, чем дальше выделение от него.
 *
 * `getXY()` возвращает ту же точку привязки, но уже в координатах холста
 * (у объекта вне выделения результат совпадает с `left/top`). Масштаб и
 * поворот самого выделения в JSON не переносятся — ровно так же, как их не
 * хранит файл проекта: копируется объект, а не временное выделение.
 */
function objectToClipboardJSON(obj: fabric.FabricObject): Record<string, unknown> {
  const json = obj.toObject(CUSTOM_PROPS) as Record<string, any>;
  const worldOrigin = obj.getXY();
  json.left = worldOrigin.x;
  json.top = worldOrigin.y;
  return json;
}

/**
 * Вставляет объекты из буфера обмена в текущую вкладку.
 *
 * Ошибки не пробрасываются: вставка — действие пользователя, и падение на
 * одном битом объекте не должно оставлять холст в полусобранном состоянии.
 */
export async function pasteObjectsFromClipboard(
  canvas: fabric.Canvas,
  entry: ClipboardEntry
): Promise<void> {
  const store = useProjectStore.getState();
  const revisionAtStart = store.loadRevision;
  const tabAtStart = store.activeTabId;

  // Вкладку могли только что переключить: `loadFromJSON` ещё идёт, и объект,
  // добавленный в этот момент, был бы стёрт загрузкой. Ждём её окончания.
  if (!(await waitForCanvasIdle())) return;
  if (!stillOnSameTab(revisionAtStart, tabAtStart)) return;

  let instances: fabric.FabricObject[];
  try {
    // enlivenObjects восстанавливает конкретный тип (Textbox, FabricImage,
    // Group…) и кастомные свойства: имя слоя, норму штрих-кода, высоту рамки.
    instances = await fabric.util.enlivenObjects<fabric.FabricObject>(entry.objects as any);
  } catch (error) {
    console.error('Не удалось развернуть объекты из буфера обмена:', error);
    return;
  }

  // Пока объекты разворачивались (картинки и превью PDF грузятся асинхронно),
  // могли переключить вкладку или загрузить файл — вставлять уже некуда.
  if (!stillOnSameTab(revisionAtStart, tabAtStart)) return;

  const objects = instances.filter(Boolean).map(preparePastedObject);
  if (objects.length === 0) return;

  // В другой вкладке копия встаёт на место оригинала (этикетки обычно того же
  // формата), в той же — со сдвигом, чтобы не накрыть оригинал. Каждая
  // следующая вставка того же буфера в эту вкладку сдвигается ещё на шаг.
  const pasteKey = `${entry.token}:${tabAtStart}`;
  const pastedBefore = pasteCounts.get(pasteKey) ?? 0;
  pasteCounts.set(pasteKey, pastedBefore + 1);

  const offset =
    (entry.sourceTabId === tabAtStart ? SAME_TAB_OFFSET : 0) + pastedBefore * SAME_TAB_OFFSET;
  placeInsideLabel(canvas, objects, offset);

  // Добавление без записи истории: в отмену должно попасть одно действие —
  // вставка, а не «добавление объекта» и «позиционирование» по отдельности.
  await withoutHistory(() => {
    objects.forEach(obj => canvas.add(obj));
  });

  if (objects.length === 1) {
    canvas.setActiveObject(objects[0]);
  } else {
    // Мультивыделение вставляется как отдельные объекты, выделенные вместе —
    // так же, как копировали: их можно сразу двигать как одно целое и по одному.
    canvas.setActiveObject(new fabric.ActiveSelection(objects, { canvas }));
  }
  canvas.requestRenderAll();

  const s = useProjectStore.getState();
  s.setCanvasJSON(serializeCanvas(canvas));
  s.bumpObjectRevision();
  s.bumpCanvasContentRevision();
}

/**
 * Готовит развёрнутый из JSON объект к вставке.
 *
 * Здесь три вещи, которые `enlivenObjects` не делает: миграция старых типов,
 * восстановление геометрии фрейма и снятие замков исходника.
 */
function preparePastedObject(raw: fabric.FabricObject): fabric.FabricObject {
  let obj = raw;

  // Объект из старого проекта или из библиотеки лежит как IText: у него нет
  // ширины переноса, и за боковые ручки он не тянется. ensureTextFrame вернёт
  // новый фрейм; объект ещё не на холсте, поэтому замена на холсте не нужна.
  if (obj.type === 'i-text') obj = ensureTextFrame(obj as any);

  // Штрих-код мог быть сохранён прежней версией нормы (в том числе с неверной
  // таблицей чётности EAN-13) — вставляем пересозданный, иначе ошибка вернулась
  // бы в проект вместе с копией.
  if (isOutdatedBarcode(obj)) obj = recreateBarcodeObject(obj) ?? obj;

  // Собственная высота рамки и обрезка: fabric хранит `height` текста отдельно
  // от `frameHeight`, и без синхронизации рамка схлопнулась бы по содержимому.
  if (obj.type === 'textbox') syncFrameGeometry(obj as any);

  // Замки исходника на копию не переносим: вставленный объект должен
  // выделяться и двигаться, иначе выглядит как «не вставился».
  const target = obj as any;
  target.locked = false;
  target.positionLocked = false;
  obj.set({
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: true,
    lockMovementX: false,
    lockMovementY: false,
  });
  obj.setCoords();

  return obj;
}

/**
 * Ставит вставленные объекты в пределы этикетки.
 *
 * Без этого копия из вкладки другого формата оказалась бы за краем холста:
 * объект физически есть, но на этикетке его не видно — «вставка не сработала».
 * Если объект больше самой этикетки, его левый верхний угол прижимается к
 * безопасной зоне: остальное пользователь поправит масштабом.
 */
function placeInsideLabel(
  canvas: fabric.Canvas,
  objects: fabric.FabricObject[],
  offset: number
): void {
  // Размер этикетки, без рабочей зоны вокруг неё: иначе объект «вписывался» бы
  // в холст с полем и вставал за краем этикетки.
  const labelW = sceneWidth(canvas);
  const labelH = sceneHeight(canvas);

  // Та же безопасная зона, что у подгонки текста: 0 в настройках означает
  // «по умолчанию 1 мм», а не «вплотную к краю».
  const { sheetSettings } = useProjectStore.getState();
  const marginMm = sheetSettings.safetyMargin_mm > 0 ? sheetSettings.safetyMargin_mm : 1;
  const inset = mmToPx(marginMm);

  const box = unionBox(objects);
  let dx = offset;
  let dy = offset;

  if (box.width <= labelW - inset * 2) {
    if (box.left + dx < inset) dx = inset - box.left;
    else if (box.left + box.width + dx > labelW - inset) dx = labelW - inset - (box.left + box.width);
  } else {
    dx = inset - box.left;
  }

  if (box.height <= labelH - inset * 2) {
    if (box.top + dy < inset) dy = inset - box.top;
    else if (box.top + box.height + dy > labelH - inset) dy = labelH - inset - (box.top + box.height);
  } else {
    dy = inset - box.top;
  }

  if (dx === 0 && dy === 0) return;

  // Сдвиг прибавляется к left/top, а не к углу bbox: так объект смещается на
  // ровно dx/dy при любой точке привязки (originX/originY) и повороте.
  objects.forEach(obj => {
    obj.set({ left: (obj.left ?? 0) + dx, top: (obj.top ?? 0) + dy });
    obj.setCoords();
  });
}

/** Общий прямоугольник набора объектов в координатах сцены. */
function unionBox(objects: fabric.FabricObject[]): Box {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const obj of objects) {
    obj.setCoords();
    const rect = obj.getBoundingRect();
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.left + rect.width);
    bottom = Math.max(bottom, rect.top + rect.height);
  }

  if (!Number.isFinite(left)) return { left: 0, top: 0, width: 0, height: 0 };
  return { left, top, width: right - left, height: bottom - top };
}

/** Холст всё ещё показывает ту же вкладку и не перезагружался. */
function stillOnSameTab(revision: number, tabId: string): boolean {
  const s = useProjectStore.getState();
  return s.loadRevision === revision && s.activeTabId === tabId;
}

/**
 * Ждёт, пока холст закончит применять состояние вкладки.
 *
 * Пока `canvasLoading` поднят, `loadFromJSON` либо идёт, либо ещё не начался:
 * добавленный в это время объект загрузка снесёт. Один кадр ожидания нужен
 * потому, что переключение вкладки — это setState → рендер → эффект загрузки,
 * и сразу после Ctrl+V признак мог ещё не подняться.
 */
async function waitForCanvasIdle(): Promise<boolean> {
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

  const deadline = Date.now() + CANVAS_IDLE_TIMEOUT;
  while (useProjectStore.getState().canvasLoading) {
    if (Date.now() > deadline) return false;
    await new Promise<void>(resolve => setTimeout(resolve, CANVAS_IDLE_STEP));
  }
  return true;
}
