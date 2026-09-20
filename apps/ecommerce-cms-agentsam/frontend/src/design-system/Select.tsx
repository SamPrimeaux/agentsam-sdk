/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Design System: Select Component
 */

import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  label: string;
  value: string | number;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  error?: string;
  helperText?: string;
}

export const Select: React.FC<SelectProps> = ({
  label,
  options,
  error,
  helperText,
  className = '',
  id,
  ...props
}) => {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={selectId}
          className="block text-xs font-medium text-zinc-300 mb-1.5 font-sans"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          className={`w-full appearance-none bg-zinc-900/90 hover:bg-zinc-900 focus:bg-zinc-950 text-zinc-100 text-xs rounded-xl border ${
            error ? 'border-red-500' : 'border-zinc-800 focus:border-amber-500/80'
          } px-3 py-2.5 pr-9 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-amber-500/20 font-mono ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={String(opt.value)} value={opt.value} disabled={opt.disabled} className="bg-zinc-900 text-zinc-100">
              {opt.label}
            </option>
          ))}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
          <ChevronDown className="w-3.5 h-3.5" />
        </div>
      </div>
      {error && <p className="mt-1 text-[11px] text-red-400">{error}</p>}
      {!error && helperText && <p className="mt-1 text-[11px] text-zinc-500">{helperText}</p>}
    </div>
  );
};
