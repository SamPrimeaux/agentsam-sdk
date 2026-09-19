/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect } from 'react';
import { SprayCan, Flame } from 'lucide-react';

interface IntroSequenceProps {
  onComplete: () => void;
}

export const IntroSequence: React.FC<IntroSequenceProps> = ({ onComplete }) => {
  const [phase, setPhase] = useState<'enter' | 'wait' | 'spray' | 'admire' | 'exit' | 'prism' | 'explode'>('enter');
  const logoUrl = 'https://fuelnfreetime.com/media/archive/shopify-import/logos/fandft-clear-background.png';

  useEffect(() => {
    // Cinematic Timeline
    const schedule = [
      { t: 100, fn: () => setPhase('enter') },      // Bot walks in
      { t: 1600, fn: () => setPhase('wait') },      // Stops, looks around
      { t: 2200, fn: () => setPhase('spray') },     // Spray can enters & sprays
      { t: 3600, fn: () => setPhase('admire') },    // Spray done, bot looks at self
      { t: 4500, fn: () => setPhase('exit') },      // Bot runs away
      { t: 5100, fn: () => setPhase('prism') },     // FuelnFreeTime logo forms
      { t: 7200, fn: () => setPhase('explode') },   // Boom
      { t: 7900, fn: () => onComplete() }           // Done
    ];

    const timers = schedule.map(s => setTimeout(s.fn, s.t));
    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-[100] bg-black flex items-center justify-center overflow-hidden font-sans select-none
      ${phase === 'explode' ? 'animate-[fadeOut_0.8s_ease-out_forwards] pointer-events-none' : ''}`}
    >
      {/* Skip Button for UX convenience */}
      <button
        onClick={onComplete}
        className="absolute top-6 right-6 z-50 text-xs font-mono text-zinc-500 hover:text-white px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 transition-colors"
      >
        Skip Intro ✕
      </button>

      {/* Flash Overlay for Explosion */}
      <div
        className={`absolute inset-0 bg-white pointer-events-none z-50 transition-opacity duration-300 ease-out ${
          phase === 'explode' ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(245,158,11,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(245,158,11,0.04)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_80%)]" />

      {/* STAGE AREA - Scaled for mobile */}
      <div className="relative w-full max-w-4xl h-96 flex items-center justify-center scale-[0.6] md:scale-100">
        {/* CHARACTER: THE BOX BOT */}
        {phase !== 'prism' && phase !== 'explode' && (
          <div
            className={`relative z-10 flex flex-col items-center transition-transform will-change-transform ${
              phase === 'enter' ? 'animate-[hopIn_1.6s_cubic-bezier(0.34,1.56,0.64,1)_forwards]' : ''
            } ${phase === 'exit' ? 'animate-[anticipateSprint_0.8s_ease-in_forwards]' : ''}`}
          >
            {/* Body */}
            <div
              className={`w-32 h-36 bg-zinc-100 rounded-xl relative overflow-hidden shadow-2xl transition-all duration-300 border-4 ${
                phase === 'spray' || phase === 'admire' || phase === 'exit'
                  ? 'border-amber-500 shadow-[0_0_40px_rgba(245,158,11,0.5)]'
                  : 'border-zinc-300'
              }`}
            >
              {/* Blank Tape */}
              <div
                className={`absolute top-0 left-1/2 -translate-x-1/2 w-8 h-full bg-zinc-200/50 border-x border-zinc-300/50 transition-opacity duration-200 ${
                  phase === 'spray' || phase === 'admire' || phase === 'exit' ? 'opacity-0' : 'opacity-100'
                }`}
              />

              {/* Face Screen */}
              <div className="absolute top-6 left-1/2 -translate-x-1/2 w-20 h-10 bg-zinc-800 rounded-md flex items-center justify-center gap-4 overflow-hidden border border-zinc-700 shadow-inner z-20">
                {/* Eyes */}
                <div
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    phase === 'spray' ? 'scale-y-10 bg-amber-400' : 'bg-amber-400 animate-pulse'
                  }`}
                />
                <div
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    phase === 'spray' ? 'scale-y-10 bg-amber-400' : 'bg-amber-400 animate-pulse'
                  }`}
                />
              </div>

              {/* BRAND REVEAL: Gradient */}
              <div
                className={`absolute inset-0 bg-gradient-to-br from-amber-500 via-orange-600 to-red-600 transition-opacity duration-500 ${
                  phase === 'spray' || phase === 'admire' || phase === 'exit' ? 'opacity-100' : 'opacity-0'
                }`}
              />

              {/* White Flash on Transform */}
              <div
                className={`absolute inset-0 bg-white mix-blend-overlay pointer-events-none ${
                  phase === 'spray' ? 'animate-[flash_0.2s_ease-out]' : 'opacity-0'
                }`}
              />

              {/* Logo Icon */}
              <div
                className={`absolute bottom-5 left-1/2 -translate-x-1/2 transition-all duration-500 transform z-20 ${
                  phase === 'spray' || phase === 'admire' || phase === 'exit'
                    ? 'opacity-100 scale-100 translate-y-0'
                    : 'opacity-0 scale-50 translate-y-4'
                }`}
              >
                <div className="w-12 h-10 bg-black/80 rounded-lg p-1 flex items-center justify-center shadow-lg border border-amber-400/40">
                  <img
                    src={logoUrl}
                    alt="FuelnFreeTime"
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
            </div>

            {/* Legs */}
            <div className="flex gap-10 -mt-1 z-0">
              <div
                className={`w-3 h-8 bg-zinc-800 rounded-b-full origin-top ${
                  phase === 'enter' ? 'animate-[legMove_0.2s_infinite_alternate]' : ''
                } ${phase === 'exit' ? 'animate-[legMove_0.1s_infinite_alternate]' : ''}`}
              />
              <div
                className={`w-3 h-8 bg-zinc-800 rounded-b-full origin-top ${
                  phase === 'enter' ? 'animate-[legMove_0.2s_infinite_alternate-reverse]' : ''
                } ${phase === 'exit' ? 'animate-[legMove_0.1s_infinite_alternate-reverse]' : ''}`}
              />
            </div>
          </div>
        )}

        {/* SPRAY CAN ACTOR */}
        {phase === 'spray' && (
          <div
            className="absolute z-20 animate-[swoopIn_0.4s_cubic-bezier(0.17,0.67,0.83,0.67)_forwards]"
            style={{ right: '22%', top: '5%' }}
          >
            <div className="relative animate-[shake_0.15s_infinite]">
              <SprayCan size={80} className="text-amber-400 fill-zinc-900 rotate-[-15deg] drop-shadow-2xl" />
              <div className="absolute top-0 -left-4 w-6 h-6 bg-amber-300 rounded-full blur-md animate-ping" />
              <div className="absolute top-4 -left-8 w-40 h-40 pointer-events-none overflow-visible">
                {[...Array(20)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-2 h-2 bg-gradient-to-r from-amber-400 to-red-400 rounded-full animate-[sprayParticle_0.4s_linear_forwards]"
                    style={{
                      top: Math.random() * 20,
                      left: 0,
                      animationDelay: `${Math.random() * 0.3}s`
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* FINALE: FUELNFREETIME APPAREL REVEAL */}
        {(phase === 'prism' || phase === 'explode') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
            <div className="relative w-36 h-28 flex items-center justify-center animate-[spinAppear_1.2s_cubic-bezier(0.34,1.56,0.64,1)_forwards]">
              <img
                src={logoUrl}
                alt="FuelnFreeTime Apparel"
                className="w-full h-full object-contain drop-shadow-[0_0_50px_rgba(245,158,11,0.6)]"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="text-center animate-[popIn_0.8s_cubic-bezier(0.17,0.67,0.83,0.67)_0.3s_forwards] opacity-0">
              <h1 className="text-4xl md:text-5xl font-black text-white tracking-tighter uppercase mb-2">
                FuelnFreeTime <span className="text-amber-400">Apparel</span>
              </h1>
              <p className="text-xs md:text-sm text-amber-300 font-mono tracking-[0.3em] uppercase">
                AI Mockup Studio & Completeful POD Hub
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
