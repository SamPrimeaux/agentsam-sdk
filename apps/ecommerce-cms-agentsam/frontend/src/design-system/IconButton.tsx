/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Design System: IconButton Component
 */

import React from 'react';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'ghost' | 'secondary' | 'outline' | 'danger' | 'amber';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  label: string;
}

export const IconButton: React.FC<IconButtonProps> = ({
  children,
  variant = 'ghost',
  size = 'md',
  label,
  className = '',
  ...props
}) => {
  const base =
    'inline-flex items-center justify-center rounded-xl transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-95';

  const sizes = {
    xs: 'w-6 h-6 p-1',
    sm: 'w-8 h-8 p-1.5',
    md: 'w-9 h-9 p-2',
    lg: 'w-11 h-11 p-2.5'
  };

  const variants = {
    ghost: 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80',
    secondary: 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/80',
    outline: 'border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500',
    danger: 'text-red-400 hover:text-red-300 hover:bg-red-950/40 border border-transparent hover:border-red-800/40',
    amber: 'bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20'
  };

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
