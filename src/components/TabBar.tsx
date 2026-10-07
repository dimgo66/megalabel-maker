import { useState } from 'react';
import { useProjectStore } from '../store/useProjectStore';
import { X, Plus } from './icons';

/**
 * Панель вкладок над холстом редактора.
 *
 * Каждая вкладка — самостоятельная этикетка: свой формат, свои настройки и
 * своя история отмен. Данные вкладки хранятся в сторе (`tabs`/`activeTabId`),
 * компонент только вызывает его действия. Клик по вкладке — переключение,
 * крестик — закрытие, кнопка «+» — новая пустая этикетка.
 *
 * Закрывать последнюю вкладку нельзя (крестик у неё не показывается): пустой
 * редактор без вкладок не предусмотрен. Переименование — двойным кликом по
 * ярлыку; имя вкладки совпадает с названием проекта в тулбаре.
 */
export function TabBar() {
  const tabs = useProjectStore(s => s.tabs);
  const activeTabId = useProjectStore(s => s.activeTabId);
  const switchTab = useProjectStore(s => s.switchTab);
  const closeTab = useProjectStore(s => s.closeTab);
  const addTab = useProjectStore(s => s.addTab);
  const renameTab = useProjectStore(s => s.renameTab);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const startEditing = (id: string, current: string) => {
    setEditingId(id);
    setDraftName(current);
  };

  const commitEditing = () => {
    if (editingId) renameTab(editingId, draftName);
    setEditingId(null);
  };

  return (
    <div
      className="h-9 bg-white border-b border-gray-200 flex items-end gap-1 px-2 shrink-0 overflow-x-auto"
      role="tablist"
      aria-label="Вкладки этикеток"
    >
      {tabs.map(tab => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={0}
            onClick={() => switchTab(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                switchTab(tab.id);
              }
            }}
            onDoubleClick={() => startEditing(tab.id, tab.name)}
            title={`${tab.name} — двойной клик: переименовать`}
            className={`group flex items-center gap-1.5 px-3 h-8 rounded-t-lg border-t border-x cursor-pointer select-none whitespace-nowrap transition-colors ${
              isActive
                ? 'bg-gray-100 border-gray-300 text-gray-900 -mb-px z-10'
                : 'bg-gray-50 border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
          >
            {editingId === tab.id ? (
              <input
                autoFocus
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitEditing}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEditing();
                  if (e.key === 'Escape') setEditingId(null);
                }}
                className="w-28 px-1 py-0 text-xs"
                aria-label="Имя вкладки"
              />
            ) : (
              <>
                <span className="text-xs font-medium max-w-[12rem] truncate">
                  {tab.name || 'Без названия'}
                </span>
                {tabs.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    className="w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-gray-300 transition-opacity shrink-0"
                    title={`Закрыть «${tab.name}»`}
                    aria-label={`Закрыть вкладку ${tab.name}`}
                  >
                    <X size={10} />
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}

      {/* Новая вкладка. Задержана лимитом стора (20 вкладок): кнопка просто
          перестаёт реагировать — состояние уже видно по списку. */}
      <button
        type="button"
        onClick={addTab}
        className="w-7 h-7 mb-0.5 ml-1 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-blue-600 transition-colors shrink-0"
        title="Новая вкладка — новая этикетка"
        aria-label="Добавить вкладку"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
