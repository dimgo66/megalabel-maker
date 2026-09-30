export function RightPanel() {
  return (
    <div className="w-[280px] bg-white border-l border-gray-300 flex flex-col shrink-0">
      {/* Header */}
      <div className="h-10 border-b border-gray-200 flex items-center px-4 shrink-0">
        <span className="text-sm font-medium text-gray-700">Свойства</span>
      </div>

      {/* Content - placeholder for step 3 */}
      <div className="flex-1 p-4">
        <div className="text-xs text-gray-400 text-center mt-8">
          Свойства объекта будут добавлены на шаге 3
        </div>
      </div>
    </div>
  );
}
