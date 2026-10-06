/**
 * File System Access API — то, чего нет в lib.dom TypeScript.
 *
 * В lib.dom есть `FileSystemFileHandle` (нужен OPFS) с `createWritable()`, но
 * нет ни выбора файла (`showSaveFilePicker` / `showOpenFilePicker`), ни методов
 * разрешений на `FileSystemHandle`. Расширяем существующие интерфейсы, а не
 * описываем свои: иначе появились бы два несовместимых `FileSystemFileHandle`.
 *
 * Файл без import/export — глобальный скрипт, поэтому объявления здесь
 * сливаются с lib.dom напрямую (внутри модуля понадобился бы `declare global`).
 */

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
  queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface FilePickerAcceptType {
  description?: string;
  accept: Record<string, string[]>;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: FilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
  id?: string;
}

interface OpenFilePickerOptions {
  types?: FilePickerAcceptType[];
  excludeAcceptAllOption?: boolean;
  multiple?: boolean;
  id?: string;
}

interface Window {
  showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
  showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
}
