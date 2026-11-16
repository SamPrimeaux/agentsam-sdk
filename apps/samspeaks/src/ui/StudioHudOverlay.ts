import * as xb from 'xrblocks';

export interface StudioHudCallbacks {
  onTogglePanels: (visible: boolean) => void;
  onQuickSpeak: () => void;
}

export class StudioHudOverlay extends xb.UIOverlay {
  private panelsVisible = true;
  private togglePanelsBtn: xb.UIButton;
  private quickSpeakBtn: xb.UIButton;
  private subtitleText: xb.UIText;

  constructor(callbacks: StudioHudCallbacks) {
    const subtitleText = new xb.UIText({
      text: 'Astrolabe • Gold',
      pointerEvents: 'none',
      style: {
        fontSize: 15,
        fontWeight: 'bold',
        opacity: 0.9,
      },
    });

    const togglePanelsBtn = new xb.UIButton({
      label: 'Hide Panels',
      icon: 'visibility_off',
      style: {
        height: 36,
        fontSize: 13,
        borderRadius: 10,
        paddingLeft: 12,
        paddingRight: 12,
      },
      onClick: () => {
        this.panelsVisible = !this.panelsVisible;
        togglePanelsBtn.label = this.panelsVisible
          ? 'Hide Panels'
          : 'Show Panels';
        togglePanelsBtn.icon = this.panelsVisible
          ? 'visibility_off'
          : 'visibility';
        callbacks.onTogglePanels(this.panelsVisible);
      },
    });

    const quickSpeakBtn = new xb.UIButton({
      label: 'Speak Scene',
      icon: 'volume_up',
      style: {
        height: 36,
        fontSize: 13,
        borderRadius: 10,
        paddingLeft: 12,
        paddingRight: 12,
        backgroundColor: 'rgba(66, 133, 244, 0.85)',
      },
      onClick: () => callbacks.onQuickSpeak(),
    });

    super({
      style: {
        position: 'absolute',
        left: '50%',
        bottom: 20,
        transform: { translateX: '-50%' },
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingTop: 8,
        paddingBottom: 8,
        paddingLeft: 14,
        paddingRight: 14,
        borderRadius: 18,
      },
      children: [
        new xb.UIExitButton(),
        subtitleText,
        togglePanelsBtn,
        quickSpeakBtn,
      ],
    });

    this.name = 'StudioHudOverlay';
    this.subtitleText = subtitleText;
    this.togglePanelsBtn = togglePanelsBtn;
    this.quickSpeakBtn = quickSpeakBtn;
  }

  public setSummary(summary: string): void {
    this.subtitleText.text = summary;
  }

  public setQuickSpeakBusy(busy: boolean): void {
    this.quickSpeakBtn.disabled = busy;
    this.quickSpeakBtn.label = busy ? 'Speaking...' : 'Speak Scene';
  }
}
