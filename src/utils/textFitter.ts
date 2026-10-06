import * as fabric from 'fabric';
import { CUSTOM_PROPS, withoutHistory } from './canvasHelpers';
import { mmToPx } from './layoutCalculator';
import { useProjectStore } from '../store/useProjectStore';

/**
 * Подгонка текста под формат этикетки при вставке.
 *
 * Задача из двух частей: длинный вставленный текст должен переноситься по
 * строкам и уменьшаться в кегле, чтобы целиком попасть в этикетку, а растущий
 * блок — оставаться на месте с точки зрения того края, к которому его
 * прижимает выравнивание абзаца (`textAlign`).
 *
 * Логика разделена намеренно:
 * - `planFontSize` и `computeFillShift` — чистые функции без fabric и DOM: их
 *   можно проверить без канваса, а не «на глаз» в браузере;
 * - `fitTextToLabel` — fabric-обвязка: конвертация, измерение, замена объекта.
 *
 * Перенос строк делается переводом объекта в `fabric.Textbox`: у `IText` нет
 * ширины, по которой текст мог бы переноситься, — он растёт одной строкой.
 */

/** Ниже этого кегля текст уже нечитаем — дальше не уменьшаем, а предупреждаем. */
export const MIN_FONT_SIZE = 4;
/** Шаг сетки кеглей. Полпикселя — предел, который вообще заметен на этикетке. */
const FONT_SIZE_STEP = 0.5;
/** Отступ от края этикетки, когда безопасные поля выключены (0 мм). */
const DEFAULT_INSET_MM = 1;

/**
 * Доля безопасной зоны, которую фрейм занимает СРАЗУ ПОСЛЕ ВСТАВКИ.
 *
 * Это только стартовый размер, а не ограничение: кегль и ширина связаны жёстко
 * (при одном кегле более узкая рамка всегда даёт больше строк), поэтому «и
 * крупный текст, и компактный блок» одновременно недостижимы — при вставке
 * выбран компромисс в пользу компактности. Дальше рамкой распоряжается
 * пользователь: тянет боковые ручки и углы, ширина меняется, кегль — нет.
 *
 * Если даже минимальным кеглем текст не влезает в эту долю, стартовая ширина
 * расширяется до всей безопасной зоны — лучше широкая рамка, чем потерянный текст.
 */
export const COMPACT_WIDTH_RATIO = 2 / 3;

export interface FitOptions {
  labelWidth_mm: number;
  labelHeight_mm: number;
  /** Безопасное поле этикетки, мм (0 — используем минимальный отступ по краю) */
  safetyMargin_mm: number;
}

export interface FitResult {
  /**
   * Объект после подгонки. Может быть новым (IText заменён на Textbox), а может
   * быть тем же самым — если текст уже помещался и менять ничего не нужно.
   */
  object: fabric.Textbox | fabric.IText;
  fontSize: number;
  /** Кегль пришлось уменьшить */
  shrunk: boolean;
  /** Текст не помещается даже минимальным кеглем */
  overflow: boolean;
  /** Объект был пересоздан как Textbox */
  converted: boolean;
}

/** Опции подгонки из текущего проекта: формат этикетки и безопасные поля. */
export function fitOptionsFromStore(): FitOptions {
  const state = useProjectStore.getState();
  return {
    labelWidth_mm: state.selectedFormat.width_mm,
    labelHeight_mm: state.selectedFormat.height_mm,
    safetyMargin_mm: state.sheetSettings.safetyMargin_mm,
  };
}

// ─── Чистая логика ────────────────────────────────────────────────────────

const roundToStep = (value: number, step = FONT_SIZE_STEP) =>
  Math.round(value / step) * step;

/**
 * Наибольший кегль из сетки `[minFontSize … maxFontSize]`, при котором текст
 * ещё помещается по высоте.
 *
 * Кегль никогда не увеличивается: подгонка обязана только уменьшать, иначе
 * уже свёрстанный текст «прыгал» бы после каждой вставки.
 *
 * @returns `overflow: true`, если даже минимальный кегль не помещается —
 *          в этом случае возвращается минимальный.
 */
export function planFontSize(params: {
  maxFontSize: number;
  /** Высота текста при заданном кегле */
  measure: (fontSize: number) => number;
  maxHeight: number;
  minFontSize?: number;
  step?: number;
}): { fontSize: number; overflow: boolean } {
  const {
    maxFontSize,
    measure,
    maxHeight,
    minFontSize = MIN_FONT_SIZE,
    step = FONT_SIZE_STEP,
  } = params;

  const top = roundToStep(Math.max(maxFontSize, minFontSize), step);
  const bottom = roundToStep(minFontSize, step);

  if (measure(top) <= maxHeight) {
    return { fontSize: top, overflow: false };
  }

  // Сетка кеглей по убыванию. Двоичный поиск, а не перебор: перебор от 200pt до
  // 4pt — это ~400 пересчётов вёрстки текста на каждую вставку.
  const sizes: number[] = [];
  for (let size = top; size >= bottom - 1e-9; size = roundToStep(size - step, step)) {
    sizes.push(roundToStep(size, step));
  }
  if (sizes[sizes.length - 1] > bottom) sizes.push(bottom);

  let low = 0;
  let high = sizes.length - 1;
  let best = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (measure(sizes[mid]) <= maxHeight) {
      best = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  if (best === -1) {
    return { fontSize: bottom, overflow: true };
  }
  return { fontSize: sizes[best], overflow: false };
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Шаг сетки ширин рамки при поиске минимальной подходящей, px. */
const WIDTH_STEP = 2;

/**
 * Минимальная ширина рамки, при которой выполнено условие `fits`.
 *
 * Условие монотонно по ширине: если подходит узкая рамка, то и более широкая
 * подойдёт тем более (текст не выше и словам просторнее). Поэтому бинарный
 * поиск, а не перебор ширин.
 *
 * Сетка строится ПО ВОЗРАСТАНИЮ, и ищется первая подходящая ширина — то есть
 * наименьшая. Обратный порядок с поиском «первой подходящей» возвращал бы
 * самую широкую рамку, что и было ошибкой первой версии.
 *
 * @returns `max`, если условие не выполнено ни на одной ширине.
 */
export function findNarrowestWidth(params: {
  min: number;
  max: number;
  fits: (width: number) => boolean;
  step?: number;
}): number {
  const { fits, step = WIDTH_STEP } = params;
  const max = Math.max(1, params.max);
  const min = Math.min(Math.max(1, params.min), max);

  const widths: number[] = [];
  for (let width = min; width <= max - 1e-9; width += step) {
    widths.push(width);
  }
  widths.push(max);

  let low = 0;
  let high = widths.length - 1;
  let best = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (fits(widths[mid])) {
      best = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return best === -1 ? max : widths[best];
}

/**
 * Смещение, которое сохраняет якорь абзаца и заводит блок внутрь безопасной зоны.
 *
 * Якорь задаётся выравниванием: при `left` блок растёт вправо, при `right` —
 * влево, при `center` — в обе стороны. Это и есть «сдвинуть в соответствующем
 * направлении»: текст остаётся там, где его видит человек, а не уезжает за
 * правый край потому, что так получилось после переноса строк.
 */
export function computeFillShift(params: {
  align: string;
  /** Границы объекта до подгонки */
  previous: Rect;
  /** Границы объекта после подгонки */
  next: Rect;
  /** Отступ безопасного поля в единицах сцены */
  inset: number;
  /** Размер этикетки в единицах сцены */
  boxWidth: number;
  boxHeight: number;
}): { dx: number; dy: number } {
  const { align, previous, next, inset, boxWidth, boxHeight } = params;

  const safeLeft = inset;
  const safeRight = boxWidth - inset;
  const safeTop = inset;
  const safeBottom = boxHeight - inset;
  const availableWidth = Math.max(0, safeRight - safeLeft);

  let dx: number;

  if (next.width >= availableWidth) {
    // Блок занимает всю безопасную зону или шире неё (многострочный текст):
    // якорь неотличим от края, поэтому прижимаем к левому краю зоны. Дальше
    // внутрь не подгоняем — блок физически шире зоны, и «подгонка» вытолкнула бы
    // его за противоположный край.
    dx = safeLeft - next.left;
  } else {
    if (align === 'right') {
      dx = (previous.left + previous.width) - (next.left + next.width);
    } else if (align === 'center') {
      dx = (previous.left + previous.width / 2) - (next.left + next.width / 2);
    } else {
      dx = previous.left - next.left;
    }

    // Внутрь зоны по горизонтали: сдвиг только на недостающую величину.
    if (next.left + dx < safeLeft) {
      dx += safeLeft - (next.left + dx);
    } else if (next.left + dx + next.width > safeRight) {
      dx -= next.left + dx + next.width - safeRight;
    }
  }

  // По вертикали блок растёт вниз; если упёрся в нижнюю границу — приподнимаем.
  let dy = previous.top - next.top;
  const top = next.top + dy;
  const bottom = top + next.height;
  if (bottom > safeBottom) {
    dy -= bottom - safeBottom;
  }
  if (next.top + dy < safeTop) {
    dy = safeTop - next.top;
  }

  return { dx, dy };
}

// ─── Ожидание вставки ─────────────────────────────────────────────────────

/** Сколько раз проверяем, что вставленный фрагмент дошёл до объекта. */
const PASTE_INSERT_ATTEMPTS = 5;
/** Пауза между проверками, мс. */
const PASTE_INSERT_RETRY_MS = 20;

/**
 * Дожидается, пока вставленный фрагмент окажется в тексте объекта.
 *
 * Зачем ждать: в режиме ввода текст попадает в объект не в момент события
 * `paste`, а позже — браузер вставляет его в скрытую textarea, и объект
 * обновляется обработчиком `input` уже после того, как событие `paste`
 * разошлось по слушателям. Подгонять кегль до этого бессмысленно: мы увидим
 * старый текст и решим, что всё помещается.
 *
 * Если фрагмент так и не появился (объект не в режиме ввода или fabric его не
 * подхватил), вызывается `onMissing` — вызывающий код вставляет текст сам.
 *
 * @param readText возвращает текущий текст объекта или null, если объекта больше нет
 */
export function whenPastedTextInserted(params: {
  readText: () => string | null;
  fragment: string;
  onInserted: () => void;
  onMissing: () => void;
  attempts?: number;
  intervalMs?: number;
}): void {
  const {
    readText,
    fragment,
    onInserted,
    onMissing,
    attempts = PASTE_INSERT_ATTEMPTS,
    intervalMs = PASTE_INSERT_RETRY_MS,
  } = params;

  let left = attempts;

  const tick = () => {
    const text = readText();
    if (text === null) return;
    if (text.includes(fragment)) {
      onInserted();
      return;
    }
    if (left-- > 0) {
      setTimeout(tick, intervalMs);
      return;
    }
    onMissing();
  };

  setTimeout(tick, 0);
}

// ─── Очистка вставленного текста ──────────────────────────────────────────

/** Нормализует переводы строк, не трогая крайние пробелы (текст уже в объекте). */
export function normalizeText(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n');
}

/** Очистка вставляемого фрагмента: переводы строк + лишние пробелы по краям. */
export function sanitizePastedFragment(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

// ─── Fabric-обвязка ───────────────────────────────────────────────────────

const rectOf = (object: fabric.FabricObject): Rect => {
  const rect = object.getBoundingRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
};

/**
 * Границы СОДЕРЖИМОГО объекта, без учёта `clipPath`.
 *
 * `getBoundingRect()` у фрейма обрезан рамкой (`clipPath`), поэтому после того,
 * как объект хоть раз прошёл `syncFrameGeometry`, он возвращает прямоугольник
 * рамки, а не текста. Для проверок «влезает ли текст» это ловушка: обрезанный
 * фрейм выглядит как полностью помещающийся, подгонка решает, что делать нечего,
 * и вставленный текст остаётся за кадром.
 *
 * `calcTextHeight()` уже даёт честную высоту содержимого, но ширину и позицию
 * так не получить, поэтому на время замера клип снимается и возвращается на
 * место. Рендер и геометрия объекта при этом не меняются.
 */
export function contentRectOf(object: fabric.FabricObject): Rect {
  const clipped = object as fabric.FabricObject & { clipPath?: fabric.FabricObject | null };
  const clip = clipped.clipPath;
  if (!clip) return rectOf(object);

  clipped.clipPath = undefined;
  try {
    object.setCoords();
    return rectOf(object);
  } finally {
    clipped.clipPath = clip;
    object.setCoords();
  }
}

/**
 * Пересоздаёт объект как `Textbox`, перенося все свойства (включая кастомные —
 * `name`, `id`, `locked`: без них объект потерял бы имя слоя и замок).
 */
function createTextboxFrom(source: fabric.Textbox | fabric.IText): fabric.Textbox {
  // Через any: у Textbox и IText несовместимые сигнатуры toObject, а нам нужен
  // общий набор свойств — тип здесь ничего не проверяет по существу.
  const props = (source as any).toObject(CUSTOM_PROPS) as Record<string, unknown>;
  delete props.type;
  delete props.width;
  delete props.height;

  const textbox = new fabric.Textbox(source.text ?? '', props as any);

  // Ширину задаём сами — по фактической ширине текста (у IText это ширина
  // строки). Если оставить её fabric, он возьмёт ширину самого длинного слова,
  // и при конвертации текст внезапно переразложится в узкий столбик.
  const inkWidth = Math.max(
    MIN_FRAME_WIDTH,
    (source.width ?? MIN_FRAME_WIDTH) * (source.scaleX ?? 1) + 2
  );

  textbox.set({
    left: source.left,
    top: source.top,
    angle: source.angle,
    scaleX: 1,
    scaleY: 1,
    originX: source.originX,
    originY: source.originY,
    width: inkWidth,
  });
  (textbox as any).initDimensions();
  return textbox;
}

/**
 * Меняет объект на холсте, сохраняя z-порядок и выделение.
 * События `object:removed` / `object:added` глушатся: замену типа объекта
 * пользователь не делал, в истории должно остаться одно действие — вставка.
 */
function replaceOnCanvas(oldObject: fabric.FabricObject, newObject: fabric.FabricObject): void {
  const canvas = oldObject.canvas as fabric.Canvas | undefined;
  if (!canvas) return;

  const index = canvas.getObjects().indexOf(oldObject);

  // Старый объект мог остаться в режиме ввода. Убираем его до удаления: иначе
  // canvas продолжает считать, что редактируется уже удалённый объект, и мышь
  // по холсту ведёт себя непредсказуемо.
  exitEditing(oldObject);

  // Новый объект обязан быть обычным выделяемым объектом: в режиме ввода fabric
  // выставляет selectable = false и lockMovementX/Y = true, и если эти флаги
  // переживут замену, блок нельзя будет ни выделить, ни сдвинуть вбок.
  newObject.set({
    selectable: true,
    evented: true,
    lockMovementX: false,
    lockMovementY: false,
    hasControls: true,
    hasBorders: true,
  });

  withoutHistory(() => {
    canvas.remove(oldObject);
    if (index >= 0 && index < canvas.getObjects().length) {
      canvas.insertAt(index, newObject);
    } else {
      canvas.add(newObject);
    }
    // Видимость ручек здесь НЕ трогаем: её задаёт обработчик object:added
    // (hideMiddleControls) — у текста боковые ручки должны остаться, у
    // остальных объектов скрыться. Раньше эта строка перезаписывала решение
    // обработчика и прятала боковые ручки у только что вставленного текста.
    canvas.setActiveObject(newObject);
  });
  canvas.requestRenderAll();
}

/**
 * Минимальная ширина фрейма: уже неё рамку тянуть нельзя — в ней не останется
 * ни одной буквы.
 */
export const MIN_FRAME_WIDTH = 24;

/** Минимальная высота фрейма: ниже неё не помещается ни одна строка. */
export const MIN_FRAME_HEIGHT = 16;

/**
 * Превращает текстовый объект во фрейм — `Textbox` с собственной шириной переноса.
 *
 * `IText` ширины переноса не имеет (он всегда растёт одной строкой), поэтому
 * фреймом быть не может. Вызывать это можно ТОЛЬКО вне перетаскивания: объект
 * подменяется на холсте (удаляется старый), и делать это посреди трансформации
 * fabric нельзя — трансформация держит ссылку на удалённый объект и ломается.
 * Поэтому миграция идёт при создании/загрузке, а не в object:scaling.
 */
export function ensureTextFrame(object: fabric.Textbox | fabric.IText): fabric.Textbox {
  if (object.type === 'textbox') return object as fabric.Textbox;
  const textbox = createTextboxFrom(object);
  replaceOnCanvas(object, textbox);
  return textbox;
}

/**
 * Переносит масштаб объекта в РАЗМЕРЫ ФРЕЙМА, не трогая кегль.
 *
 * Смысл: у текста две независимые характеристики — размер рамки и размер текста.
 * Потянув за ручку, пользователь меняет рамку (текст переносится заново, при
 * недостатке места обрезается), а кегль меняется только в панели. Без этого
 * fabric масштабирует объект целиком, и любые размеры превращаются в кегль.
 *
 * Работает только с готовым фреймом (`Textbox`): для `IText` возвращает null.
 * Конвертация подменяет объект на холсте, а делать это внутри живого
 * перетаскивания нельзя — fabric держит ссылку на удаляемый объект и драг
 * ломается. `IText` доводится до фрейма при создании и загрузке проекта.
 */
export function applyFrameScale(
  object: fabric.Textbox | fabric.IText,
  minWidth: number = MIN_FRAME_WIDTH,
  minHeight: number = MIN_FRAME_HEIGHT
): fabric.Textbox | null {
  if (object.type !== 'textbox') return null;
  const frame = object as fabric.Textbox;

  const scaleX = frame.scaleX ?? 1;
  const scaleY = frame.scaleY ?? 1;
  if (Math.abs(scaleX - 1) < 0.001 && Math.abs(scaleY - 1) < 0.001) return frame;

  const currentWidth = frame.width ?? minWidth;
  const nextWidth = Math.max(minWidth, currentWidth * scaleX);

  // Высоту рамки берём из frameHeight, а если она ещё не задана (рамку не тянули
  // за верх/низ) — из фактической высоты текста.
  const currentHeight = ((frame as any).frameHeight as number | undefined) ?? frame.height ?? minHeight;
  const nextHeight = Math.max(minHeight, currentHeight * scaleY);

  // Высоту тянули руками — значит, это осознанный размер рамки (в том числе
  // меньше текста, ради обрезки). Автоподгон при следующей вставке не должен
  // молча его перезаписывать.
  const userSetHeight = Math.abs(scaleY - 1) > 0.001;

  frame.set({
    width: nextWidth,
    frameHeight: nextHeight,
    scaleX: 1,
    scaleY: 1,
    ...(userSetHeight ? { frameAutoHeight: false } : {}),
  } as any);
  syncFrameGeometry(frame);
  return frame;
}

/**
 * Приводит объект к размерам рамки: высота фрейма и обрезка.
 *
 * `fabric.Textbox` пересчитывает `height` из содержимого при каждом изменении
 * текста или ширины, поэтому собственную высоту рамки нужно возвращать после
 * каждого такого пересчёта — иначе рамка «схлопывается» по тексту, и тянуть её
 * за верх/низ нечего.
 *
 * Обрезка: `clipPath` по прямоугольнику рамки. Так текст за пределами рамки не
 * только выглядит обрезанным, но и реально не рисуется — включая растровый
 * экспорт.
 */
export function syncFrameGeometry(frame: fabric.Textbox): void {
  const frameWidth = frame.width ?? MIN_FRAME_WIDTH;

  // Содержимое меряем ДО фиксации высоты: `calcTextHeight` считает по тексту и
  // от собственной высоты рамки не зависит.
  const contentHeight = (frame as any).calcTextHeight?.() ?? frame.height ?? MIN_FRAME_HEIGHT;

  // Пока высоту не задавали руками (`frameAutoHeight !== false`), рамка идёт за
  // текстом: иначе вставленный или дописанный текст остаётся за пределами
  // `clipPath` и пропадает с этикетки. Отсутствие признака (старые проекты,
  // объекты из библиотеки) трактуем как «идёт за текстом» — это сохраняет текст
  // видимым; ручной размер всегда проставляет `frameAutoHeight: false`.
  const followsText = (frame as any).frameAutoHeight !== false;
  const frameHeight = Math.max(
    MIN_FRAME_HEIGHT,
    followsText ? contentHeight : (((frame as any).frameHeight as number | undefined) ?? contentHeight)
  );

  // Высоту фиксируем принудительно: fabric пересчитал её по содержимому, а для
  // ручной рамки это перезаписало бы заданный пользователем размер.
  frame.set({ frameHeight, height: frameHeight } as any);

  // clipPath в собственных координатах объекта: прямоугольник с центром в
  // центре фрейма накрывает его ровно.
  frame.clipPath = new fabric.Rect({
    width: frameWidth,
    height: frameHeight,
    originX: 'center',
    originY: 'center',
  });

  // Признак переполнения: содержимое выше рамки. Рамка выделения краснеет —
  // это единственный видимый сигнал, что часть текста обрезана.
  const overflowing = contentHeight > frameHeight + 0.5;
  frame.set({ borderColor: overflowing ? '#DC2626' : 'rgb(178, 204, 255)' });

  frame.setCoords();
  frame.canvas?.requestRenderAll();
}

/**
 * Подгоняет текстовый объект под этикетку: переносит строки, уменьшает кегль
 * и сдвигает блок по направлению выравнивания абзаца.
 *
 * Мутирует объект, а если он был `IText` — пересоздаёт его как `Textbox` и
 * подменяет на холсте (возвращается новый объект из `result.object`).
 */
export function fitTextToLabel(
  object: fabric.Textbox | fabric.IText,
  options: FitOptions
): FitResult {
  const inset_mm = options.safetyMargin_mm > 0 ? options.safetyMargin_mm : DEFAULT_INSET_MM;
  const inset = mmToPx(inset_mm);
  const boxWidth = mmToPx(options.labelWidth_mm);
  const boxHeight = mmToPx(options.labelHeight_mm);
  const innerWidth = Math.max(8, boxWidth - inset * 2);
  const innerHeight = Math.max(8, boxHeight - inset * 2);

  // Масштаб переносим в кегль: при scale ≠ 1 ширина и высота объекта не равны
  // фактическим, и подбор кегля считался бы по неверным числам.
  const scale = ((object.scaleX ?? 1) + (object.scaleY ?? 1)) / 2;
  if (Math.abs(scale - 1) > 0.001) {
    object.set({
      fontSize: Math.max(MIN_FONT_SIZE, (object.fontSize ?? 14) * scale),
      scaleX: 1,
      scaleY: 1,
    });
  }

  const previous = contentRectOf(object);
  const maxFontSize = object.fontSize ?? 14;

  // Быстрый путь: текст уже помещается в безопасную зону. Тогда не меняем ни
  // тип объекта, ни кегль, ни позицию. Без него любая короткая вставка
  // превращала бы IText в Textbox и сдвигала объект — при том что подгонять
  // было нечего.
  if (previous.width <= innerWidth + 0.5 && previous.height <= innerHeight + 0.5) {
    // Геометрию рамки всё же выравниваем: текст мог помещаться в этикетку, но
    // не в собственную рамку (например, после «Текст» высотой в одну строку).
    // Без этого `clipPath` продолжал бы обрезать видимую часть, хотя подгонять
    // кегль действительно не нужно. `IText` рамкой не является — его не трогаем.
    if (object.type === 'textbox') syncFrameGeometry(object as fabric.Textbox);
    return {
      object,
      fontSize: maxFontSize,
      shrunk: false,
      overflow: false,
      converted: false,
    };
  }

  const converted = object.type !== 'textbox';
  const textbox: fabric.Textbox = converted
    ? createTextboxFrom(object)
    : (object as fabric.Textbox);

  // ── Ширина и кегль ──────────────────────────────────────────────────────
  // «Хвост» рамки: fabric кладёт в bounding box толщину обводки, поэтому Textbox
  // шириной W даёт прямоугольник W+strokeWidth. Считаем его как разницу между
  // bbox и ФАКТИЧЕСКОЙ шириной объекта, а не между bbox и запрошенной: fabric не
  // даёт рамке быть уже самого длинного слова и молча поднимает ширину до него,
  // а эта разница к обводке отношения не имеет.
  textbox.set({ fontSize: textbox.fontSize, width: innerWidth, splitByGrapheme: false });
  (textbox as any).initDimensions();
  const boxSlack = Math.max(0, contentRectOf(textbox).width - (textbox.width ?? innerWidth));
  const zoneWidth = Math.max(8, innerWidth - boxSlack);

  // Ширина, которую разрешено занять рамке: доля зоны (см. COMPACT_WIDTH_RATIO),
  // но не меньше собственной ширины объекта — если пользователь сделал блок
  // шире, менять его размеры молча нельзя.
  const compactMax = Math.max(32, zoneWidth * COMPACT_WIDTH_RATIO);
  const ownWidth = Math.min(Math.max(previous.width, 8), zoneWidth);

  const measureAt = (width: number) => (fontSize: number) => {
    textbox.set({ fontSize, width, splitByGrapheme: false });
    (textbox as any).initDimensions();
    return textbox.height ?? 0;
  };

  // 1. Кегль подбирается под компактную рамку. Если текст не влезает даже
  //    минимальным кеглем — разрешаем всю безопасную зону: лучше широкая
  //    рамка, чем потерянная часть текста.
  let wrapMax = compactMax;
  let plan = planFontSize({ maxFontSize, maxHeight: innerHeight, measure: measureAt(compactMax) });
  if (plan.overflow) {
    const widePlan = planFontSize({ maxFontSize, maxHeight: innerHeight, measure: measureAt(zoneWidth) });
    if (widePlan.fontSize > plan.fontSize || !widePlan.overflow) {
      plan = widePlan;
      wrapMax = zoneWidth;
    }
  }

  // 2. Внутри разрешённой ширины берём минимальную, при которой текст этим
  //    кеглем ещё влезает по высоте: блок должен обнимать текст, а не висеть
  //    пустой рамкой.
  const wrapMin = Math.min(Math.max(32, ownWidth), wrapMax);
  const chosenWidth = findNarrowestWidth({
    min: wrapMin,
    max: wrapMax,
    fits: (width) => {
      textbox.set({ fontSize: plan.fontSize, width, splitByGrapheme: false });
      (textbox as any).initDimensions();

      // fabric поднимает ширину до самого длинного слова. Если это произошло,
      // ширина не та, что мы проверяли: брать её нельзя, иначе поиск вернёт
      // число, которого у объекта нет.
      if (Math.abs((textbox.width ?? 0) - width) > 0.5) return false;

      return (textbox.height ?? Infinity) <= innerHeight + 0.5;
    },
  });

  textbox.set({ fontSize: plan.fontSize, width: chosenWidth, splitByGrapheme: false });
  (textbox as any).initDimensions();
  textbox.setCoords();

  const next = contentRectOf(textbox);
  const { dx, dy } = computeFillShift({
    align: textbox.textAlign ?? 'left',
    previous,
    next,
    inset,
    boxWidth,
    boxHeight,
  });
  textbox.set({ left: (textbox.left ?? 0) + dx, top: (textbox.top ?? 0) + dy });
  textbox.setCoords();

  // Рамка обнимает подогнанный текст. Без этого `clipPath`, выставленный
  // прежней геометрией (например, «Текст» высотой в одну строку), обрезал бы
  // всё, что выросло после вставки: текст физически есть, но на этикетке его
  // не видно. Сознательно укороченную вручную рамку (`frameAutoHeight: false`)
  // функция не трогает — там обрезка и есть замысел пользователя.
  syncFrameGeometry(textbox);

  if (converted) {
    replaceOnCanvas(object, textbox);
  } else {
    // Объект уже был Textbox и остался в режиме ввода: в нём fabric держит
    // selectable = false и lockMovementX/Y = true, то есть блок нельзя ни
    // выделить, ни сдвинуть, пока пользователь не кликнет мимо. Вставка —
    // законченное действие, после него блок должен браться мышью сразу.
    exitEditing(textbox);
  }

  return {
    object: textbox,
    fontSize: plan.fontSize,
    shrunk: plan.fontSize < maxFontSize - 1e-9,
    overflow: plan.overflow,
    converted,
  };
}

/** Снимает режим ввода, если объект в нём: ошибки fabric здесь не критичны. */
function exitEditing(object: fabric.FabricObject): void {
  const editable = object as unknown as { isEditing?: boolean; exitEditing?: () => void };
  if (!editable.isEditing || typeof editable.exitEditing !== 'function') return;
  try {
    editable.exitEditing();
  } catch {
    // Состояние ввода уже могло быть снято — на подгонку это не влияет.
  }
}
