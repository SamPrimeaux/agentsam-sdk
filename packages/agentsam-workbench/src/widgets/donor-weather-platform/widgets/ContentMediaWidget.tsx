/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * ContentMediaWidget: Atmospheric radar loops and Web Audio ambient soundscapes.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Radio, Volume2, VolumeX, Play, Pause, Waves, Wind, CloudRain } from 'lucide-react';
import { WidgetFrame } from './WidgetFrame';

export const ContentMediaWidget: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [isPlayingSound, setIsPlayingSound] = useState(false);
  const [soundMode, setSoundMode] = useState<'rain' | 'wind' | 'chime'>('rain');
  const [radarFrame, setRadarFrame] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const noiseNodeRef = useRef<AudioNode | null>(null);

  // Radar sweep animation frame
  useEffect(() => {
    const timer = setInterval(() => {
      setRadarFrame((f) => (f + 1) % 12);
    }, 400);
    return () => clearInterval(timer);
  }, []);

  const toggleSound = () => {
    try {
      if (isPlayingSound) {
        if (audioCtxRef.current) {
          audioCtxRef.current.close();
          audioCtxRef.current = null;
        }
        setIsPlayingSound(false);
      } else {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        audioCtxRef.current = ctx;

        // Generate gentle white/pink noise for ambient rain/wind
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          // Brown/pink filter
          data[i] = (lastOut + 0.02 * white) / 1.02;
          lastOut = data[i];
          data[i] *= 2.5; // Gain
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = soundMode === 'rain' ? 'lowpass' : 'bandpass';
        filter.frequency.value = soundMode === 'rain' ? 800 : 400;

        const gain = ctx.createGain();
        gain.gain.value = 0.05;

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        noise.start();
        noiseNodeRef.current = noise;
        setIsPlayingSound(true);
      }
    } catch {
      // Audio might be blocked
    }
  };

  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
    };
  }, []);

  return (
    <WidgetFrame
      id="media"
      title="Atmospheric Media"
      category="content"
      subtitle="Radar & Acoustic"
      version="1.0.0"
      icon={<Radio className="w-4 h-4 text-sky-400" />}
      actions={
        <button
          onClick={toggleSound}
          title={isPlayingSound ? "Mute Ambience" : "Play Rain Ambience"}
          className={`p-1.5 rounded-md transition-colors ${
            isPlayingSound ? 'text-emerald-300 bg-white/10' : 'text-white/40 hover:text-white'
          }`}
        >
          {isPlayingSound ? <Volume2 className="w-3.5 h-3.5 animate-pulse" /> : <VolumeX className="w-3.5 h-3.5" />}
        </button>
      }
      className={className}
    >
      <div className="flex flex-col h-full justify-between gap-3">
        {/* Radar Visualizer */}
        <div className="relative rounded-xl overflow-hidden bg-black/40 border border-white/10 p-3 h-[130px] flex items-center justify-center">
          {/* Radar Circles */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-24 h-24 rounded-full border border-sky-400/20" />
            <div className="w-16 h-16 rounded-full border border-sky-400/30" />
            <div className="w-8 h-8 rounded-full border border-sky-400/40" />
            <div className="absolute w-full h-px bg-sky-400/15" />
            <div className="absolute h-full w-px bg-sky-400/15" />
          </div>

          {/* Rotating sweep line */}
          <div
            className="absolute w-24 h-24 rounded-full origin-center pointer-events-none transition-transform duration-300"
            style={{
              transform: `rotate(${radarFrame * 30}deg)`,
              background: 'conic-gradient(from 0deg, rgba(56, 189, 248, 0.35) 0deg, transparent 60deg)'
            }}
          />

          {/* Weather cluster simulated blips */}
          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="text-xs font-medium text-sky-200">Doppler Synthesis Loop</div>
            <div className="text-[10px] text-white/50 font-mono mt-0.5">Frame {radarFrame + 1}/12 · Composite Reflectivity</div>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-[11px] text-emerald-300 font-mono">LIVE FEED ACTIVE</span>
            </div>
          </div>
        </div>

        {/* Ambient Controls */}
        <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5">
          <div className="flex items-center gap-1.5 text-white/60">
            <Waves className="w-3.5 h-3.5 text-sky-400" />
            <span>Soundscape:</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setSoundMode('rain')}
              className={`px-2 py-0.5 rounded text-[11px] ${soundMode === 'rain' ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white'}`}
            >
              Rain
            </button>
            <button
              onClick={() => setSoundMode('wind')}
              className={`px-2 py-0.5 rounded text-[11px] ${soundMode === 'wind' ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white'}`}
            >
              Wind
            </button>
          </div>
        </div>
      </div>
    </WidgetFrame>
  );
};
