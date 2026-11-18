import { useCallback, useEffect, useRef, useState } from 'react';
import type * as fabric from 'fabric';
import { useProjectStore } from '../store/useProjectStore';
import { extractDroppedFiles, ingestFile, transferHasFiles } from '../utils/imageIngest';

/**
 * Перетаскивание изображений и PDF с рабочего стола на этикетку.
 *
 * Что перехватывается:
 *   • `dragover` — обязательный `preventDefault`, иначе браузер не разрешит
 *     дроп и откроет файл вместо вставки. Вешается на `window`, потому что
 *     по умолчанию он действует на ВСЁ окно приложения: без перехвата бросок
 *     мимо холста (на панель или тулбар) навигацией заменял бы приложение
 *     открытым PDF;
 *   • `dragenter`/`dragleave` — только подсветка зоны. Считаются счётчиком:
 *     при движении над холстом браузер шлёт пару enter/leave на каждый
 *     дочерний элемент (обёртка fabric, слои SVG), и без счётчика подсветка
 *     мигала бы;
 *   • `drop` — собственно вставка. Обрабатывается только когда курсор был над
 *     этикеткой; иначе файл из рабочей зоны вокруг неё всё равно попадает на
 *     холст (в центр листа), а бросок в панели инструментов не делает ничего
 *     и не мешает пользователю.
 */
export function useCanvasFileDrop(
  containerRef: React.RefObject<HTMLElement | null>,
  dropZoneRef: React.RefObject<HTMLElement | null>
) {
  /** Курсор с файлами над зоной этикетки — включается подсветка. */
  const [isDragOver, setIsDragOver] = useState(false);
  /** Идёт загрузка брошенных файлов — подсветка показывает ожидание. */
  const [isImporting, setIsImporting] = useState(false);

  /** Счётчик вложенных enter: см. комментарий выше. */
  const depthRef = useRef(0);
  /**
   * Загрузка по очереди: несколько файлов за один бросок не должны гоняться
   * за холстом и подгонкой масштаба одновременно.
   */
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  /** Метка последней поставленной в очередь партии (см. enqueue). */
  const lastBatchRef = useRef<symbol | null>(null);

  const dragOverRef = useRef(false);
  useEffect(() => {
    dragOverRef.current = isDragOver;
  }, [isDragOver]);

  /**
   * Курсор внутри области редактора (лист этикетки + рабочая зона вокруг).
   *
   * Считается по геометрии DOM, а НЕ через `elementFromPoint`: при сильном
   * увеличении холст выходит за пределы окна и его видимая часть перекрыта
   * панелями — проверка «элемент под курсором принадлежит холсту» давала бы
   * отказ ровно там, где бросать и нужно. Область редактора исключает панели:
   * бросок в левую панель инструментов не засчитывается.
   */
  const isPointInZone = useCallback(
    (clientX: number, clientY: number): boolean => {
      const container = containerRef.current;
      if (!container) return false;

      const c = container.getBoundingClientRect();
      return clientX >= c.left && clientX <= c.right && clientY >= c.top && clientY <= c.bottom;
    },
    [containerRef]
  );

  /**
   * Точка сброса в координатах этикетки (базовые пиксели сцены, 96 dpi).
   *
   * Пересчёт идёт через `viewportTransform` самого холста, а не через
   * геометрию DOM: сцена совпадает с областью прокрутки только при отсутствии
   * прокрутки и масштабирования браузера, а сдвиг вьюпорта (рабочая зона) уже
   * учтён в его матрице.
   */
  const dropPointFromEvent = useCallback((e: DragEvent) => {
    const canvas = useProjectStore.getState().editorCanvas as
      | (fabric.Canvas & { upperCanvasEl?: HTMLCanvasElement })
      | null;
    if (!canvas) return undefined;

    const el = canvas.upperCanvasEl ?? (canvas as unknown as { lowerCanvasEl?: HTMLCanvasElement });
    const target = el as HTMLCanvasElement | undefined;
    if (!target?.getBoundingClientRect) return undefined;

    const r = target.getBoundingClientRect();
    if (!r.width || !r.height) return undefined;

    // Пиксели элемента холста: bounding rect уже учитывает CSS-размеры и
    // прокрутку, поэтому масштабирование страницы отдельно не считаем.
    const px = ((e.clientX - r.left) / r.width) * target.width;
    const py = ((e.clientY - r.top) / r.height) * target.height;

    const vpt = canvas.viewportTransform;
    if (!vpt || vpt[0] === 0 || vpt[3] === 0) return undefined;

    // Обратная матрица вьюпорта: (px, py) → координаты сцены (этикетки).
    const x = (px - vpt[4]) / vpt[0];
    const y = (py - vpt[5]) / vpt[3];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;

    // Попадание в лист: объект, брошенный в рабочую зону вокруг этикетки,
    // встанет в ближайшую точку внутри листа (см. placeAtDropPoint).
    const store = useProjectStore.getState();
    const pxPerMm = 96 / 25.4;
    const labelW = store.selectedFormat.width_mm * pxPerMm;
    const labelH = store.selectedFormat.height_mm * pxPerMm;

    return {
      x: Math.min(Math.max(x, 0), labelW),
      y: Math.min(Math.max(y, 0), labelH),
    };
  }, []);

  const enqueue = useCallback((files: File[], point?: { x: number; y: number }) => {
    if (files.length === 0) return;

    setIsImporting(true);
    // Метка этой партии: если бросили второй файл, пока грузится первый, новая
    // задача встанет в очередь уже после catch первого. Без метки её
    // завершение сняло бы признак ожидания, а её загрузка ещё шла бы.
    const batch = Symbol('drop-batch');

    const run = queueRef.current
      .then(async () => {
        // Холст мог исчезнуть (размонтирование, перезагрузка проекта) — берём
        // его в момент загрузки, а не в момент броска.
        const canvas = useProjectStore.getState().editorCanvas;
        if (!canvas) return;

        for (const file of files) {
          await ingestFile(file, canvas, point);
        }
      })
      .catch(error => {
        console.error('Ошибка перетаскивания файла:', error);
      })
      .finally(() => {
        if (lastBatchRef.current === batch) setIsImporting(false);
      });

    lastBatchRef.current = batch;
    queueRef.current = run;
  }, []);

  useEffect(() => {
    /** Общий признак «мышью тащат файл из ОС». */
    const isFileDrag = (e: DragEvent) => transferHasFiles(e.dataTransfer);

    const handleDragEnter = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      // Без preventDefault браузер не поднимет последующий drop.
      e.preventDefault();

      if (!isPointInZone(e.clientX, e.clientY)) return;

      depthRef.current += 1;
      setIsDragOver(true);
    };

    const handleDragOver = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      // Ключевая строка: без неё дроп не разрешён и браузер откроет файл.
      e.preventDefault();
      e.dataTransfer!.dropEffect = isPointInZone(e.clientX, e.clientY) ? 'copy' : 'none';
    };

    const handleDragLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      depthRef.current = Math.max(0, depthRef.current - 1);

      // Ушли за пределы окна — сбрасываем всё сразу: leave за дочерними
      // элементами мог не прийти.
      const leftWindow =
        e.clientX <= 0 ||
        e.clientY <= 0 ||
        e.clientX >= window.innerWidth ||
        e.clientY >= window.innerHeight;

      if (depthRef.current === 0 || leftWindow) {
        depthRef.current = 0;
        setIsDragOver(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();

      const wasOverZone = dragOverRef.current || isPointInZone(e.clientX, e.clientY);
      depthRef.current = 0;
      setIsDragOver(false);

      // Бросок мимо этикетки (панель, тулбар, модалка) игнорируем: вставлять
      // объект «вслепую» туда, где пользователь его не ждал, хуже, чем ничего.
      if (!wasOverZone) return;

      const files = extractDroppedFiles(e.dataTransfer);
      if (files.length === 0) return;

      enqueue(files, dropPointFromEvent(e));
    };

    // `dragover` и `dragenter` висят на window: дефолтное поведение браузера
    // («открыть файл») действует на всё окно, перехват на контейнере его не
    // отменял бы для остальной площади приложения.
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
      depthRef.current = 0;
    };
  }, [containerRef, dropPointFromEvent, enqueue, isPointInZone]);

  return { isDragOver, isImporting };
}
