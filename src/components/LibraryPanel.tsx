import { useEffect, useRef, useState } from "react";
import * as fabric from "fabric";
import { useLibraryStore, LibraryItem, LIBRARY_THUMBNAIL_VERSION } from "../store/useLibraryStore";
import { useProjectStore } from "../store/useProjectStore";
import { CUSTOM_PROPS, serializeCanvas, sceneWidth, sceneHeight } from "../utils/canvasHelpers";
import { downloadLibraryFile, readLibraryFile } from "../utils/librarySerializer";
import { ensureTextFrame } from "../utils/textFitter";
import { CollapsibleSection } from "./CollapsibleSection";
import {
  ArrowDown,
  BarcodeIcon,
  BookOpen,
  Download,
  Folder,
  ImageIcon,
  Package,
  Pencil,
  Square,
  X,
} from "./icons";

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Размер миниатюры. Было 120×80 — под строку списка; карточка показывает
 * превью крупнее, и на прежнем размере оно выглядело бы мылом. Смена размера
 * отмечена LIBRARY_THUMBNAIL_VERSION: у старых элементов миниатюра
 * перерисовывается из objectJSON при первом показе.
 */
const THUMBNAIL_W = 240;
const THUMBNAIL_H = 160;

function detectType(obj: fabric.FabricObject): LibraryItem["type"] {
  const o = obj as any;
  if (o.barcodeFormat) return "barcode";
  if (obj instanceof fabric.IText || obj instanceof fabric.Textbox) return "text";
  if (obj instanceof fabric.FabricImage) return "image";
  if (obj instanceof fabric.Group) return "group";
  return "other";
}

function defaultName(type: LibraryItem["type"]): string {
  const map: Record<LibraryItem["type"], string> = {
    text: "Текст",
    image: "Изображение",
    barcode: "Штрих-код",
    group: "Группа",
    other: "Элемент",
  };
  return map[type];
}

function typeLabel(type: LibraryItem["type"]): string {
  return defaultName(type);
}

/** Рисует obj на офф-скрин канвасе и возвращает data URL */
async function makeThumbnail(obj: fabric.FabricObject): Promise<string> {
  const tmpEl = document.createElement("canvas");
  tmpEl.width = THUMBNAIL_W;
  tmpEl.height = THUMBNAIL_H;
  const tmpCanvas = new fabric.StaticCanvas(tmpEl, { width: THUMBNAIL_W, height: THUMBNAIL_H });

  // Клонируем объект чтобы не трогать оригинал
  const cloned = await obj.clone(CUSTOM_PROPS);

  // Масштабируем под миниатюру
  const bw = obj.getBoundingRect().width || 1;
  const bh = obj.getBoundingRect().height || 1;
  const scale = Math.min((THUMBNAIL_W - 8) / bw, (THUMBNAIL_H - 8) / bh, 1);
  cloned.scaleX = (cloned.scaleX || 1) * scale;
  cloned.scaleY = (cloned.scaleY || 1) * scale;
  cloned.set({
    left: THUMBNAIL_W / 2,
    top: THUMBNAIL_H / 2,
    originX: "center",
    originY: "center",
  });

  tmpCanvas.add(cloned);
  tmpCanvas.renderAll();
  const url = tmpEl.toDataURL("image/png");
  tmpCanvas.dispose();
  return url;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LibraryPanel() {
  const {
    items,
    addItem,
    removeItem,
    renameItem,
    updateItem,
    replaceItems,
    mergeItems,
  } = useLibraryStore();
  const { editorCanvas } = useProjectStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Элементы, у которых миграция миниатюры уже запускалась в этой сессии.
  // Хранится в ref, а не в состоянии: попытка должна быть ровно одна, иначе
  // не развернувшийся объект перерисовывался бы на каждом обновлении списка.
  const thumbnailMigrationRef = useRef<Set<string>>(new Set());

  // ── Ленивая миграция миниатюр прошлых версий ────────────────────────────
  useEffect(() => {
    const stale = items.filter(
      item =>
        (item.thumbnailVersion ?? 0) < LIBRARY_THUMBNAIL_VERSION &&
        !thumbnailMigrationRef.current.has(item.id)
    );
    if (stale.length === 0) return;

    let cancelled = false;

    const migrate = async () => {
      for (const item of stale) {
        thumbnailMigrationRef.current.add(item.id);
        try {
          const [obj] = await fabric.util.enlivenObjects<fabric.FabricObject>(item.objectJSON as any);
          const thumbnail = obj ? await makeThumbnail(obj) : "";
          if (cancelled) return;
          updateItem(item.id, {
            thumbnail: thumbnail || item.thumbnail,
            thumbnailVersion: LIBRARY_THUMBNAIL_VERSION,
          });
        } catch {
          // Объект не развернулся — миниатюру не трогаем, но версию отмечаем,
          // чтобы не пытаться снова при каждом изменении списка.
          if (cancelled) return;
          updateItem(item.id, { thumbnailVersion: LIBRARY_THUMBNAIL_VERSION });
        }
      }
    };

    migrate();
    return () => {
      cancelled = true;
    };
  }, [items, updateItem]);

  // ── Save selected object to library ──────────────────────────────────────
  const handleSaveSelected = async () => {
    if (!editorCanvas) return;
    const active = editorCanvas.getActiveObject();
    if (!active) {
      setStatus("Сначала выделите объект на этикетке");
      return;
    }

    setAdding(true);
    try {
      const type = detectType(active);
      const thumbnail = await makeThumbnail(active);
      const objectJSON = active.toObject(CUSTOM_PROPS);

      const item: LibraryItem = {
        id: crypto.randomUUID(),
        name: defaultName(type),
        objectJSON,
        thumbnail,
        createdAt: new Date().toISOString(),
        type,
        thumbnailVersion: LIBRARY_THUMBNAIL_VERSION,
      };
      addItem(item);
      setStatus(`«${item.name}» добавлен в библиотеку`);
    } finally {
      setAdding(false);
    }
  };

  // ── Insert item onto canvas ───────────────────────────────────────────────
  const handleInsert = async (item: LibraryItem) => {
    if (!editorCanvas) return;

    // enlivenObjects правильно восстанавливает конкретный тип (IText, FabricImage, Group…)
    const [raw] = await fabric.util.enlivenObjects<fabric.FabricObject>([item.objectJSON as any]);
    if (!raw) return;

    // Элементы, сохранённые до появления фреймов, лежат как IText: у него нет
    // ширины переноса, и за боковые ручки он не тянется. Переводим во фрейм.
    const obj = raw.type === "i-text" ? ensureTextFrame(raw as any) : raw;

    // Размещаем по центру сцены
    const cw = sceneWidth(editorCanvas);
    const ch = sceneHeight(editorCanvas);
    obj.set({ left: cw / 2, top: ch / 2, originX: "center", originY: "center" });
    obj.setCoords();

    editorCanvas.add(obj);
    editorCanvas.setActiveObject(obj);
    editorCanvas.renderAll();

    // Пишем в историю
    const json = serializeCanvas(editorCanvas);
    useProjectStore.getState().setCanvasJSON(json);
  };

  // ── Экспорт и импорт библиотеки файлом ───────────────────────────────────
  const handleExportLibrary = () => {
    if (items.length === 0) return;
    try {
      downloadLibraryFile(items);
      setStatus(`Библиотека сохранена в файл: ${items.length} элементов`);
    } catch (error) {
      setStatus(`Не удалось сохранить библиотеку: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
    }
  };

  const handleImportLibrary = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Поле очищается сразу: иначе повторный выбор того же файла не вызовет change
    e.target.value = "";
    if (!file) return;

    try {
      const incoming = await readLibraryFile(file);

      if (items.length === 0) {
        mergeItems(incoming);
        setStatus(`Загружено элементов: ${incoming.length}`);
        return;
      }

      const replace = window.confirm(
        `В библиотеке уже ${items.length} элементов.\n\n` +
        `ОК — заменить их содержимым файла (${incoming.length}).\n` +
        `Отмена — добавить элементы из файла к текущим.`
      );

      if (replace) {
        replaceItems(incoming);
        setStatus(`Библиотека заменена: ${incoming.length} элементов`);
      } else {
        const { added, updated } = mergeItems(incoming);
        setStatus(`Добавлено: ${added}, обновлено: ${updated}`);
      }
    } catch (error) {
      setStatus(`Ошибка загрузки: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
    }
  };

  // ── Rename ────────────────────────────────────────────────────────────────
  const startRename = (item: LibraryItem) => {
    setEditingId(item.id);
    setEditingName(item.name);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const commitRename = () => {
    if (editingId && editingName.trim()) {
      renameItem(editingId, editingName.trim());
    }
    setEditingId(null);
  };

  // ─────────────────────────────────────────────────────────────────────────

  // Иконки типов из общего набора. Раньше здесь были эмодзи и символьные
  // глифы (✏️ 🖼️ ▮▮▮ 📦 ⬜) — они не наследуют currentColor, по-разному
  // выглядят в разных ОС и не совпадали по толщине с левой панелью.
  const typeIcon: Record<LibraryItem["type"], typeof Square> = {
    text: Pencil,
    image: ImageIcon,
    barcode: BarcodeIcon,
    group: Package,
    other: Square,
  };

  return (
    <CollapsibleSection
      title="Библиотека"
      icon={<BookOpen size={16} />}
      badge={
        items.length > 0 ? (
          <span className="bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 text-xs font-semibold leading-none">
            {items.length}
          </span>
        ) : undefined
      }
      className="border-b border-gray-200"
      contentClassName="px-4 pb-4"
    >
      <div className="space-y-2">
          {/* Save selected button */}
          <button
            type="button"
            onClick={handleSaveSelected}
            disabled={adding}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs text-blue-700 font-medium transition-colors disabled:opacity-50"
          >
            {adding ? "Сохраняем..." : "＋ Сохранить выделенное"}
          </button>

          {/* Библиотека файлом: обмен между профилями и машинами.
              Сама библиотека живёт в localStorage, поэтому без этих двух кнопок
              её нельзя ни перенести, ни восстановить после очистки данных сайта. */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleExportLibrary}
              disabled={items.length === 0}
              className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg text-xs text-gray-700 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Скачать библиотеку файлом .json"
            >
              <Download size={13} />
              <span>Сохранить</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-1.5 px-2 py-1.5 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg text-xs text-gray-700 font-medium transition-colors"
              title="Загрузить библиотеку из файла .json"
            >
              <Folder size={13} />
              <span>Загрузить</span>
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportLibrary}
            className="hidden"
            aria-label="Файл библиотеки"
          />

          {status && (
            <p role="status" aria-live="polite" className="type-meta text-center">
              {status}
            </p>
          )}

          {/* Items grid */}
          {items.length === 0 ? (
            <div className="type-meta text-center py-4 bg-gray-50 rounded-lg border border-dashed border-gray-300">
              Выделите объект и нажмите «Сохранить»
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto pr-0.5">
              {items.map((item) => {
                const TypeGlyph = typeIcon[item.type];
                return (
                  <div
                    key={item.id}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "F2") {
                        e.preventDefault();
                        startRename(item);
                      }
                    }}
                    className="group/item flex flex-col bg-gray-50 hover:bg-white border border-gray-200 hover:border-blue-200 rounded-lg overflow-hidden transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                  >
                    {/* Превью. Клик по нему — вставка: раньше это была кнопка
                        56×40 в строке, теперь площадь карточки, и промахнуться
                        по ней сложнее. */}
                    <button
                      type="button"
                      className="relative w-full aspect-[3/2] bg-white border-b border-gray-200 flex items-center justify-center cursor-pointer hover:bg-blue-50/50 transition-colors"
                      onClick={() => handleInsert(item)}
                      title="Вставить на этикетку"
                      aria-label={`Вставить «${item.name}» на этикетку`}
                    >
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt=""
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <TypeGlyph size={22} className="text-gray-400" />
                      )}
                      <span className="absolute right-1 bottom-1 w-5 h-5 flex items-center justify-center bg-blue-600 text-white rounded opacity-0 group-hover/item:opacity-100 group-focus-within/item:opacity-100 transition-opacity">
                        <ArrowDown size={12} />
                      </span>
                    </button>

                    {/* Название + кнопка переименования.
                        Карандаш виден всегда, а не только по наведению: раньше
                        переименование жило на двойном клике по названию, и о нём
                        можно было не узнать. Двойной клик оставлен как привычка. */}
                    <div
                      className="flex items-center gap-1 px-2 pt-1.5"
                      onDoubleClick={() => startRename(item)}
                    >
                      {editingId === item.id ? (
                        <input
                          ref={inputRef}
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename();
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          aria-label="Название элемента библиотеки"
                          className="w-full text-xs border border-blue-300 rounded px-1 py-0.5 outline-none"
                        />
                      ) : (
                        <>
                          <span
                            className="flex-1 min-w-0 text-xs font-medium text-gray-700 truncate"
                            title={item.name}
                          >
                            {item.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => startRename(item)}
                            className="w-5 h-5 flex items-center justify-center shrink-0 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Переименовать (F2)"
                            aria-label={`Переименовать «${item.name}»`}
                          >
                            <Pencil size={11} />
                          </button>
                        </>
                      )}
                    </div>

                    {/* Тип и удаление */}
                    <div className="flex items-center justify-between px-2 pb-1.5 pt-0.5">
                      <span className="type-meta">{typeLabel(item.type)}</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Удалить «${item.name}» из библиотеки?`)) {
                            removeItem(item.id);
                          }
                        }}
                        className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-700 hover:bg-red-100 rounded transition-colors opacity-0 group-hover/item:opacity-100 group-focus-within/item:opacity-100"
                        title="Удалить из библиотеки"
                        aria-label={`Удалить «${item.name}» из библиотеки`}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {items.length > 0 && (
            <p className="type-meta text-center">
              Карандаш — переименовать, клик по превью — вставить
            </p>
          )}
      </div>
    </CollapsibleSection>
  );
}
