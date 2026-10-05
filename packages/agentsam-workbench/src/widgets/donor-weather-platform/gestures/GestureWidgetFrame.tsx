/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * GestureWidgetFrame: Physics-based centralized gesture handler using motion/react.
 * Powers physical card-swiping, swipe-to-reveal contextual actions, compression on touch,
 * spring snap dynamics, and card lifting into edit mode with semantic haptic feedback.
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Pin, 
  EyeOff, 
  Trash2, 
  RotateCcw, 
  ExternalLink, 
  MoreVertical, 
  ChevronDown, 
  ChevronUp, 
  MoveUp, 
  MoveDown
} from 'lucide-react';
import { useTheme } from '@inneranimalmedia/agentsam-themes';
import { haptics } from '../haptics';
import { WidgetSizeClass } from '../../contracts/widgets/database';
import { useWidgetGestures, GestureManager } from './GestureManager';

export interface GestureWidgetFrameProps {
  id: string;
  title: string;
  category: string;
  icon?: React.ReactNode;
  version?: string;
  subtitle?: string;
  className?: string;
  sizeClass?: WidgetSizeClass;
  isPinned?: boolean;
  isDocked?: boolean;
  isEditing?: boolean;
  onRefresh?: () => void;
  onPinToggle?: () => void;
  onHide?: () => void;
  onRemove?: () => void;
  onSizeChange?: (size: WidgetSizeClass) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onOpenFullApp?: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
  onMaximizeToggle?: () => void;
  isMaximized?: boolean;
}

export const GestureWidgetFrame: React.FC<GestureWidgetFrameProps> = ({
  id,
  title,
  category,
  icon,
  version,
  subtitle,
  className = '',
  sizeClass = 'M',
  isPinned = false,
  isDocked = false,
  isEditing = false,
  onRefresh,
  onPinToggle,
  onHide,
  onRemove,
  onSizeChange,
  onMoveUp,
  onMoveDown,
  onOpenFullApp,
  actions,
  children,
  defaultCollapsed = false,
  onMaximizeToggle,
  isMaximized = false
}) => {
  const { activeTheme } = useTheme();
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [showMenu, setShowMenu] = useState(false);

  // Centralized Physics Gesture Handler
  const {
    x,
    isHeld,
    isRevealed,
    revealProgress,
    actionScale,
    dragProps,
    cardMotionProps
  } = useWidgetGestures({
    id,
    isEditMode: isEditing,
    onLongPress: () => {
      setShowMenu(true);
    },
    onSwipeDismiss: () => {
      onHide?.();
    },
    swipeConfig: {
      revealWidth: 130,
      triggerThreshold: 60,
      dismissThreshold: 160,
      flingVelocity: 300
    }
  });

  return (
    <div className={`relative overflow-hidden rounded-[22px] ${isMaximized ? 'col-span-full' : ''} ${className}`}>
      {/* Background Revealed Action Surface (uncovered during left swipe) */}
      <motion.div
        style={{ opacity: revealProgress }}
        className="absolute inset-0 bg-slate-950/80 rounded-[22px] flex items-center justify-end pr-3 gap-1 z-0 pointer-events-auto border border-white/10"
      >
        <motion.div style={{ scale: actionScale }} className="flex items-center gap-1.5">
          {onSizeChange && (
            <button
              onClick={() => {
                const nextSize: Record<WidgetSizeClass, WidgetSizeClass> = {
                  'S': 'M', 'M': 'L', 'L': 'XL', 'XL': 'S', 'Full': 'M', 'XS': 'S'
                };
                haptics.selection();
                onSizeChange(nextSize[sizeClass]);
              }}
              title="Cycle size class"
              className="px-2 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-mono text-[10px] font-bold transition-colors"
            >
              {sizeClass}
            </button>
          )}

          {onPinToggle && (
            <button
              onClick={() => {
                haptics.selection();
                onPinToggle();
              }}
              title={isPinned ? "Unpin widget" : "Pin widget"}
              className={`p-2 rounded-xl transition-colors ${
                isPinned ? 'bg-amber-500/25 text-amber-300' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              <Pin className="w-3.5 h-3.5" />
            </button>
          )}

          {onHide && (
            <button
              onClick={() => {
                haptics.success();
                onHide();
              }}
              title="Hide widget"
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <EyeOff className="w-3.5 h-3.5" />
            </button>
          )}

          {onRemove && (
            <button
              onClick={() => {
                haptics.success();
                onRemove();
              }}
              title="Remove widget"
              className="p-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </motion.div>
      </motion.div>

      {/* Physics-Driven Front Glass Card Managed by GestureManager */}
      <motion.div
        {...dragProps}
        style={{
          ...cardMotionProps.style,
          background: activeTheme.glass.cardFill,
          backdropFilter: `blur(${activeTheme.glass.backdropBlur})`,
          WebkitBackdropFilter: `blur(${activeTheme.glass.backdropBlur})`,
          border: `1px solid ${isHeld ? 'rgba(255,255,255,0.4)' : activeTheme.glass.cardBorder}`,
          boxShadow: isHeld ? '0 24px 48px -12px rgba(0,0,0,0.6)' : activeTheme.glass.cardShadow,
        }}
        whileTap={cardMotionProps.whileTap}
        animate={cardMotionProps.animate}
        className="relative rounded-[22px] flex flex-col z-10 select-none cursor-grab active:cursor-grabbing"
      >
        {/* Top Hairline Highlight */}
        <div 
          className="absolute top-0 left-0 right-0 h-[1px] pointer-events-none rounded-t-[22px]"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${activeTheme.glass.cardHighlight} 50%, transparent 100%)`
          }}
        />

        {/* Top Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 relative z-10">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && (
              <div 
                className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 border border-white/10"
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: activeTheme.text.primary
                }}
              >
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 
                  className="text-[13.5px] font-semibold tracking-tight truncate leading-tight"
                  style={{ color: activeTheme.text.primary }}
                >
                  {title}
                </h3>
                {version && (
                  <span className="text-white/35 text-[10px] font-mono tabular-nums">
                    v{version}
                  </span>
                )}
                {isPinned && (
                  <span title="Pinned" className="text-amber-400">
                    <Pin className="w-2.5 h-2.5 fill-current" />
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-white/50 truncate mt-0.5">
                <span className="capitalize">{category.replace('/', ' · ')}</span>
                {subtitle && (
                  <>
                    <span aria-hidden="true" className="text-white/25">·</span>
                    <span className="truncate">{subtitle}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action Affordances */}
          <div className="flex items-center gap-1 shrink-0 ml-2" onPointerDown={(e) => e.stopPropagation()}>
            {actions}

            {onRefresh && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  haptics.selection();
                  onRefresh();
                }}
                title="Refresh widget state"
                className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}

            {onOpenFullApp && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  haptics.selection();
                  onOpenFullApp();
                }}
                title="Open full app handoff"
                className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                haptics.selection();
                setShowMenu(!showMenu);
              }}
              title="Widget actions"
              className={`p-1.5 rounded-lg transition-colors ${
                showMenu ? 'text-white bg-white/15' : 'text-white/50 hover:text-white hover:bg-white/10'
              }`}
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                haptics.selection();
                setIsCollapsed(!isCollapsed);
              }}
              title={isCollapsed ? "Expand" : "Collapse"}
              className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            >
              {isCollapsed ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Management Drawer (Accessible menu alternative) */}
        {showMenu && (
          <div 
            className="p-3 bg-black/75 border-b border-white/10 flex flex-col gap-2.5 animate-in fade-in duration-200 text-xs"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {onSizeChange && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-white/50 font-mono">SIZE CLASS:</span>
                <div className="flex items-center gap-1 bg-white/10 p-0.5 rounded-lg">
                  {(['S', 'M', 'L', 'XL'] as WidgetSizeClass[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        haptics.impact('light');
                        onSizeChange(s);
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors ${
                        sizeClass === s ? 'bg-white text-slate-900 font-bold' : 'text-white/60 hover:text-white'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-white/5">
              {onPinToggle && (
                <button
                  onClick={() => {
                    haptics.selection();
                    onPinToggle();
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] flex items-center gap-1 border transition-colors ${
                    isPinned ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-white/5 text-white/80 border-white/10'
                  }`}
                >
                  <Pin className="w-3 h-3" />
                  <span>{isPinned ? 'Unpin' : 'Pin to Top'}</span>
                </button>
              )}

              {onMoveUp && (
                <button
                  onClick={() => { haptics.selection(); onMoveUp(); }}
                  title="Move earlier"
                  className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 border border-white/10"
                >
                  <MoveUp className="w-3.5 h-3.5" />
                </button>
              )}

              {onMoveDown && (
                <button
                  onClick={() => { haptics.selection(); onMoveDown(); }}
                  title="Move later"
                  className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 border border-white/10"
                >
                  <MoveDown className="w-3.5 h-3.5" />
                </button>
              )}

              {onHide && (
                <button
                  onClick={() => {
                    haptics.success();
                    setShowMenu(false);
                    onHide();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 text-[11px] flex items-center gap-1"
                >
                  <EyeOff className="w-3 h-3" />
                  <span>Hide</span>
                </button>
              )}

              {onRemove && (
                <button
                  onClick={() => {
                    haptics.success();
                    setShowMenu(false);
                    onRemove();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/20 text-[11px] flex items-center gap-1 ml-auto"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Remove</span>
                </button>
              )}

              <button
                onClick={() => setShowMenu(false)}
                className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/60 text-[10px]"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Main Content Body */}
        {!isCollapsed && (
          <div className="p-4 sm:p-5 flex-1 min-h-0 flex flex-col relative z-0">
            {children}
          </div>
        )}
      </motion.div>
    </div>
  );
};
