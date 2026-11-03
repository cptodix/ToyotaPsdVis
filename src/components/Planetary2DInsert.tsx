import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { getRotationDirection, PSD_CONSTANTS } from '../simulation/ths5Engine';
import { COMPONENT_COLORS, PowertrainState, RotationDir } from '../types/hybrid';

interface Planetary2DInsertProps {
  stateRef: React.MutableRefObject<PowertrainState>;
  state: PowertrainState;
  timeScale?: number;
}

function buildExternalGearPath(
  teeth: number,
  pitchR: number,
  addendum: number,
  dedendum: number
): string {
  const outerR = pitchR + addendum;
  const rootR = pitchR - dedendum;
  const step = (Math.PI * 2) / teeth;
  const pts: string[] = [];

  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const a1 = a0 + step * 0.18;
    const a2 = a0 + step * 0.34;
    const a3 = a0 + step * 0.66;
    const a4 = a0 + step * 0.82;

    pts.push(
      `${i === 0 ? 'M' : 'L'} ${(rootR * Math.cos(a0)).toFixed(2)} ${(rootR * Math.sin(a0)).toFixed(2)}`
    );
    pts.push(`L ${(rootR * Math.cos(a1)).toFixed(2)} ${(rootR * Math.sin(a1)).toFixed(2)}`);
    pts.push(`L ${(outerR * Math.cos(a2)).toFixed(2)} ${(outerR * Math.sin(a2)).toFixed(2)}`);
    pts.push(`L ${(outerR * Math.cos(a3)).toFixed(2)} ${(outerR * Math.sin(a3)).toFixed(2)}`);
    pts.push(`L ${(rootR * Math.cos(a4)).toFixed(2)} ${(rootR * Math.sin(a4)).toFixed(2)}`);
  }
  pts.push('Z');
  return pts.join(' ');
}

function buildInternalRingGearPath(
  teeth: number,
  pitchR: number,
  outerRimR: number,
  toothDepth: number
): string {
  const innerTipR = pitchR - toothDepth * 0.5;
  const innerRootR = pitchR + toothDepth * 0.5;
  const step = (Math.PI * 2) / teeth;

  const outerCircle = `M ${outerRimR} 0 A ${outerRimR} ${outerRimR} 0 1 1 ${-outerRimR} 0 A ${outerRimR} ${outerRimR} 0 1 1 ${outerRimR} 0 Z`;

  const innerPts: string[] = [];
  for (let i = teeth - 1; i >= 0; i--) {
    const a0 = i * step;
    const a1 = a0 + step * 0.18;
    const a2 = a0 + step * 0.34;
    const a3 = a0 + step * 0.66;
    const a4 = a0 + step * 0.82;

    innerPts.push(
      `${i === teeth - 1 ? 'M' : 'L'} ${(innerRootR * Math.cos(a4)).toFixed(2)} ${(
        innerRootR * Math.sin(a4)
      ).toFixed(2)}`
    );
    innerPts.push(
      `L ${(innerTipR * Math.cos(a3)).toFixed(2)} ${(innerTipR * Math.sin(a3)).toFixed(2)}`
    );
    innerPts.push(
      `L ${(innerTipR * Math.cos(a2)).toFixed(2)} ${(innerTipR * Math.sin(a2)).toFixed(2)}`
    );
    innerPts.push(
      `L ${(innerRootR * Math.cos(a1)).toFixed(2)} ${(innerRootR * Math.sin(a1)).toFixed(2)}`
    );
    innerPts.push(
      `L ${(innerRootR * Math.cos(a0)).toFixed(2)} ${(innerRootR * Math.sin(a0)).toFixed(2)}`
    );
  }
  innerPts.push('Z');
  return `${outerCircle} ${innerPts.join(' ')}`;
}

const CurvedTurnArrow: React.FC<{
  radius: number;
  centerDeg: number;
  spanDeg: number;
  dir: RotationDir;
  color: string;
  strokeWidth?: number;
  headSize?: number;
}> = ({ radius, centerDeg, spanDeg, dir, color, strokeWidth = 2.4, headSize = 5.4 }) => {
  if (dir === RotationDir.STOP) {
    const rad = (centerDeg * Math.PI) / 180;
    const cx = radius * Math.cos(rad);
    const cy = radius * Math.sin(rad);
    return (
      <rect
        x={cx - 2.6}
        y={cy - 2.6}
        width={5.2}
        height={5.2}
        rx={1}
        fill={color}
        fillOpacity={0.75}
      />
    );
  }

  const half = spanDeg * 0.5;
  const startDeg = dir === RotationDir.CW ? centerDeg - half : centerDeg + half;
  const endDeg = dir === RotationDir.CW ? centerDeg + half : centerDeg - half;

  const sRad = (startDeg * Math.PI) / 180;
  const eRad = (endDeg * Math.PI) / 180;

  const sx = radius * Math.cos(sRad);
  const sy = radius * Math.sin(sRad);
  const ex = radius * Math.cos(eRad);
  const ey = radius * Math.sin(eRad);

  const sweepFlag = dir === RotationDir.CW ? 1 : 0;
  const largeArc = spanDeg > 180 ? 1 : 0;

  const tx = dir === RotationDir.CW ? -Math.sin(eRad) : Math.sin(eRad);
  const ty = dir === RotationDir.CW ? Math.cos(eRad) : -Math.cos(eRad);
  const nx = -ty;
  const ny = tx;

  const tipX = ex + tx * (headSize * 0.65);
  const tipY = ey + ty * (headSize * 0.65);
  const baseX = ex - tx * (headSize * 0.75);
  const baseY = ey - ty * (headSize * 0.75);
  const w = headSize * 0.68;

  const headPoints = `${tipX.toFixed(1)},${tipY.toFixed(1)} ${(baseX + nx * w).toFixed(1)},${(
    baseY + ny * w
  ).toFixed(1)} ${(baseX - nx * w).toFixed(1)},${(baseY - ny * w).toFixed(1)}`;

  return (
    <g>
      <path
        d={`M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} ${sweepFlag} ${ex.toFixed(
          2
        )} ${ey.toFixed(2)}`}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <polygon points={headPoints} fill={color} />
    </g>
  );
};

function formatShortDir(rpm: number): string {
  const dir = getRotationDirection(rpm);
  if (dir === RotationDir.CW) return '↻ CW';
  if (dir === RotationDir.CCW) return '↺ CCW';
  return '■ 0';
}

export const Planetary2DInsert = forwardRef<HTMLElement, Planetary2DInsertProps>(
  function Planetary2DInsert({ stateRef, state, timeScale = 1 }, ref) {
    const [minimized, setMinimized] = useState(false);
    const timeScaleRef = useRef(timeScale);
    timeScaleRef.current = timeScale;

    const ringGearRef = useRef<SVGGElement | null>(null);
    const carrierGroupRef = useRef<SVGGElement | null>(null);
    const sunGearRef = useRef<SVGGElement | null>(null);
    const planetRefs = useRef<Array<SVGPathElement | null>>([null, null, null, null]);

    const rSun = 24.75;
    const rPlanet = 19.8;
    const rOrbit = rSun + rPlanet;
    const rRing = 64.35;
    const rRingOuter = 73.5;

    const sunPath = useMemo(() => buildExternalGearPath(15, rSun, 2.5, 2.7), [rSun]);
    const planetPath = useMemo(() => buildExternalGearPath(12, rPlanet, 2.5, 2.7), [rPlanet]);
    const ringPath = useMemo(
      () => buildInternalRingGearPath(39, rRing, rRingOuter, 5.2),
      [rRing, rRingOuter]
    );

    useEffect(() => {
      let raf = 0;
      let last = performance.now();
      let degIce = 0;
      let degSun = 0;

      const animate = (now: number) => {
        const dt = Math.min((now - last) / 1000, 0.06) * timeScaleRef.current;
        last = now;

        const st = stateRef.current;
        const rpmToDegPerSec = 0.105;
        degIce = (degIce + st.iceRpm * rpmToDegPerSec * dt) % 360;
        degSun = (degSun + st.mg1Rpm * rpmToDegPerSec * dt) % 360;
        const degRing =
          ((PSD_CONSTANTS.Z_SUN + PSD_CONSTANTS.Z_RING) / PSD_CONSTANTS.Z_RING) * degIce -
          (PSD_CONSTANTS.Z_SUN / PSD_CONSTANTS.Z_RING) * degSun;

        const relSunCarrier = degSun - degIce;
        const sunToPlanet = PSD_CONSTANTS.Z_SUN / PSD_CONSTANTS.Z_PLANET;

        if (ringGearRef.current) {
          ringGearRef.current.setAttribute('transform', `rotate(${degRing.toFixed(2)})`);
        }
        if (carrierGroupRef.current) {
          carrierGroupRef.current.setAttribute('transform', `rotate(${degIce.toFixed(2)})`);
        }
        if (sunGearRef.current) {
          sunGearRef.current.setAttribute('transform', `rotate(${degSun.toFixed(2)})`);
        }
        for (let i = 0; i < 4; i++) {
          const pEl = planetRefs.current[i];
          if (pEl) {
            const betaDeg = i * 90;
            const localDeg = 15 - betaDeg * sunToPlanet - relSunCarrier * sunToPlanet;
            pEl.setAttribute('transform', `rotate(${localDeg.toFixed(2)})`);
          }
        }

        raf = requestAnimationFrame(animate);
      };

      raf = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(raf);
    }, [stateRef]);

    const sunDir = getRotationDirection(state.mg1Rpm);
    const carrierDir = getRotationDirection(state.iceRpm);
    const planetDir = getRotationDirection(state.planetLocalRpm);
    const ringDir = getRotationDirection(state.ringRpm);

    return (
      <aside
        ref={ref}
        aria-label="2D Planetary Gear Speed and Direction Insert"
        className="pointer-events-auto absolute top-3 right-3.5 z-20 w-[214px] rounded-xl bg-slate-950/78 border border-slate-700/65 shadow-xl text-slate-200 select-none"
      >
        <div className="flex items-center justify-between px-2.5 py-1 border-b border-slate-800/80">
          <span className="font-display font-bold text-xs text-slate-100 tracking-tight whitespace-nowrap">
            2D Planetary Gear
          </span>
          <button
            type="button"
            onClick={() => setMinimized((prev) => !prev)}
            className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors"
            title={minimized ? 'Expand 2D Planetary View' : 'Minimize 2D Planetary View'}
          >
            {minimized ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>

        {!minimized && (
          <div className="p-2 space-y-1.5">
            <div className="relative flex items-center justify-center bg-slate-900/55 rounded-lg border border-slate-800/70 py-1">
              <svg
                viewBox="-92 -92 184 184"
                className="w-[130px] h-[130px] overflow-visible"
                aria-hidden="true"
              >
                {/* 1. Outer Ring Gear (Electric Cyan — MG2 & Wheel) */}
                <g ref={ringGearRef}>
                  <path
                    d={ringPath}
                    fillRule="evenodd"
                    fill={COMPONENT_COLORS.mg2.hex}
                    fillOpacity={0.28}
                    stroke={COMPONENT_COLORS.mg2.hex}
                    strokeWidth={1.5}
                  />
                </g>

                <CurvedTurnArrow
                  radius={82}
                  centerDeg={-90}
                  spanDeg={56}
                  dir={ringDir}
                  color="#22d3ee"
                  strokeWidth={2.8}
                  headSize={6.4}
                />
                <CurvedTurnArrow
                  radius={82}
                  centerDeg={90}
                  spanDeg={56}
                  dir={ringDir}
                  color="#22d3ee"
                  strokeWidth={2.8}
                  headSize={6.4}
                />

                {/* 2. Thin 4-Spoke Carrier + 4 Planet Gears (Crimson — ICE) */}
                <g ref={carrierGroupRef}>
                  <line
                    x1={-rOrbit}
                    y1={0}
                    x2={rOrbit}
                    y2={0}
                    stroke={COMPONENT_COLORS.ice.hex}
                    strokeWidth={3.2}
                    strokeOpacity={0.85}
                  />
                  <line
                    x1={0}
                    y1={-rOrbit}
                    x2={0}
                    y2={rOrbit}
                    stroke={COMPONENT_COLORS.ice.hex}
                    strokeWidth={3.2}
                    strokeOpacity={0.85}
                  />

                  {[0, 1, 2, 3].map((idx) => {
                    const rad = (idx * Math.PI) / 2;
                    const px = rOrbit * Math.cos(rad);
                    const py = rOrbit * Math.sin(rad);
                    return (
                      <g key={idx} transform={`translate(${px.toFixed(2)}, ${py.toFixed(2)})`}>
                        <path
                          ref={(el) => {
                            planetRefs.current[idx] = el;
                          }}
                          d={planetPath}
                          fill="#ef4444"
                          fillOpacity={0.38}
                          stroke="#fca5a5"
                          strokeWidth={1.3}
                        />
                        <circle r={3.2} fill="#dc2626" stroke="#fecaca" strokeWidth={0.9} />
                        <CurvedTurnArrow
                          radius={11.5}
                          centerDeg={-90}
                          spanDeg={135}
                          dir={planetDir}
                          color="#fef2f2"
                          strokeWidth={1.9}
                          headSize={4.4}
                        />
                      </g>
                    );
                  })}
                </g>

                <CurvedTurnArrow
                  radius={rOrbit}
                  centerDeg={-45}
                  spanDeg={34}
                  dir={carrierDir}
                  color="#f87171"
                  strokeWidth={2.6}
                  headSize={5.6}
                />
                <CurvedTurnArrow
                  radius={rOrbit}
                  centerDeg={135}
                  spanDeg={34}
                  dir={carrierDir}
                  color="#f87171"
                  strokeWidth={2.6}
                  headSize={5.6}
                />

                {/* 3. Center Sun Gear (Solar Amber — MG1) */}
                <g ref={sunGearRef}>
                  <path
                    d={sunPath}
                    fill={COMPONENT_COLORS.mg1.hex}
                    fillOpacity={0.42}
                    stroke="#fcd34d"
                    strokeWidth={1.4}
                  />
                  <circle r={6.2} fill="#78350f" stroke={COMPONENT_COLORS.mg1.hex} strokeWidth={1.4} />
                </g>

                <CurvedTurnArrow
                  radius={14.5}
                  centerDeg={-90}
                  spanDeg={165}
                  dir={sunDir}
                  color="#fde68a"
                  strokeWidth={2.5}
                  headSize={5.4}
                />
              </svg>
            </div>

            {/* Compact Color-Coded RPM & Connection Legend */}
            <div className="space-y-0.5 text-[10.5px]">
              <div className="flex items-center justify-between gap-1 px-1.5 py-0.5 rounded bg-slate-900/65 border border-amber-500/30">
                <span className="inline-flex items-center gap-1 font-semibold text-amber-300 whitespace-nowrap">
                  <span
                    className="w-2 h-2 rounded-xs shrink-0"
                    style={{ backgroundColor: COMPONENT_COLORS.mg1.hex }}
                  />
                  <span>Sun→MG1</span>
                </span>
                <span className="font-mono whitespace-nowrap">
                  <span className="text-amber-200">{formatShortDir(state.mg1Rpm)}</span>{' '}
                  <span className="text-slate-100 inline-block w-[46px] text-right">
                    {Math.round(state.mg1Rpm)}
                  </span>
                </span>
              </div>

              <div className="flex items-center justify-between gap-1 px-1.5 py-0.5 rounded bg-slate-900/65 border border-red-500/30">
                <span className="inline-flex items-center gap-1 font-semibold text-red-300 whitespace-nowrap">
                  <span
                    className="w-2 h-2 rounded-xs shrink-0"
                    style={{ backgroundColor: COMPONENT_COLORS.ice.hex }}
                  />
                  <span>Carrier→ICE</span>
                </span>
                <span className="font-mono whitespace-nowrap">
                  <span className="text-red-200">{formatShortDir(state.iceRpm)}</span>{' '}
                  <span className="text-slate-100 inline-block w-[46px] text-right">
                    {Math.round(state.iceRpm)}
                  </span>
                </span>
              </div>

              <div className="flex items-center justify-between gap-1 px-1.5 py-0.5 rounded bg-slate-900/65 border border-red-400/25">
                <span className="inline-flex items-center gap-1 font-medium text-red-200 whitespace-nowrap">
                  <span className="w-2 h-2 rounded-xs shrink-0 bg-red-400" />
                  <span>Planets (Pin)</span>
                </span>
                <span className="font-mono whitespace-nowrap">
                  <span className="text-red-200">{formatShortDir(state.planetLocalRpm)}</span>{' '}
                  <span className="text-slate-100 inline-block w-[46px] text-right">
                    {Math.round(state.planetLocalRpm)}
                  </span>
                </span>
              </div>

              <div className="flex items-center justify-between gap-1 px-1.5 py-0.5 rounded bg-slate-900/65 border border-cyan-500/30">
                <span className="inline-flex items-center gap-1 font-semibold text-cyan-300 whitespace-nowrap">
                  <span
                    className="w-2 h-2 rounded-xs shrink-0"
                    style={{ backgroundColor: COMPONENT_COLORS.mg2.hex }}
                  />
                  <span>Ring→MG2/Whl</span>
                </span>
                <span className="font-mono whitespace-nowrap">
                  <span className="text-cyan-200">{formatShortDir(state.ringRpm)}</span>{' '}
                  <span className="text-slate-100 inline-block w-[46px] text-right">
                    {Math.round(state.ringRpm)}
                  </span>
                </span>
              </div>
            </div>
          </div>
        )}
      </aside>
    );
  }
);
