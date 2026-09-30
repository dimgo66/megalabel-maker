import { useState } from 'react';
import { LabelFormat } from '../types';
import { LABEL_FORMATS } from '../config/labelFormats';
import { calculateLayout } from '../utils/layoutCalculator';

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
    { label: '6–16 на листе', formats: [] },
    { label: '18–40 на листе', formats: [] },
    { label: '42–85 на листе', formats: [] },
    { label: '100+ на листе', formats: [] },
  ];

  formats.forEach(format => {
    if (format.count <= 4) groups[0].formats.push(format);
    else if (format.count <= 16) groups[1].formats.push(format);
    else if (format.count <= 40) groups[2].formats.push(format);
    else if (format.count <= 85) groups[3].formats.push(format);
    else groups[4].formats.push(format);
  });

  return groups.filter(g => g.formats.length > 0);
}

function FormatThumbnail({ format }: { format: LabelFormat }) {
  const layout = calculateLayout(format);
  const svgWidth = 60;
  const svgHeight = 85;
  const padding = 2;
  
  const availW = svgWidth - padding * 2;
  const availH = svgHeight - padding * 2;
  
  const cellW = availW / layout.cols;
  const cellH = availH / layout.rows;

  return (
    <svg width={svgWidth} height={svgHeight} className="border border-gray-300 bg-white">
      {Array.from({ length: layout.rows * layout.cols }).map((_, idx) => {
        const col = idx % layout.cols;
        const row = Math.floor(idx / layout.cols);
        const x = padding + col * cellW;
        const y = padding + row * cellH;

        if (format.shape === 'circle') {
          const r = Math.min(cellW, cellH) / 2 - 1;
          return (
            <circle
              key={idx}
              cx={x + cellW / 2}
              cy={y + cellH / 2}
              r={r}
              fill="none"
              stroke="#999"
              strokeWidth="0.5"
            />
          );
        }

        return (
          <rect
            key={idx}
            x={x + 0.5}
            y={y + 0.5}
            width={cellW - 1}
            height={cellH - 1}
            fill="none"
            stroke="#999"
            strokeWidth="0.5"
          />
        );
      })}
    </svg>
  );
}

export function FormatSelector({ selectedFormat, onSelect }: FormatSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const groups = groupFormats(LABEL_FORMATS);

  const handleSelect = (format: LabelFormat) => {
    onSelect(format);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-1.5 bg-white border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
      >
        <span>{selectedFormat.name}</span>
        <span className="text-gray-400">▾</span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-1 w-[520px] max-h-[500px] overflow-y-auto bg-white border border-gray-300 rounded shadow-lg z-50">
            <div className="p-3">
              {groups.map(group => (
                <div key={group.label} className="mb-4">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
                    {group.label}
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    {group.formats.map(format => (
                      <button
                        key={format.id}
                        onClick={() => handleSelect(format)}
                        className={`p-2 border rounded text-left hover:bg-gray-50 transition-colors ${
                          format.id === selectedFormat.id
                            ? 'border-gray-600 bg-gray-50'
                            : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <FormatThumbnail format={format} />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-700 truncate">
                              {format.width_mm}×{format.height_mm} мм
                            </div>
                            <div className="text-xs text-gray-500">
                              {format.count} шт
                              {format.shape === 'circle' && ' • круг'}
                            </div>
                          </div>
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
