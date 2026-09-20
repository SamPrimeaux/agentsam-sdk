/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Design System: Card Component
 */

import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'glass' | 'solid' | 'subtle';
  interactive?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'glass',
  interactive = false,
  padding = 'md',
  className = '',
  ...props
}) => {
  const paddings = {
    none: '',
    sm: 'p-3',
    md: 'p-5',
    lg: 'p-7'
  };

  const variants = {
    glass: 'glass-card',
    solid: 'bg-zinc-950 border border-zinc-800 shadow-xl',
    subtle: 'bg-zinc-900/40 border border-zinc-800/80'
  };

  return (
    <div
      className={`rounded-2xl ${variants[variant]} ${paddings[padding]} ${
        interactive ? 'glass-card-interactive cursor-pointer' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
