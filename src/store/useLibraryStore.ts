import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { mergeLibraries } from '../utils/librarySerializer';

/**
 * Версия миниатюры. Растёт, когда меняются её размеры: элементы, сохранённые
 * прежней версией, перерисовываются из objectJSON (см. LibraryPanel).
 * 0/undefined — миниатюры 120×80 из первой версии библиотеки.
 */
export const LIBRARY_THUMBNAIL_VERSION = 1;

export interface LibraryItem {
  id: string;
  name: string;
  /** Сериализованный fabric-объект (результат obj.toObject(CUSTOM_PROPS)) */
  objectJSON: object;
  /** Data URL миниатюры (PNG, размер — LIBRARY_THUMBNAIL_VERSION) */
  thumbnail: string;
  createdAt: string;
  /** Тип: text | image | barcode | group | other */
  type: 'text' | 'image' | 'barcode' | 'group' | 'other';
  /** Версия миниатюры; отсутствует у элементов, сохранённых до её введения */
  thumbnailVersion?: number;
}

interface LibraryState {
  items: LibraryItem[];
  addItem: (item: LibraryItem) => void;
  removeItem: (id: string) => void;
  renameItem: (id: string, name: string) => void;
  /** Точечное обновление полей (миграция миниатюр) */
  updateItem: (id: string, patch: Partial<LibraryItem>) => void;
  /** Замена библиотеки целиком — режим «заменить» при импорте файла */
  replaceItems: (items: LibraryItem[]) => void;
  /** Слияние по id; возвращает счётчики для сообщения пользователю */
  mergeItems: (incoming: LibraryItem[]) => { added: number; updated: number };
  reorderItems: (fromIndex: number, toIndex: number) => void;
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        set({ items: [...get().items, item] });
      },

      removeItem: (id) => {
        set({ items: get().items.filter((i) => i.id !== id) });
      },

      renameItem: (id, name) => {
        set({
          items: get().items.map((i) => (i.id === id ? { ...i, name } : i)),
        });
      },

      updateItem: (id, patch) => {
        set({
          items: get().items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        });
      },

      replaceItems: (items) => {
        set({ items });
      },

      mergeItems: (incoming) => {
        const { items, added, updated } = mergeLibraries(get().items, incoming);
        set({ items });
        return { added, updated };
      },

      reorderItems: (fromIndex, toIndex) => {
        const items = [...get().items];
        const [moved] = items.splice(fromIndex, 1);
        items.splice(toIndex, 0, moved);
        set({ items });
      },
    }),
    {
      name: 'megalabel-library',
    }
  )
);
