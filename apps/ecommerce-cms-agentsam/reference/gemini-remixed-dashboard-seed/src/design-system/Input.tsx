/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Design System: Input & Select Components
 */

import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  icon,
  rightElement,
  className = '',
  id,
  ...props
}) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-medium text-zinc-300 mb-1.5 font-sans"
        >
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {icon && (
          <div className="absolute left-3 text-zinc-500 pointer-events-none flex items-center">
            {icon}
          </div>
        )}
        <input
          id={inputId}
          className={`w-full bg-zinc-900/90 hover:bg-zinc-900 focus:bg-zinc-950 text-zinc-100 placeholder-zinc-500 text-xs rounded-xl border ${
            error ? 'border-red-500 focus:ring-red-500/30' : 'border-zinc-800 focus:border-amber-500/80 focus:ring-amber-500/20'
          } px-3 py-2.5 ${icon ? 'pl-9' : ''} ${rightElement ? 'pr-10' : ''} transition-all duration-150 focus:outline-none focus:ring-2 font-mono ${className}`}
          {...props}
        />
        {rightElement && (
          <div className="absolute right-2.5 flex items-center">
            {rightElement}
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-[11px] text-red-400 font-sans">{error}</p>}
      {!error && helperText && (
        <p className="mt-1 text-[11px] text-zinc-500 font-sans">{helperText}</p>
      )}
    </div>
  );
};
