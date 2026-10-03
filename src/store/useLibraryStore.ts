import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface LibraryItem {
  id: string;
  name: string;
  /** Сериализованный fabric-объект (результат obj.toObject(CUSTOM_PROPS)) */
  objectJSON: object;
  /** Data URL миниатюры (PNG 120x80) */
  thumbnail: string;
  createdAt: string;
  /** Тип: text | image | barcode | group | other */
  type: 'text' | 'image' | 'barcode' | 'group' | 'other';
}

interface LibraryState {
  items: LibraryItem[];
  addItem: (item: LibraryItem) => void;
  removeItem: (id: string) => void;
  renameItem: (id: string, name: string) => void;
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
