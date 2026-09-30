export function LeftPanel() {
  return (
    <div className="w-60 bg-white border-r border-gray-300 flex flex-col shrink-0">
      {/* Header */}
      <div className="h-10 border-b border-gray-200 flex items-center px-4 shrink-0">
        <span className="text-sm font-medium text-gray-700">Инструменты</span>
      </div>

      {/* Content - placeholder for step 3 */}
      <div className="flex-1 p-4">
        <div className="text-xs text-gray-400 text-center mt-8">
          Инструменты будут добавлены на шаге 3
        </div>
      </div>
    </div>
  );
}
