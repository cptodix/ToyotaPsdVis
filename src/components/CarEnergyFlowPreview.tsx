import React, { useEffect, useState } from 'react';
import {
  AutoDriveEventKind,
  AutoDriveMode,
  COMPONENT_COLORS,
  PowertrainState,
} from '../types/hybrid';

interface CarEnergyFlowPreviewProps {
  state: PowertrainState;
  timeScale?: number;
}

interface FlowArrowProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kw: number;
  posColor: string;
  negColor: string;
  phase: number;
}

const FlowArrow: React.FC<FlowArrowProps> = ({
  x1,
  y1,
  x2,
  y2,
  kw,
  posColor,
  negColor,
  phase,
}) => {
  const absKw = Math.abs(kw);
  const active = absKw >= 0.35;
  const color = kw >= 0 ? posColor : negColor;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;

  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={active ? color : '#475569'}
        strokeWidth={active ? 2.2 : 1.1}
        strokeOpacity={active ? 0.55 : 0.4}
      />
      {active &&
        [0, 0.5].map((offset, idx) => {
          const rawT = kw >= 0 ? (phase + offset) % 1 : (1 - ((phase + offset) % 1)) % 1;
          const px = x1 + dx * rawT;
          const py = y1 + dy * rawT;
          const dirSign = kw >= 0 ? 1 : -1;
          const tipX = px + ux * 3.8 * dirSign;
          const tipY = py + uy * 3.8 * dirSign;
          const perpX = -uy * 2.8;
          const perpY = ux * 2.8;
          const tailX = px - ux * 2.2 * dirSign;
          const tailY = py - uy * 2.2 * dirSign;

          return (
            <polygon
              key={idx}
              points={`${tipX.toFixed(1)},${tipY.toFixed(1)} ${(tailX + perpX).toFixed(1)},${(
                tailY + perpY
              ).toFixed(1)} ${(tailX - perpX).toFixed(1)},${(tailY - perpY).toFixed(1)}`}
              fill={color}
            />
          );
        })}
    </g>
  );
};

/**
 * Compact Translucent 5th-Gen Car Preview & Simplified Energy Flow
 * Supports extreme road inclines (-50% to +50%, up to ±26.6° true ramp angle).
 */
export const CarEnergyFlowPreview: React.FC<CarEnergyFlowPreviewProps> = ({
  state,
  timeScale = 1,
}) => {
  const [animState, setAnimState] = useState({ phase: 0, wheelAngle: 0, roadShift: 0 });

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.06) * timeScale;
      last = now;
      setAnimState((prev) => ({
        phase: (prev.phase + dt * 1.15) % 1,
        wheelAngle: (prev.wheelAngle + state.speedKmh * dt * 8.5) % 360,
        roadShift: (((prev.roadShift + state.speedKmh * dt * 1.4) % 28) + 28) % 28,
      }));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [state.speedKmh, timeScale]);

  const braking = state.brakePercent > 2 || state.flows.counterToWheelKw < -1.5;
  const grade = Math.round(state.roadGradePercent);
  const ad = state.autoDrive;
  const isRedSignal =
    ad.mode !== AutoDriveMode.OFF &&
    (ad.eventKind === AutoDriveEventKind.RED_LIGHT_BRAKE ||
      ad.eventKind === AutoDriveEventKind.RED_LIGHT_WAIT);
  const isGreenSignal =
    ad.mode !== AutoDriveMode.OFF && ad.eventKind === AutoDriveEventKind.GREEN_LAUNCH;
  const showLeadVehicle =
    ad.mode !== AutoDriveMode.OFF &&
    (ad.eventKind === AutoDriveEventKind.TRAFFIC_JAM ||
      ad.eventKind === AutoDriveEventKind.HEAVY_TRAFFIC ||
      ad.eventKind === AutoDriveEventKind.TRAFFIC_SLOWDOWN);
  const showOvertakeArrow =
    ad.mode !== AutoDriveMode.OFF && ad.eventKind === AutoDriveEventKind.OVERTAKE;

  const trueSlopeDeg = (Math.atan(state.roadGradePercent / 100) * 180) / Math.PI;
  const gradeTiltDeg = Math.max(-25, Math.min(25, trueSlopeDeg));

  const nIce = { x: 52, y: 38 };
  const nPsdMg1 = { x: 112, y: 31 };
  const nMg2Pcu = { x: 112, y: 66 };
  const nWheel = { x: 60, y: 84 };
  const nBatt = { x: 205, y: 70 };

  return (
    <div className="flex flex-col justify-between px-2 py-1 rounded-lg bg-slate-900/45 border border-slate-700/45 min-[860px]:w-[188px] shrink-0">
      <div className="flex items-center justify-between text-[10px] text-slate-300">
        <span className="font-medium text-slate-300 whitespace-nowrap">
          Incline{' '}
          <span
            className={`font-mono ${
              grade > 0 ? 'text-amber-300' : grade < 0 ? 'text-cyan-300' : 'text-slate-400'
            }`}
          >
            {grade > 0 ? `+${grade}%` : `${grade}%`}
          </span>
        </span>
        <span className="font-mono text-emerald-400 shrink-0 ml-1">
          SoC {Math.round(state.socPercent)}%
        </span>
      </div>

      <svg
        viewBox="-6 -14 280 122"
        className="w-full h-[58px] overflow-visible"
        aria-label="Simplified 5th Gen Car Energy Flow"
      >
        <g transform={`rotate(${gradeTiltDeg.toFixed(2)}, 134, 64)`}>
          {/* Moving Road */}
          <line x1="2" y1="93" x2="262" y2="93" stroke="#334155" strokeWidth="1.6" />
          {Array.from({ length: 10 }).map((_, i) => {
            const rx = 12 + ((i * 28 - animState.roadShift + 280) % 248);
            return (
              <line
                key={i}
                x1={rx}
                y1="95"
                x2={rx + 10}
                y2="95"
                stroke="#64748b"
                strokeWidth="1.5"
              />
            );
          })}

          {/* AutoDrive Traffic Signal Cue (Ahead of Front Bumper) */}
          {(isRedSignal || isGreenSignal) && (
            <g transform="translate(5, 36)">
              <line x1="0" y1="22" x2="0" y2="57" stroke="#64748b" strokeWidth="1.6" />
              <rect
                x="-5"
                y="0"
                width="10"
                height="23"
                rx="2.5"
                fill="#0f172a"
                stroke="#64748b"
                strokeWidth="1.1"
              />
              <circle
                cx="0"
                cy="5.5"
                r="2.7"
                fill={isRedSignal ? '#ef4444' : '#450a0a'}
              />
              <circle cx="0" cy="11.5" r="2.3" fill="#422006" />
              <circle
                cx="0"
                cy="17.5"
                r="2.7"
                fill={isGreenSignal ? '#10b981' : '#052e16'}
              />
            </g>
          )}

          {/* AutoDrive Lead Traffic Cue (Traffic Jam / Heavy Traffic / Slowdown) */}
          {showLeadVehicle && (
            <g transform="translate(-4, 62)">
              <path
                d="M 0 18 L 2 8 L 12 4 L 15 18 Z"
                fill="rgba(245, 158, 11, 0.22)"
                stroke="#f59e0b"
                strokeWidth="1.2"
              />
              <line x1="14.5" y1="9" x2="14.5" y2="14" stroke="#ef4444" strokeWidth="2.2" />
            </g>
          )}

          {/* AutoDrive Passing / Overtake Cue */}
          {showOvertakeArrow && (
            <g transform="translate(-3, 52)">
              <line x1="16" y1="8" x2="2" y2="8" stroke="#c084fc" strokeWidth="2" />
              <polygon points="0,8 6,4 6,12" fill="#c084fc" />
            </g>
          )}

          {/* Car Silhouette (Front faces Left) */}
          <path
            d="M 18 78 L 22 61 C 28 51, 46 46, 72 40 L 126 20 C 152 16, 192 18, 224 32 L 248 47 C 254 53, 255 68, 250 78 Z"
            fill="rgba(15, 23, 42, 0.72)"
            stroke="#475569"
            strokeWidth="1.4"
          />
          <line
            x1="248"
            y1="49"
            x2="252"
            y2="60"
            stroke={braking ? '#ef4444' : '#7f1d1d'}
            strokeWidth={braking ? 3.2 : 1.8}
            strokeLinecap="round"
          />

          {/* 5th-Gen Power Flow Arrows */}
          <FlowArrow
            x1={nIce.x + 14}
            y1={nIce.y}
            x2={nPsdMg1.x - 16}
            y2={nPsdMg1.y}
            kw={state.flows.iceToCarrierKw}
            posColor={COMPONENT_COLORS.ice.hex}
            negColor={COMPONENT_COLORS.mg1.hex}
            phase={animState.phase}
          />
          <FlowArrow
            x1={nPsdMg1.x - 12}
            y1={nPsdMg1.y + 8}
            x2={nWheel.x + 9}
            y2={nWheel.y - 10}
            kw={state.flows.carrierToRingKw}
            posColor={COMPONENT_COLORS.mg2.hex}
            negColor={COMPONENT_COLORS.mg2.hex}
            phase={animState.phase}
          />
          <FlowArrow
            x1={nPsdMg1.x}
            y1={nPsdMg1.y + 9}
            x2={nMg2Pcu.x}
            y2={nMg2Pcu.y - 9}
            kw={state.flows.mg1ToPcuKw}
            posColor={COMPONENT_COLORS.mg1.hex}
            negColor={COMPONENT_COLORS.mg2.hex}
            phase={animState.phase}
          />
          <FlowArrow
            x1={nBatt.x - 21}
            y1={nBatt.y}
            x2={nMg2Pcu.x + 17}
            y2={nMg2Pcu.y}
            kw={state.flows.batteryToPcuKw}
            posColor={COMPONENT_COLORS.battery.hex}
            negColor={COMPONENT_COLORS.mg2.hex}
            phase={animState.phase}
          />
          <FlowArrow
            x1={nMg2Pcu.x - 15}
            y1={nMg2Pcu.y + 4}
            x2={nWheel.x + 12}
            y2={nWheel.y - 4}
            kw={state.flows.mg2ToCounterKw}
            posColor={COMPONENT_COLORS.mg2.hex}
            negColor={COMPONENT_COLORS.battery.hex}
            phase={animState.phase}
          />

          {/* Nodes */}
          <g transform={`translate(${nIce.x}, ${nIce.y})`}>
            <rect
              x="-15"
              y="-8"
              width="30"
              height="16"
              rx="3"
              fill="#1e1b24"
              stroke={COMPONENT_COLORS.ice.hex}
              strokeWidth="1.5"
            />
            <text y="3" textAnchor="middle" className="fill-red-300 text-[7.5px] font-bold">
              ICE
            </text>
          </g>

          <g transform={`translate(${nPsdMg1.x}, ${nPsdMg1.y})`}>
            <rect
              x="-17"
              y="-8"
              width="34"
              height="16"
              rx="3"
              fill="#1c1917"
              stroke={COMPONENT_COLORS.mg1.hex}
              strokeWidth="1.5"
            />
            <text y="3" textAnchor="middle" className="fill-amber-300 text-[7.5px] font-bold">
              MG1
            </text>
          </g>

          <g transform={`translate(${nMg2Pcu.x}, ${nMg2Pcu.y})`}>
            <rect
              x="-17"
              y="-8"
              width="34"
              height="16"
              rx="3"
              fill="#0f1f29"
              stroke={COMPONENT_COLORS.mg2.hex}
              strokeWidth="1.5"
            />
            <text y="3" textAnchor="middle" className="fill-cyan-300 text-[7.5px] font-bold">
              MG2
            </text>
          </g>

          <g transform={`translate(${nBatt.x}, ${nBatt.y})`}>
            <rect
              x="-21"
              y="-9"
              width="42"
              height="18"
              rx="3"
              fill="#0b1f1a"
              stroke={COMPONENT_COLORS.battery.hex}
              strokeWidth="1.5"
            />
            <rect
              x="-18"
              y="-6"
              width={Math.max(3, (state.socPercent / 100) * 36)}
              height="12"
              rx="1.5"
              fill={COMPONENT_COLORS.battery.hex}
              fillOpacity="0.3"
            />
            <text y="3" textAnchor="middle" className="fill-emerald-300 text-[7.5px] font-bold">
              BATT
            </text>
          </g>

          {/* Front Drive Wheel (Violet) */}
          <g transform={`translate(${nWheel.x}, ${nWheel.y}) rotate(${-animState.wheelAngle})`}>
            <circle r="10.5" fill="#0f172a" stroke={COMPONENT_COLORS.wheel.hex} strokeWidth="2.2" />
            <line x1="-8" y1="0" x2="8" y2="0" stroke={COMPONENT_COLORS.wheel.hex} strokeWidth="1.4" />
            <line x1="0" y1="-8" x2="0" y2="8" stroke={COMPONENT_COLORS.wheel.hex} strokeWidth="1.4" />
          </g>

          {/* Rear Wheel */}
          <g transform={`translate(216, 84) rotate(${-animState.wheelAngle})`}>
            <circle r="10.5" fill="#0f172a" stroke="#64748b" strokeWidth="1.8" />
            <line x1="-7" y1="0" x2="7" y2="0" stroke="#64748b" strokeWidth="1.3" />
            <line x1="0" y1="-7" x2="0" y2="7" stroke="#64748b" strokeWidth="1.3" />
          </g>
        </g>
      </svg>
    </div>
  );
};
