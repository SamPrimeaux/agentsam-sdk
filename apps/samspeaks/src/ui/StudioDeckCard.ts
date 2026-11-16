import * as xb from 'xrblocks';
import { FINISH_LIST, SUBJECT_LIST } from '../constants.ts';
import type { FinishId, StudioSubjectId } from '../types.ts';

export interface StudioDeckCallbacks {
  onSelectSubject: (id: StudioSubjectId) => void;
  onSelectFinish: (id: FinishId) => void;
  onExplodeChange: (value: number) => void;
  onSpinChange: (value: number) => void;
  onLightAngleChange: (radians: number) => void;
  onToggleBrush: (enabled: boolean) => void;
  onClearBrush: () => void;
  onResetStudio: () => void;
}

export class StudioDeckCard extends xb.UICard {
  private subjectButtons = new Map<StudioSubjectId, xb.UIButton>();
  private finishButtons = new Map<FinishId, xb.UIButton>();
  private explodeSlider: xb.UISlider;
  private explodeValueText: xb.UIText;
  private spinSlider: xb.UISlider;
  private spinValueText: xb.UIText;
  private lightSlider: xb.UISlider;
  private lightValueText: xb.UIText;
  private brushButton: xb.UIButton;
  private clearBrushButton: xb.UIButton;
  private brushActive = false;

  constructor(callbacks: StudioDeckCallbacks) {
    const subjectRowTop = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', gap: 8 },
    });
    const subjectRowBottom = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'row', gap: 8 },
    });
    const subjectRow = new xb.UIPanel({
      style: { width: '100%', flexDirection: 'column', gap: 8 },
      children: [subjectRowTop, subjectRowBottom],
    });

    const subjectBtnMap = new Map<StudioSubjectId, xb.UIButton>();
    SUBJECT_LIST.forEach((subject, idx) => {
      const btn = new xb.UIButton({
        label: subject.label,
        style: {
          flexGrow: 1,
          height: 40,
          fontSize: 15,
          borderRadius: 12,
        },
        onClick: () => callbacks.onSelectSubject(subject.id),
      });
      subjectBtnMap.set(subject.id, btn);
      if (idx < 2) subjectRowTop.add(btn);
      else subjectRowBottom.add(btn);
    });

    const finishRow = new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        gap: 6,
      },
    });

    const finishBtnMap = new Map<FinishId, xb.UIButton>();
    for (const finish of FINISH_LIST) {
      const btn = new xb.UIButton({
        label: finish.label,
        style: {
          flexGrow: 1,
          height: 38,
          fontSize: 13,
          paddingLeft: 8,
          paddingRight: 8,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: finish.swatchHex,
        },
        onClick: () => callbacks.onSelectFinish(finish.id),
      });
      finishBtnMap.set(finish.id, btn);
      finishRow.add(btn);
    }

    const explodeValueText = new xb.UIText({
      text: '0%',
      style: { fontSize: 15, fontWeight: 'bold' },
    });
    const explodeSlider = new xb.UISlider({
      ariaLabel: 'Exploded view separation',
      min: 0,
      max: 1,
      step: 0.02,
      value: 0,
      style: { width: '100%', height: 34 },
      onInput: (val) => {
        explodeValueText.text = `${Math.round(val * 100)}%`;
        callbacks.onExplodeChange(val);
      },
    });

    const spinValueText = new xb.UIText({
      text: '0.28x',
      style: { fontSize: 15, fontWeight: 'bold' },
    });
    const spinSlider = new xb.UISlider({
      ariaLabel: 'Turntable rotation speed',
      min: 0,
      max: 1.6,
      step: 0.04,
      value: 0.28,
      style: { width: '100%', height: 34 },
      onInput: (val) => {
        spinValueText.text = `${val.toFixed(2)}x`;
        callbacks.onSpinChange(val);
      },
    });

    const lightValueText = new xb.UIText({
      text: '37°',
      style: { fontSize: 15, fontWeight: 'bold' },
    });
    const lightSlider = new xb.UISlider({
      ariaLabel: 'Studio key light azimuth angle',
      min: -Math.PI,
      max: Math.PI,
      step: 0.05,
      value: 0.65,
      style: { width: '100%', height: 34 },
      onInput: (val) => {
        const deg = Math.round((val * 180) / Math.PI);
        lightValueText.text = `${deg}°`;
        callbacks.onLightAngleChange(val);
      },
    });

    const brushButton = new xb.UIButton({
      label: '3D Brush: Off',
      icon: 'brush',
      style: { flexGrow: 1, height: 42, fontSize: 14, borderRadius: 12 },
      onClick: () => {
        this.setBrushActive(!this.brushActive);
        callbacks.onToggleBrush(this.brushActive);
      },
    });

    const clearBrushButton = new xb.UIButton({
      label: 'Clear (0)',
      icon: 'delete_sweep',
      disabled: true,
      style: { flexGrow: 1, height: 42, fontSize: 14, borderRadius: 12 },
      onClick: () => callbacks.onClearBrush(),
    });

    const resetButton = new xb.UIButton({
      label: 'Reset Stage',
      icon: 'restart_alt',
      style: { width: '100%', height: 40, fontSize: 14, borderRadius: 12 },
      onClick: () => callbacks.onResetStudio(),
    });

    super({
      size: { width: 0.54, height: 'auto' },
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 12,
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
              icon: 'deployed_code',
              style: { width: 28, height: 28, color: '#8ab4f8' },
            }),
            new xb.UIPanel({
              style: { flexGrow: 1, flexDirection: 'column', gap: 2 },
              children: [
                new xb.UIText({
                  text: '3D Stage & Sculpt',
                  style: { fontSize: 22, fontWeight: 'bold' },
                }),
                new xb.UIText({
                  text: 'Procedural PBR subjects & studio lighting',
                  style: { fontSize: 13, opacity: 0.72 },
                }),
              ],
            }),
          ],
        }),
        new xb.UIText({
          text: 'SUBJECT',
          style: { fontSize: 12, fontWeight: 'bold', opacity: 0.68 },
        }),
        subjectRow,
        new xb.UIText({
          text: 'PBR FINISH',
          style: { fontSize: 12, fontWeight: 'bold', opacity: 0.68 },
        }),
        finishRow,
        StudioDeckCard.createSliderRow('Exploded View', explodeValueText),
        explodeSlider,
        StudioDeckCard.createSliderRow('Turntable Spin', spinValueText),
        spinSlider,
        StudioDeckCard.createSliderRow('Key Light Orbit', lightValueText),
        lightSlider,
        new xb.UIPanel({
          style: { width: '100%', flexDirection: 'row', gap: 8 },
          children: [brushButton, clearBrushButton],
        }),
        resetButton,
      ],
    });

    this.name = 'StudioDeckCard';
    this.subjectButtons = subjectBtnMap;
    this.finishButtons = finishBtnMap;
    this.explodeSlider = explodeSlider;
    this.explodeValueText = explodeValueText;
    this.spinSlider = spinSlider;
    this.spinValueText = spinValueText;
    this.lightSlider = lightSlider;
    this.lightValueText = lightValueText;
    this.brushButton = brushButton;
    this.clearBrushButton = clearBrushButton;

    this.setActiveSubject('astrolabe');
    this.setActiveFinish('gold');
  }

  private static createSliderRow(label: string, valueText: xb.UIText): xb.UIPanel {
    return new xb.UIPanel({
      style: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
      },
      children: [
        new xb.UIText({
          text: label,
          style: { fontSize: 14, fontWeight: 'bold' },
        }),
        valueText,
      ],
    });
  }

  public setActiveSubject(id: StudioSubjectId): void {
    for (const [key, btn] of this.subjectButtons.entries()) {
      const active = key === id;
      btn.style.backgroundColor = active
        ? 'rgba(84, 148, 255, 0.85)'
        : 'rgba(255, 255, 255, 0.08)';
      btn.style.color = active ? '#ffffff' : '#d9e2f2';
    }
  }

  public setActiveFinish(id: FinishId): void {
    for (const [key, btn] of this.finishButtons.entries()) {
      const active = key === id;
      btn.style.backgroundColor = active
        ? 'rgba(255, 255, 255, 0.22)'
        : 'rgba(255, 255, 255, 0.05)';
    }
  }

  public setBrushActive(active: boolean): void {
    this.brushActive = active;
    this.brushButton.label = active ? '3D Brush: On' : '3D Brush: Off';
    this.brushButton.style.backgroundColor = active
      ? 'rgba(52, 168, 83, 0.85)'
      : 'rgba(255, 255, 255, 0.1)';
  }

  public setStrokeCount(count: number): void {
    this.clearBrushButton.label = `Clear (${count})`;
    this.clearBrushButton.disabled = count === 0;
  }

  public resetSliders(): void {
    this.explodeSlider.value = 0;
    this.explodeValueText.text = '0%';
    this.spinSlider.value = 0.28;
    this.spinValueText.text = '0.28x';
    this.lightSlider.value = 0.65;
    this.lightValueText.text = '37°';
  }
}
