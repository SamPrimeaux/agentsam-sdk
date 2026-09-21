/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState } from 'react';
import { Flame } from 'lucide-react';

interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = '',
  size = 'md',
  showSubtitle = true
}) => {
  const [imgError, setImgError] = useState(false);
  const logoUrl = 'https://fuelnfreetime.com/media/archive/shopify-import/logos/fandft-clear-background.png';

  const logoSizes = {
    sm: 'h-8 w-auto',
    md: 'h-10 w-auto',
    lg: 'h-16 w-auto'
  };

  const textSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-2xl'
  };

  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {!imgError ? (
        <img
          src={logoUrl}
          alt="FuelnFreeTime Apparel"
          className={`${logoSizes[size]} object-contain drop-shadow-md`}
          onError={() => setImgError(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 via-orange-600 to-red-600 flex items-center justify-center text-white shadow-lg shadow-orange-500/20">
          <Flame size={22} className="animate-pulse" />
        </div>
      )}
      
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5">
          <span className={`font-black tracking-tight text-white uppercase ${textSizes[size]}`}>
            FuelnFreeTime
          </span>
          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">
            APPAREL
          </span>
        </div>
        {showSubtitle && (
          <span className="text-[10px] text-zinc-400 font-mono tracking-widest uppercase">
            POD Studio & Completeful Hub
          </span>
        )}
      </div>
    </div>
  );
};
