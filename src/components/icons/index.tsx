import type { SVGProps } from 'react';

/**
 * Иконная система Megalabel Pro.
 *
 * Зачем: до этого иконками служили эмодзи и символьные глифы (🏷️ 💾 ▶ ✓ ▮ ⚪).
 * Они не масштабируются, выглядят по-разному в Windows/macOS/Android, не
 * наследуют `currentColor` (эмодзи отрисованы цветными битмапами) и не
 * выравниваются по базовой линии текста. Здесь один набор нарисованных
 * контуров: 24×24, обводка 2, скруглённые стыки, `stroke="currentColor"`.
 *
 * Правила набора:
 * - одна толщина обводки и одна геометрия у всех иконок;
 * - только `currentColor` — цвет задаёт место применения;
 * - иконки декоративные по умолчанию (`aria-hidden`), смысл несёт подпись;
 *   там, где подписи нет, вызывающий код обязан передать `aria-label`
 *   и убрать `aria-hidden`.
 */

export interface IconProps extends SVGProps<SVGSVGElement> {
  /** Сторона в px. 16 совпадает с прежним `w-4 h-4`. */
  size?: number;
}

function Icon({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ── Объекты этикетки ─────────────────────────────────────────────────── */

/** Текст: литера «T» с засечкой. */
export const TypeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7V4h16v3" />
    <path d="M12 4v16" />
    <path d="M9 20h6" />
  </Icon>
);

/** Изображение: рамка, солнце и склон. */
export const ImageIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="1.6" />
    <path d="M21 15l-4.5-4.5L6 21" />
  </Icon>
);

/**
 * Штрих-код. Полосы разной толщины — так он читается как штрих-код, а не как
 * «несколько линий». Внутри набора это единственная иконка с локальной
 * толщиной, и это осознанно: предметная форма важнее формального единообразия.
 */
export const BarcodeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5v14" />
    <path d="M7.5 5v14" strokeWidth={3.5} />
    <path d="M11 5v14" />
    <path d="M13.5 5v14" strokeWidth={3.5} />
    <path d="M17 5v14" />
    <path d="M20 5v14" strokeWidth={3.5} />
  </Icon>
);

/** Группа объектов: закрытая коробка. */
export const Package = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 8l-9-5-9 5 9 5 9-5z" />
    <path d="M3 8v8l9 5 9-5V8" />
    <path d="M12 13v8" />
  </Icon>
);

/** Прочее: пустой квадрат. */
export const Square = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
  </Icon>
);

/** Круглая форма этикетки. */
export const Circle = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
  </Icon>
);

/** Новая вкладка / добавление: крестик под 45°. */
export const Plus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

/* ── Действия ─────────────────────────────────────────────────────────── */

export const Save = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
    <path d="M17 21v-8H7v8" />
    <path d="M7 3v5h8" />
  </Icon>
);

/**
 * «Сохранить как»: тот же диск, но с карандашом — действие создаёт НОВЫЙ файл,
 * а не перезаписывает текущий. Отличается от `Save` именно карандашом в правом
 * нижнем углу, поэтому рядом с «Сохранить» иконки не читаются как дубль.
 */
export const SaveAs = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 21H5a2 2 0 01-2-2V5a2 2 0 012-2h9l4 4v3" />
    <path d="M7 21v-7h8" />
    <path d="M7 3v4h6" />
    <path d="M19.5 10.5a1.6 1.6 0 012.3 2.3L16 18.6l-3 .7.7-3z" />
  </Icon>
);

export const FolderOpen = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v1" />
    <path d="M2 9h18l-2 10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
  </Icon>
);

export const Folder = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
  </Icon>
);

export const Download = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <path d="M7 10l5 5 5-5" />
    <path d="M12 15V3" />
  </Icon>
);

export const Pencil = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" />
  </Icon>
);

export const Trash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </Icon>
);

export const RefreshCw = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 12a9 9 0 11-2.6-6.4" />
    <path d="M21 3v6h-6" />
  </Icon>
);

export const Printer = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 9V3h12v6" />
    <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" rx="1" />
  </Icon>
);

export const FileText = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M16 13H8M16 17H8" />
  </Icon>
);

/* ── Состояния и видимость ────────────────────────────────────────────── */

export const Eye = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const EyeOff = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.9 5.2A9.6 9.6 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4.1" />
    <path d="M6.2 6.2A17 17 0 002 12s3.6 7 10 7a9.6 9.6 0 004.1-.9" />
    <path d="M10 10a3 3 0 004 4" />
    <path d="M3 3l18 18" />
  </Icon>
);

export const Lock = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 018 0v4" />
  </Icon>
);

export const Unlock = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 017.5-2" />
  </Icon>
);

export const Check = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 6L9 17l-5-5" />
  </Icon>
);

export const X = (p: IconProps) => (
  <Icon {...p}>
    <path d="M18 6L6 18M6 6l12 12" />
  </Icon>
);

export const AlertTriangle = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </Icon>
);

export const Lightbulb = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 18h6" />
    <path d="M10 22h4" />
    <path d="M12 2a7 7 0 00-4 12.7V18h8v-3.3A7 7 0 0012 2z" />
  </Icon>
);

/* ── Навигация ────────────────────────────────────────────────────────── */

export const ChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 18l6-6-6-6" />
  </Icon>
);

export const ChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);

export const ArrowUp = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </Icon>
);

export const ArrowDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M19 12l-7 7-7-7" />
  </Icon>
);

export const ArrowLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </Icon>
);

export const ArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14M12 5l7 7-7 7" />
  </Icon>
);

export const Home = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 9.5l9-7 9 7V20a1 1 0 01-1 1H4a1 1 0 01-1-1z" />
    <path d="M9 21v-9h6v9" />
  </Icon>
);

/* ── Разделы справки и настройки ──────────────────────────────────────── */

/** Библиотека / справка: раскрытая книга. */
export const BookOpen = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 4h6a4 4 0 014 4v13a3 3 0 00-3-3H2z" />
    <path d="M22 4h-6a4 4 0 00-4 4v13a3 3 0 013-3h7z" />
  </Icon>
);

/** Карта интерфейса. */
export const Map = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 6l7-3 6 3 7-3v15l-7 3-6-3-7 3z" />
    <path d="M9 3v15M15 6v15" />
  </Icon>
);

/** Формат листа: угольник. */
export const Ruler = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 15.5l13-13 6 6-13 13z" />
    <path d="M6 12l2 2M9 9l2 2M12 6l2 2" />
  </Icon>
);

/** Штрих-коды: столбцы данных. */
export const BarChart = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 20v-4M12 20V10M18 20V4" />
  </Icon>
);

/** Шрифты. */
export const Type = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7V4h16v3" />
    <path d="M9 20h6M12 4v16" />
  </Icon>
);

/** Слои и объекты. */
export const Clipboard = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" />
  </Icon>
);

export const Keyboard = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
  </Icon>
);

export const Target = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.5" />
  </Icon>
);

export const HelpCircle = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.2 9a3 3 0 015.5 1.5c0 2-3 2.5-3 2.5" />
    <path d="M12 17h.01" />
  </Icon>
);

/** Метка продукта (Megalabel Pro). */
export const Tag = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0l-7.2-7.2a2 2 0 01-.6-1.5l.4-6a2 2 0 011.9-1.9l6-.4a2 2 0 011.5.6l7.2 7.2a2 2 0 010 2.8z" />
    <path d="M7.5 7.5h.01" />
  </Icon>
);

/** Безопасное поле / размеры. */
export const MoveVertical = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v18" />
    <path d="M9 6l3-3 3 3M9 18l3 3 3-3" />
  </Icon>
);

/* ── Выравнивание текста ──────────────────────────────────────────────── */

export const AlignLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 6h18M3 12h12M3 18h15" />
  </Icon>
);

export const AlignCenter = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 6h18M6 12h12M4.5 18h15" />
  </Icon>
);

export const AlignRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 6h18M9 12h12M6 18h15" />
  </Icon>
);
