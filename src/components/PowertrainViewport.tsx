import React, { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, Check, ChevronDown, Globe, HelpCircle, ListOrdered, X } from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  classifyIceOperatingStatus,
  formatDirectionLabel,
  getRotationDirection,
  PSD_CONSTANTS,
} from '../drivetrain';
import { LOCALE_OPTIONS } from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import { buildPowertrainScene, LabelAnchorRefs } from '../three/buildPowertrainScene';
import {
  AnimationSpeedMode,
  CameraPresetId,
  COMPONENT_COLORS,
  IceCombustionMode,
  PowertrainState,
  PsdLogCategory,
  PsdLogEntry,
  RotationDir,
  WorkspaceTab,
} from '../types/hybrid';
import { Planetary2DInsert } from './Planetary2DInsert';

interface PowertrainViewportProps {
  stateRef: React.MutableRefObject<PowertrainState>;
  uiState: PowertrainState;
  activeTab: WorkspaceTab;
  onTickSimulation: (dt: number) => void;
  cameraPreset: CameraPresetId;
  cameraPresetTrigger: number;
  explodeFactor: number;
  visualSpinScale: number;
  animationSpeedMode: AnimationSpeedMode;
  showStreams: boolean;
  onOpenLogModal: () => void;
  logNotifEnabled: boolean;
  onToggleLogNotif: () => void;
  onOpenHowToModal: () => void;
  activeNotification: PsdLogEntry | null;
  onDismissNotification: () => void;
}

const NOTIF_CAT_BADGE: Record<PsdLogCategory, string> = {
  HYBRID: 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200',
  FLOW: 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200',
  ROTATION: 'bg-amber-500/20 border-amber-400/50 text-amber-200',
};

const CAMERA_PRESETS: Record<
  CameraPresetId,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  [CameraPresetId.OVERVIEW]: {
    pos: [3.45, 4.25, 16.25],
    target: [1.15, 0.62, 0.15],
  },
  [CameraPresetId.PLANETARY]: {
    pos: [-2.45, 2.25, 3.65],
    target: [-1.55, 1.42, -0.45],
  },
  [CameraPresetId.PARALLEL_SHAFTS]: {
    pos: [3.05, 2.65, 6.4],
    target: [2.75, 0.82, 0.32],
  },
  [CameraPresetId.WHEEL_DIFF]: {
    pos: [9.65, 1.35, 5.8],
    target: [5.65, -0.55, 0.9],
  },
};

const _projVec = new THREE.Vector3();

interface TagLayoutItem {
  rawX: number;
  rawY: number;
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
}

// Pre-allocated 5-item layout buffer for zero-GC collision-free 3D badge placement
// [0]=ICE, [1]=Battery, [2]=MG1, [3]=MG2, [4]=Wheel
const _tagLayout: [
  TagLayoutItem,
  TagLayoutItem,
  TagLayoutItem,
  TagLayoutItem,
  TagLayoutItem,
] = [
  { rawX: 0, rawY: 0, x: 0, y: 0, w: 202, h: 80, visible: false },
  { rawX: 0, rawY: 0, x: 0, y: 0, w: 200, h: 68, visible: false },
  { rawX: 0, rawY: 0, x: 0, y: 0, w: 188, h: 62, visible: false },
  { rawX: 0, rawY: 0, x: 0, y: 0, w: 188, h: 62, visible: false },
  { rawX: 0, rawY: 0, x: 0, y: 0, w: 190, h: 72, visible: false },
];

export const PowertrainViewport: React.FC<PowertrainViewportProps> = ({
  stateRef,
  uiState,
  activeTab,
  onTickSimulation,
  cameraPreset,
  cameraPresetTrigger,
  explodeFactor,
  visualSpinScale,
  animationSpeedMode,
  showStreams,
  onOpenLogModal,
  logNotifEnabled,
  onToggleLogNotif,
  onOpenHowToModal,
  activeNotification,
  onDismissNotification,
}) => {
  const { locale, setLocale, t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;

  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement | null>(null);

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const topBarRef = useRef<HTMLDivElement | null>(null);
  const insertRef = useRef<HTMLElement | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    if (!langMenuOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLangMenuOpen(false);
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKey);
    };
  }, [langMenuOpen]);

  const tickCallbackRef = useRef(onTickSimulation);
  tickCallbackRef.current = onTickSimulation;

  const viewParamsRef = useRef({
    explodeFactor,
    visualSpinScale,
    animationSpeedMode,
    showStreams,
  });
  viewParamsRef.current = {
    explodeFactor,
    visualSpinScale,
    animationSpeedMode,
    showStreams,
  };

  const camTransitionRef = useRef<{
    active: boolean;
    goalPos: THREE.Vector3;
    goalTarget: THREE.Vector3;
  }>({
    active: false,
    goalPos: new THREE.Vector3(...CAMERA_PRESETS[CameraPresetId.OVERVIEW].pos),
    goalTarget: new THREE.Vector3(...CAMERA_PRESETS[CameraPresetId.OVERVIEW].target),
  });

  useEffect(() => {
    const spec = CAMERA_PRESETS[cameraPreset];
    camTransitionRef.current.goalPos.set(...spec.pos);
    camTransitionRef.current.goalTarget.set(...spec.target);
    camTransitionRef.current.active = true;
  }, [cameraPreset, cameraPresetTrigger]);

  // DOM refs for 5 non-overlapping floating callout badges + SVG pointer lines
  const iceTagRef = useRef<HTMLDivElement | null>(null);
  const iceValRef = useRef<HTMLSpanElement | null>(null);
  const iceDirRef = useRef<HTMLSpanElement | null>(null);
  const iceStatusRef = useRef<HTMLSpanElement | null>(null);
  const iceBarRef = useRef<HTMLDivElement | null>(null);
  const iceLineRef = useRef<SVGLineElement | null>(null);

  const battTagRef = useRef<HTMLDivElement | null>(null);
  const battSocRef = useRef<HTMLSpanElement | null>(null);
  const battStatusRef = useRef<HTMLSpanElement | null>(null);
  const battBarRef = useRef<HTMLDivElement | null>(null);
  const battLineRef = useRef<SVGLineElement | null>(null);

  const mg1TagRef = useRef<HTMLDivElement | null>(null);
  const mg1ValRef = useRef<HTMLSpanElement | null>(null);
  const mg1DirRef = useRef<HTMLSpanElement | null>(null);
  const mg1BarRef = useRef<HTMLDivElement | null>(null);
  const mg1LineRef = useRef<SVGLineElement | null>(null);

  const mg2TagRef = useRef<HTMLDivElement | null>(null);
  const mg2ValRef = useRef<HTMLSpanElement | null>(null);
  const mg2DirRef = useRef<HTMLSpanElement | null>(null);
  const mg2BarRef = useRef<HTMLDivElement | null>(null);
  const mg2LineRef = useRef<SVGLineElement | null>(null);

  const wheelTagRef = useRef<HTMLDivElement | null>(null);
  const wheelRpmRef = useRef<HTMLSpanElement | null>(null);
  const wheelTurnRef = useRef<HTMLSpanElement | null>(null);
  const wheelKmhRef = useRef<HTMLSpanElement | null>(null);
  const wheelTravelRef = useRef<HTMLSpanElement | null>(null);
  const wheelLineRef = useRef<SVGLineElement | null>(null);

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('WebGL hardware context could not be initialized in this browser.');
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    const initSpec = CAMERA_PRESETS[CameraPresetId.OVERVIEW];
    camera.position.set(...initSpec.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...initSpec.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.0;
    controls.maxDistance = 26.0;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.update();

    const onControlsStart = () => {
      camTransitionRef.current.active = false;
    };
    controls.addEventListener('start', onControlsStart);

    const ctx = buildPowertrainScene(renderer, isSoftwareGl);

    if (!isSoftwareGl) {
      renderer.compile(ctx.scene, camera);
    }

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('WebGL rendering context was paused.');
    };
    const onContextRestored = () => {
      setWebglError(null);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    function projectAnchor(
      anchor: THREE.Object3D,
      slot: TagLayoutItem,
      w: number,
      h: number,
      offsetY = -24,
      offsetX = 0
    ) {
      anchor.getWorldPosition(_projVec);
      _projVec.project(camera);
      if (_projVec.z > 1 || _projVec.z < -1) {
        slot.visible = false;
        return;
      }
      slot.visible = true;
      slot.rawX = (_projVec.x * 0.5 + 0.5) * w;
      slot.rawY = (-_projVec.y * 0.5 + 0.5) * h;
      slot.x = slot.rawX + offsetX;
      slot.y = slot.rawY + offsetY;
    }

    /**
     * Enforces hard exclusion zones around the top-left legend bar, the top-right
     * 2D Planetary Gear Insert, and the bottom control dock so no badge can ever
     * be covered by UI overlays or another badge.
     */
    function clampAgainstUiObstacles(
      a: TagLayoutItem,
      w: number,
      topBarBottom: number,
      topBarRight: number,
      insLeft: number,
      insBottom: number,
      bottomSafe: number
    ) {
      const halfW = a.w * 0.5;
      const halfH = a.h * 0.5;

      const baseMinX = halfW + 10;
      const baseMaxX = Math.max(baseMinX, w - halfW - 10);
      let effMinY = 10 + halfH;
      const effMaxY = Math.max(effMinY, bottomSafe - halfH);

      // Avoid Top-Left Legend Bar
      if (a.x - halfW < topBarRight) {
        effMinY = Math.max(effMinY, topBarBottom + halfH);
      }

      a.x = Math.max(baseMinX, Math.min(baseMaxX, a.x));
      a.y = Math.max(effMinY, Math.min(effMaxY, a.y));

      // Hard Exclusion for Top-Right 2D Planetary Gear Insert [insLeft..w, 0..insBottom]
      if (a.x + halfW > insLeft && a.y - halfH < insBottom) {
        const pushLeftX = insLeft - halfW;
        const pushDownY = insBottom + halfH;
        const canPushDown = pushDownY <= effMaxY;
        const canPushLeft = pushLeftX >= baseMinX;

        const distLeft = a.x - pushLeftX;
        const distDown = pushDownY - a.y;

        // Right-side components (e.g. Wheel or zoomed-in MG2) prefer dropping below the 2D insert
        // when reasonably close; upper-center components stay strictly to the left of the 2D insert.
        if (canPushDown && (!canPushLeft || a.rawX > insLeft + 24 || distDown < distLeft * 0.95)) {
          a.y = pushDownY;
        } else if (canPushLeft) {
          a.x = pushLeftX;
        } else if (canPushDown) {
          a.y = pushDownY;
        }
      }

      a.x = Math.max(baseMinX, Math.min(baseMaxX, a.x));
      a.y = Math.max(effMinY, Math.min(effMaxY, a.y));
    }

    function resolveTagCollisions(w: number, h: number) {
      const topBarEl = topBarRef.current;
      const topBarBottom = topBarEl ? topBarEl.offsetTop + topBarEl.offsetHeight + 8 : 48;
      const topBarRight = topBarEl ? topBarEl.offsetLeft + topBarEl.offsetWidth + 8 : 560;

      const insEl = insertRef.current;
      const insWidth = insEl ? insEl.offsetWidth : 202;
      const insHeight = insEl ? insEl.offsetHeight : 272;
      const insLeft = w - 14 - insWidth - 10;
      const insBottom = 12 + insHeight + 10;

      const dockEl = document.getElementById('bottom-control-dock');
      const dockRectTop = dockEl ? dockEl.getBoundingClientRect().top : h - 168;
      const vpRectTop = container ? container.getBoundingClientRect().top : 0;
      const bottomSafe = Math.max(180, Math.min(h - 36, dockRectTop - vpRectTop - 10));

      // Initial obstacle clamp before iterative relaxation
      for (let i = 0; i < 5; i++) {
        const a = _tagLayout[i];
        if (!a.visible) continue;
        clampAgainstUiObstacles(a, w, topBarBottom, topBarRight, insLeft, insBottom, bottomSafe);
      }

      // Simultaneous pairwise badge separation + hard UI obstacle projection (16 iterations)
      for (let iter = 0; iter < 16; iter++) {
        for (let i = 0; i < 5; i++) {
          const a = _tagLayout[i];
          if (!a.visible) continue;

          for (let j = i + 1; j < 5; j++) {
            const b = _tagLayout[j];
            if (!b.visible) continue;

            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const minSepX = (a.w + b.w) * 0.5 + 12;
            const minSepY = (a.h + b.h) * 0.5 + 10;
            const overlapX = minSepX - Math.abs(dx);
            const overlapY = minSepY - Math.abs(dy);

            if (overlapX > 0 && overlapY > 0) {
              if (overlapX < overlapY * 1.25) {
                const sign = dx >= 0 ? 1 : -1;
                const pushX = overlapX * 0.54 * sign;
                a.x -= pushX;
                b.x += pushX;
              } else {
                const sign = dy >= 0 ? 1 : -1;
                const pushY = overlapY * 0.54 * sign;
                a.y -= pushY;
                b.y += pushY;
              }
            }
          }
        }

        for (let i = 0; i < 5; i++) {
          const a = _tagLayout[i];
          if (!a.visible) continue;
          clampAgainstUiObstacles(
            a,
            w,
            topBarBottom,
            topBarRight,
            insLeft,
            insBottom,
            bottomSafe
          );
        }
      }
    }

    function applyTagTransform(
      slot: TagLayoutItem,
      el: HTMLDivElement | null,
      line: SVGLineElement | null
    ) {
      if (!el) return;
      if (!slot.visible) {
        el.style.opacity = '0';
        if (line) line.style.opacity = '0';
        return;
      }
      el.style.opacity = '1';
      el.style.transform = `translate3d(${Math.round(slot.x)}px, ${Math.round(
        slot.y
      )}px, 0) translate(-50%, -50%)`;

      if (line) {
        // Attach leader line to top edge if badge was pushed below its 3D anchor, otherwise bottom edge
        const anchorEdgeY =
          slot.y > slot.rawY ? slot.y - slot.h * 0.45 : slot.y + slot.h * 0.45;
        const dist = Math.hypot(slot.x - slot.rawX, anchorEdgeY - slot.rawY);
        if (dist > 8) {
          line.style.opacity = '0.6';
          line.setAttribute('x1', slot.x.toFixed(1));
          line.setAttribute('y1', anchorEdgeY.toFixed(1));
          line.setAttribute('x2', slot.rawX.toFixed(1));
          line.setAttribute('y2', slot.rawY.toFixed(1));
        } else {
          line.style.opacity = '0';
        }
      }
    }

    function formatArrowBadge(rpm: number): string {
      const dir = getRotationDirection(rpm);
      const glyph = dir === RotationDir.CW ? '↻' : dir === RotationDir.CCW ? '↺' : '■';
      if (dir === RotationDir.STOP) return `${glyph} ${tRef.current.badges.stop}`;
      return `${glyph} ${formatDirectionLabel(rpm, false)}`;
    }

    function updateDomCallouts(anchors: LabelAnchorRefs, st: PowertrainState) {
      const w = container?.clientWidth || window.innerWidth;
      const h = container?.clientHeight || window.innerHeight;
      const tb = tRef.current.badges;

      projectAnchor(anchors.ice, _tagLayout[0], w, h, 54, 0);
      projectAnchor(anchors.battery, _tagLayout[1], w, h, -28, 0);
      projectAnchor(anchors.mg1, _tagLayout[2], w, h, -48, 36);
      projectAnchor(anchors.mg2, _tagLayout[3], w, h, 86, 0);
      projectAnchor(anchors.wheel, _tagLayout[4], w, h, -26, 0);

      resolveTagCollisions(w, h);

      applyTagTransform(_tagLayout[0], iceTagRef.current, iceLineRef.current);
      applyTagTransform(_tagLayout[1], battTagRef.current, battLineRef.current);
      applyTagTransform(_tagLayout[2], mg1TagRef.current, mg1LineRef.current);
      applyTagTransform(_tagLayout[3], mg2TagRef.current, mg2LineRef.current);
      applyTagTransform(_tagLayout[4], wheelTagRef.current, wheelLineRef.current);

      // 1. ICE (Distinguishes active combustion power vs unfueled vacuum/air-pump spin)
      const iceStatus = classifyIceOperatingStatus(
        st.iceRpm,
        st.iceFuelActive,
        st.flows.iceToCarrierKw
      );
      if (iceValRef.current) {
        iceValRef.current.textContent = `${Math.round(st.iceRpm).toLocaleString()} RPM`;
      }
      if (iceDirRef.current) {
        iceDirRef.current.textContent = formatArrowBadge(st.iceRpm);
      }
      if (iceStatusRef.current) {
        iceStatusRef.current.textContent =
          iceStatus.mode === IceCombustionMode.PRODUCING_POWER
            ? `${tb.iceFiringPrefix} · +${st.flows.iceToCarrierKw.toFixed(1)} kW`
            : tb.iceStatus[iceStatus.mode];
        iceStatusRef.current.className =
          iceStatus.badgeTone === 'power'
            ? 'text-orange-300 font-semibold'
            : iceStatus.badgeTone === 'idle'
              ? 'text-amber-200 font-semibold'
              : iceStatus.badgeTone === 'unfueled'
                ? 'text-sky-300 font-semibold'
                : 'text-slate-400';
      }
      if (iceBarRef.current) {
        const icePct = Math.min(100, (Math.abs(st.iceRpm) / PSD_CONSTANTS.ICE_MAX_RPM) * 100);
        iceBarRef.current.style.width = `${icePct.toFixed(1)}%`;
        iceBarRef.current.className =
          iceStatus.badgeTone === 'power'
            ? 'h-full bg-orange-400 rounded-full'
            : iceStatus.badgeTone === 'idle'
              ? 'h-full bg-amber-300 rounded-full'
              : iceStatus.badgeTone === 'unfueled'
                ? 'h-full bg-sky-400/80 rounded-full'
                : 'h-full bg-red-400 rounded-full';
      }

      // 2. HV Battery · PCU
      const socRounded = Math.round(st.socPercent);
      if (battSocRef.current) {
        battSocRef.current.textContent = `${tb.socLabel} ${socRounded}%`;
      }
      if (battBarRef.current) {
        battBarRef.current.style.width = `${Math.max(4, Math.min(100, socRounded))}%`;
      }
      if (battStatusRef.current) {
        const battKw = st.flows.batteryToPcuKw;
        if (battKw < -0.35) {
          battStatusRef.current.textContent = `${tb.chgPrefix} +${Math.abs(battKw).toFixed(1)} kW`;
          battStatusRef.current.className = 'text-emerald-300 font-semibold';
        } else if (battKw > 0.35) {
          battStatusRef.current.textContent = `${tb.disPrefix} -${battKw.toFixed(1)} kW`;
          battStatusRef.current.className = 'text-amber-300 font-semibold';
        } else {
          battStatusRef.current.textContent = tb.standby;
          battStatusRef.current.className = 'text-slate-400';
        }
      }

      // 3. MG1 (Direction-agnostic RPM bar vs THS-5 MG1 10,500 RPM ceiling)
      if (mg1ValRef.current) {
        mg1ValRef.current.textContent = `${Math.round(st.mg1Rpm).toLocaleString()} RPM`;
      }
      if (mg1DirRef.current) {
        mg1DirRef.current.textContent = formatArrowBadge(st.mg1Rpm);
      }
      if (mg1BarRef.current) {
        const mg1Pct = Math.min(100, (Math.abs(st.mg1Rpm) / PSD_CONSTANTS.MG1_MAX_RPM) * 100);
        mg1BarRef.current.style.width = `${mg1Pct.toFixed(1)}%`;
      }

      // 4. MG2 (Direction-agnostic RPM bar vs 1VM MG2 17,000 RPM ceiling)
      if (mg2ValRef.current) {
        mg2ValRef.current.textContent = `${Math.round(st.mg2Rpm).toLocaleString()} RPM`;
      }
      if (mg2DirRef.current) {
        mg2DirRef.current.textContent = formatArrowBadge(st.mg2Rpm);
      }
      if (mg2BarRef.current) {
        const mg2Pct = Math.min(100, (Math.abs(st.mg2Rpm) / PSD_CONSTANTS.MG2_MAX_RPM) * 100);
        mg2BarRef.current.style.width = `${mg2Pct.toFixed(1)}%`;
      }

      // 5. Wheel (Uncramped 2-row layout: km/h below RPM, FWD/REV below CW/CCW)
      const wheelDir = getRotationDirection(st.wheelRpm);
      if (wheelRpmRef.current) {
        wheelRpmRef.current.textContent = `${Math.round(st.wheelRpm).toLocaleString()} RPM`;
      }
      if (wheelTurnRef.current) {
        wheelTurnRef.current.textContent =
          wheelDir === RotationDir.CW
            ? '↻ CW'
            : wheelDir === RotationDir.CCW
              ? '↺ CCW'
              : `■ ${tb.stop}`;
      }
      if (wheelKmhRef.current) {
        wheelKmhRef.current.textContent = `${Math.abs(Math.round(st.speedKmh))} km/h`;
      }
      if (wheelTravelRef.current) {
        wheelTravelRef.current.textContent =
          wheelDir === RotationDir.CW
            ? tb.fwd
            : wheelDir === RotationDir.CCW
              ? tb.rev
              : tb.stop;
      }
    }

    let frameId = 0;
    let isDisposed = false;
    const clock = new THREE.Clock();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (isDisposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (isDisposed) return;
      const dt = Math.min(clock.getDelta(), 0.08);

      tickCallbackRef.current(dt);

      if (camTransitionRef.current.active) {
        const alpha = isSoftwareGl ? 0.35 : 1 - Math.exp(-5.5 * dt);
        camera.position.lerp(camTransitionRef.current.goalPos, alpha);
        controls.target.lerp(camTransitionRef.current.goalTarget, alpha);
        if (
          camera.position.distanceToSquared(camTransitionRef.current.goalPos) < 0.001 &&
          controls.target.distanceToSquared(camTransitionRef.current.goalTarget) < 0.001
        ) {
          camera.position.copy(camTransitionRef.current.goalPos);
          controls.target.copy(camTransitionRef.current.goalTarget);
          camTransitionRef.current.active = false;
        }
      }

      controls.update();

      const vp = viewParamsRef.current;
      ctx.updateKinematics(
        stateRef.current,
        dt,
        vp.visualSpinScale,
        vp.animationSpeedMode,
        vp.explodeFactor,
        vp.showStreams
      );

      ctx.scene.updateMatrixWorld();
      updateDomCallouts(ctx.labelAnchors, stateRef.current);

      renderer.render(ctx.scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      controls.removeEventListener('start', onControlsStart);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      controls.dispose();
      ctx.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [stateRef]);

  return (
    <div className="relative w-full h-full overflow-hidden select-none bg-[#090d16]">
      <div ref={canvasMountRef} className="w-full h-full" />

      {/* Top-Left HUD Stack: Title + 5-Component Legend + PSD Log & Notif + Notification Toast */}
      <div
        ref={topBarRef}
        className="pointer-events-none absolute top-2.5 left-3.5 z-10 flex flex-col items-start gap-1.5 w-fit max-w-[calc(100vw-262px)]"
      >
        {/* Row 1: Title + Color Key + PSD Log Modal + Notif + Language Select + How To? */}
        <div className="flex flex-wrap items-center gap-1.5 max-w-full">
          <div className="inline-flex w-fit max-w-full flex-wrap items-center gap-x-2.5 gap-y-1 px-2.5 py-1 rounded-lg bg-slate-950/72 border border-slate-800/80 text-xs text-slate-300">
            <span className="font-display font-bold text-[13px] text-slate-100 whitespace-nowrap">
              {t.hud.title}
            </span>
            <span className="text-slate-600 hidden sm:inline">·</span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <span
                className="w-2 h-2 rounded-xs"
                style={{ backgroundColor: COMPONENT_COLORS.ice.hex }}
              />
              <span>{t.hud.iceLegend}</span>
            </span>
            <span className="text-slate-600">·</span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <span
                className="w-2 h-2 rounded-xs"
                style={{ backgroundColor: COMPONENT_COLORS.mg1.hex }}
              />
              <span>{t.hud.mg1Legend}</span>
            </span>
            <span className="text-slate-600">·</span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <span
                className="w-2 h-2 rounded-xs"
                style={{ backgroundColor: COMPONENT_COLORS.mg2.hex }}
              />
              <span>{t.hud.mg2Legend}</span>
            </span>
            <span className="text-slate-600">·</span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <span
                className="w-2 h-2 rounded-xs"
                style={{ backgroundColor: COMPONENT_COLORS.wheel.hex }}
              />
              <span>{t.hud.wheelLegend}</span>
            </span>
            <span className="text-slate-600">·</span>
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <span
                className="w-2 h-2 rounded-xs"
                style={{ backgroundColor: COMPONENT_COLORS.battery.hex }}
              />
              <span>{t.hud.battLegend}</span>
            </span>
          </div>

          <div className="pointer-events-auto inline-flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={onOpenLogModal}
              title={t.hud.psdLogTitle}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950/82 border border-slate-700/75 text-xs font-medium text-slate-200 hover:text-white hover:border-slate-500 transition-colors whitespace-nowrap"
            >
              <ListOrdered className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t.hud.psdLog}</span>
            </button>

            <button
              type="button"
              onClick={onToggleLogNotif}
              aria-pressed={logNotifEnabled}
              title={logNotifEnabled ? t.hud.notifOnTitle : t.hud.notifOffTitle}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                logNotifEnabled
                  ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-200 hover:bg-cyan-500/30'
                  : 'bg-slate-950/75 border-slate-700/65 text-slate-400 hover:text-white'
              }`}
            >
              {logNotifEnabled ? (
                <Bell className="w-3.5 h-3.5 text-cyan-300" />
              ) : (
                <BellOff className="w-3.5 h-3.5" />
              )}
              <span>{logNotifEnabled ? t.hud.notifOn : t.hud.notifOff}</span>
            </button>

            {/* Button 1 beside Notif: Language Selector (Default strictly English) */}
            <div ref={langMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setLangMenuOpen((prev) => !prev)}
                aria-expanded={langMenuOpen}
                aria-haspopup="menu"
                title={t.hud.languageTitle}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                  langMenuOpen
                    ? 'bg-slate-800 border-slate-500 text-white'
                    : 'bg-slate-950/82 border-slate-700/75 text-slate-200 hover:text-white hover:border-slate-500'
                }`}
              >
                <Globe className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-mono font-semibold">
                  {LOCALE_OPTIONS.find((opt) => opt.id === locale)?.shortLabel ?? 'EN'}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {langMenuOpen && (
                <div
                  role="menu"
                  aria-label={t.hud.languageTitle}
                  className="absolute left-0 top-full mt-1 min-w-[168px] py-1 rounded-lg bg-[#0c1220] border border-slate-700/85 shadow-2xl z-40"
                >
                  {LOCALE_OPTIONS.map((opt) => {
                    const selected = opt.id === locale;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selected}
                        onClick={() => {
                          setLocale(opt.id);
                          setLangMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs transition-colors text-left ${
                          selected
                            ? 'bg-cyan-500/20 text-cyan-200 font-semibold'
                            : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-slate-400 w-5">
                            {opt.shortLabel}
                          </span>
                          <span>{opt.nativeName}</span>
                        </span>
                        {selected && <Check className="w-3.5 h-3.5 text-cyan-300 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Button 2 beside Notif: How To? Guide & THS V Manual */}
            <button
              type="button"
              onClick={onOpenHowToModal}
              title={t.hud.howToTitle}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950/82 border border-slate-700/75 text-xs font-medium text-slate-200 hover:text-white hover:border-amber-400/60 transition-colors whitespace-nowrap"
            >
              <HelpCircle className="w-3.5 h-3.5 text-amber-300" />
              <span>{t.hud.howTo}</span>
            </button>
          </div>
        </div>

        {/* Row 2: Live Transition Notification Banner under Top Legend */}
        {logNotifEnabled && activeNotification && (
          <div className="pointer-events-auto max-w-[620px] px-2.5 py-1.5 rounded-lg bg-slate-950/90 border border-cyan-500/50 shadow-lg text-xs space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1">
                {activeNotification.categories.map((cat) => (
                  <span
                    key={cat}
                    className={`px-1 py-0.2 rounded border font-mono text-[10.5px] font-bold ${NOTIF_CAT_BADGE[cat]}`}
                  >
                    {cat}
                  </span>
                ))}
                <strong className="text-slate-100 font-semibold">
                  {activeNotification.title}
                </strong>
                <span className="font-mono text-[11px] text-violet-300">
                  · {Math.abs(activeNotification.speedKmh)} km/h
                </span>
              </div>
              <button
                type="button"
                onClick={onDismissNotification}
                aria-label="Dismiss notification"
                className="p-0.5 text-slate-400 hover:text-white shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-slate-300 text-[11.5px] leading-snug">
              {activeNotification.explanation}
            </p>
          </div>
        )}
      </div>

      {/* Top-Right 2D Planetary Gear Insert (Measured via ref so badges NEVER touch it) */}
      <Planetary2DInsert
        ref={insertRef}
        stateRef={stateRef}
        state={uiState}
        timeScale={visualSpinScale}
      />

      {/* SVG Leader Pointers + Collision-Free 3D Speed, SoC & Direction Callouts */}
      <svg className="pointer-events-none absolute inset-0 w-full h-full z-10 overflow-visible">
        <line
          ref={iceLineRef}
          stroke={COMPONENT_COLORS.ice.hex}
          strokeWidth="1.2"
          strokeDasharray="3 2"
        />
        <line
          ref={battLineRef}
          stroke={COMPONENT_COLORS.battery.hex}
          strokeWidth="1.2"
          strokeDasharray="3 2"
        />
        <line
          ref={mg1LineRef}
          stroke={COMPONENT_COLORS.mg1.hex}
          strokeWidth="1.2"
          strokeDasharray="3 2"
        />
        <line
          ref={mg2LineRef}
          stroke={COMPONENT_COLORS.mg2.hex}
          strokeWidth="1.2"
          strokeDasharray="3 2"
        />
        <line
          ref={wheelLineRef}
          stroke={COMPONENT_COLORS.wheel.hex}
          strokeWidth="1.2"
          strokeDasharray="3 2"
        />
      </svg>

      <div className="pointer-events-none absolute inset-0 overflow-hidden z-10">
        {/* 1. ICE · Carrier & Planets */}
        <div
          ref={iceTagRef}
          className="absolute top-0 left-0 w-[198px] px-2.5 py-1 rounded-lg bg-slate-950/74 border border-red-500/45 shadow-md"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400 whitespace-nowrap">
            <span className="inline-block w-2 h-2 rounded-xs bg-red-500" />
            <span>{t.badges.iceTitle}</span>
          </div>
          <div className="flex items-center justify-between mt-0.5 text-[12.5px] font-mono text-slate-100 whitespace-nowrap">
            <span ref={iceValRef}>0 RPM</span>
            <span ref={iceDirRef} className="text-red-300">
              ■ {t.badges.stop}
            </span>
          </div>
          <div className="flex items-center justify-between mt-0.5 text-[11.5px] font-mono whitespace-nowrap">
            <span ref={iceStatusRef} className="text-slate-400">
              {t.badges.iceStatus[IceCombustionMode.STOPPED]}
            </span>
          </div>
          <div className="mt-1 h-1 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              ref={iceBarRef}
              className="h-full bg-red-400 rounded-full"
              style={{ width: '0%' }}
            />
          </div>
        </div>

        {/* 2. HV Battery · PCU */}
        <div
          ref={battTagRef}
          className="absolute top-0 left-0 w-[196px] px-2.5 py-1 rounded-lg bg-slate-950/74 border border-emerald-500/50 shadow-md"
        >
          <div className="flex items-center justify-between gap-1 text-xs font-semibold text-emerald-400 whitespace-nowrap">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-xs bg-emerald-500" />
              <span>{t.badges.battTitle}</span>
            </span>
            <span ref={battSocRef} className="font-mono text-emerald-200">
              {t.badges.socLabel} 60%
            </span>
          </div>
          <div className="flex items-center justify-between mt-0.5 text-xs font-mono whitespace-nowrap">
            <span ref={battStatusRef} className="text-slate-300">
              {t.badges.standby}
            </span>
          </div>
          <div className="mt-1 h-1 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              ref={battBarRef}
              className="h-full bg-emerald-400 rounded-full"
              style={{ width: '60%' }}
            />
          </div>
        </div>

        {/* 3. MG1 · Sun Gear */}
        <div
          ref={mg1TagRef}
          className="absolute top-0 left-0 w-[186px] px-2.5 py-1 rounded-lg bg-slate-950/74 border border-amber-500/45 shadow-md"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 whitespace-nowrap">
            <span className="inline-block w-2 h-2 rounded-xs bg-amber-500" />
            <span>{t.badges.mg1Title}</span>
          </div>
          <div className="flex items-center justify-between mt-0.5 text-[12.5px] font-mono text-slate-100 whitespace-nowrap">
            <span ref={mg1ValRef}>0 RPM</span>
            <span ref={mg1DirRef} className="text-amber-300">
              ■ {t.badges.stop}
            </span>
          </div>
          <div className="mt-1 h-1 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              ref={mg1BarRef}
              className="h-full bg-amber-400 rounded-full"
              style={{ width: '0%' }}
            />
          </div>
        </div>

        {/* 4. MG2 · Ring & Counter */}
        <div
          ref={mg2TagRef}
          className="absolute top-0 left-0 w-[186px] px-2.5 py-1 rounded-lg bg-slate-950/74 border border-cyan-500/45 shadow-md"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400 whitespace-nowrap">
            <span className="inline-block w-2 h-2 rounded-xs bg-cyan-500" />
            <span>{t.badges.mg2Title}</span>
          </div>
          <div className="flex items-center justify-between mt-0.5 text-[12.5px] font-mono text-slate-100 whitespace-nowrap">
            <span ref={mg2ValRef}>0 RPM</span>
            <span ref={mg2DirRef} className="text-cyan-300">
              ■ {t.badges.stop}
            </span>
          </div>
          <div className="mt-1 h-1 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              ref={mg2BarRef}
              className="h-full bg-cyan-400 rounded-full"
              style={{ width: '0%' }}
            />
          </div>
        </div>

        {/* 5. Drive Wheel · Final Axle */}
        <div
          ref={wheelTagRef}
          className="absolute top-0 left-0 w-[188px] px-2.5 py-1 rounded-lg bg-slate-950/74 border border-violet-500/45 shadow-md"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-400 whitespace-nowrap">
            <span className="inline-block w-2 h-2 rounded-xs bg-violet-500" />
            <span>{t.badges.wheelTitle}</span>
          </div>
          <div className="flex items-center justify-between mt-0.5 text-[12.5px] font-mono text-slate-100 whitespace-nowrap">
            <span ref={wheelRpmRef}>0 RPM</span>
            <span ref={wheelTurnRef} className="text-violet-300">
              ■ {t.badges.stop}
            </span>
          </div>
          <div className="flex items-center justify-between text-[12.5px] font-mono text-violet-200 whitespace-nowrap">
            <span ref={wheelKmhRef}>0 km/h</span>
            <span ref={wheelTravelRef} className="font-semibold text-violet-300">
              {t.badges.stop}
            </span>
          </div>
        </div>
      </div>

      {webglError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#090d16]/90 p-6">
          <div className="max-w-md rounded-xl border border-slate-800 bg-slate-950/85 p-6 text-center">
            <h2 className="text-base font-semibold text-slate-100">{webglError}</h2>
          </div>
        </div>
      )}
    </div>
  );
};
