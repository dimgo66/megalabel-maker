import { useState } from 'react';
import {
  AlertTriangle,
  BarChart,
  BookOpen,
  Check,
  ChevronRight,
  Clipboard,
  Eye,
  Home,
  ImageIcon,
  Keyboard,
  Lightbulb,
  Map,
  MoveVertical,
  Pencil,
  Printer,
  RefreshCw,
  Ruler,
  Save,
  Target,
  Lock,
  Type as TypeIcon,
  X,
} from './icons';
import type { IconProps } from './icons';

interface HelpSection {
  id: string;
  /** Компонент иконки из общего набора (раньше — строка-эмодзи). */
  icon: (p: IconProps) => React.ReactElement;
  title: string;
  content: React.ReactNode;
}

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const sections: HelpSection[] = [
  {
    id: 'overview',
    icon: Home,
    title: 'Обзор',
    content: (
      <div className="space-y-4">
        <p className="text-gray-700 leading-relaxed">
          <strong>Megalabel Pro</strong> — профессиональный редактор этикеток для создания и печати этикеток на листах A4.
          Поддерживает векторные штрих-коды, произвольные шрифты и экспорт в PDF.
        </p>
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
          <div className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-1.5">
            <Map size={15} className="shrink-0" />
            <span>Интерфейс приложения</span>
          </div>
          <div className="space-y-2 text-sm text-blue-700">
            <div className="flex items-start gap-2">
              <span className="font-bold shrink-0 w-28">Верхняя панель</span>
              <span>— название проекта, формат этикетки, отмена/повтор, сохранение, загрузка, предпросмотр</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-bold shrink-0 w-28">Левая панель</span>
              <span>— инструменты добавления объектов (текст, изображение, штрих-код) и управление шрифтами</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-bold shrink-0 w-28">Центр</span>
              <span>— рабочая область редактора этикетки с масштабированием</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-bold shrink-0 w-28">Правая панель</span>
              <span>— свойства выделенного объекта, слои, настройки листа</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div className="font-medium text-gray-800 mb-1 flex items-center gap-1.5"><Ruler size={14} className="text-gray-500 shrink-0" /> <span>50+ форматов</span></div>
            <div className="text-gray-500">от 18×12 мм до A4</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div className="font-medium text-gray-800 mb-1 flex items-center gap-1.5"><BarChart size={14} className="text-gray-500 shrink-0" /> <span>Векторные штрих-коды</span></div>
            <div className="text-gray-500">EAN-13, ITF-14</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div className="font-medium text-gray-800 mb-1 flex items-center gap-1.5"><TypeIcon size={14} className="text-gray-500 shrink-0" /> <span>Шрифты</span></div>
            <div className="text-gray-500">Системные, Google Fonts, свои .ttf/.otf</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div className="font-medium text-gray-800 mb-1 flex items-center gap-1.5"><Save size={14} className="text-gray-500 shrink-0" /> <span>Автосохранение</span></div>
            <div className="text-gray-500">Проект восстанавливается при перезагрузке</div>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'format',
    icon: Ruler,
    title: 'Формат и лист',
    content: (
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Выбор формата этикетки</h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            Нажмите на кнопку формата в верхней панели (например «EAN-40×30»). Откроется список из 50+ стандартных форматов,
            сгруппированных по категориям (EAN, ITF, квадратные, прямоугольные, круглые).
          </p>
          <div className="mt-3 bg-amber-50 rounded-lg p-3 border border-amber-200 text-sm text-amber-800 flex items-start gap-2">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>При смене формата содержимое редактора сбрасывается. Сохраните проект перед сменой формата.</span>
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Настройки листа A4 (в Предпросмотре)</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-start gap-2">
              <span aria-hidden="true" className="text-blue-600 shrink-0"><ChevronRight size={14} /></span>
              <span><strong>Поля листа</strong> — отступы от краёв A4 (мм): верхнее, нижнее, левое, правое</span>
            </div>
            <div className="flex items-start gap-2">
              <span aria-hidden="true" className="text-blue-600 shrink-0"><ChevronRight size={14} /></span>
              <span><strong>Промежутки</strong> — расстояние между этикетками по горизонтали и вертикали</span>
            </div>
            <div className="flex items-start gap-2">
              <span aria-hidden="true" className="text-blue-600 shrink-0"><ChevronRight size={14} /></span>
              <span><strong>Безопасное поле</strong> — зона отступа от края этикетки (показывается в редакторе красной штриховкой). Текст и объекты не должны заходить в эту зону</span>
            </div>
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Масштаб редактора</h3>
          <p className="text-sm text-gray-600">
            Используйте <strong>Ctrl + колесо мыши</strong> для зума или кнопку «+» в правом верхнем углу редактора.
            Нажмите кнопку с процентами для сброса масштаба к 100%.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: 'text',
    icon: Pencil,
    title: 'Текстовые блоки',
    content: (
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Добавление текста</h3>
          <p className="text-sm text-gray-600">
            Нажмите кнопку <strong>«T Текст»</strong> в левой панели. На этикетке появится текстовый блок «Текст».
          </p>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Редактирование текста</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-start gap-2">
              <span aria-hidden="true" className="text-blue-600 shrink-0"><ChevronRight size={14} /></span>
              <span><strong>Двойной клик</strong> по блоку — переход в режим ввода текста</span>
            </div>
            <div className="flex items-start gap-2">
              <span aria-hidden="true" className="text-blue-600 shrink-0"><ChevronRight size={14} /></span>
              <span><strong>Одиночный клик</strong> — выделение блока для перемещения и изменения размеров</span>
            </div>
            <div className="flex items-start gap-2">
              <span aria-hidden="true" className="text-blue-600 shrink-0"><ChevronRight size={14} /></span>
              <span><strong>Delete / Backspace</strong> (когда блок выделен, но не в режиме ввода) — удаление блока</span>
            </div>
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Свойства текста (правая панель)</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[
              { label: 'Шрифт', desc: 'Выбор из списка загруженных' },
              { label: 'Размер', desc: 'В пунктах (pt)' },
              { label: 'Жирный / Курсив', desc: 'Начертание' },
              { label: 'Выравнивание', desc: 'Лево / Центр / Право' },
              { label: 'Цвет', desc: 'Цвет заливки текста' },
              { label: 'Межстрочный интервал', desc: 'Высота строки' },
              { label: 'Позиция X / Y', desc: 'Координаты в мм' },
              { label: 'Ширина / Высота', desc: 'Размеры блока в мм' },
            ].map(({ label, desc }) => (
              <div key={label} className="bg-gray-50 rounded p-2 border border-gray-200">
                <div className="font-medium text-gray-800 text-xs">{label}</div>
                <div className="text-gray-500 text-xs">{desc}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 border border-blue-100 text-sm text-blue-800 flex items-start gap-2">
          <Lightbulb size={15} className="shrink-0 mt-0.5" />
          <span>Многострочный текст: нажмите <kbd className="bg-white border border-blue-200 rounded px-1 text-xs">Enter</kbd> внутри текстового блока для перевода строки.</span>
        </div>
      </div>
    ),
  },
  {
    id: 'images',
    icon: ImageIcon,
    title: 'Изображения',
    content: (
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Добавление изображения</h3>
          <p className="text-sm text-gray-600">
            Нажмите кнопку <strong>«Изображение»</strong> в левой панели. Поддерживаются форматы:
          </p>
          <div className="flex gap-2 mt-2 flex-wrap">
            {['PNG', 'JPG', 'JPEG', 'SVG', 'PDF'].map(fmt => (
              <span key={fmt} className="bg-gray-100 text-gray-700 text-xs font-mono px-2 py-1 rounded border border-gray-200">{fmt}</span>
            ))}
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">PDF-файлы как изображения</h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            При добавлении PDF-файла он автоматически конвертируется в изображение и помещается на этикетку.
          </p>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Свойства изображения</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-start gap-2">
              <span aria-hidden="true" className="text-blue-600 shrink-0"><ChevronRight size={14} /></span>
              <span><strong>Позиция X/Y</strong> — координаты левого верхнего угла в мм</span>
            </div>
            <div className="flex items-start gap-2">
              <span aria-hidden="true" className="text-blue-600 shrink-0"><ChevronRight size={14} /></span>
              <span><strong>Ширина/Высота</strong> — размеры в мм (пропорции можно зафиксировать)</span>
            </div>
            <div className="flex items-start gap-2">
              <span aria-hidden="true" className="text-blue-600 shrink-0"><ChevronRight size={14} /></span>
              <span><strong>Непрозрачность</strong> — прозрачность изображения (0–100%)</span>
            </div>
          </div>
        </div>
        <div className="bg-amber-50 rounded-lg p-3 border border-amber-200 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <span>PNG/JPG остаются растровыми в PDF. SVG и PDF-вставки остаются векторными.</span>
        </div>
      </div>
    ),
  },
  {
    id: 'barcodes',
    icon: BarChart,
    title: 'Штрих-коды',
    content: (
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Добавление штрих-кода</h3>
          <p className="text-sm text-gray-600">
            Нажмите кнопку <strong>«Штрих-код»</strong> в левой панели. Откроется окно добавления.
          </p>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Форматы штрих-кодов</h3>
          <div className="space-y-3">
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="font-medium text-gray-800 mb-1">EAN-13</div>
              <div className="text-sm text-gray-600">
                13 цифр (12 + контрольная). Стандарт для розничной торговли.
                Последняя цифра рассчитывается автоматически. Введите 12 или 13 цифр.
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="font-medium text-gray-800 mb-1">ITF-14</div>
              <div className="text-sm text-gray-600">
                14 цифр (13 + контрольная). Для транспортной упаковки и складской логистики.
              </div>
            </div>
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Векторная генерация</h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            Штрих-коды генерируются в векторном формате (SVG) прямо в браузере.
            Они остаются <strong>чёткими при любом масштабе и в PDF-экспорте</strong>.
            Защитные штрихи EAN-13 длиннее обычных, как по стандарту.
          </p>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Свойства штрих-кода</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-start gap-2"><span aria-hidden="true" className="text-blue-600 shrink-0"><ChevronRight size={14} /></span><span><strong>Цифры</strong> — ввод и редактирование кода</span></div>
            <div className="flex items-start gap-2"><span aria-hidden="true" className="text-blue-600 shrink-0"><ChevronRight size={14} /></span><span><strong>Цвет штрихов</strong> — обычно чёрный (#000000)</span></div>
            <div className="flex items-start gap-2"><span aria-hidden="true" className="text-blue-600 shrink-0"><ChevronRight size={14} /></span><span><strong>Фон</strong> — цвет фона (обычно белый или прозрачный)</span></div>
            <div className="flex items-start gap-2"><span aria-hidden="true" className="text-blue-600 shrink-0"><ChevronRight size={14} /></span><span><strong>Показывать цифры</strong> — отображение числовой строки под штрих-кодом</span></div>
            <div className="flex items-start gap-2"><span aria-hidden="true" className="text-blue-600 shrink-0"><ChevronRight size={14} /></span><span><strong>Размеры и позиция</strong> — в мм, как у других объектов</span></div>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'fonts',
    icon: TypeIcon,
    title: 'Шрифты',
    content: (
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Типы шрифтов</h3>
          <div className="space-y-3">
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="font-medium text-gray-800 mb-1">Встроенные системные</div>
              <div className="text-sm text-gray-600">Arial, Times New Roman, Courier New, Georgia, Verdana. Доступны сразу без загрузки.</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="font-medium text-gray-800 mb-1">Google Fonts (кириллица)</div>
              <div className="text-sm text-gray-600">
                Inter, Roboto, Open Sans, PT Sans, Montserrat, Rubik и другие.
                Нажмите <strong>«Загрузить»</strong> рядом с нужным шрифтом. Загружается один раз, затем запоминается в браузере.
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="font-medium text-gray-800 mb-1">С компьютера (.ttf / .otf)</div>
              <div className="text-sm text-gray-600">
                Нажмите <strong>«Загрузить шрифт»</strong> и выберите файлы шрифтов.
                Они сохраняются в IndexedDB браузера и восстанавливаются при следующем открытии.
                Поддерживаются: .ttf, .otf, .woff, .woff2
              </div>
            </div>
          </div>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 border border-blue-100 text-sm text-blue-800 flex items-start gap-2">
          <Lightbulb size={15} className="shrink-0 mt-0.5" />
          <span>Для корректного экспорта в PDF шрифты встраиваются в PDF-файл автоматически.</span>
        </div>
      </div>
    ),
  },
  {
    id: 'layers',
    icon: Clipboard,
    title: 'Слои и порядок',
    content: (
      <div className="space-y-4">
        <p className="text-sm text-gray-600 leading-relaxed">
          Панель <strong>«Слои»</strong> находится в правой панели. Здесь показаны все объекты на этикетке
          в порядке их наложения (сверху — ближе к зрителю).
        </p>
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Управление слоями</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-start gap-2"><span aria-hidden="true" className="text-blue-600 shrink-0"><ChevronRight size={14} /></span><span><strong>Клик по слою</strong> — выделение объекта на канвасе</span></div>
            <div className="flex items-start gap-2"><span aria-hidden="true" className="text-blue-600 shrink-0"><ChevronRight size={14} /></span><span><strong>Кнопки ▲▼</strong> — перемещение объекта выше/ниже в стопке</span></div>
            <div className="flex items-start gap-2"><span aria-hidden="true" className="text-blue-600 shrink-0"><ChevronRight size={14} /></span><span><strong>🗑 Удалить</strong> — удаление объекта</span></div>
            <div className="flex items-start gap-2"><span aria-hidden="true" className="text-blue-600 shrink-0"><ChevronRight size={14} /></span><span><strong>👁 Видимость</strong> — скрыть/показать объект</span></div>
          </div>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 border border-blue-100 text-sm text-blue-800 flex items-start gap-2">
          <Lightbulb size={15} className="shrink-0 mt-0.5" />
          <span>Если объект не виден на этикетке, проверьте: возможно, другой объект перекрывает его. Переместите нужный объект выше в панели слоёв.</span>
        </div>
      </div>
    ),
  },
  {
    id: 'preview',
    icon: Eye,
    title: 'Предпросмотр и печать',
    content: (
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Открытие предпросмотра</h3>
          <p className="text-sm text-gray-600">
            Нажмите кнопку <strong>«Предпросмотр»</strong> или горячую клавишу <kbd className="bg-gray-100 border border-gray-300 rounded px-1 text-xs">Ctrl+Shift+P</kbd>.
          </p>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Что можно делать в предпросмотре</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-start gap-2"><span className="text-green-700 shrink-0" aria-hidden="true"><Check size={14} /></span><span>Видеть лист A4 с тиражированием этикетки на все позиции сетки</span></div>
            <div className="flex items-start gap-2"><span className="text-green-700 shrink-0" aria-hidden="true"><Check size={14} /></span><span>Настроить количество копий и начальную позицию</span></div>
            <div className="flex items-start gap-2"><span className="text-green-700 shrink-0" aria-hidden="true"><Check size={14} /></span><span>Экспортировать в PDF (векторный или растровый)</span></div>
            <div className="flex items-start gap-2"><span className="text-green-700 shrink-0" aria-hidden="true"><Check size={14} /></span><span>Распечатать напрямую через браузер</span></div>
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Экспорт PDF</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-start gap-2"><span aria-hidden="true" className="text-blue-600 shrink-0"><ChevronRight size={14} /></span><span><strong>Векторный PDF</strong> — штрих-коды и текст остаются векторными. Идеальное качество.</span></div>
            <div className="flex items-start gap-2"><span aria-hidden="true" className="text-blue-600 shrink-0"><ChevronRight size={14} /></span><span><strong>Растровый PDF</strong> — резервный вариант, если векторный не работает</span></div>
          </div>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 border border-blue-100 text-sm text-blue-800 flex items-start gap-2">
          <Lightbulb size={15} className="shrink-0 mt-0.5" />
          <span>При печати рекомендуется установить <strong>масштаб 100%</strong> в настройках принтера, чтобы соблюсти точные размеры в мм.</span>
        </div>
      </div>
    ),
  },
  {
    id: 'project',
    icon: Save,
    title: 'Проект и сохранение',
    content: (
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Название проекта</h3>
          <p className="text-sm text-gray-600">Введите название в поле вверху. Оно используется как имя файла при сохранении.</p>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Сохранение проекта в файл</h3>
          <p className="text-sm text-gray-600">Кнопка <strong>«Сохранить»</strong> или <kbd className="bg-gray-100 border border-gray-300 rounded px-1 text-xs">Ctrl+S</kbd>. Файл <code className="text-xs bg-gray-100 px-1 rounded">.labelproj.json</code> сохраняется на компьютер.</p>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Загрузка проекта</h3>
          <p className="text-sm text-gray-600">Кнопка <strong>«Загрузить»</strong> или <kbd className="bg-gray-100 border border-gray-300 rounded px-1 text-xs">Ctrl+O</kbd>. Выберите ранее сохранённый <code className="text-xs bg-gray-100 px-1 rounded">.labelproj.json</code> файл.</p>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Автосохранение</h3>
          <p className="text-sm text-gray-600 leading-relaxed">Проект автоматически сохраняется в браузере. При следующем открытии появится баннер <strong>«Найден несохранённый проект»</strong> с кнопками <em>Восстановить</em> или <em>Удалить</em>.</p>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Индикатор состояния</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              {/* green-600, а не green-500: ровно так нарисован настоящий
                  индикатор в панели (галочка text-green-600). green-500 давал
                  всего 2.22:1 на белом и не совпадал с оригиналом. */}
              <div className="w-2 h-2 bg-green-600 rounded-full shrink-0"></div>
              <span><strong>Зелёный «Сохранено»</strong> — изменений нет</span>
            </div>
            <div className="flex items-center gap-2">
              {/* amber-600, а не amber-500: 2.15:1 на белом — ниже нормы 3:1
                  для нетекстового индикатора, и светлее зелёного соседа.
                  amber-600 даёт 3.20:1 и совпадает по весу с green-600. */}
              <div className="w-2 h-2 bg-amber-600 rounded-full shrink-0"></div>
              <span><strong>Жёлтый «Изменения»</strong> — есть несохранённые изменения</span>
            </div>
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Отмена / Повтор</h3>
          <div className="space-y-1 text-sm text-gray-600">
            <div><kbd className="bg-gray-100 border border-gray-300 rounded px-1 text-xs">Ctrl+Z</kbd> — отменить последнее действие</div>
            <div><kbd className="bg-gray-100 border border-gray-300 rounded px-1 text-xs">Ctrl+Y</kbd> или <kbd className="bg-gray-100 border border-gray-300 rounded px-1 text-xs">Ctrl+Shift+Z</kbd> — повторить</div>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'hotkeys',
    icon: Keyboard,
    title: 'Горячие клавиши',
    content: (
      <div className="space-y-1">
        {[
          { keys: 'Ctrl + S', desc: 'Сохранить проект в файл' },
          { keys: 'Ctrl + O', desc: 'Загрузить проект из файла' },
          { keys: 'Ctrl + Z', desc: 'Отменить действие' },
          { keys: 'Ctrl + Y', desc: 'Повторить действие' },
          { keys: 'Ctrl + Shift + Z', desc: 'Повторить действие (альтернатива)' },
          { keys: 'Ctrl + Shift + P', desc: 'Открыть предпросмотр листа' },
          { keys: 'Ctrl + P', desc: 'Открыть предпросмотр (печать)' },
          { keys: 'Ctrl + Shift + E', desc: 'Открыть предпросмотр (экспорт PDF)' },
          { keys: 'Ctrl + колесо мыши', desc: 'Масштабирование редактора' },
          { keys: 'Delete / Backspace', desc: 'Удалить выделенный объект' },
          { keys: 'Esc', desc: 'Снять выделение / закрыть режим ввода' },
          { keys: 'Стрелки', desc: 'Перемещение выделенного объекта' },
        ].map(({ keys, desc }) => (
          <div key={keys} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
            <span className="text-sm text-gray-600">{desc}</span>
            <kbd className="bg-gray-100 border border-gray-300 rounded px-2 py-0.5 text-xs font-mono text-gray-700 shrink-0 ml-4">{keys}</kbd>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'tips',
    icon: Lightbulb,
    title: 'Советы и трюки',
    content: (
      <div className="space-y-3">
        {[
          { icon: Target, title: 'Точное позиционирование', text: 'Введите точные координаты X/Y в мм в правой панели свойств для точного размещения объекта.' },
          { icon: MoveVertical, title: 'Безопасное поле', text: 'Красная штриховка в редакторе показывает зону, куда не стоит помещать важные элементы — при обрезке после печати они могут быть срезаны.' },
          { icon: RefreshCw, title: 'Несколько шрифтов в тексте', text: 'Выделите часть текста (двойной клик → выделение мышью) и примените нужный шрифт только к выделенной части.' },
          { icon: Clipboard, title: 'Начальная позиция', text: 'В предпросмотре можно задать начальную позицию — начать печать не с первой этикетки листа, если первые уже использованы.' },
          { icon: Printer, title: 'Точная печать', text: 'В настройках принтера выберите «Реальный размер» (100%) без подгонки к странице, чтобы размеры этикеток в мм соответствовали реальным.' },
          { icon: Save, title: 'Шрифты в PDF', text: 'Используемые шрифты встраиваются в PDF автоматически — PDF корректно откроется на любом устройстве.' },
          { icon: Lock, title: 'Пропорции изображений', text: 'При изменении размеров изображения удерживайте Shift или включите «Зафиксировать пропорции» в свойствах.' },
        ].map(({ icon: TipIcon, title, text }) => (
          <div key={title} className="flex items-start gap-3 bg-gray-50 rounded-lg p-3 border border-gray-200">
            <TipIcon size={18} className="text-gray-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-gray-800 text-sm mb-0.5">{title}</div>
              <div className="text-xs text-gray-600 leading-relaxed">{text}</div>
            </div>
          </div>
        ))}
      </div>
    ),
  },
];

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
  const [activeSection, setActiveSection] = useState('overview');

  if (!isOpen) return null;

  const current = sections.find(s => s.id === activeSection) ?? sections[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl flex overflow-hidden animate-slideIn"
        style={{ width: '860px', height: '600px', maxWidth: '95vw', maxHeight: '90vh' }}
      >
        {/* Sidebar */}
        <div className="w-52 shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col">
          {/* Header */}
          <div className="px-4 py-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <span className="text-2xl"><BookOpen size={24} /></span>
              <div>
                <div className="text-sm font-bold text-gray-900">Справка</div>
                <div className="type-meta">Megalabel Pro</div>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-2">
            {sections.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-all duration-150 ${
                  activeSection === section.id
                    ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-500'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <span className="text-base">{(() => { const I = section.icon; return <I size={16} />; })()}</span>
                <span>{section.title}</span>
              </button>
            ))}
          </nav>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-200">
            <div className="type-meta text-center">Megalabel Pro v1.0</div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Content header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{(() => { const I = current.icon; return <I size={24} />; })()}</span>
              <h2 className="text-lg font-bold text-gray-900">{current.title}</h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="Закрыть"
              aria-label="Закрыть справку"
            >
              <X size={18} />
            </button>
          </div>

          {/* Content body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {current.content}
          </div>
        </div>
      </div>
    </div>
  );
}
