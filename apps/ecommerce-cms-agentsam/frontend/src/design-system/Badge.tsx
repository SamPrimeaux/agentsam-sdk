/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Design System: Badge Component
 */

import React from 'react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'amber' | 'emerald' | 'red' | 'sky' | 'indigo' | 'zinc' | 'purple';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  dot?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'zinc',
  size = 'sm',
  icon,
  dot = false,
  className = ''
}) => {
  const sizeStyles = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs'
  };

  const variantStyles = {
    amber: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
    emerald: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
    red: 'bg-red-500/15 text-red-300 border border-red-500/30',
    sky: 'bg-sky-500/15 text-sky-300 border border-sky-500/30',
    indigo: 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30',
    zinc: 'bg-zinc-800/80 text-zinc-400 border border-zinc-700/60',
    purple: 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
  };

  const dotColors = {
    amber: 'bg-amber-400',
    emerald: 'bg-emerald-400',
    red: 'bg-red-400',
    sky: 'bg-sky-400',
    indigo: 'bg-indigo-400',
    zinc: 'bg-zinc-400',
    purple: 'bg-purple-400'
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono font-medium rounded-full whitespace-nowrap select-none ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
};
