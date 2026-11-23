import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface Option {
  label: string;
  value: string;
}

interface CustomDropdownProps {
  id: string;
  label: string;
  options: Option[];
  value: string;
  onChange: (val: string) => void;
  required?: boolean;
}

export const CustomDropdown: React.FC<CustomDropdownProps> = ({
  id,
  label,
  options,
  value,
  onChange,
  required,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-1" ref={containerRef}>
      <label id={`${id}-label`} className="block text-xs font-semibold text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>

      {/* Accessible Custom Combobox container recognized by FormPilot scanner */}
      <div
        id={id}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-labelledby={`${id}-label`}
        data-formpilot-custom-dropdown="true"
        data-options={JSON.stringify(options)}
        className="relative"
      >
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white border border-slate-300 rounded-md shadow-2xs hover:border-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-left"
        >
          <span className={selectedOption ? 'text-slate-900 font-medium' : 'text-slate-400'}>
            {selectedOption ? selectedOption.label : 'Select an option...'}
          </span>
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
        </button>

        <ul
          role="listbox"
          tabIndex={-1}
          className={`absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-auto py-1 text-xs ${
            isOpen ? 'block' : 'hidden'
          }`}
        >
            {options.map((option) => (
              <li
                key={option.value}
                role="option"
                data-value={option.value}
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`flex items-center justify-between px-3 py-2 cursor-pointer transition ${
                  option.value === value
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>{option.label}</span>
                {option.value === value && <Check className="w-3.5 h-3.5 text-blue-600" />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
