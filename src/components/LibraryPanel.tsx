import { useState, useRef } from "react";
import * as fabric from "fabric";
import { useLibraryStore, LibraryItem } from "../store/useLibraryStore";
import { useProjectStore } from "../store/useProjectStore";
import { CUSTOM_PROPS, serializeCanvas, sceneWidth, sceneHeight } from "../utils/canvasHelpers";

// ─── helpers ──────────────────────────────────────────────────────────────────

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

/** Рисует obj на офф-скрин канвасе 120x80 и возвращает data URL */
async function makeThumbnail(obj: fabric.FabricObject): Promise<string> {
  const TW = 120;
  const TH = 80;
  const tmpEl = document.createElement("canvas");
  tmpEl.width = TW;
  tmpEl.height = TH;
  const tmpCanvas = new fabric.StaticCanvas(tmpEl, { width: TW, height: TH });

  // Клонируем объект чтобы не трогать оригинал
  const cloned = await obj.clone(CUSTOM_PROPS);

  // Масштабируем под миниатюру
  const bw = obj.getBoundingRect().width || 1;
  const bh = obj.getBoundingRect().height || 1;
  const scale = Math.min((TW - 8) / bw, (TH - 8) / bh, 1);
  cloned.scaleX = (cloned.scaleX || 1) * scale;
  cloned.scaleY = (cloned.scaleY || 1) * scale;
  cloned.set({ left: TW / 2, top: TH / 2, originX: "center", originY: "center" });

  tmpCanvas.add(cloned);
  tmpCanvas.renderAll();
  const url = tmpEl.toDataURL("image/png");
  tmpCanvas.dispose();
  return url;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LibraryPanel() {
  const { items, addItem, removeItem, renameItem } = useLibraryStore();
  const { editorCanvas } = useProjectStore();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Save selected object to library ──────────────────────────────────────
  const handleSaveSelected = async () => {
    if (!editorCanvas) return;
    const active = editorCanvas.getActiveObject();
    if (!active) {
      alert("Сначала выделите объект на этикетке");
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
      };
      addItem(item);
    } finally {
      setAdding(false);
    }
  };

  // ── Insert item onto canvas ───────────────────────────────────────────────
  const handleInsert = async (item: LibraryItem) => {
    if (!editorCanvas) return;

    // enlivenObjects правильно восстанавливает конкретный тип (IText, FabricImage, Group…)
    const [obj] = await fabric.util.enlivenObjects<fabric.FabricObject>([item.objectJSON as any]);
    if (!obj) return;

    // Размещаем по центру сцены
    const cw = sceneWidth(editorCanvas);
    const ch = sceneHeight(editorCanvas);
    obj.set({ left: cw / 2, top: ch / 2, originX: "center", originY: "center" });
    obj.setCoords();

    // Скрываем средние ручки
    obj.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false });

    editorCanvas.add(obj);
    editorCanvas.setActiveObject(obj);
    editorCanvas.renderAll();

    // Пишем в историю
    const json = serializeCanvas(editorCanvas);
    useProjectStore.getState().setCanvasJSON(json);
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

  const typeIcon: Record<LibraryItem["type"], string> = {
    text: "✏️",
    image: "🖼️",
    barcode: "▮▮▮",
    group: "📦",
    other: "⬜",
  };

  return (
    <div className="mb-4">
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-xs font-medium text-gray-600 mb-2 hover:text-gray-900 transition-colors group"
      >
        <span className="flex items-center gap-1.5">
          <span>📚</span>
          <span>Библиотека</span>
          {items.length > 0 && (
            <span className="bg-blue-100 text-blue-600 rounded-full px-1.5 py-0.5 text-xs font-semibold leading-none">
              {items.length}
            </span>
          )}
        </span>
        <span className="text-gray-400 group-hover:text-gray-600 transition-colors">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="space-y-2">
          {/* Save button */}
          <button
            onClick={handleSaveSelected}
            disabled={adding}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs text-blue-700 font-medium transition-colors disabled:opacity-50"
          >
            {adding ? "Сохраняем..." : "＋ Сохранить выделенное"}
          </button>

          {/* Items grid */}
          {items.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-4 bg-gray-50 rounded-lg border border-dashed border-gray-200">
              Выделите объект и нажмите «Сохранить»
            </div>
          ) : (
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="group/item flex items-center gap-2 p-2 bg-gray-50 hover:bg-white border border-gray-200 hover:border-blue-200 rounded-lg transition-all cursor-default"
                >
                  {/* Thumbnail */}
                  <div
                    className="w-14 h-10 shrink-0 bg-white border border-gray-200 rounded overflow-hidden flex items-center justify-center cursor-pointer hover:border-blue-400 transition-colors"
                    onClick={() => handleInsert(item)}
                    title="Вставить на этикетку"
                  >
                    {item.thumbnail ? (
                      <img
                        src={item.thumbnail}
                        alt={item.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="text-lg">{typeIcon[item.type]}</span>
                    )}
                  </div>

                  {/* Name + type */}
                  <div className="flex-1 min-w-0">
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
                        className="w-full text-xs border border-blue-300 rounded px-1 py-0.5 outline-none"
                      />
                    ) : (
                      <div
                        className="text-xs font-medium text-gray-700 truncate cursor-pointer hover:text-blue-600"
                        title="Двойной клик — переименовать"
                        onDoubleClick={() => startRename(item)}
                      >
                        {item.name}
                      </div>
                    )}
                    <div className="text-xs text-gray-400 mt-0.5">
                      {typeIcon[item.type]} {item.type === "barcode" ? "Штрих-код" : item.type === "text" ? "Текст" : item.type === "image" ? "Изображение" : item.type === "group" ? "Группа" : "Объект"}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1 shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleInsert(item)}
                      className="w-6 h-6 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded text-xs transition-colors"
                      title="Вставить"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Удалить «${item.name}» из библиотеки?`)) removeItem(item.id);
                      }}
                      className="w-6 h-6 flex items-center justify-center bg-red-100 hover:bg-red-500 text-red-500 hover:text-white rounded text-xs transition-colors"
                      title="Удалить из библиотеки"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {items.length > 0 && (
            <p className="text-xs text-gray-400 text-center">
              Двойной клик по названию — переименовать
            </p>
          )}
        </div>
      )}
    </div>
  );
}
