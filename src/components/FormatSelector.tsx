import { useEffect, useRef, useState } from 'react';
import { LabelFormat } from '../types';
import { LABEL_FORMATS } from '../config/labelFormats';
import { calculateLayout } from '../utils/layoutCalculator';
import { gridPitch } from '../utils/layoutCalculator';
import { Circle } from './icons';

interface FormatSelectorProps {
  selectedFormat: LabelFormat;
  onSelect: (format: LabelFormat) => void;
}

interface FormatGroup {
  label: string;
  formats: LabelFormat[];
}

function groupFormats(formats: LabelFormat[]): FormatGroup[] {
  const groups: FormatGroup[] = [
    { label: '1–4 на листе', formats: [] },
    { label: '5–16 на листе', formats: [] },
    { label: '17–40 на листе', formats: [] },
    { label: '41+ на листе', formats: [] },
  ];

  formats.forEach(format => {
    if (format.count <= 4) groups[0].formats.push(format);
    else if (format.count <= 16) groups[1].formats.push(format);
    else if (format.count <= 40) groups[2].formats.push(format);
    else groups[3].formats.push(format);
  });

  return groups.filter(g => g.formats.length > 0);
}

function FormatThumbnail({ format }: { format: LabelFormat }) {
  const layout = calculateLayout(format);
  const { pitchX, pitchY } = (() => {
    const p = gridPitch(format, layout);
    return { pitchX: p.pitchX_mm, pitchY: p.pitchY_mm };
  })();
  const svgWidth = 80;
  const svgHeight = 113;
  const padding = 4;
  
  const availW = svgWidth - padding * 2;
  const availH = svgHeight - padding * 2;
  
  // Миниатюра = лист A4 в масштабе (пропорции раскладки сохраняются)
  const k = Math.min(availW / 210, availH / 297);
  const cellW = layout.cellWidth_mm * k;
  const cellH = layout.cellHeight_mm * k;

  return (
    <svg width={svgWidth} height={svgHeight} className="border border-gray-200 rounded bg-gray-50">
      {Array.from({ length: Math.min(layout.rows * layout.cols, format.count) }).map((_, idx) => {
        const col = idx % layout.cols;
        const row = Math.floor(idx / layout.cols);
        const x = padding + layout.marginLeft_mm * k + col * pitchX * k;
        const y = padding + layout.marginTop_mm * k + row * pitchY * k;

        if (format.shape === 'circle') {
          const r = Math.min(cellW, cellH) / 2;
          return (
            <circle
              key={idx}
              cx={x + cellW / 2}
              cy={y + cellH / 2}
              r={r}
              fill="none"
              stroke="#9CA3AF"
              strokeWidth="1"
            />
          );
        }

        return (
          <rect
            key={idx}
            x={x}
            y={y}
            width={cellW}
            height={cellH}
            fill="none"
            stroke="#9CA3AF"
            strokeWidth="1"
            rx="1"
          />
        );
      })}
    </svg>
  );
}

export function FormatSelector({ selectedFormat, onSelect }: FormatSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const groups = groupFormats(LABEL_FORMATS);

  const handleSelect = (format: LabelFormat) => {
    onSelect(format);
    setIsOpen(false);
  };

  // Escape закрывает список и возвращает фокус на кнопку
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        containerRef.current?.querySelector('button')?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm hover:bg-blue-100 hover:border-blue-400 transition-all duration-200 flex items-center gap-2 shadow-sm whitespace-nowrap"
        title="Выбрать формат этикетки"
      >
        <span className="text-blue-700 text-xs font-medium uppercase tracking-wide">Формат</span>
        <span className="font-semibold text-blue-700">{selectedFormat.name}</span>
        <svg
          className={`w-4 h-4 text-blue-600 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div
            role="dialog"
            aria-label="Выбор формата этикетки"
            className="absolute top-full left-0 mt-2 w-[min(600px,90vw)] max-h-[min(600px,70vh)] overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl z-50 animate-slideIn"
          >
            <div className="p-4 border-b border-gray-200 sticky top-0 bg-white z-10">
              <h3 className="type-section">Выберите формат этикетки</h3>
            </div>
            <div className="p-4">
              {groups.map(group => (
                <div key={group.label} className="mb-6 last:mb-0">
                  <h4 className="type-group mb-3">
                    {group.label}
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    {group.formats.map(format => (
                      <button
                        type="button"
                        key={format.id}
                        onClick={() => handleSelect(format)}
                        aria-current={format.id === selectedFormat.id}
                        className={`p-3 border rounded-lg text-left transition-all duration-200 hover:scale-105 ${
                          format.id === selectedFormat.id
                            ? 'border-blue-500 bg-blue-50 shadow-md'
                            : 'border-gray-200 hover:border-blue-300 hover:shadow-md'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <FormatThumbnail format={format} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900">
                              {format.width_mm}×{format.height_mm} мм
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {format.count} шт на листе
                            </div>
                            {format.shape === 'circle' && (
                              <div className="text-xs text-blue-600 font-medium mt-1 flex items-center gap-1">
                                <Circle size={11} />
                                <span>Круглая форма</span>
                              </div>
                            )}
                          </div>
                          {format.id === selectedFormat.id && (
                            <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
