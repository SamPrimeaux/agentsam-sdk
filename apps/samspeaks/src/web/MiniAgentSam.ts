import {
  ATMOSPHERE_LIST,
  CAMERA_SHOTS,
  DEFAULT_STORYBOARD_BEATS,
  DEFAULT_STYLE_PRESETS,
  FINISH_LIST,
  SCENERY_PROP_OPTIONS,
  SUBJECT_LIST,
  TRANSITION_OPTIONS,
  VOICE_OPTIONS,
} from '../constants.ts';
import type {
  AtmosphereMoodId,
  CameraShotId,
  DroppedImageAsset,
  DynamicLightingState,
  FinishId,
  MovieBeat,
  SceneryPropType,
  StudioSubjectId,
  TransitionType,
  TtsMode,
  TtsRequest,
  VoiceName,
} from '../types.ts';

type SideTab = 'sam' | 'scenery' | 'lighting' | 'walkthrough';
type SideViewMode = 'panel' | 'split' | 'canvas';
type DockSide = 'left' | 'right';

export interface MiniAgentSamCallbacks {
  onSelectSubject: (id: StudioSubjectId) => void;
  onSelectFinish: (id: FinishId) => void;
  onSelectMood: (id: AtmosphereMoodId) => void;
  onExplodeChange: (value: number) => void;
  onSpinChange: (value: number) => void;
  onLightAngleChange: (radians: number) => void;
  onKeyIntensityChange: (value: number) => void;
  onAmbientColorChange: (hue: number, saturation: number) => void;
  onAmbientIntensityChange: (value: number) => void;
  onShadowSoftnessChange: (value: number) => void;
  onResetLighting: () => void;
  onToggleBrush: (enabled: boolean) => void;
  onClearBrush: () => void;
  onResetStudio: () => void;
  onArmProp: (propType: SceneryPropType) => void;
  onCancelArm: () => void;
  onPlaceImageInScene: (asset: DroppedImageAsset) => void;
  onArmImageInScene: (asset: DroppedImageAsset) => void;
  onRotateSelectedProp: () => void;
  onDeleteSelectedProp: () => void;
  onFocusSelectedProp: () => void;
  onClearScenery: () => void;
  onCameraShot: (shot: CameraShotId, transition: TransitionType) => void;
  onToggleAutoTour: (enabled: boolean) => void;
  onPreviewBeat: (beat: MovieBeat) => void;
  onComposeStory: (prompt: string, images: DroppedImageAsset[]) => Promise<{
    movieTitle: string;
    beats: MovieBeat[];
  }>;
  onPlayMovie: (beats: MovieBeat[], startIndex: number) => void;
  onStopMovie: () => void;
  onSpeakBeat: (beat: MovieBeat) => Promise<void>;
  onSynthesizeStandalone: (request: TtsRequest) => Promise<void>;
  onStopAudio: () => void;
  onDownloadAudio: () => void;
  onAssistScript: (mode: TtsMode) => Promise<string>;
  onExportScene: () => Promise<void>;
  onEnterXr: () => void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function processImageFile(file: File): Promise<DroppedImageAsset> {
  const dataUrlRaw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not decode dropped image.'));
    el.src = dataUrlRaw;
  });

  const maxSide = 1024;
  let targetW = img.naturalWidth || 800;
  let targetH = img.naturalHeight || 600;
  if (targetW > maxSide || targetH > maxSide) {
    const scale = maxSide / Math.max(targetW, targetH);
    targetW = Math.round(targetW * scale);
    targetH = Math.round(targetH * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: file.name,
      mimeType: file.type || 'image/jpeg',
      dataUrl: dataUrlRaw,
      width: targetW,
      height: targetH,
    };
  }

  ctx.drawImage(img, 0, 0, targetW, targetH);
  const outMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const outUrl = canvas.toDataURL(outMime, 0.86);

  return {
    id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: file.name || 'Backdrop',
    mimeType: outMime,
    dataUrl: outUrl,
    width: targetW,
    height: targetH,
  };
}

/**
 * Workspace Shell + Flexible Side Container ("miniAgentSam").
 * Features a slim left icon rail, a resizable/collapsible/dock-flippable side container
 * with Panel / Split / Creativity-Flow Canvas modes, and an unobstructed 3D viewport.
 */
export class MiniAgentSam {
  private callbacks: MiniAgentSamCallbacks;
  private root: HTMLDivElement;
  private sideEl!: HTMLElement;
  private splitterEl!: HTMLDivElement;
  private viewportEl!: HTMLElement;
  private sideBodyEl!: HTMLDivElement;
  private subtitleEl!: HTMLDivElement;
  private toastEl!: HTMLDivElement;
  private dropOverlayEl!: HTMLDivElement;
  private armedBannerEl!: HTMLDivElement;
  private armedBannerTextEl!: HTMLSpanElement;

  private activeTab: SideTab = 'sam';
  private viewMode: SideViewMode = 'split';
  private dockSide: DockSide = 'left';
  private sideWidth = 420;
  private collapsed = false;

  private activeSubject: StudioSubjectId = 'astrolabe';
  private activeFinish: FinishId = 'gold';
  private activeMood: AtmosphereMoodId = 'studio';
  private lightingState: DynamicLightingState = {
    keyIntensity: 2.6,
    ambientHue: 217,
    ambientSaturation: 1.0,
    ambientIntensity: 1.15,
    ambientHex: '#d0e2ff',
    shadowSoftness: 2.5,
    keyAngle: 0.65,
  };
  private brushEnabled = false;
  private strokeCount = 0;
  private autoTour = false;
  private manualTransition: TransitionType = 'glide';

  private movieTitle = 'Atelier Guided Adventure';
  private promptDraft = '';
  private beats: MovieBeat[] = DEFAULT_STORYBOARD_BEATS.map((b) => ({ ...b }));
  private activeBeatIndex = 0;
  private isComposing = false;
  private isPlayingMovie = false;
  private playingBeatIndex = -1;
  private droppedImages: DroppedImageAsset[] = [];

  private selectedPropLabel: string | null = null;
  private sceneryCount = 0;

  // Standalone voice state
  private voiceMode: TtsMode = 'single';
  private voiceName: VoiceName = 'Kore';
  private voiceStyle = 'Warm, articulate design documentary narrator';
  private voiceScript = '';
  private isSpeakingStandalone = false;
  private hasAudioDownload = false;
  private isExportingScene = false;

  private toastTimer: number | null = null;
  private cleanupDrag: (() => void) | null = null;

  constructor(callbacks: MiniAgentSamCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement('div');
    this.root.className = 'ws-shell';
    this.buildShell();
    document.body.prepend(this.root);
    this.applyLayoutState();
    this.render();
  }

  public getViewportElement(): HTMLElement {
    return this.viewportEl;
  }

  private buildShell(): void {
    this.root.innerHTML = `
      <aside class="ws-rail" aria-label="Workspace navigation">
        <div class="ws-rail-group">
          <button type="button" class="ws-rail-btn is-active" data-rail-tab="sam" title="miniAgentSam Composer &amp; Storyboard">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.8L20 10.7l-6.1 1.9L12 18.4l-1.9-5.8L4 10.7l6.1-1.9L12 3z"/></svg>
            <span>Sam</span>
          </button>
          <button type="button" class="ws-rail-btn" data-rail-tab="scenery" title="Scenery &amp; Stage Builder">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            <span>Stage</span>
          </button>
          <button type="button" class="ws-rail-btn" data-rail-tab="lighting" title="Dynamic Lighting">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M6.34 17.66l-1.41 1.41"/><path d="M19.07 4.93l-1.41 1.41"/></svg>
            <span>Lights</span>
          </button>
          <button type="button" class="ws-rail-btn" data-rail-tab="walkthrough" title="Walkthrough Camera &amp; Voice Studio">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
            <span>Direct</span>
          </button>
          <button type="button" class="ws-rail-btn" id="wsRailCanvasBtn" title="Toggle Creativity Flow Canvas">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/></svg>
            <span>Flow</span>
          </button>
        </div>

        <div class="ws-rail-group ws-rail-bottom">
          <button type="button" class="ws-rail-btn" id="wsFlipSideBtn" title="Flip Side Container Left / Right">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="12" y1="4" x2="12" y2="20"/><polyline points="8 9 5 12 8 15"/><polyline points="16 9 19 12 16 15"/></svg>
            <span>Flip</span>
          </button>
          <button type="button" class="ws-rail-btn" id="wsCollapseRailBtn" title="Collapse / Expand Side Container (H)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="9" y1="4" x2="9" y2="20"/></svg>
            <span>Hide</span>
          </button>
          <button type="button" class="ws-rail-btn" id="wsEnterXrBtn" title="Enter WebXR Headset (if connected)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-4l-2.5-3h-3L8 17H4a2 2 0 0 1-2-2v-5z"/></svg>
            <span>XR</span>
          </button>
        </div>
      </aside>

      <aside class="ws-side" id="wsSideContainer">
        <header class="ws-side-header">
          <div class="ws-side-title-group">
            <span class="ws-side-title">Workflow Space</span>
            <span class="ws-side-subtitle" id="wsSideMovieTitle"></span>
          </div>
          <div class="ws-side-controls">
            <div class="ws-view-switch" role="group" aria-label="Side container view mode">
              <button type="button" class="ws-switch-btn" data-view-mode="panel">Panel</button>
              <button type="button" class="ws-switch-btn is-active" data-view-mode="split">Split</button>
              <button type="button" class="ws-switch-btn" data-view-mode="canvas">Canvas</button>
            </div>
            <button type="button" class="ws-icon-btn" id="wsSideCloseBtn" title="Collapse Side Container (H)">×</button>
          </div>
        </header>

        <div class="ws-flow-bar" aria-label="Creativity flow stages">
          <button type="button" class="ws-flow-pill" data-flow-step="inspo"><span>1</span>Inspo</button>
          <button type="button" class="ws-flow-pill is-active" data-flow-step="compose"><span>2</span>Compose</button>
          <button type="button" class="ws-flow-pill" data-flow-step="stage"><span>3</span>Stage</button>
          <button type="button" class="ws-flow-pill" data-flow-step="direct"><span>4</span>Direct</button>
          <button type="button" class="ws-flow-pill ws-flow-play" data-flow-step="play">▶ Play</button>
        </div>

        <div class="ws-side-body" id="wsSideBody"></div>
      </aside>

      <div class="ws-splitter" id="wsSplitter" role="separator" aria-orientation="vertical" title="Drag to resize side container"></div>

      <main class="ws-viewport" id="wsViewport">
        <div class="ws-viewport-hud">
          <div class="ws-vp-left">
            <button type="button" class="ws-vp-pill ws-vp-accent" id="wsExpandSideBtn" hidden>Open Studio (H)</button>
            <div class="ws-vp-badge">
              <strong>ATELIER XR</strong>
              <span id="wsBrandStatus">Astrolabe • Studio</span>
            </div>
          </div>
          <div class="ws-vp-right">
            <span class="ws-vp-hint">Drag to Orbit • Scroll to Zoom • Drop Images Anywhere</span>
            <button type="button" class="ws-vp-pill ws-vp-accent" id="wsPlayMovieBtn">Play Movie</button>
            <button type="button" class="ws-vp-pill ws-vp-danger" id="wsStopMovieBtn" hidden>Stop Movie</button>
            <button type="button" class="ws-vp-pill" id="wsExportSceneBtn" title="Download current 3D creation as a GLB file">Export Scene</button>
            <button type="button" class="ws-vp-pill" id="wsResetCamBtn">Reset View</button>
          </div>
        </div>

        <div class="ws-armed-banner" id="wsArmedBanner" hidden>
          <span id="wsArmedBannerText">Click anywhere on the studio floor to place</span>
          <button type="button" class="ws-mini-btn" id="wsCancelArmBtn">Cancel (Esc)</button>
        </div>

        <div class="ws-subtitle" id="wsSubtitle" hidden></div>
        <div class="ws-toast" id="wsToast" hidden></div>
      </main>

      <div class="ws-drop-overlay" id="wsDropOverlay" hidden>
        <div class="ws-drop-overlay-box">
          <strong>Drop Image into Studio</strong>
          <span>Mounts onto a 3D framed backdrop and attaches to miniAgentSam Inspo</span>
        </div>
      </div>
    `;

    this.sideEl = this.root.querySelector('#wsSideContainer') as HTMLElement;
    this.splitterEl = this.root.querySelector('#wsSplitter') as HTMLDivElement;
    this.viewportEl = this.root.querySelector('#wsViewport') as HTMLElement;
    this.sideBodyEl = this.root.querySelector('#wsSideBody') as HTMLDivElement;
    this.subtitleEl = this.root.querySelector('#wsSubtitle') as HTMLDivElement;
    this.toastEl = this.root.querySelector('#wsToast') as HTMLDivElement;
    this.dropOverlayEl = this.root.querySelector('#wsDropOverlay') as HTMLDivElement;
    this.armedBannerEl = this.root.querySelector('#wsArmedBanner') as HTMLDivElement;
    this.armedBannerTextEl = this.root.querySelector('#wsArmedBannerText') as HTMLSpanElement;

    this.attachShellEvents();
    this.attachResizeSplitter();
  }

  private attachShellEvents(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-rail-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.railTab as SideTab;
        if (!next) return;
        if (this.collapsed) this.collapsed = false;
        if (this.viewMode === 'canvas') this.viewMode = 'split';
        this.activeTab = next;
        this.applyLayoutState();
        this.render();
      });
    });

    this.root.querySelector('#wsRailCanvasBtn')?.addEventListener('click', () => {
      if (this.collapsed) this.collapsed = false;
      this.viewMode = this.viewMode === 'canvas' ? 'split' : 'canvas';
      if (this.sideWidth < 460) {
        this.sideWidth = 520;
      }
      this.applyLayoutState();
      this.render();
    });

    this.root.querySelector('#wsFlipSideBtn')?.addEventListener('click', () => {
      this.dockSide = this.dockSide === 'left' ? 'right' : 'left';
      this.applyLayoutState();
    });

    this.root.querySelector('#wsCollapseRailBtn')?.addEventListener('click', () => {
      this.toggleCollapsed();
    });

    this.root.querySelector('#wsSideCloseBtn')?.addEventListener('click', () => {
      this.toggleCollapsed(true);
    });

    this.root.querySelector('#wsExpandSideBtn')?.addEventListener('click', () => {
      this.toggleCollapsed(false);
    });

    this.root.querySelector('#wsEnterXrBtn')?.addEventListener('click', () => {
      this.callbacks.onEnterXr();
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-view-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.viewMode as SideViewMode;
        if (!mode) return;
        this.viewMode = mode;
        if (mode === 'canvas' && this.sideWidth < 500) this.sideWidth = 540;
        if (mode === 'panel' && this.sideWidth > 480) this.sideWidth = 400;
        this.applyLayoutState();
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-flow-step]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const step = btn.dataset.flowStep;
        if (step === 'inspo' || step === 'compose') {
          this.activeTab = 'sam';
          if (this.viewMode === 'canvas') this.viewMode = 'split';
        } else if (step === 'stage') {
          this.activeTab = 'scenery';
          if (this.viewMode === 'canvas') this.viewMode = 'split';
        } else if (step === 'direct') {
          this.activeTab = 'walkthrough';
          if (this.viewMode === 'canvas') this.viewMode = 'split';
        } else if (step === 'play') {
          this.callbacks.onPlayMovie(this.beats, this.activeBeatIndex);
          return;
        }
        this.collapsed = false;
        this.applyLayoutState();
        this.render();
      });
    });

    this.root.querySelector('#wsPlayMovieBtn')?.addEventListener('click', () => {
      this.callbacks.onPlayMovie(this.beats, this.activeBeatIndex);
    });

    this.root.querySelector('#wsStopMovieBtn')?.addEventListener('click', () => {
      this.callbacks.onStopMovie();
    });

    const exportBtn = this.root.querySelector('#wsExportSceneBtn') as HTMLButtonElement | null;
    exportBtn?.addEventListener('click', async () => {
      if (this.isExportingScene) return;
      this.isExportingScene = true;
      exportBtn.disabled = true;
      exportBtn.textContent = 'Exporting...';
      try {
        await this.callbacks.onExportScene();
      } finally {
        this.isExportingScene = false;
        exportBtn.disabled = false;
        exportBtn.textContent = 'Export Scene';
      }
    });

    this.root.querySelector('#wsResetCamBtn')?.addEventListener('click', () => {
      this.autoTour = false;
      this.callbacks.onResetStudio();
      this.renderBody();
    });

    this.root.querySelector('#wsCancelArmBtn')?.addEventListener('click', () => {
      this.callbacks.onCancelArm();
      this.setArmedPlacement(null);
    });
  }

  private attachResizeSplitter(): void {
    let dragging = false;
    let startX = 0;
    let startWidth = this.sideWidth;

    const onPointerDown = (e: PointerEvent) => {
      if (this.collapsed) return;
      dragging = true;
      startX = e.clientX;
      startWidth = this.sideWidth;
      this.splitterEl.classList.add('is-dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const delta = this.dockSide === 'left' ? e.clientX - startX : startX - e.clientX;
      const maxAllowed = Math.min(780, Math.floor(window.innerWidth * 0.62));
      this.sideWidth = Math.max(310, Math.min(maxAllowed, startWidth + delta));
      this.root.style.setProperty('--ws-side-width', `${this.sideWidth}px`);
    };

    const onPointerUp = () => {
      if (!dragging) return;
      dragging = false;
      this.splitterEl.classList.remove('is-dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    this.splitterEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    this.cleanupDrag = () => {
      this.splitterEl.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }

  private applyLayoutState(): void {
    this.root.style.setProperty('--ws-side-width', `${this.sideWidth}px`);
    this.root.classList.toggle('is-dock-right', this.dockSide === 'right');
    this.root.classList.toggle('is-side-collapsed', this.collapsed);

    this.sideEl.hidden = this.collapsed;
    this.splitterEl.hidden = this.collapsed;

    const expandBtn = this.root.querySelector('#wsExpandSideBtn') as HTMLButtonElement;
    if (expandBtn) expandBtn.hidden = !this.collapsed;

    const railHideBtn = this.root.querySelector('#wsCollapseRailBtn');
    const railHideSpan = railHideBtn?.querySelector('span');
    if (railHideSpan) railHideSpan.textContent = this.collapsed ? 'Open' : 'Hide';
  }

  public toggleCollapsed(force?: boolean): void {
    this.collapsed = force !== undefined ? force : !this.collapsed;
    this.applyLayoutState();
  }

  public setDropOverlayVisible(visible: boolean): void {
    this.dropOverlayEl.hidden = !visible;
  }

  public showToast(message: string, durationMs = 3200): void {
    this.toastEl.textContent = message;
    this.toastEl.hidden = false;
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.hidden = true;
      this.toastTimer = null;
    }, durationMs);
  }

  public setSubtitle(text: string | null): void {
    if (!text) {
      this.subtitleEl.hidden = true;
      this.subtitleEl.textContent = '';
      return;
    }
    this.subtitleEl.textContent = text;
    this.subtitleEl.hidden = false;
  }

  public setArmedPlacement(label: string | null): void {
    if (!label) {
      this.armedBannerEl.hidden = true;
      return;
    }
    this.armedBannerTextEl.textContent = `Placement armed: Click anywhere on the studio floor to drop "${label}"`;
    this.armedBannerEl.hidden = false;
  }

  public addDroppedImage(asset: DroppedImageAsset): void {
    this.droppedImages.unshift(asset);
    if (this.droppedImages.length > 6) {
      this.droppedImages = this.droppedImages.slice(0, 6);
    }
    this.render();
  }

  public syncSubject(id: StudioSubjectId): void {
    this.activeSubject = id;
    this.updateBrandStatus();
    if (this.activeTab === 'scenery' || this.viewMode !== 'panel') this.renderBody();
  }

  public syncFinish(id: FinishId): void {
    this.activeFinish = id;
    if (this.activeTab === 'scenery' || this.viewMode !== 'panel') this.renderBody();
  }

  public syncMood(id: AtmosphereMoodId): void {
    this.activeMood = id;
    this.updateBrandStatus();
    if (this.activeTab === 'scenery' || this.activeTab === 'lighting' || this.viewMode !== 'panel') {
      this.renderBody();
    }
  }

  public syncLightingState(state: DynamicLightingState): void {
    this.lightingState = { ...state };
    if (this.activeTab === 'lighting') {
      this.renderBody();
    }
  }

  public syncBrushState(enabled: boolean, strokeCount: number): void {
    this.brushEnabled = enabled;
    this.strokeCount = strokeCount;
    if (this.activeTab === 'scenery') this.renderBody();
  }

  public syncSelection(label: string | null, totalCount: number): void {
    this.selectedPropLabel = label;
    this.sceneryCount = totalCount;
    if (this.activeTab === 'scenery' || this.viewMode !== 'panel') this.renderBody();
  }

  public setMoviePlaybackState(playing: boolean, beatIndex = -1): void {
    this.isPlayingMovie = playing;
    this.playingBeatIndex = beatIndex;
    if (playing && beatIndex >= 0 && beatIndex < this.beats.length) {
      this.activeBeatIndex = beatIndex;
    }
    this.renderHeaderState();
    this.renderBody();
  }

  public setStandaloneVoiceState(
    speaking: boolean,
    hasDownload: boolean,
    scriptText?: string
  ): void {
    this.isSpeakingStandalone = speaking;
    this.hasAudioDownload = hasDownload;
    if (scriptText !== undefined) {
      this.voiceScript = scriptText;
    }
    if (this.activeTab === 'walkthrough') this.renderBody();
  }

  public syncStandaloneScript(scriptText: string): void {
    this.voiceScript = scriptText;
    if (this.activeTab === 'walkthrough') this.renderBody();
  }

  private updateBrandStatus(): void {
    const el = this.root.querySelector('#wsBrandStatus');
    if (!el) return;
    const subj = SUBJECT_LIST.find((s) => s.id === this.activeSubject)?.label || 'Studio';
    const mood = ATMOSPHERE_LIST.find((m) => m.id === this.activeMood)?.label || 'Studio';
    el.textContent = `${subj} • ${mood}`;
  }

  private renderHeaderState(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-rail-tab]').forEach((btn) => {
      const active = this.viewMode !== 'canvas' && btn.dataset.railTab === this.activeTab;
      btn.classList.toggle('is-active', active);
    });
    this.root
      .querySelector('#wsRailCanvasBtn')
      ?.classList.toggle('is-active', this.viewMode === 'canvas');

    this.root.querySelectorAll<HTMLButtonElement>('[data-view-mode]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.viewMode === this.viewMode);
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-flow-step]').forEach((btn) => {
      const step = btn.dataset.flowStep;
      const isActive =
        (step === 'compose' && this.activeTab === 'sam') ||
        (step === 'stage' && (this.activeTab === 'scenery' || this.activeTab === 'lighting')) ||
        (step === 'direct' && this.activeTab === 'walkthrough');
      btn.classList.toggle('is-active', isActive);
    });

    const titleEl = this.root.querySelector('#wsSideMovieTitle');
    if (titleEl) {
      titleEl.textContent = `${this.movieTitle} • ${this.beats.length} beats`;
    }

    const playBtn = this.root.querySelector('#wsPlayMovieBtn') as HTMLButtonElement;
    const stopBtn = this.root.querySelector('#wsStopMovieBtn') as HTMLButtonElement;
    playBtn.hidden = this.isPlayingMovie;
    stopBtn.hidden = !this.isPlayingMovie;
  }

  private render(): void {
    this.updateBrandStatus();
    this.renderHeaderState();
    this.renderBody();
  }

  private renderBody(): void {
    if (this.viewMode === 'canvas') {
      this.sideBodyEl.innerHTML = `<div class="ws-canvas-well" id="wsCanvasMount"></div>`;
      const mount = this.sideBodyEl.querySelector('#wsCanvasMount') as HTMLDivElement;
      this.renderFlowCanvas(mount);
      return;
    }

    if (this.viewMode === 'split') {
      this.sideBodyEl.innerHTML = `
        <div class="ws-split-top" id="wsPanelMount"></div>
        <div class="ws-canvas-well ws-split-bottom" id="wsCanvasMount"></div>
      `;
      const panelMount = this.sideBodyEl.querySelector('#wsPanelMount') as HTMLDivElement;
      const canvasMount = this.sideBodyEl.querySelector('#wsCanvasMount') as HTMLDivElement;
      this.renderActivePanel(panelMount);
      this.renderFlowCanvas(canvasMount);
      return;
    }

    this.sideBodyEl.innerHTML = `<div class="ws-panel-full" id="wsPanelMount"></div>`;
    const panelMount = this.sideBodyEl.querySelector('#wsPanelMount') as HTMLDivElement;
    this.renderActivePanel(panelMount);
  }

  private renderActivePanel(container: HTMLElement): void {
    if (this.activeTab === 'sam') {
      this.renderSamPanel(container);
    } else if (this.activeTab === 'scenery') {
      this.renderSceneryPanel(container);
    } else if (this.activeTab === 'lighting') {
      this.renderLightingPanel(container);
    } else {
      this.renderWalkthroughPanel(container);
    }
  }

  private renderFlowCanvas(container: HTMLElement): void {
    const subjLabel = SUBJECT_LIST.find((s) => s.id === this.activeSubject)?.label || 'Astrolabe';
    const moodObj = ATMOSPHERE_LIST.find((m) => m.id === this.activeMood) || ATMOSPHERE_LIST[0];

    const inspoThumbs =
      this.droppedImages.length > 0
        ? this.droppedImages
            .map(
              (img) => `
              <button type="button" class="ws-art-thumb" data-canvas-place-img="${escapeHtml(
                img.id
              )}" title="Click to place ${escapeHtml(img.name)} in 3D">
                <img src="${img.dataUrl}" alt="${escapeHtml(img.name)}" referrerpolicy="no-referrer" />
                <span>${escapeHtml(img.name.slice(0, 12))}</span>
              </button>
            `
            )
            .join('')
        : `<span class="ws-muted-note">Drop any image onto the studio to add Inspo artboards.</span>`;

    const beatCardsHtml = this.beats
      .map((b, i) => {
        const moodColor = ATMOSPHERE_LIST.find((m) => m.id === b.mood)?.swatchHex || '#0A84FF';
        const isCurrent = i === this.activeBeatIndex;
        const isPlaying = this.isPlayingMovie && i === this.playingBeatIndex;
        return `
          <div class="ws-artboard ${isCurrent ? 'is-selected' : ''} ${
            isPlaying ? 'is-playing' : ''
          }" data-canvas-beat="${i}">
            <div class="ws-artboard-head">
              <span class="ws-artboard-title">${escapeHtml(b.title)}</span>
              <span class="ws-mood-dot" style="background:${moodColor}" title="Mood: ${escapeHtml(
                b.mood
              )}"></span>
            </div>
            <div class="ws-artboard-tags">
              <span class="ws-tag">${escapeHtml(b.cameraShot)}</span>
              <span class="ws-tag">${escapeHtml(b.transitionType)}</span>
              <span class="ws-tag">${escapeHtml(b.voiceName)}</span>
            </div>
            <p class="ws-artboard-script">${escapeHtml(b.script)}</p>
            <div class="ws-artboard-actions">
              <button type="button" class="ws-mini-btn" data-canvas-preview="${i}">Preview Shot</button>
              <button type="button" class="ws-mini-btn ws-mini-accent" data-canvas-speak="${i}">Speak</button>
            </div>
          </div>
        `;
      })
      .join('');

    container.innerHTML = `
      <div class="ws-canvas-toolbar">
        <span class="ws-canvas-label">CREATIVITY FLOW CANVAS</span>
        <div class="ws-row-gap">
          <button type="button" class="ws-mini-btn" id="wsCanvasAddBeat">+ Beat</button>
          <button type="button" class="ws-mini-btn ws-mini-accent" id="wsCanvasPlayAll">${
            this.isPlayingMovie ? 'Stop Movie' : 'Play Flow'
          }</button>
        </div>
      </div>

      <div class="ws-artboard ws-artboard-meta">
        <div class="ws-artboard-head">
          <span class="ws-artboard-title">00 • Inspo &amp; Stage Anchor</span>
          <span class="ws-tag">${escapeHtml(subjLabel)} • ${escapeHtml(
            moodObj.label
          )} • ${this.sceneryCount} props</span>
        </div>
        <div class="ws-art-thumb-row">${inspoThumbs}</div>
      </div>

      <div class="ws-flow-cards-list">${beatCardsHtml}</div>
    `;

    container.querySelector('#wsCanvasAddBeat')?.addEventListener('click', () => {
      this.appendBlankBeat();
    });

    container.querySelector('#wsCanvasPlayAll')?.addEventListener('click', () => {
      if (this.isPlayingMovie) {
        this.callbacks.onStopMovie();
      } else {
        this.callbacks.onPlayMovie(this.beats, this.activeBeatIndex);
      }
    });

    container.querySelectorAll<HTMLButtonElement>('[data-canvas-place-img]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const asset = this.droppedImages.find((img) => img.id === btn.dataset.canvasPlaceImg);
        if (asset) {
          this.callbacks.onArmImageInScene(asset);
          this.setArmedPlacement(asset.name);
        }
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-canvas-preview]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.canvasPreview);
        if (!Number.isNaN(idx) && this.beats[idx]) {
          this.activeBeatIndex = idx;
          this.callbacks.onPreviewBeat(this.beats[idx]);
          this.render();
        }
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-canvas-speak]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.canvasSpeak);
        if (!Number.isNaN(idx) && this.beats[idx]) {
          this.activeBeatIndex = idx;
          this.callbacks.onPreviewBeat(this.beats[idx]);
          void this.callbacks.onSpeakBeat(this.beats[idx]);
          this.render();
        }
      });
    });

    container.querySelectorAll<HTMLElement>('[data-canvas-beat]').forEach((card) => {
      card.addEventListener('click', () => {
        const idx = Number(card.dataset.canvasBeat);
        if (!Number.isNaN(idx) && this.beats[idx]) {
          this.activeBeatIndex = idx;
          this.callbacks.onPreviewBeat(this.beats[idx]);
          this.render();
        }
      });
    });
  }

  private renderSamPanel(container: HTMLElement): void {
    const beat = this.beats[this.activeBeatIndex] || this.beats[0];

    const beatPillsHtml = this.beats
      .map((b, i) => {
        const isCurrent = i === this.activeBeatIndex;
        const isPlaying = this.isPlayingMovie && i === this.playingBeatIndex;
        return `
          <button type="button" class="ws-beat-pill ${isCurrent ? 'is-active' : ''} ${
            isPlaying ? 'is-playing' : ''
          }" data-beat-index="${i}">
            <strong>${escapeHtml(b.title)}</strong>
            <span>${escapeHtml(b.transitionType)} • ${escapeHtml(b.mood)}</span>
          </button>
        `;
      })
      .join('');

    const thumbsHtml = this.droppedImages
      .map(
        (img) => `
        <div class="ws-thumb-card">
          <img src="${img.dataUrl}" alt="${escapeHtml(img.name)}" referrerpolicy="no-referrer" />
          <div class="ws-thumb-actions">
            <button type="button" class="ws-mini-btn" data-place-img="${escapeHtml(img.id)}">3D</button>
            <button type="button" class="ws-mini-btn" data-remove-img="${escapeHtml(img.id)}">×</button>
          </div>
        </div>
      `
      )
      .join('');

    container.innerHTML = `
      <section class="ws-card">
        <div class="ws-row-between">
          <span class="ws-label">miniAgentSam Composer</span>
          <span class="ws-muted-note">Audio scripts • Transitions • Inspo images</span>
        </div>
        <textarea class="ws-textarea" id="wsPromptInput" rows="2" placeholder="Describe a movie, guided tour, lighting transition, or drop reference images...">${escapeHtml(
          this.promptDraft
        )}</textarea>
        <div class="ws-row-gap">
          <label class="ws-dropzone">
            <input type="file" id="wsFileInput" accept="image/*" multiple hidden />
            <span>+ Drop / Pick Images</span>
          </label>
          <button type="button" class="ws-btn ws-btn-primary" id="wsComposeBtn" ${
            this.isComposing ? 'disabled' : ''
          }>
            ${this.isComposing ? 'Composing...' : 'Compose Story'}
          </button>
        </div>
        ${this.droppedImages.length > 0 ? `<div class="ws-thumb-strip">${thumbsHtml}</div>` : ''}
      </section>

      <section class="ws-card">
        <div class="ws-row-between">
          <span class="ws-label">Storyboard Beats (${this.beats.length})</span>
          <button type="button" class="ws-mini-btn" id="wsAddBeatBtn">+ Add Beat</button>
        </div>
        <div class="ws-beat-strip">${beatPillsHtml}</div>

        ${
          beat
            ? `
          <div class="ws-beat-editor">
            <div class="ws-row-gap">
              <input type="text" class="ws-input ws-flex-1" id="wsBeatTitle" value="${escapeHtml(
                beat.title
              )}" placeholder="Beat title" />
              <button type="button" class="ws-btn ws-btn-primary" id="wsSpeakBeatBtn">Speak</button>
              <button type="button" class="ws-btn ws-btn-ghost" id="wsDeleteBeatBtn" ${
                this.beats.length <= 1 ? 'disabled' : ''
              }>Del</button>
            </div>
            <div class="ws-grid-3">
              <select class="ws-select" id="wsBeatShot" title="Camera Shot">
                ${CAMERA_SHOTS.map(
                  (s) =>
                    `<option value="${s.id}" ${s.id === beat.cameraShot ? 'selected' : ''}>${escapeHtml(
                      s.label
                    )}</option>`
                ).join('')}
              </select>
              <select class="ws-select" id="wsBeatTransition" title="Camera Transition">
                ${TRANSITION_OPTIONS.map(
                  (t) =>
                    `<option value="${t.id}" ${
                      t.id === beat.transitionType ? 'selected' : ''
                    }>${escapeHtml(t.label)}</option>`
                ).join('')}
              </select>
              <select class="ws-select" id="wsBeatMood" title="Atmosphere Mood">
                ${ATMOSPHERE_LIST.map(
                  (m) =>
                    `<option value="${m.id}" ${m.id === beat.mood ? 'selected' : ''}>${escapeHtml(
                      m.label
                    )}</option>`
                ).join('')}
              </select>
            </div>
            <div class="ws-grid-2">
              <select class="ws-select" id="wsBeatMode">
                <option value="single" ${beat.ttsMode === 'single' ? 'selected' : ''}>Single Voice</option>
                <option value="dual" ${beat.ttsMode === 'dual' ? 'selected' : ''}>Dual (Alex &amp; Sam)</option>
              </select>
              <select class="ws-select" id="wsBeatVoice">
                ${VOICE_OPTIONS.map(
                  (v) =>
                    `<option value="${v.name}" ${v.name === beat.voiceName ? 'selected' : ''}>${
                      v.name
                    } (${v.tone})</option>`
                ).join('')}
              </select>
            </div>
            <div class="ws-row-gap">
              <input type="text" class="ws-input ws-flex-1" id="wsBeatStyle" value="${escapeHtml(
                beat.voiceStyle
              )}" placeholder="Voice direction" />
              <label class="ws-inline-slider">
                <span>Explode</span>
                <input type="range" id="wsBeatExplode" min="0" max="1" step="0.05" value="${
                  beat.explodeAmount
                }" />
              </label>
            </div>
            <textarea class="ws-textarea" id="wsBeatScript" rows="2">${escapeHtml(
              beat.script
            )}</textarea>
          </div>
        `
            : ''
        }
      </section>
    `;

    const promptInput = container.querySelector('#wsPromptInput') as HTMLTextAreaElement;
    promptInput.addEventListener('input', () => {
      this.promptDraft = promptInput.value;
    });

    const fileInput = container.querySelector('#wsFileInput') as HTMLInputElement;
    fileInput.addEventListener('change', async () => {
      const files = Array.from(fileInput.files || []);
      for (const file of files) {
        try {
          const asset = await processImageFile(file);
          this.addDroppedImage(asset);
          this.callbacks.onPlaceImageInScene(asset);
        } catch (err) {
          this.showToast(err instanceof Error ? err.message : 'Image load failed');
        }
      }
      fileInput.value = '';
    });

    container.querySelector('#wsComposeBtn')?.addEventListener('click', async () => {
      const prompt = this.promptDraft.trim();
      if (!prompt && this.droppedImages.length === 0) {
        this.showToast('Type a creative prompt or drop an image first.');
        return;
      }
      this.isComposing = true;
      this.renderBody();
      try {
        const result = await this.callbacks.onComposeStory(prompt, this.droppedImages);
        this.movieTitle = result.movieTitle;
        this.beats = result.beats;
        this.activeBeatIndex = 0;
        this.callbacks.onPreviewBeat(this.beats[0]);
        this.showToast(`miniAgentSam composed "${result.movieTitle}"!`);
      } catch (err) {
        this.showToast(err instanceof Error ? err.message : 'Compose failed.');
      } finally {
        this.isComposing = false;
        this.render();
      }
    });

    container.querySelectorAll<HTMLButtonElement>('[data-beat-index]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.beatIndex);
        if (!Number.isNaN(idx) && this.beats[idx]) {
          this.activeBeatIndex = idx;
          this.callbacks.onPreviewBeat(this.beats[idx]);
          this.render();
        }
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-place-img]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const asset = this.droppedImages.find((img) => img.id === btn.dataset.placeImg);
        if (asset) {
          this.callbacks.onArmImageInScene(asset);
          this.setArmedPlacement(asset.name);
        }
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-remove-img]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.removeImg;
        this.droppedImages = this.droppedImages.filter((img) => img.id !== id);
        this.render();
      });
    });

    container.querySelector('#wsAddBeatBtn')?.addEventListener('click', () => {
      this.appendBlankBeat();
    });

    if (beat) {
      const titleEl = container.querySelector('#wsBeatTitle') as HTMLInputElement;
      const shotEl = container.querySelector('#wsBeatShot') as HTMLSelectElement;
      const transEl = container.querySelector('#wsBeatTransition') as HTMLSelectElement;
      const moodEl = container.querySelector('#wsBeatMood') as HTMLSelectElement;
      const modeEl = container.querySelector('#wsBeatMode') as HTMLSelectElement;
      const voiceEl = container.querySelector('#wsBeatVoice') as HTMLSelectElement;
      const styleEl = container.querySelector('#wsBeatStyle') as HTMLInputElement;
      const explodeEl = container.querySelector('#wsBeatExplode') as HTMLInputElement;
      const scriptEl = container.querySelector('#wsBeatScript') as HTMLTextAreaElement;

      titleEl.addEventListener('input', () => {
        beat.title = titleEl.value;
      });
      shotEl.addEventListener('change', () => {
        beat.cameraShot = shotEl.value as CameraShotId;
        this.callbacks.onPreviewBeat(beat);
        if (this.viewMode === 'split') this.render();
      });
      transEl.addEventListener('change', () => {
        beat.transitionType = transEl.value as TransitionType;
        this.callbacks.onPreviewBeat(beat);
        if (this.viewMode === 'split') this.render();
      });
      moodEl.addEventListener('change', () => {
        beat.mood = moodEl.value as AtmosphereMoodId;
        this.callbacks.onPreviewBeat(beat);
        if (this.viewMode === 'split') this.render();
      });
      modeEl.addEventListener('change', () => {
        beat.ttsMode = modeEl.value as TtsMode;
      });
      voiceEl.addEventListener('change', () => {
        beat.voiceName = voiceEl.value as VoiceName;
      });
      styleEl.addEventListener('input', () => {
        beat.voiceStyle = styleEl.value;
      });
      explodeEl.addEventListener('input', () => {
        beat.explodeAmount = Number(explodeEl.value);
        this.callbacks.onExplodeChange(beat.explodeAmount);
      });
      scriptEl.addEventListener('input', () => {
        beat.script = scriptEl.value;
      });

      container.querySelector('#wsSpeakBeatBtn')?.addEventListener('click', () => {
        this.callbacks.onPreviewBeat(beat);
        void this.callbacks.onSpeakBeat(beat);
      });

      container.querySelector('#wsDeleteBeatBtn')?.addEventListener('click', () => {
        if (this.beats.length <= 1) return;
        this.beats.splice(this.activeBeatIndex, 1);
        this.activeBeatIndex = Math.max(0, this.activeBeatIndex - 1);
        this.render();
      });
    }
  }

  private renderSceneryPanel(container: HTMLElement): void {
    container.innerHTML = `
      <section class="ws-card">
        <span class="ws-label">Centerpiece Subject</span>
        <div class="ws-chip-row">
          ${SUBJECT_LIST.map(
            (s) =>
              `<button type="button" class="ws-chip ${
                s.id === this.activeSubject ? 'is-active' : ''
              }" data-subject="${s.id}">${escapeHtml(s.label)}</button>`
          ).join('')}
        </div>
        <span class="ws-label">PBR Finish</span>
        <div class="ws-chip-row">
          ${FINISH_LIST.map(
            (f) =>
              `<button type="button" class="ws-chip ${
                f.id === this.activeFinish ? 'is-active' : ''
              }" data-finish="${f.id}">
                <span class="ws-swatch" style="background:${f.swatchHex}"></span>
                ${escapeHtml(f.label)}
              </button>`
          ).join('')}
        </div>
        <div class="ws-row-between">
          <span class="ws-label">Atmosphere Mood</span>
          <button type="button" class="ws-mini-btn" id="wsJumpLightingBtn">Dynamic Lighting ↗</button>
        </div>
        <div class="ws-chip-row">
          ${ATMOSPHERE_LIST.map(
            (m) =>
              `<button type="button" class="ws-chip ${
                m.id === this.activeMood ? 'is-active' : ''
              }" data-mood="${m.id}">
                <span class="ws-swatch" style="background:${m.swatchHex}"></span>
                ${escapeHtml(m.label)}
              </button>`
          ).join('')}
        </div>
      </section>

      <section class="ws-card">
        <div class="ws-row-between">
          <span class="ws-label">Scenery Maker (${this.sceneryCount} props)</span>
          <span class="ws-muted-note">Click prop in 3D to drag • R rotate</span>
        </div>
        <div class="ws-grid-2">
          ${SCENERY_PROP_OPTIONS.map(
            (p) =>
              `<button type="button" class="ws-btn ws-btn-ghost" data-arm-prop="${p.type}" title="${escapeHtml(
                p.hint
              )}">+ ${escapeHtml(p.label)}</button>`
          ).join('')}
        </div>
        <div class="ws-selection-box">
          <span class="ws-selection-text">${
            this.selectedPropLabel
              ? `Selected: ${escapeHtml(this.selectedPropLabel)}`
              : 'Click any prop in 3D to select & move'
          }</span>
          <div class="ws-row-gap">
            <button type="button" class="ws-mini-btn" id="wsFocusPropBtn" ${
              !this.selectedPropLabel ? 'disabled' : ''
            }>Focus</button>
            <button type="button" class="ws-mini-btn" id="wsRotatePropBtn" ${
              !this.selectedPropLabel ? 'disabled' : ''
            }>Rotate 45°</button>
            <button type="button" class="ws-mini-btn" id="wsDeletePropBtn" ${
              !this.selectedPropLabel ? 'disabled' : ''
            }>Delete</button>
            <button type="button" class="ws-mini-btn" id="wsClearSceneryBtn">Clear</button>
          </div>
        </div>
      </section>

      <section class="ws-card">
        <span class="ws-label">Stage Controls &amp; 3D Brush</span>
        <div class="ws-sliders-col">
          <label class="ws-slider-row">
            <span>Explode View</span>
            <input type="range" id="wsStageExplode" min="0" max="1" step="0.05" value="0" />
          </label>
          <label class="ws-slider-row">
            <span>Turntable Spin</span>
            <input type="range" id="wsStageSpin" min="0" max="1.4" step="0.05" value="0.28" />
          </label>
          <label class="ws-slider-row">
            <span>Key Light Orbit</span>
            <input type="range" id="wsStageLight" min="-1.5" max="2.5" step="0.1" value="0.65" />
          </label>
        </div>
        <div class="ws-row-gap">
          <button type="button" class="ws-btn ws-flex-1 ${
            this.brushEnabled ? 'ws-btn-accent' : 'ws-btn-ghost'
          }" id="wsToggleBrushBtn">
            ${this.brushEnabled ? '3D Brush: ON (Drag canvas)' : '3D Brush: OFF'}
          </button>
          <button type="button" class="ws-btn ws-btn-ghost" id="wsClearBrushBtn">
            Clear (${this.strokeCount})
          </button>
        </div>
      </section>
    `;

    container.querySelectorAll<HTMLButtonElement>('[data-subject]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onSelectSubject(btn.dataset.subject as StudioSubjectId);
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-finish]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onSelectFinish(btn.dataset.finish as FinishId);
      });
    });

    container.querySelector('#wsJumpLightingBtn')?.addEventListener('click', () => {
      this.activeTab = 'lighting';
      if (this.viewMode === 'canvas') this.viewMode = 'split';
      this.render();
    });

    container.querySelectorAll<HTMLButtonElement>('[data-mood]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onSelectMood(btn.dataset.mood as AtmosphereMoodId);
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-arm-prop]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.armProp as SceneryPropType;
        const label = SCENERY_PROP_OPTIONS.find((p) => p.type === type)?.label || type;
        this.callbacks.onArmProp(type);
        this.setArmedPlacement(label);
      });
    });

    container.querySelector('#wsFocusPropBtn')?.addEventListener('click', () => {
      this.callbacks.onFocusSelectedProp();
    });
    container.querySelector('#wsRotatePropBtn')?.addEventListener('click', () => {
      this.callbacks.onRotateSelectedProp();
    });
    container.querySelector('#wsDeletePropBtn')?.addEventListener('click', () => {
      this.callbacks.onDeleteSelectedProp();
    });
    container.querySelector('#wsClearSceneryBtn')?.addEventListener('click', () => {
      this.callbacks.onClearScenery();
    });

    const explodeEl = container.querySelector('#wsStageExplode') as HTMLInputElement;
    const spinEl = container.querySelector('#wsStageSpin') as HTMLInputElement;
    const lightEl = container.querySelector('#wsStageLight') as HTMLInputElement;
    explodeEl.addEventListener('input', () =>
      this.callbacks.onExplodeChange(Number(explodeEl.value))
    );
    spinEl.addEventListener('input', () =>
      this.callbacks.onSpinChange(Number(spinEl.value))
    );
    lightEl.addEventListener('input', () =>
      this.callbacks.onLightAngleChange(Number(lightEl.value))
    );

    container.querySelector('#wsToggleBrushBtn')?.addEventListener('click', () => {
      this.brushEnabled = !this.brushEnabled;
      this.callbacks.onToggleBrush(this.brushEnabled);
      this.renderBody();
    });
    container.querySelector('#wsClearBrushBtn')?.addEventListener('click', () => {
      this.callbacks.onClearBrush();
    });
  }

  private renderLightingPanel(container: HTMLElement): void {
    const s = this.lightingState;
    const angleDeg = Math.round((s.keyAngle * 180) / Math.PI);
    const satPct = Math.round(s.ambientSaturation * 100);
    const previewHex = `hsl(${s.ambientHue}, ${satPct}%, 72%)`;

    container.innerHTML = `
      <section class="ws-card">
        <div class="ws-row-between">
          <span class="ws-label">Dynamic Lighting</span>
          <button type="button" class="ws-mini-btn" id="wsResetLightingBtn">Reset Lighting</button>
        </div>

        <div class="ws-light-controls">
          <label class="ws-light-control">
            <div class="ws-light-head">
              <span>Light Intensity</span>
              <span class="ws-light-value" id="wsValKeyIntensity">${s.keyIntensity.toFixed(2)}</span>
            </div>
            <input type="range" class="ws-range" id="wsLightIntensity" min="0" max="5" step="0.05" value="${s.keyIntensity}" />
          </label>

          <label class="ws-light-control">
            <div class="ws-light-head">
              <span>Ambient Color</span>
              <span class="ws-color-badge">
                <span class="ws-color-dot" id="wsAmbientSwatch" style="background:${previewHex}"></span>
                <span class="ws-light-value" id="wsValAmbientHue">${s.ambientHue}°</span>
              </span>
            </div>
            <input type="range" class="ws-range ws-hue-slider" id="wsAmbientHue" min="0" max="360" step="1" value="${s.ambientHue}" />
          </label>

          <label class="ws-light-control">
            <div class="ws-light-head">
              <span>Ambient Tint</span>
              <span class="ws-light-value" id="wsValAmbientSat">${satPct}%</span>
            </div>
            <input type="range" class="ws-range" id="wsAmbientSat" min="0" max="100" step="1" value="${satPct}" />
          </label>

          <label class="ws-light-control">
            <div class="ws-light-head">
              <span>Ambient Fill</span>
              <span class="ws-light-value" id="wsValAmbientFill">${s.ambientIntensity.toFixed(2)}</span>
            </div>
            <input type="range" class="ws-range" id="wsAmbientFill" min="0" max="2.5" step="0.05" value="${s.ambientIntensity}" />
          </label>

          <label class="ws-light-control">
            <div class="ws-light-head">
              <span>Shadow Softness</span>
              <span class="ws-light-value" id="wsValShadowSoftness">${s.shadowSoftness.toFixed(1)} px</span>
            </div>
            <input type="range" class="ws-range" id="wsShadowSoftness" min="0.5" max="10" step="0.25" value="${s.shadowSoftness}" />
          </label>

          <label class="ws-light-control">
            <div class="ws-light-head">
              <span>Key Light Angle</span>
              <span class="ws-light-value" id="wsValKeyAngle">${angleDeg}°</span>
            </div>
            <input type="range" class="ws-range" id="wsLightOrbit" min="-1.5" max="2.5" step="0.05" value="${s.keyAngle}" />
          </label>
        </div>
      </section>

      <section class="ws-card">
        <span class="ws-label">Atmosphere Mood Presets</span>
        <div class="ws-chip-row">
          ${ATMOSPHERE_LIST.map(
            (m) =>
              `<button type="button" class="ws-chip ${
                m.id === this.activeMood ? 'is-active' : ''
              }" data-light-mood="${m.id}">
                <span class="ws-swatch" style="background:${m.swatchHex}"></span>
                ${escapeHtml(m.label)}
              </button>`
          ).join('')}
        </div>
      </section>
    `;

    const keyIntInput = container.querySelector('#wsLightIntensity') as HTMLInputElement;
    const keyIntVal = container.querySelector('#wsValKeyIntensity') as HTMLSpanElement;
    const hueInput = container.querySelector('#wsAmbientHue') as HTMLInputElement;
    const hueVal = container.querySelector('#wsValAmbientHue') as HTMLSpanElement;
    const satInput = container.querySelector('#wsAmbientSat') as HTMLInputElement;
    const satVal = container.querySelector('#wsValAmbientSat') as HTMLSpanElement;
    const swatchEl = container.querySelector('#wsAmbientSwatch') as HTMLSpanElement;
    const fillInput = container.querySelector('#wsAmbientFill') as HTMLInputElement;
    const fillVal = container.querySelector('#wsValAmbientFill') as HTMLSpanElement;
    const shadowInput = container.querySelector('#wsShadowSoftness') as HTMLInputElement;
    const shadowVal = container.querySelector('#wsValShadowSoftness') as HTMLSpanElement;
    const orbitInput = container.querySelector('#wsLightOrbit') as HTMLInputElement;
    const orbitVal = container.querySelector('#wsValKeyAngle') as HTMLSpanElement;

    const updateAmbient = () => {
      const hue = Number(hueInput.value);
      const satPctVal = Number(satInput.value);
      const sat = satPctVal / 100;
      this.lightingState.ambientHue = hue;
      this.lightingState.ambientSaturation = sat;
      hueVal.textContent = `${hue}°`;
      satVal.textContent = `${satPctVal}%`;
      swatchEl.style.background = `hsl(${hue}, ${satPctVal}%, 72%)`;
      this.callbacks.onAmbientColorChange(hue, sat);
    };

    keyIntInput.addEventListener('input', () => {
      const val = Number(keyIntInput.value);
      this.lightingState.keyIntensity = val;
      keyIntVal.textContent = val.toFixed(2);
      this.callbacks.onKeyIntensityChange(val);
    });

    hueInput.addEventListener('input', updateAmbient);
    satInput.addEventListener('input', updateAmbient);

    fillInput.addEventListener('input', () => {
      const val = Number(fillInput.value);
      this.lightingState.ambientIntensity = val;
      fillVal.textContent = val.toFixed(2);
      this.callbacks.onAmbientIntensityChange(val);
    });

    shadowInput.addEventListener('input', () => {
      const val = Number(shadowInput.value);
      this.lightingState.shadowSoftness = val;
      shadowVal.textContent = `${val.toFixed(1)} px`;
      this.callbacks.onShadowSoftnessChange(val);
    });

    orbitInput.addEventListener('input', () => {
      const val = Number(orbitInput.value);
      this.lightingState.keyAngle = val;
      orbitVal.textContent = `${Math.round((val * 180) / Math.PI)}°`;
      this.callbacks.onLightAngleChange(val);
    });

    container.querySelector('#wsResetLightingBtn')?.addEventListener('click', () => {
      this.callbacks.onResetLighting();
    });

    container.querySelectorAll<HTMLButtonElement>('[data-light-mood]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.callbacks.onSelectMood(btn.dataset.lightMood as AtmosphereMoodId);
      });
    });
  }

  private renderWalkthroughPanel(container: HTMLElement): void {
    container.innerHTML = `
      <section class="ws-card">
        <div class="ws-row-between">
          <span class="ws-label">Camera Director</span>
          <select class="ws-select" id="wsManualTransition">
            ${TRANSITION_OPTIONS.map(
              (t) =>
                `<option value="${t.id}" ${
                  t.id === this.manualTransition ? 'selected' : ''
                }>${escapeHtml(t.label)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="ws-chip-row">
          ${CAMERA_SHOTS.map(
            (s) =>
              `<button type="button" class="ws-chip" data-shot="${s.id}">${escapeHtml(
                s.label
              )}</button>`
          ).join('')}
        </div>
        <div class="ws-row-gap">
          <button type="button" class="ws-btn ws-flex-1 ${
            this.autoTour ? 'ws-btn-accent' : 'ws-btn-ghost'
          }" id="wsAutoTourBtn">
            ${this.autoTour ? 'Auto-Orbit Tour: ON' : 'Auto-Orbit Tour: OFF'}
          </button>
          <button type="button" class="ws-btn ws-btn-ghost" id="wsResetViewBtn">
            Reset Studio
          </button>
        </div>
      </section>

      <section class="ws-card">
        <span class="ws-label">Voice &amp; Sound Studio (gemini-3.8-flash-tts)</span>
        <div class="ws-grid-2">
          <select class="ws-select" id="wsVoiceMode">
            <option value="single" ${this.voiceMode === 'single' ? 'selected' : ''}>Single Narrator</option>
            <option value="dual" ${this.voiceMode === 'dual' ? 'selected' : ''}>Dual (Alex &amp; Sam)</option>
          </select>
          <select class="ws-select" id="wsVoiceSelect">
            ${VOICE_OPTIONS.map(
              (v) =>
                `<option value="${v.name}" ${v.name === this.voiceName ? 'selected' : ''}>${
                  v.name
                } — ${v.tone}</option>`
            ).join('')}
          </select>
        </div>
        <div class="ws-row-gap">
          <select class="ws-select" id="wsStylePreset">
            <option value="">Preset...</option>
            ${DEFAULT_STYLE_PRESETS.map(
              (p) => `<option value="${escapeHtml(p.style)}">${escapeHtml(p.label)}</option>`
            ).join('')}
          </select>
          <input type="text" class="ws-input ws-flex-1" id="wsVoiceStyleInput" value="${escapeHtml(
            this.voiceStyle
          )}" placeholder="Voice style direction" />
        </div>
        <textarea class="ws-textarea" id="wsVoiceScriptInput" rows="3" placeholder="Write voiceover script...">${escapeHtml(
          this.voiceScript
        )}</textarea>
        <div class="ws-row-gap">
          <button type="button" class="ws-mini-btn" data-tag=" <breath> ">+&lt;breath&gt;</button>
          <button type="button" class="ws-mini-btn" data-tag=" <laugh> ">+&lt;laugh&gt;</button>
          <button type="button" class="ws-mini-btn" data-tag=" |yeah| ">+|yeah|</button>
          <button type="button" class="ws-mini-btn" id="wsAiWriteBtn">AI Write</button>
        </div>
        <div class="ws-row-gap">
          <button type="button" class="ws-btn ws-btn-primary ws-flex-1" id="wsSpeakStandaloneBtn" ${
            this.isSpeakingStandalone ? 'disabled' : ''
          }>${this.isSpeakingStandalone ? 'Speaking...' : 'Speak Scene'}</button>
          <button type="button" class="ws-btn ws-btn-ghost" id="wsStopStandaloneBtn" ${
            !this.isSpeakingStandalone ? 'disabled' : ''
          }>Stop</button>
          <button type="button" class="ws-btn ws-btn-ghost" id="wsDownloadWavBtn" ${
            !this.hasAudioDownload ? 'disabled' : ''
          }>.WAV</button>
        </div>
      </section>
    `;

    const transEl = container.querySelector('#wsManualTransition') as HTMLSelectElement;
    transEl.addEventListener('change', () => {
      this.manualTransition = transEl.value as TransitionType;
    });

    container.querySelectorAll<HTMLButtonElement>('[data-shot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.autoTour = false;
        this.callbacks.onCameraShot(btn.dataset.shot as CameraShotId, this.manualTransition);
        this.renderBody();
      });
    });

    container.querySelector('#wsAutoTourBtn')?.addEventListener('click', () => {
      this.autoTour = !this.autoTour;
      this.callbacks.onToggleAutoTour(this.autoTour);
      this.renderBody();
    });

    container.querySelector('#wsResetViewBtn')?.addEventListener('click', () => {
      this.autoTour = false;
      this.callbacks.onResetStudio();
      this.renderBody();
    });

    const modeEl = container.querySelector('#wsVoiceMode') as HTMLSelectElement;
    const voiceEl = container.querySelector('#wsVoiceSelect') as HTMLSelectElement;
    const presetEl = container.querySelector('#wsStylePreset') as HTMLSelectElement;
    const styleInput = container.querySelector('#wsVoiceStyleInput') as HTMLInputElement;
    const scriptInput = container.querySelector('#wsVoiceScriptInput') as HTMLTextAreaElement;

    modeEl.addEventListener('change', () => {
      this.voiceMode = modeEl.value as TtsMode;
    });
    voiceEl.addEventListener('change', () => {
      this.voiceName = voiceEl.value as VoiceName;
    });
    presetEl.addEventListener('change', () => {
      if (presetEl.value) {
        this.voiceStyle = presetEl.value;
        styleInput.value = presetEl.value;
      }
    });
    styleInput.addEventListener('input', () => {
      this.voiceStyle = styleInput.value;
    });
    scriptInput.addEventListener('input', () => {
      this.voiceScript = scriptInput.value;
    });

    container.querySelectorAll<HTMLButtonElement>('[data-tag]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag || '';
        this.voiceScript = (this.voiceScript + tag).trimStart();
        scriptInput.value = this.voiceScript;
      });
    });

    container.querySelector('#wsAiWriteBtn')?.addEventListener('click', async () => {
      try {
        const script = await this.callbacks.onAssistScript(this.voiceMode);
        this.voiceScript = script;
        scriptInput.value = script;
      } catch (err) {
        this.showToast(err instanceof Error ? err.message : 'AI write failed');
      }
    });

    container.querySelector('#wsSpeakStandaloneBtn')?.addEventListener('click', () => {
      const text = this.voiceScript.trim();
      if (!text) {
        this.showToast('Please enter a script first.');
        return;
      }
      if (this.voiceMode === 'dual') {
        void this.callbacks.onSynthesizeStandalone({
          mode: 'dual',
          text,
          speakerA: 'Alex',
          speakerB: 'Sam',
          voiceA: this.voiceName === 'Puck' ? 'Kore' : 'Puck',
          voiceB: this.voiceName,
          styleA: this.voiceStyle || 'Enthusiastic creative director',
          styleB: 'Curious studio engineer',
        });
      } else {
        void this.callbacks.onSynthesizeStandalone({
          mode: 'single',
          text,
          voiceName: this.voiceName,
          stylePrompt: this.voiceStyle,
        });
      }
    });

    container.querySelector('#wsStopStandaloneBtn')?.addEventListener('click', () => {
      this.callbacks.onStopAudio();
    });
    container.querySelector('#wsDownloadWavBtn')?.addEventListener('click', () => {
      this.callbacks.onDownloadAudio();
    });
  }

  private appendBlankBeat(): void {
    const nextNum = this.beats.length + 1;
    const newBeat: MovieBeat = {
      id: `beat-${Date.now()}`,
      title: `${String(nextNum).padStart(2, '0')} • New Scene`,
      script: 'Gliding into the next chapter of our spatial story.',
      ttsMode: 'single',
      voiceName: 'Kore',
      voiceStyle: 'Warm cinematic narrator',
      cameraShot: 'hero',
      transitionType: 'glide',
      mood: this.activeMood,
      explodeAmount: 0,
    };
    this.beats.push(newBeat);
    this.activeBeatIndex = this.beats.length - 1;
    this.render();
  }

  public dispose(): void {
    this.cleanupDrag?.();
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.root.remove();
  }
}
