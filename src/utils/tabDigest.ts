import { LabelDesign, SheetSettings } from '../types';

/**
 * Отпечаток содержимого этикетки — то, что определяет «есть ли несохранённые
 * правки» у конкретной вкладки.
 *
 * Приложение пишет в файл одну этикетку, поэтому «сохранено ли» — свойство
 * вкладки, а не всего проекта. Отпечаток снимается при записи/открытии файла и
 * сравнивается с текущим содержимым вкладки (например, при её закрытии).
 *
 * Имя входит в отпечаток: переименование этикетки тоже требует сохранения.
 * `metadata` (createdAt/updatedAt) не входит — метка времени обновляется от
 * любой правки и к содержимому этикетки отношения не имеет.
 */
export interface TabContent {
  name: string;
  labelDesign: LabelDesign;
  sheetSettings: SheetSettings;
}

export function tabDigest(entry: TabContent): string {
  return JSON.stringify([
    entry.name,
    entry.labelDesign.formatId,
    entry.sheetSettings,
    entry.labelDesign.canvasJSON ?? {},
  ]);
}
