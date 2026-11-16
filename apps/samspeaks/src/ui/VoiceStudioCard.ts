import * as xb from 'xrblocks';
import {
  DEFAULT_STYLE_PRESETS,
  SUBJECT_MAP,
  VOICE_OPTIONS,
} from '../constants.ts';
import type {
  StudioSubjectId,
  TtsMode,
  TtsRequest,
  VoiceName,
} from '../types.ts';

export interface VoiceStudioCallbacks {
  onSynthesize: (request: TtsRequest) => Promise<void>;
  onStopAudio: () => void;
  onDownloadAudio: () => void;
  onAssistScript: (mode: TtsMode) => Promise<string>;
}

export class VoiceStudioCard extends xb.UICard {
  private mode: TtsMode = 'single';
  private selectedVoice: VoiceName = 'Kore';
  private selectedVoiceB: VoiceName = 'Puck';
  private singleModeBtn: xb.UIButton;
  private dualModeBtn: xb.UIButton;
  private voiceButtons = new Map<VoiceName, xb.UIButton>();
  private styleInput: xb.UITextInput;
  private scriptInput: xb.UITextInput;
  private statusText: xb.UIText;
  private speakButton: xb.UIButton;
  private stopButton: xb.UIButton;
  private downloadButton: xb.UIButton;
  private assistButton: xb.UIButton;
  private busy = false;
  private hasAudio = false;

  constructor(callbacks: VoiceStudioCallbacks) {
    const singleModeBtn = new xb.UIButton({
      label: 'Single Voice',
      icon: 'record_voice_over',
      style: { flexGrow: 1, height: 38, fontSize: 14, borderRadius: 10 },
      onClick: () => this.setMode('single'),
    });
    const dualModeBtn = new xb.UIButton({
      label: 'Dual Dialogue',
      icon: 'forum',
      style: { flexGrow: 1, height: 38, fontSize: 14, borderRadius: 10 },
      onClick: () => this.setMode('dual'),
    });

    const voiceRow = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'column',
        gap: 5,
      },
    });
    const voiceBtnMap = new Map<VoiceName, xb.UIButton>();
    for (let i = 0; i < VOICE_OPTIONS.length; i += 5) {
      const row = new xb.UIPanel({
        style: {
          width: '100%',
          flexDirection: 'row',
          gap: 5,
        },
      });
      for (const v of VOICE_OPTIONS.slice(i, i + 5)) {
        const btn = new xb.UIButton({
          label: v.name,
          style: {
            flexGrow: 1,
            height: 28,
            fontSize: 11,
            paddingLeft: 4,
            paddingRight: 4,
            borderRadius: 8,
          },
          onClick: () => this.setVoice(v.name),
        });
        voiceBtnMap.set(v.name, btn);
        row.add(btn);
      }
      voiceRow.add(row);
    }

    const stylePresetsRow = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', gap: 6 },
    });
    const styleInput = new xb.UITextInput({
      ariaLabel: 'Voice persona and speaking style direction',
      value: DEFAULT_STYLE_PRESETS[0].style,
      placeholder: 'Describe voice style (e.g. Warm studio director)...',
      style: {
        width: '100%',
        height: 40,
        fontSize: 14,
        borderRadius: 10,
        paddingLeft: 10,
        paddingRight: 10,
      },
    });
    for (const preset of DEFAULT_STYLE_PRESETS) {
      stylePresetsRow.add(
        new xb.UIButton({
          label: preset.label,
          style: {
            flexGrow: 1,
            height: 32,
            fontSize: 12,
            paddingLeft: 6,
            paddingRight: 6,
            borderRadius: 8,
            backgroundColor: 'rgba(255, 255, 255, 0.07)',
          },
          onClick: () => {
            styleInput.value = preset.style;
          },
        })
      );
    }

    const scriptInput = new xb.UITextInput({
      ariaLabel: 'Narration or dialogue script for Gemini TTS',
      value: SUBJECT_MAP.astrolabe.defaultSingleScript,
      placeholder: 'Type script or dialogue (Alex: ... / Sam: ...)',
      multiline: true,
      style: {
        width: '100%',
        height: 118,
        fontSize: 14,
        lineHeight: 1.35,
        borderRadius: 12,
        padding: 10,
      },
    });

    const appendTag = (tag: string) => {
      const current = scriptInput.value.trim();
      scriptInput.value = current ? `${current} ${tag}` : tag;
    };

    const assistButton = new xb.UIButton({
      label: 'AI Script',
      icon: 'auto_awesome',
      style: {
        flexGrow: 1,
        height: 34,
        fontSize: 12,
        borderRadius: 8,
        backgroundColor: 'rgba(138, 180, 248, 0.18)',
      },
      onClick: async () => {
        if (this.busy) return;
        this.setBusy(true, 'Writing studio script...');
        try {
          const nextScript = await callbacks.onAssistScript(this.mode);
          scriptInput.value = nextScript;
          this.setStatus('Script updated. Ready to synthesize.');
        } catch (err) {
          this.setStatus(
            err instanceof Error ? err.message : 'Script assist failed.'
          );
        } finally {
          this.setBusy(false);
        }
      },
    });

    const tagRow = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', gap: 6 },
      children: [
        new xb.UIButton({
          label: '+<breath>',
          style: { flexGrow: 1, height: 34, fontSize: 12, borderRadius: 8 },
          onClick: () => appendTag('<breath>'),
        }),
        new xb.UIButton({
          label: '+<laugh>',
          style: { flexGrow: 1, height: 34, fontSize: 12, borderRadius: 8 },
          onClick: () => appendTag('<laugh>'),
        }),
        new xb.UIButton({
          label: '+|yeah|',
          style: { flexGrow: 1, height: 34, fontSize: 12, borderRadius: 8 },
          onClick: () => appendTag('|yeah|'),
        }),
        assistButton,
      ],
    });

    const statusText = new xb.UIText({
      text: 'Ready — powered by gemini-3.8-flash-tts',
      style: {
        width: '100%',
        fontSize: 13,
        opacity: 0.82,
        textAlign: 'center',
      },
    });

    const speakButton = new xb.UIButton({
      label: 'Speak & Animate',
      icon: 'graphic_eq',
      style: {
        flexGrow: 2,
        height: 44,
        fontSize: 15,
        fontWeight: 'bold',
        borderRadius: 12,
        backgroundColor: 'rgba(66, 133, 244, 0.9)',
        color: '#ffffff',
      },
      onClick: async () => {
        if (this.busy) return;
        const text = scriptInput.value.trim();
        if (!text) {
          this.setStatus('Enter a script before synthesizing.');
          return;
        }
        this.setBusy(true, 'Synthesizing with gemini-3.8-flash-tts...');
        try {
          if (this.mode === 'dual') {
            await callbacks.onSynthesize({
              mode: 'dual',
              text,
              speakerA: 'Alex',
              speakerB: 'Sam',
              voiceA: this.selectedVoiceB,
              voiceB: this.selectedVoice,
              styleA: styleInput.value.trim() || 'Enthusiastic creative director',
              styleB: 'Curious, articulate studio engineer',
            });
          } else {
            await callbacks.onSynthesize({
              mode: 'single',
              text,
              voiceName: this.selectedVoice,
              stylePrompt: styleInput.value.trim(),
            });
          }
        } finally {
          this.setBusy(false);
        }
      },
    });

    const stopButton = new xb.UIButton({
      label: 'Stop',
      icon: 'stop',
      disabled: true,
      style: { flexGrow: 1, height: 44, fontSize: 14, borderRadius: 12 },
      onClick: () => callbacks.onStopAudio(),
    });

    const downloadButton = new xb.UIButton({
      label: 'WAV',
      icon: 'download',
      disabled: true,
      style: { flexGrow: 1, height: 44, fontSize: 14, borderRadius: 12 },
      onClick: () => callbacks.onDownloadAudio(),
    });

    super({
      size: { width: 0.6, height: 'auto' },
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 10,
        padding: 18,
        borderRadius: 22,
      },
      children: [
        new xb.UIPanel({
          style: {
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          },
          children: [
            new xb.UIIcon({
              icon: 'spatial_audio_off',
              style: { width: 28, height: 28, color: '#a8c7fa' },
            }),
            new xb.UIPanel({
              style: { flexGrow: 1, flexDirection: 'column', gap: 2 },
              children: [
                new xb.UIText({
                  text: 'Voice & Sound Studio',
                  style: { fontSize: 22, fontWeight: 'bold' },
                }),
                new xb.UIText({
                  text: 'Gemini 3.8 Flash TTS • Voice Design & Audio Reactive',
                  style: { fontSize: 13, opacity: 0.72 },
                }),
              ],
            }),
          ],
        }),
        new xb.UIPanel({
          style: { width: '100%', flexDirection: 'row', gap: 8 },
          children: [singleModeBtn, dualModeBtn],
        }),
        new xb.UIText({
          text: 'VOICE PERSONA',
          style: { fontSize: 12, fontWeight: 'bold', opacity: 0.68 },
        }),
        voiceRow,
        stylePresetsRow,
        styleInput,
        new xb.UIText({
          text: 'SCRIPT & EXPRESSIVE CUES',
          style: { fontSize: 12, fontWeight: 'bold', opacity: 0.68 },
        }),
        scriptInput,
        tagRow,
        new xb.UIPanel({
          style: { width: '100%', flexDirection: 'row', gap: 8 },
          children: [speakButton, stopButton, downloadButton],
        }),
        statusText,
      ],
    });

    this.name = 'VoiceStudioCard';
    this.singleModeBtn = singleModeBtn;
    this.dualModeBtn = dualModeBtn;
    this.voiceButtons = voiceBtnMap;
    this.styleInput = styleInput;
    this.scriptInput = scriptInput;
    this.statusText = statusText;
    this.speakButton = speakButton;
    this.stopButton = stopButton;
    this.downloadButton = downloadButton;
    this.assistButton = assistButton;

    this.setMode('single');
    this.setVoice('Kore');
  }

  public setMode(next: TtsMode, subjectId?: StudioSubjectId): void {
    this.mode = next;
    this.singleModeBtn.style.backgroundColor =
      next === 'single'
        ? 'rgba(84, 148, 255, 0.85)'
        : 'rgba(255, 255, 255, 0.08)';
    this.dualModeBtn.style.backgroundColor =
      next === 'dual'
        ? 'rgba(84, 148, 255, 0.85)'
        : 'rgba(255, 255, 255, 0.08)';

    if (subjectId) {
      const meta = SUBJECT_MAP[subjectId];
      this.scriptInput.value =
        next === 'dual' ? meta.defaultDualScript : meta.defaultSingleScript;
    } else {
      const current = this.scriptInput.value.trim();
      const matchesDefault = Object.values(SUBJECT_MAP).some(
        (m) =>
          m.defaultSingleScript === current || m.defaultDualScript === current
      );
      if (matchesDefault) {
        const matched = Object.values(SUBJECT_MAP).find(
          (m) =>
            m.defaultSingleScript === current || m.defaultDualScript === current
        )!;
        this.scriptInput.value =
          next === 'dual'
            ? matched.defaultDualScript
            : matched.defaultSingleScript;
      }
    }
  }

  public syncSubjectScript(subjectId: StudioSubjectId): void {
    const meta = SUBJECT_MAP[subjectId];
    this.scriptInput.value =
      this.mode === 'dual' ? meta.defaultDualScript : meta.defaultSingleScript;
  }

  public getCurrentScript(): string {
    return this.scriptInput.value.trim();
  }

  public getCurrentStyle(): string {
    return this.styleInput.value.trim();
  }

  public getCurrentVoice(): VoiceName {
    return this.selectedVoice;
  }

  public getCurrentMode(): TtsMode {
    return this.mode;
  }

  public setVoice(voice: VoiceName): void {
    this.selectedVoice = voice;
    this.selectedVoiceB = voice === 'Puck' ? 'Kore' : 'Puck';
    for (const [key, btn] of this.voiceButtons.entries()) {
      const active = key === voice;
      btn.style.backgroundColor = active
        ? 'rgba(84, 148, 255, 0.85)'
        : 'rgba(255, 255, 255, 0.08)';
      btn.style.color = active ? '#ffffff' : '#d9e2f2';
    }
  }

  public setBusy(busy: boolean, status?: string): void {
    this.busy = busy;
    this.speakButton.disabled = busy;
    this.assistButton.disabled = busy;
    if (status) {
      this.statusText.text = status;
    }
  }

  public setPlaybackState(playing: boolean, hasAudio: boolean): void {
    this.hasAudio = hasAudio;
    this.stopButton.disabled = !playing;
    this.downloadButton.disabled = !this.hasAudio;
  }

  public setStatus(text: string): void {
    this.statusText.text = text;
  }
}
