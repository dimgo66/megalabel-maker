export function LeftPanel() {
  return (
    <div className="w-[260px] bg-white border-r border-gray-200 flex flex-col shrink-0">
      {/* Header */}
      <div className="h-12 border-b border-gray-200 flex items-center px-4 shrink-0">
        <span className="text-sm font-semibold text-gray-900">Инструменты</span>
      </div>

      {/* Tools section */}
      <div className="p-4 space-y-3">
        <div className="card opacity-50 cursor-not-allowed">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">T</span>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700">Текст</div>
              <div className="text-xs text-gray-400">Добавить текст</div>
            </div>
          </div>
        </div>

        <div className="card opacity-50 cursor-not-allowed">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">🖼️</span>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700">Изображение</div>
              <div className="text-xs text-gray-400">Добавить картинку</div>
            </div>
          </div>
        </div>

        <div className="card opacity-50 cursor-not-allowed">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
              <span className="text-xl">▮▮▮</span>
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700">Штрих-код</div>
              <div className="text-xs text-gray-400">Добавить штрих-код</div>
            </div>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="mt-auto p-4 border-t border-gray-200">
        <div className="text-xs text-gray-400 text-center">
          Инструменты будут доступны на шаге 3
        </div>
      </div>
    </div>
  );
}
