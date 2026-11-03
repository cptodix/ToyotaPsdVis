import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { formatDirectionLabel, getRotationDirection } from '../simulation/ths5Engine';
import { buildPowertrainScene, LabelAnchorRefs } from '../three/buildPowertrainScene';
import {
  CameraPresetId,
  COMPONENT_COLORS,
  PowertrainState,
  RotationDir,
} from '../types/hybrid';
import { Planetary2DInsert } from './Planetary2DInsert';

interface PowertrainViewportProps {
  stateRef: React.MutableRefObject<PowertrainState>;
  uiState: PowertrainState;
  onTickSimulation: (dt: number) => void;
  cameraPreset: CameraPresetId;
  cameraPresetTrigger: number;
  explodeFactor: number;
  visualSpinScale: number;
  showStreams: boolean;
}

const CAMERA_PRESETS: Record<
  CameraPresetId,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  [CameraPresetId.OVERVIEW]: {
    pos: [0.35, 3.85, 13.8],
    target: [0.25, 0.72, 0.15],
  },
  [CameraPresetId.PLANETARY]: {
    pos: [-2.65, 2.25, 3.45],
    target: [-1.75, 1.42, -0.45],
  },
  [CameraPresetId.PARALLEL_SHAFTS]: {
    pos: [2.75, 2.65, 6.2],
    target: [2.45, 0.82, 0.32],
  },
  [CameraPresetId.WHEEL_DIFF]: {
    pos: [8.45, 1.15, 5.1],
    target: [4.85, -0.55, 0.9],
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
  { rawX: 0, rawY: 0, x: 0, y: 0, w: 174, h: 50, visible: false },
  { rawX: 0, rawY: 0, x: 0, y: 0, w: 184, h: 64, visible: false },
  { rawX: 0, rawY: 0, x: 0, y: 0, w: 174, h: 50, visible: false },
  { rawX: 0, rawY: 0, x: 0, y: 0, w: 174, h: 50, visible: false },
  { rawX: 0, rawY: 0, x: 0, y: 0, w: 176, h: 68, visible: false },
];

export const PowertrainViewport: React.FC<PowertrainViewportProps> = ({
  stateRef,
  uiState,
  onTickSimulation,
  cameraPreset,
  cameraPresetTrigger,
  explodeFactor,
  visualSpinScale,
  showStreams,
}) => {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const topBarRef = useRef<HTMLDivElement | null>(null);
  const insertRef = useRef<HTMLElement | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  const tickCallbackRef = useRef(onTickSimulation);
  tickCallbackRef.current = onTickSimulation;

  const viewParamsRef = useRef({
    explodeFactor,
    visualSpinScale,
    showStreams,
  });
  viewParamsRef.current = {
    explodeFactor,
    visualSpinScale,
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
  const iceLineRef = useRef<SVGLineElement | null>(null);

  const battTagRef = useRef<HTMLDivElement | null>(null);
  const battSocRef = useRef<HTMLSpanElement | null>(null);
  const battStatusRef = useRef<HTMLSpanElement | null>(null);
  const battBarRef = useRef<HTMLDivElement | null>(null);
  const battLineRef = useRef<SVGLineElement | null>(null);

  const mg1TagRef = useRef<HTMLDivElement | null>(null);
  const mg1ValRef = useRef<HTMLSpanElement | null>(null);
  const mg1DirRef = useRef<HTMLSpanElement | null>(null);
  const mg1LineRef = useRef<SVGLineElement | null>(null);

  const mg2TagRef = useRef<HTMLDivElement | null>(null);
  const mg2ValRef = useRef<HTMLSpanElement | null>(null);
  const mg2DirRef = useRef<HTMLSpanElement | null>(null);
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
      offsetY = -24
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
      slot.x = slot.rawX;
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
            const minSepX = (a.w + b.w) * 0.5 + 8;
            const minSepY = (a.h + b.h) * 0.5 + 8;
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
      return `${glyph} ${formatDirectionLabel(rpm, false)}`;
    }

    function updateDomCallouts(anchors: LabelAnchorRefs, st: PowertrainState) {
      const w = container?.clientWidth || window.innerWidth;
      const h = container?.clientHeight || window.innerHeight;

      projectAnchor(anchors.ice, _tagLayout[0], w, h, -24);
      projectAnchor(anchors.battery, _tagLayout[1], w, h, -26);
      projectAnchor(anchors.mg1, _tagLayout[2], w, h, -24);
      projectAnchor(anchors.mg2, _tagLayout[3], w, h, -24);
      projectAnchor(anchors.wheel, _tagLayout[4], w, h, -28);

      resolveTagCollisions(w, h);

      applyTagTransform(_tagLayout[0], iceTagRef.current, iceLineRef.current);
      applyTagTransform(_tagLayout[1], battTagRef.current, battLineRef.current);
      applyTagTransform(_tagLayout[2], mg1TagRef.current, mg1LineRef.current);
      applyTagTransform(_tagLayout[3], mg2TagRef.current, mg2LineRef.current);
      applyTagTransform(_tagLayout[4], wheelTagRef.current, wheelLineRef.current);

      // 1. ICE
      if (iceValRef.current) {
        iceValRef.current.textContent = `${Math.round(st.iceRpm).toLocaleString()} RPM`;
      }
      if (iceDirRef.current) {
        iceDirRef.current.textContent = formatArrowBadge(st.iceRpm);
      }

      // 2. HV Battery · PCU
      const socRounded = Math.round(st.socPercent);
      if (battSocRef.current) {
        battSocRef.current.textContent = `SoC ${socRounded}%`;
      }
      if (battBarRef.current) {
        battBarRef.current.style.width = `${Math.max(4, Math.min(100, socRounded))}%`;
      }
      if (battStatusRef.current) {
        const battKw = st.flows.batteryToPcuKw;
        if (battKw < -0.35) {
          battStatusRef.current.textContent = `▲ CHG +${Math.abs(battKw).toFixed(1)} kW`;
          battStatusRef.current.className = 'text-emerald-300 font-semibold';
        } else if (battKw > 0.35) {
          battStatusRef.current.textContent = `▼ DIS -${battKw.toFixed(1)} kW`;
          battStatusRef.current.className = 'text-amber-300 font-semibold';
        } else {
          battStatusRef.current.textContent = '■ STANDBY';
          battStatusRef.current.className = 'text-slate-400';
        }
      }

      // 3. MG1
      if (mg1ValRef.current) {
        mg1ValRef.current.textContent = `${Math.round(st.mg1Rpm).toLocaleString()} RPM`;
      }
      if (mg1DirRef.current) {
        mg1DirRef.current.textContent = formatArrowBadge(st.mg1Rpm);
      }

      // 4. MG2
      if (mg2ValRef.current) {
        mg2ValRef.current.textContent = `${Math.round(st.mg2Rpm).toLocaleString()} RPM`;
      }
      if (mg2DirRef.current) {
        mg2DirRef.current.textContent = formatArrowBadge(st.mg2Rpm);
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
              : '■ STOP';
      }
      if (wheelKmhRef.current) {
        wheelKmhRef.current.textContent = `${Math.abs(Math.round(st.speedKmh))} km/h`;
      }
      if (wheelTravelRef.current) {
        wheelTravelRef.current.textContent =
          wheelDir === RotationDir.CW
            ? 'FWD'
            : wheelDir === RotationDir.CCW
              ? 'REV'
              : 'STOP';
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

      {/* Top-Left Title + Complete 5-Component Color Key */}
      <div
        ref={topBarRef}
        className="pointer-events-none absolute top-3 left-3.5 z-10 inline-flex w-fit max-w-[calc(100vw-232px)] flex-wrap items-center gap-x-2.5 gap-y-1 px-2.5 py-1 rounded-lg bg-slate-950/68 border border-slate-800/75 text-[11.5px] text-slate-300"
      >
        <span className="font-display font-bold text-xs text-slate-100 whitespace-nowrap">
          5th-Gen Toyota PSD
        </span>
        <span className="text-slate-600 hidden sm:inline">·</span>
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <span
            className="w-2 h-2 rounded-xs"
            style={{ backgroundColor: COMPONENT_COLORS.ice.hex }}
          />
          <span>ICE + Carrier &amp; Planets</span>
        </span>
        <span className="text-slate-600">·</span>
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <span
            className="w-2 h-2 rounded-xs"
            style={{ backgroundColor: COMPONENT_COLORS.mg1.hex }}
          />
          <span>MG1 + Sun</span>
        </span>
        <span className="text-slate-600">·</span>
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <span
            className="w-2 h-2 rounded-xs"
            style={{ backgroundColor: COMPONENT_COLORS.mg2.hex }}
          />
          <span>MG2 + Ring &amp; Gears</span>
        </span>
        <span className="text-slate-600">·</span>
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <span
            className="w-2 h-2 rounded-xs"
            style={{ backgroundColor: COMPONENT_COLORS.wheel.hex }}
          />
          <span>Wheel + Tire</span>
        </span>
        <span className="text-slate-600">·</span>
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <span
            className="w-2 h-2 rounded-xs"
            style={{ backgroundColor: COMPONENT_COLORS.battery.hex }}
          />
          <span>HV Batt + PCU</span>
        </span>
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
          className="absolute top-0 left-0 w-[172px] px-2.5 py-1 rounded-lg bg-slate-950/74 border border-red-500/45 shadow-md"
        >
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-red-400 whitespace-nowrap">
            <span className="inline-block w-2 h-2 rounded-xs bg-red-500" />
            <span>ICE · Carrier &amp; Planets</span>
          </div>
          <div className="flex items-center justify-between mt-0.5 text-[11.5px] font-mono text-slate-100 whitespace-nowrap">
            <span ref={iceValRef}>0 RPM</span>
            <span ref={iceDirRef} className="text-red-300">
              ■ STOP
            </span>
          </div>
        </div>

        {/* 2. HV Battery · PCU */}
        <div
          ref={battTagRef}
          className="absolute top-0 left-0 w-[182px] px-2.5 py-1 rounded-lg bg-slate-950/74 border border-emerald-500/50 shadow-md"
        >
          <div className="flex items-center justify-between gap-1 text-[11px] font-semibold text-emerald-400 whitespace-nowrap">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-xs bg-emerald-500" />
              <span>HV Battery · PCU</span>
            </span>
            <span ref={battSocRef} className="font-mono text-emerald-200">
              SoC 60%
            </span>
          </div>
          <div className="flex items-center justify-between mt-0.5 text-[11px] font-mono whitespace-nowrap">
            <span ref={battStatusRef} className="text-slate-300">
              ■ STANDBY
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
          className="absolute top-0 left-0 w-[172px] px-2.5 py-1 rounded-lg bg-slate-950/74 border border-amber-500/45 shadow-md"
        >
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-400 whitespace-nowrap">
            <span className="inline-block w-2 h-2 rounded-xs bg-amber-500" />
            <span>MG1 · Sun Gear</span>
          </div>
          <div className="flex items-center justify-between mt-0.5 text-[11.5px] font-mono text-slate-100 whitespace-nowrap">
            <span ref={mg1ValRef}>0 RPM</span>
            <span ref={mg1DirRef} className="text-amber-300">
              ■ STOP
            </span>
          </div>
        </div>

        {/* 4. MG2 · Ring & Counter */}
        <div
          ref={mg2TagRef}
          className="absolute top-0 left-0 w-[172px] px-2.5 py-1 rounded-lg bg-slate-950/74 border border-cyan-500/45 shadow-md"
        >
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-400 whitespace-nowrap">
            <span className="inline-block w-2 h-2 rounded-xs bg-cyan-500" />
            <span>MG2 · Ring &amp; Gears</span>
          </div>
          <div className="flex items-center justify-between mt-0.5 text-[11.5px] font-mono text-slate-100 whitespace-nowrap">
            <span ref={mg2ValRef}>0 RPM</span>
            <span ref={mg2DirRef} className="text-cyan-300">
              ■ STOP
            </span>
          </div>
        </div>

        {/* 5. Drive Wheel · Final Axle */}
        <div
          ref={wheelTagRef}
          className="absolute top-0 left-0 w-[174px] px-2.5 py-1 rounded-lg bg-slate-950/74 border border-violet-500/45 shadow-md"
        >
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-violet-400 whitespace-nowrap">
            <span className="inline-block w-2 h-2 rounded-xs bg-violet-500" />
            <span>Wheel · Final Axle</span>
          </div>
          <div className="flex items-center justify-between mt-0.5 text-[11.5px] font-mono text-slate-100 whitespace-nowrap">
            <span ref={wheelRpmRef}>0 RPM</span>
            <span ref={wheelTurnRef} className="text-violet-300">
              ■ STOP
            </span>
          </div>
          <div className="flex items-center justify-between text-[11.5px] font-mono text-violet-200 whitespace-nowrap">
            <span ref={wheelKmhRef}>0 km/h</span>
            <span ref={wheelTravelRef} className="font-semibold text-violet-300">
              STOP
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
