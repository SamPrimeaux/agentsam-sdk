import type { AudioLevels } from '../types.ts';
import { base64ToUint8Array } from './ttsService.ts';

/**
 * Zero-dependency Web Audio engine for WAV playback, real-time FFT analysis,
 * and procedural spatial UI feedback tones.
 */
export class AudioEngine {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private activeSource: AudioBufferSourceNode | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private isPlayingAudio = false;
  private onEndedCallback: (() => void) | null = null;

  public readonly levels: AudioLevels = {
    overall: 0,
    low: 0,
    mid: 0,
    high: 0,
    isPlaying: false,
  };

  private ensureContext(): AudioContext {
    if (!this.context) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.context = new AudioCtx();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.78;
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = 0.92;
      this.analyser.connect(this.masterGain);
      this.masterGain.connect(this.context.destination);
      this.freqData = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
    }
    if (this.context.state === 'suspended') {
      void this.context.resume();
    }
    return this.context;
  }

  async playWavBase64(base64: string, onEnded?: () => void): Promise<void> {
    this.stop();
    const ctx = this.ensureContext();
    if (!this.analyser) return;

    const bytes = base64ToUint8Array(base64);
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.analyser);

    this.activeSource = source;
    this.isPlayingAudio = true;
    this.levels.isPlaying = true;
    this.onEndedCallback = onEnded ?? null;

    source.onended = () => {
      if (this.activeSource === source) {
        this.activeSource = null;
        this.isPlayingAudio = false;
        this.levels.isPlaying = false;
        const cb = this.onEndedCallback;
        this.onEndedCallback = null;
        cb?.();
      }
    };

    source.start(0);
  }

  stop(): void {
    if (this.activeSource) {
      try {
        this.activeSource.onended = null;
        this.activeSource.stop();
        this.activeSource.disconnect();
      } catch {
        // Ignore already stopped source
      }
      this.activeSource = null;
    }
    this.isPlayingAudio = false;
    this.levels.isPlaying = false;
    this.onEndedCallback = null;
  }

  /**
   * Procedural Web Audio chime for tactile studio feedback (zero external files).
   */
  playStudioCue(kind: 'select' | 'switch' | 'ready' | 'paint'): void {
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (kind === 'select') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(780, now + 0.06);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      } else if (kind === 'switch') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(340, now);
        osc.frequency.exponentialRampToValueAtTime(510, now + 0.11);
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      } else if (kind === 'ready') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.setValueAtTime(880, now + 0.07);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.05);
        gain.gain.setValueAtTime(0.035, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      }

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } catch {
      // Audio context may be blocked prior to gesture
    }
  }

  /**
   * Updates frequency/RMS levels in place (zero allocations per frame).
   */
  sampleLevels(dt: number): AudioLevels {
    const decay = Math.exp(-10 * dt);
    if (!this.isPlayingAudio || !this.analyser || !this.freqData) {
      this.levels.overall *= decay;
      this.levels.low *= decay;
      this.levels.mid *= decay;
      this.levels.high *= decay;
      return this.levels;
    }

    this.analyser.getByteFrequencyData(this.freqData);
    const len = this.freqData.length;
    let lowSum = 0;
    let midSum = 0;
    let highSum = 0;
    const lowEnd = Math.max(1, Math.floor(len * 0.16));
    const midEnd = Math.max(lowEnd + 1, Math.floor(len * 0.5));

    for (let i = 0; i < len; i++) {
      const val = this.freqData[i] / 255;
      if (i < lowEnd) lowSum += val;
      else if (i < midEnd) midSum += val;
      else highSum += val;
    }

    const low = Math.min(1, (lowSum / lowEnd) * 1.45);
    const mid = Math.min(1, (midSum / (midEnd - lowEnd)) * 1.65);
    const high = Math.min(1, (highSum / Math.max(1, len - midEnd)) * 2.1);
    const overall = Math.min(1, low * 0.4 + mid * 0.45 + high * 0.15);

    const smooth = 1 - Math.exp(-18 * dt);
    this.levels.low += (low - this.levels.low) * smooth;
    this.levels.mid += (mid - this.levels.mid) * smooth;
    this.levels.high += (high - this.levels.high) * smooth;
    this.levels.overall += (overall - this.levels.overall) * smooth;
    return this.levels;
  }

  dispose(): void {
    this.stop();
    if (this.context) {
      void this.context.close();
      this.context = null;
    }
    this.analyser = null;
    this.masterGain = null;
    this.freqData = null;
  }
}
