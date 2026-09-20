/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Design System: StatCard Component
 */

import React from 'react';
import { Card } from './Card';
import { TrendingUp, TrendingDown } from 'lucide-react';

export interface StatCardProps {
  label: string;
  value: string | number;
  change?: {
    value: string;
    isPositive: boolean;
    period?: string;
  };
  icon?: React.ReactNode;
  subtitle?: string;
  onClick?: () => void;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  change,
  icon,
  subtitle,
  onClick,
  className = ''
}) => {
  return (
    <Card
      padding="md"
      interactive={!!onClick}
      onClick={onClick}
      className={`relative overflow-hidden ${className}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xs font-mono font-medium text-zinc-400 uppercase tracking-wider block">
            {label}
          </span>
          <span className="text-2xl font-bold font-mono text-zinc-100 mt-1.5 block tracking-tight">
            {value}
          </span>
        </div>
        {icon && (
          <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-amber-400">
            {icon}
          </div>
        )}
      </div>

      {(change || subtitle) && (
        <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between text-xs">
          {change && (
            <div
              className={`flex items-center gap-1 font-mono font-medium ${
                change.isPositive ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {change.isPositive ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              <span>{change.value}</span>
              {change.period && (
                <span className="text-zinc-500 font-sans text-[11px] ml-1">
                  vs {change.period}
                </span>
              )}
            </div>
          )}
          {subtitle && <span className="text-zinc-500 text-[11px] truncate">{subtitle}</span>}
        </div>
      )}
    </Card>
  );
};
