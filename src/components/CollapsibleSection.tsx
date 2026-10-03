import { ReactNode, useId, useState } from 'react';

/**
 * Единая сворачиваемая секция для панелей.
 *
 * Заменяет разрозненные реализации (шеврон SVG в LeftPanel/RightPanel,
 * текстовые «▲/▼» в LibraryPanel) одним паттерном: одинаковый шеврон,
 * одинаковая анимация и корректная доступность
 * (aria-expanded / aria-controls + реальный <button>).
 *
 * Вложенность не поддерживается намеренно: аккордеон внутри аккордеона
 * даёт двойной выпадающий список и лишний клик. Секции держим плоскими,
 * а внутри — обычные подзаголовки <h3>.
 */

interface CollapsibleSectionProps {
  /** Заголовок секции. */
  title: string;
  /** Необязательная иконка слева от заголовка. */
  icon?: ReactNode;
  /** Необязательный счётчик/бейдж справа от заголовка. */
  badge?: ReactNode;
  /** Открыта ли секция при первом рендере. */
  defaultOpen?: boolean;
  /** Дополнительные классы для внешней обёртки. */
  className?: string;
  /** Отступы содержимого. По умолчанию — px-4 pb-4. */
  contentClassName?: string;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  icon,
  badge,
  defaultOpen = false,
  className = '',
  contentClassName = 'px-4 pb-4',
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={contentId}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-1.5 min-w-0">
          {icon && <span className="shrink-0">{icon}</span>}
          <span className="type-section truncate">{title}</span>
          {badge}
        </span>
        <svg
          className={`w-4 h-4 shrink-0 text-gray-500 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div id={contentId} hidden={!open} className={open ? contentClassName : ''}>
        {open && children}
      </div>
    </div>
  );
}
