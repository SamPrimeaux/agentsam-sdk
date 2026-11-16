import * as THREE from 'three';
import * as xb from 'xrblocks';
import { FINISH_MAP, SUBJECT_MAP } from './constants.ts';
import { AudioEngine } from './services/audioEngine.ts';
import { exportSceneAsGlb } from './services/sceneExportService.ts';
import {
  assistScript,
  composeWithMiniAgentSam,
  downloadWavBase64,
  synthesizeSpeech,
} from './services/ttsService.ts';
import { CameraDirector } from './studio/cameraDirector.ts';
import { STAGE_POSITION, StudioStage } from './studio/environment.ts';
import { SceneryManager } from './studio/scenery.ts';
import { SpatialBrush } from './studio/sculptBrush.ts';
import type {
  AtmosphereMoodId,
  CameraShotId,
  DroppedImageAsset,
  FinishId,
  MovieBeat,
  SceneryPropType,
  StudioSubjectId,
  TransitionType,
  TtsMode,
  TtsRequest,
} from './types.ts';
import { StudioDeckCard } from './ui/StudioDeckCard.ts';
import { StudioHudOverlay } from './ui/StudioHudOverlay.ts';
import { VoiceStudioCard } from './ui/VoiceStudioCard.ts';
import { MiniAgentSam, processImageFile } from './web/MiniAgentSam.ts';

const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _paintPlane = new THREE.Plane();
const _paintNormal = new THREE.Vector3();
const _paintPoint = new THREE.Vector3();

export class StudioApp extends xb.Script {
  private audioEngine = new AudioEngine();
  private stage = new StudioStage();
  private cameraDirector = new CameraDirector();
  private scenery!: SceneryManager;
  private brush!: SpatialBrush;

  // Spatial XR UI cards (visible when entering XR / simulator, kept clear on desktop web)
  private deckCard!: StudioDeckCard;
  private voiceCard!: VoiceStudioCard;
  private hudOverlay!: StudioHudOverlay;
  private deckTransition!: xb.VisibilityTransition;
  private voiceTransition!: xb.VisibilityTransition;

  // Web-friendly creative studio & miniAgentSam composer
  private miniSam!: MiniAgentSam;

  private activeSubjectId: StudioSubjectId = 'astrolabe';
  private activeFinishId: FinishId = 'gold';
  private activeMoodId: AtmosphereMoodId = 'studio';
  private lastAudioBase64: string | null = null;
  private uiValidated = false;
  private framesSinceInit = 0;

  // Desktop pointer/drag/paint tracking
  private pointerDownPos = new THREE.Vector2();
  private draggingProp = false;
  private paintingWeb = false;
  private dragDepth = 0;
  private movieRunToken = 0;
  private cleanupListeners: Array<() => void> = [];

  init(): void {
    xb.ui.theme = 'grayGlass';

    this.add(this.stage);
    this.stage.init();
    this.cameraDirector.init(this.stage.isSoftwareGl);

    this.scenery = new SceneryManager(this.stage.materials, this.stage.textures, {
      onSelectionChange: (item, count) => {
        this.miniSam?.syncSelection(item ? item.label : null, count);
      },
      onPlacementComplete: () => {
        this.miniSam?.setArmedPlacement(null);
        this.audioEngine.playStudioCue('select');
      },
    });
    this.add(this.scenery);
    this.scenery.seedStarterScenery();

    this.brush = new SpatialBrush(this.stage.materials.paintRibbon, (count) => {
      this.deckCard?.setStrokeCount(count);
      this.miniSam?.syncBrushState(this.brush.enabled, count);
    });
    this.add(this.brush);

    this.setupXrSpatialUi();
    this.setupMiniAgentSam();
    this.mountCanvasIntoViewport();
    this.attachCanvasInteractions();
    this.attachGlobalDropAndKeys();

    this.audioEngine.playStudioCue('ready');
  }

  private mountCanvasIntoViewport(): void {
    const renderer = xb.core.renderer;
    const viewport = this.miniSam.getViewportElement();
    if (!renderer || !('domElement' in renderer) || !renderer.domElement || !viewport) {
      return;
    }

    const canvas = renderer.domElement;
    if (canvas.parentElement !== viewport) {
      viewport.prepend(canvas);
    }

    const syncViewportSize = () => {
      if (xb.core.renderer?.xr?.isPresenting) return;
      const camera = xb.core.camera as THREE.PerspectiveCamera | undefined;
      const w = Math.max(1, Math.floor(viewport.clientWidth));
      const h = Math.max(1, Math.floor(viewport.clientHeight));
      if (camera && 'aspect' in camera) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      if ('setSize' in renderer && typeof renderer.setSize === 'function') {
        renderer.setSize(w, h, false);
      }
    };

    const observer = new ResizeObserver(() => syncViewportSize());
    observer.observe(viewport);

    const onWindowResize = () => {
      window.requestAnimationFrame(syncViewportSize);
    };
    window.addEventListener('resize', onWindowResize);
    syncViewportSize();

    this.cleanupListeners.push(() => {
      observer.disconnect();
      window.removeEventListener('resize', onWindowResize);
    });
  }

  private setupXrSpatialUi(): void {
    this.deckCard = new StudioDeckCard({
      onSelectSubject: (id) => this.handleSelectSubject(id),
      onSelectFinish: (id) => this.handleSelectFinish(id),
      onExplodeChange: (value) => this.stage.setExplodeAmount(value),
      onSpinChange: (value) => this.stage.setSpinSpeed(value),
      onLightAngleChange: (rad) => this.stage.setKeyLightAngle(rad),
      onToggleBrush: (enabled) => this.handleToggleBrush(enabled),
      onClearBrush: () => this.handleClearBrush(),
      onResetStudio: () => this.handleResetStudio(),
    });
    this.deckCard.position.set(-0.78, 1.38, -1.08);
    this.deckCard.rotation.y = 0.38;
    this.deckTransition = new xb.VisibilityTransition({ duration: 0.24 });
    this.deckCard.add(this.deckTransition);
    this.deckCard.visible = false;
    this.add(this.deckCard);

    this.voiceCard = new VoiceStudioCard({
      onSynthesize: (req) => this.handleSynthesize(req),
      onStopAudio: () => this.handleStopAudio(),
      onDownloadAudio: () => this.handleDownloadAudio(),
      onAssistScript: (mode) => this.handleAssistScript(mode),
    });
    this.voiceCard.position.set(0.8, 1.38, -1.08);
    this.voiceCard.rotation.y = -0.38;
    this.voiceTransition = new xb.VisibilityTransition({ duration: 0.24 });
    this.voiceCard.add(this.voiceTransition);
    this.voiceCard.visible = false;
    this.add(this.voiceCard);

    this.hudOverlay = new StudioHudOverlay({
      onTogglePanels: (visible) => this.setPanelsVisible(visible),
      onQuickSpeak: () => void this.handleQuickSpeak(),
    });
    this.hudOverlay.visible = false;
    this.add(this.hudOverlay);
    this.refreshHudSummary();
  }

  private setupMiniAgentSam(): void {
    this.miniSam = new MiniAgentSam({
      onSelectSubject: (id) => this.handleSelectSubject(id),
      onSelectFinish: (id) => this.handleSelectFinish(id),
      onSelectMood: (id) => this.handleSelectMood(id),
      onExplodeChange: (value) => this.stage.setExplodeAmount(value),
      onSpinChange: (value) => this.stage.setSpinSpeed(value),
      onLightAngleChange: (rad) => this.stage.setKeyLightAngle(rad),
      onKeyIntensityChange: (value) => this.stage.setKeyLightIntensity(value),
      onAmbientColorChange: (hue, sat) => this.stage.setAmbientColorHsl(hue, sat),
      onAmbientIntensityChange: (value) => this.stage.setAmbientIntensity(value),
      onShadowSoftnessChange: (value) => this.stage.setShadowSoftness(value),
      onResetLighting: () => {
        this.stage.resetLighting();
        this.miniSam.syncLightingState(this.stage.getLightingState());
        this.audioEngine.playStudioCue('select');
      },
      onToggleBrush: (enabled) => this.handleToggleBrush(enabled),
      onClearBrush: () => this.handleClearBrush(),
      onResetStudio: () => this.handleResetStudio(),
      onArmProp: (propType: SceneryPropType) => {
        this.scenery.armPropPlacement(propType);
      },
      onCancelArm: () => {
        this.scenery.clearArmedPlacement();
      },
      onPlaceImageInScene: (asset) => {
        const item = this.scenery.placeImageBackdrop(asset);
        this.cameraDirector.focusOnWorldPoint(item.group.position, 'glide');
        this.audioEngine.playStudioCue('ready');
        this.miniSam.showToast(`Placed 3D backdrop: ${asset.name}`);
      },
      onArmImageInScene: (asset) => {
        this.scenery.armImagePlacement(asset);
      },
      onRotateSelectedProp: () => {
        this.scenery.rotateSelected(Math.PI / 4);
        this.audioEngine.playStudioCue('select');
      },
      onDeleteSelectedProp: () => {
        this.scenery.deleteSelected();
        this.audioEngine.playStudioCue('select');
      },
      onFocusSelectedProp: () => {
        const sel = this.scenery.getSelectedItem();
        if (sel) {
          this.cameraDirector.focusOnWorldPoint(sel.group.position, 'glide');
        }
      },
      onClearScenery: () => {
        this.scenery.clearAll();
        this.audioEngine.playStudioCue('select');
      },
      onCameraShot: (shot: CameraShotId, transition: TransitionType) => {
        this.stage.triggerTransitionEffect(transition);
        this.cameraDirector.goToShot(shot, transition);
        this.audioEngine.playStudioCue('switch');
      },
      onToggleAutoTour: (enabled) => {
        this.cameraDirector.setAutoTour(enabled);
      },
      onPreviewBeat: (beat) => this.applyBeatVisuals(beat),
      onComposeStory: async (prompt, images) => {
        return composeWithMiniAgentSam({
          prompt,
          subjectId: this.activeSubjectId,
          mood: this.activeMoodId,
          images,
        });
      },
      onPlayMovie: (beats, startIndex) => void this.playMovie(beats, startIndex),
      onStopMovie: () => this.stopMovie(),
      onSpeakBeat: async (beat) => {
        this.miniSam.setSubtitle(`${beat.title} — ${beat.script}`);
        const req = this.buildTtsRequestForBeat(beat);
        await this.handleSynthesize(req);
      },
      onSynthesizeStandalone: (req) => this.handleSynthesize(req),
      onStopAudio: () => this.handleStopAudio(),
      onDownloadAudio: () => this.handleDownloadAudio(),
      onAssistScript: (mode) => this.handleAssistScript(mode),
      onExportScene: () => this.handleExportScene(),
      onEnterXr: () => this.handleEnterXr(),
    });

    this.miniSam.syncSelection(null, this.scenery.getItemCount());
    this.miniSam.syncStandaloneScript(SUBJECT_MAP[this.activeSubjectId].defaultSingleScript);
    this.miniSam.syncLightingState(this.stage.getLightingState());
  }

  private attachCanvasInteractions(): void {
    const renderer = xb.core.renderer;
    if (!renderer || !('domElement' in renderer) || !renderer.domElement) return;
    const dom = renderer.domElement;

    const getWebBrushPoint = (clientX: number, clientY: number): THREE.Vector3 | null => {
      const camera = xb.core.camera;
      if (!camera) return null;
      const rect = dom.getBoundingClientRect();
      _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_ndc, camera);
      camera.getWorldDirection(_paintNormal).negate();
      _paintPlane.setFromNormalAndCoplanarPoint(
        _paintNormal,
        new THREE.Vector3(STAGE_POSITION.x, 1.15, STAGE_POSITION.z)
      );
      const hit = _raycaster.ray.intersectPlane(_paintPlane, _paintPoint);
      return hit ? hit.clone() : null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (xb.core.renderer?.xr?.isPresenting) return;

      this.pointerDownPos.set(e.clientX, e.clientY);

      if (this.brush.enabled) {
        const pt = getWebBrushPoint(e.clientX, e.clientY);
        if (pt) {
          this.paintingWeb = true;
          this.cameraDirector.setDraggingProp(true);
          this.brush.startWebStroke(pt);
        }
        return;
      }

      if (this.scenery.isPlacementArmed) {
        this.cameraDirector.setDraggingProp(true);
        return;
      }

      const hit = this.scenery.hitTestProp(e.clientX, e.clientY);
      if (hit) {
        this.scenery.selectItem(hit.id);
        this.draggingProp = true;
        this.cameraDirector.setDraggingProp(true);
        this.audioEngine.playStudioCue('select');
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (this.paintingWeb) {
        const pt = getWebBrushPoint(e.clientX, e.clientY);
        if (pt) this.brush.moveWebStroke(pt);
        return;
      }
      if (this.draggingProp) {
        this.scenery.moveSelectedToScreenPoint(e.clientX, e.clientY);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const moved = Math.hypot(
        e.clientX - this.pointerDownPos.x,
        e.clientY - this.pointerDownPos.y
      );

      if (this.paintingWeb) {
        this.paintingWeb = false;
        this.brush.endWebStroke();
        this.cameraDirector.setDraggingProp(false);
        return;
      }

      if (this.draggingProp) {
        this.draggingProp = false;
        this.cameraDirector.setDraggingProp(false);
        return;
      }

      if (this.scenery.isPlacementArmed) {
        this.cameraDirector.setDraggingProp(false);
        if (moved < 8) {
          this.scenery.handleCanvasClick(e.clientX, e.clientY);
        }
        return;
      }

      if (moved < 5) {
        const hit = this.scenery.hitTestProp(e.clientX, e.clientY);
        if (!hit) {
          this.scenery.selectItem(null);
        }
      }
    };

    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    this.cleanupListeners.push(() => {
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    });
  }

  private attachGlobalDropAndKeys(): void {
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      this.dragDepth++;
      this.miniSam.setDropOverlayVisible(true);
    };

    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
    };

    const onDragLeave = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      this.dragDepth = Math.max(0, this.dragDepth - 1);
      if (this.dragDepth === 0) {
        this.miniSam.setDropOverlayVisible(false);
      }
    };

    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      this.dragDepth = 0;
      this.miniSam.setDropOverlayVisible(false);
      const files = Array.from(e.dataTransfer?.files || []).filter((f) =>
        f.type.startsWith('image/')
      );
      if (files.length === 0) return;

      for (const file of files) {
        try {
          const asset = await processImageFile(file);
          this.miniSam.addDroppedImage(asset);
          const item = this.scenery.placeImageBackdrop(asset);
          this.cameraDirector.focusOnWorldPoint(item.group.position, 'glide');
          this.audioEngine.playStudioCue('ready');
          this.miniSam.showToast(`Placed 3D image backdrop: ${asset.name}`);
        } catch (err) {
          this.miniSam.showToast(
            err instanceof Error ? err.message : 'Could not load dropped image.'
          );
        }
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'h' || e.key === 'H') {
        this.miniSam.toggleCollapsed();
      } else if (e.key === 'r' || e.key === 'R') {
        this.scenery.rotateSelected(Math.PI / 4);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        this.scenery.deleteSelected();
      } else if (e.key === 'Escape') {
        this.scenery.clearArmedPlacement();
        this.miniSam.setArmedPlacement(null);
        this.stopMovie();
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('keydown', onKeyDown);

    this.cleanupListeners.push(() => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('keydown', onKeyDown);
    });
  }

  onXRSessionStarted(): void {
    this.deckCard.visible = true;
    this.voiceCard.visible = true;
    this.hudOverlay.visible = true;
  }

  onSimulatorStarted(): void {
    // Keep desktop viewport unobstructed; XR cards only appear in actual WebXR sessions.
  }

  onXRSessionEnded(): void {
    this.deckCard.visible = false;
    this.voiceCard.visible = false;
    this.hudOverlay.visible = false;
  }

  private handleEnterXr(): void {
    const manager = xb.core.webXRSessionManager;
    if (manager && manager.isXRSupported()) {
      manager.startSession();
      return;
    }
    this.miniSam.showToast(
      'No XR headset detected on this browser — full web 3D studio mode is already active!'
    );
  }

  private handleSelectSubject(id: StudioSubjectId): void {
    this.activeSubjectId = id;
    this.stage.setSubject(id);
    this.deckCard.setActiveSubject(id);
    this.voiceCard.syncSubjectScript(id);
    this.miniSam.syncSubject(id);
    this.miniSam.syncStandaloneScript(SUBJECT_MAP[id].defaultSingleScript);
    this.refreshHudSummary();
    this.audioEngine.playStudioCue('switch');
  }

  private handleSelectFinish(id: FinishId): void {
    this.activeFinishId = id;
    this.stage.setFinish(id);
    this.deckCard.setActiveFinish(id);
    this.miniSam.syncFinish(id);
    this.refreshHudSummary();
    this.audioEngine.playStudioCue('select');
  }

  private handleSelectMood(id: AtmosphereMoodId): void {
    this.activeMoodId = id;
    this.stage.setAtmosphereMood(id);
    this.miniSam.syncLightingState(this.stage.getLightingState());
    this.miniSam.syncMood(id);
    this.audioEngine.playStudioCue('select');
  }

  private handleToggleBrush(enabled: boolean): void {
    this.brush.setEnabled(enabled);
    this.miniSam.syncBrushState(enabled, this.brush.strokeCount);
    this.audioEngine.playStudioCue('paint');
  }

  private handleClearBrush(): void {
    this.brush.clearStrokes();
    this.miniSam.syncBrushState(this.brush.enabled, 0);
    this.audioEngine.playStudioCue('select');
  }

  private handleResetStudio(): void {
    this.stage.resetViewPose();
    this.activeMoodId = 'studio';
    this.miniSam.syncLightingState(this.stage.getLightingState());
    this.miniSam.syncMood('studio');
    this.cameraDirector.goToShot('establishing', 'glide');
    this.deckCard.resetSliders();
    this.deckCard.position.set(-0.78, 1.38, -1.08);
    this.deckCard.rotation.set(0, 0.38, 0);
    this.voiceCard.position.set(0.8, 1.38, -1.08);
    this.voiceCard.rotation.set(0, -0.38, 0);
    this.audioEngine.playStudioCue('ready');
  }

  private setPanelsVisible(visible: boolean): void {
    if (visible) {
      this.deckTransition.show();
      this.voiceTransition.show();
    } else {
      this.deckTransition.hide();
      this.voiceTransition.hide();
    }
    this.audioEngine.playStudioCue('select');
  }

  private refreshHudSummary(): void {
    const subj = SUBJECT_MAP[this.activeSubjectId].label;
    const fin = FINISH_MAP[this.activeFinishId].label;
    this.hudOverlay.setSummary(`${subj} • ${fin}`);
  }

  private applyBeatVisuals(beat: MovieBeat): void {
    this.activeMoodId = beat.mood;
    this.stage.setAtmosphereMood(beat.mood);
    this.miniSam.syncLightingState(this.stage.getLightingState());
    this.miniSam.syncMood(beat.mood);
    this.stage.setExplodeAmount(beat.explodeAmount);
    this.stage.triggerTransitionEffect(beat.transitionType);
    this.cameraDirector.goToShot(beat.cameraShot, beat.transitionType);
  }

  private buildTtsRequestForBeat(beat: MovieBeat): TtsRequest {
    if (beat.ttsMode === 'dual') {
      return {
        mode: 'dual',
        text: beat.script,
        speakerA: 'Alex',
        speakerB: 'Sam',
        voiceA: beat.voiceName === 'Puck' ? 'Kore' : 'Puck',
        voiceB: beat.voiceName,
        styleA: beat.voiceStyle || 'Enthusiastic creative director',
        styleB: 'Curious spatial designer',
      };
    }
    return {
      mode: 'single',
      text: beat.script,
      voiceName: beat.voiceName,
      stylePrompt: beat.voiceStyle,
    };
  }

  private async playMovie(beats: MovieBeat[], startIndex = 0): Promise<void> {
    if (beats.length === 0) return;
    const token = ++this.movieRunToken;
    this.audioEngine.stop();

    for (let i = Math.max(0, startIndex); i < beats.length; i++) {
      if (token !== this.movieRunToken) return;
      const beat = beats[i];
      this.miniSam.setMoviePlaybackState(true, i);
      this.applyBeatVisuals(beat);
      this.miniSam.setSubtitle(`${beat.title} — ${beat.script}`);

      try {
        const res = await synthesizeSpeech(this.buildTtsRequestForBeat(beat));
        if (token !== this.movieRunToken) return;
        this.lastAudioBase64 = res.audioBase64;
        this.miniSam.setStandaloneVoiceState(true, true);

        await new Promise<void>((resolve) => {
          void this.audioEngine
            .playWavBase64(res.audioBase64, () => resolve())
            .catch(() => resolve());
        });
      } catch (err) {
        if (token !== this.movieRunToken) return;
        this.miniSam.showToast(
          err instanceof Error ? err.message : 'Beat narration failed.'
        );
        await new Promise<void>((resolve) => window.setTimeout(resolve, 1800));
      }

      if (token !== this.movieRunToken) return;
      await new Promise<void>((resolve) => window.setTimeout(resolve, 350));
    }

    if (token === this.movieRunToken) {
      this.miniSam.setMoviePlaybackState(false, -1);
      this.miniSam.setStandaloneVoiceState(false, Boolean(this.lastAudioBase64));
      this.miniSam.setSubtitle(null);
      this.miniSam.showToast('Movie walkthrough complete.');
    }
  }

  private stopMovie(): void {
    this.movieRunToken++;
    this.audioEngine.stop();
    this.miniSam.setMoviePlaybackState(false, -1);
    this.miniSam.setStandaloneVoiceState(false, Boolean(this.lastAudioBase64));
    this.miniSam.setSubtitle(null);
  }

  private async handleSynthesize(request: TtsRequest): Promise<void> {
    this.hudOverlay.setQuickSpeakBusy(true);
    this.miniSam.setStandaloneVoiceState(true, Boolean(this.lastAudioBase64));
    try {
      const result = await synthesizeSpeech(request);
      this.lastAudioBase64 = result.audioBase64;
      this.voiceCard.setPlaybackState(true, true);
      this.voiceCard.setStatus(`Playing (${result.model})...`);
      this.miniSam.setStandaloneVoiceState(true, true);
      await this.audioEngine.playWavBase64(result.audioBase64, () => {
        this.voiceCard.setPlaybackState(false, Boolean(this.lastAudioBase64));
        this.voiceCard.setStatus('Playback complete. Ready.');
        this.hudOverlay.setQuickSpeakBusy(false);
        this.miniSam.setStandaloneVoiceState(false, Boolean(this.lastAudioBase64));
        this.miniSam.setSubtitle(null);
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'TTS failed.';
      this.voiceCard.setStatus(msg);
      this.voiceCard.setPlaybackState(false, Boolean(this.lastAudioBase64));
      this.hudOverlay.setQuickSpeakBusy(false);
      this.miniSam.setStandaloneVoiceState(false, Boolean(this.lastAudioBase64));
      this.miniSam.showToast(msg);
    }
  }

  private async handleQuickSpeak(): Promise<void> {
    const text =
      this.voiceCard.getCurrentScript() ||
      SUBJECT_MAP[this.activeSubjectId].defaultSingleScript;
    const mode = this.voiceCard.getCurrentMode();
    const voice = this.voiceCard.getCurrentVoice();
    const style = this.voiceCard.getCurrentStyle();

    this.voiceCard.setBusy(true, 'Synthesizing with gemini-3.8-flash-tts...');
    try {
      if (mode === 'dual') {
        await this.handleSynthesize({
          mode: 'dual',
          text,
          speakerA: 'Alex',
          speakerB: 'Sam',
          voiceA: voice === 'Puck' ? 'Kore' : 'Puck',
          voiceB: voice,
          styleA: style || 'Enthusiastic creative director',
          styleB: 'Curious studio engineer',
        });
      } else {
        await this.handleSynthesize({
          mode: 'single',
          text,
          voiceName: voice,
          stylePrompt: style,
        });
      }
    } finally {
      this.voiceCard.setBusy(false);
    }
  }

  private handleStopAudio(): void {
    this.movieRunToken++;
    this.audioEngine.stop();
    this.voiceCard.setPlaybackState(false, Boolean(this.lastAudioBase64));
    this.voiceCard.setStatus('Playback stopped.');
    this.hudOverlay.setQuickSpeakBusy(false);
    this.miniSam.setMoviePlaybackState(false, -1);
    this.miniSam.setStandaloneVoiceState(false, Boolean(this.lastAudioBase64));
    this.miniSam.setSubtitle(null);
  }

  private handleDownloadAudio(): void {
    if (!this.lastAudioBase64) return;
    const filename = `atelier-xr-${this.activeSubjectId}.wav`;
    downloadWavBase64(this.lastAudioBase64, filename);
    this.voiceCard.setStatus(`Downloaded ${filename}`);
    this.miniSam.showToast(`Downloaded ${filename}`);
  }

  private async handleAssistScript(mode: TtsMode): Promise<string> {
    return assistScript({
      subjectId: this.activeSubjectId,
      mode,
    });
  }

  private async handleExportScene(): Promise<void> {
    try {
      const exportTargets = [
        this.stage.getExportGroup(),
        this.scenery.getExportGroup(),
        this.brush.getExportGroup(),
      ];
      const { filename, byteLength } = await exportSceneAsGlb(
        exportTargets,
        `samscenes-${this.activeSubjectId}`
      );
      const sizeKb = Math.max(1, Math.round(byteLength / 1024));
      this.audioEngine.playStudioCue('ready');
      this.miniSam.showToast(`Exported ${filename} (${sizeKb} KB)`);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Failed to export 3D scene.';
      this.miniSam.showToast(msg);
    }
  }

  update(): void {
    const rawDt = xb.getDeltaTime();
    const dt = rawDt > 0 ? Math.min(0.05, rawDt) : 1 / 60;
    const elapsed = xb.core.elapsedTime || 0;
    const audio = this.audioEngine.sampleLevels(dt);

    this.cameraDirector.update(dt);
    this.stage.updateStage(elapsed, dt, audio);

    if (!this.uiValidated) {
      this.framesSinceInit++;
      if (this.framesSinceInit >= 12) {
        const report = xb.ui.validate();
        if (report.ready) {
          this.uiValidated = true;
          if (!report.ok) {
            console.warn('Spatial UI validation issues:', report.issues);
          }
        }
      }
    }
  }

  dispose(): void {
    this.movieRunToken++;
    this.cleanupListeners.forEach((fn) => fn());
    this.cleanupListeners = [];
    this.cameraDirector.dispose();
    this.miniSam?.dispose();
    this.audioEngine.dispose();
  }
}
