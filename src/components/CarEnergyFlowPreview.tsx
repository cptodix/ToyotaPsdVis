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
  className?: string;
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
        strokeWidth={active ? 2.6 : 1.3}
        strokeOpacity={active ? 0.65 : 0.42}
      />
      {active &&
        [0, 0.5].map((offset, idx) => {
          const rawT = kw >= 0 ? (phase + offset) % 1 : (1 - ((phase + offset) % 1)) % 1;
          const px = x1 + dx * rawT;
          const py = y1 + dy * rawT;
          const dirSign = kw >= 0 ? 1 : -1;
          const tipX = px + ux * 4.4 * dirSign;
          const tipY = py + uy * 4.4 * dirSign;
          const perpX = -uy * 3.3;
          const perpY = ux * 3.3;
          const tailX = px - ux * 2.5 * dirSign;
          const tailY = py - uy * 2.5 * dirSign;

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
 * Full-Frame 5th-Gen Car Preview & Simplified Energy Flow Diagram
 * Enlarged to fill its card frame cleanly with road inclination & scenario cues.
 */
export const CarEnergyFlowPreview: React.FC<CarEnergyFlowPreviewProps> = ({
  state,
  timeScale = 1,
  className = '',
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
  const isMountain = ad.mode === AutoDriveMode.MOUNTAIN;

  const trueSlopeDeg = (Math.atan(state.roadGradePercent / 100) * 180) / Math.PI;
  const gradeTiltDeg = Math.max(-6.5, Math.min(6.5, trueSlopeDeg * 0.32));

  const nIce = { x: 54, y: 40 };
  const nPsdMg1 = { x: 116, y: 31 };
  const nMg2Pcu = { x: 116, y: 66 };
  const nWheel = { x: 60, y: 83.5 };
  const nBatt = { x: 206, y: 69 };

  return (
    <div
      className={`flex flex-col justify-between px-1 min-[760px]:px-1.5 py-1 rounded-lg bg-slate-900/45 border border-slate-700/45 w-full h-full min-w-0 overflow-hidden ${className}`}
    >
      <div className="flex items-center justify-between text-[8px] min-[760px]:text-[9px] min-[960px]:text-[10px] text-slate-300 leading-none min-w-0">
        <span className="font-medium text-slate-300 whitespace-nowrap">
          <span className="min-[920px]:hidden">Inc </span>
          <span className="hidden min-[920px]:inline">Incline </span>
          <span
            className={`font-mono tabular-nums font-semibold ${
              grade > 0 ? 'text-amber-300' : grade < 0 ? 'text-cyan-300' : 'text-slate-400'
            }`}
          >
            {grade > 0 ? `+${grade}%` : `${grade}%`}
          </span>
        </span>
        <span className="font-mono tabular-nums font-semibold text-emerald-400 shrink-0 ml-0.5 whitespace-nowrap">
          SoC {Math.round(state.socPercent)}%
        </span>
      </div>

      <div className="relative w-full h-[50px] min-[920px]:h-[58px] overflow-hidden mt-0.5">
        <svg
          viewBox="-8 9 272 95"
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full block overflow-hidden"
          aria-label="5th Gen Car Energy Flow Diagram"
        >
          {/* Subtle Mountain Backdrop Silhouette during Countryside Mountain AutoDrive */}
          {isMountain && (
            <path
              d="M 10 92 L 54 34 L 92 68 L 146 22 L 204 72 L 236 44 L 258 92 Z"
              fill="rgba(51, 65, 85, 0.25)"
              stroke="#475569"
              strokeOpacity="0.35"
              strokeWidth="1"
            />
          )}

          <g transform={`rotate(${gradeTiltDeg.toFixed(2)}, 132, 56)`}>
            {/* Moving Road */}
            <line x1="0" y1="94.5" x2="258" y2="94.5" stroke="#475569" strokeWidth="1.8" />
          {Array.from({ length: 10 }).map((_, i) => {
            const rx = 10 + ((i * 28 - animState.roadShift + 280) % 248);
            return (
              <line
                key={i}
                x1={rx}
                y1="97.5"
                x2={rx + 11}
                y2="97.5"
                stroke="#64748b"
                strokeWidth="1.6"
              />
            );
          })}

          {/* AutoDrive Traffic Signal Cue */}
          {(isRedSignal || isGreenSignal) && (
            <g transform="translate(5, 36)">
              <line x1="0" y1="23" x2="0" y2="59" stroke="#64748b" strokeWidth="1.6" />
              <rect
                x="-5"
                y="0"
                width="10"
                height="24"
                rx="2.5"
                fill="#0f172a"
                stroke="#64748b"
                strokeWidth="1.1"
              />
              <circle cx="0" cy="5.8" r="2.8" fill={isRedSignal ? '#ef4444' : '#450a0a'} />
              <circle cx="0" cy="12" r="2.4" fill="#422006" />
              <circle cx="0" cy="18.2" r="2.8" fill={isGreenSignal ? '#10b981' : '#052e16'} />
            </g>
          )}

          {/* AutoDrive Lead Traffic Cue */}
          {showLeadVehicle && (
            <g transform="translate(-4, 62)">
              <path
                d="M 0 18 L 2 8 L 12 4 L 15 18 Z"
                fill="rgba(245, 158, 11, 0.25)"
                stroke="#f59e0b"
                strokeWidth="1.3"
              />
              <line x1="14.5" y1="9" x2="14.5" y2="14" stroke="#ef4444" strokeWidth="2.4" />
            </g>
          )}

          {/* AutoDrive Overtake Cue */}
          {showOvertakeArrow && (
            <g transform="translate(-3, 52)">
              <line x1="16" y1="8" x2="2" y2="8" stroke="#c084fc" strokeWidth="2.2" />
              <polygon points="0,8 6,4 6,12" fill="#c084fc" />
            </g>
          )}

          {/* Enlarged Car Silhouette (Front faces Left) */}
          <path
            d="M 16 80 L 20 61 C 27 50, 46 45, 73 38 L 128 16 C 156 12, 196 15, 228 30 L 252 46 C 257 53, 258 69, 253 80 Z"
            fill="rgba(15, 23, 42, 0.78)"
            stroke="#64748b"
            strokeWidth="1.6"
          />
          <line
            x1="251"
            y1="48"
            x2="255"
            y2="60"
            stroke={braking ? '#ef4444' : '#7f1d1d'}
            strokeWidth={braking ? 3.6 : 2.0}
            strokeLinecap="round"
          />

          {/* 5th-Gen Power Flow Arrows */}
          <FlowArrow
            x1={nIce.x + 16}
            y1={nIce.y}
            x2={nPsdMg1.x - 18}
            y2={nPsdMg1.y}
            kw={state.flows.iceToCarrierKw}
            posColor={COMPONENT_COLORS.ice.hex}
            negColor={COMPONENT_COLORS.mg1.hex}
            phase={animState.phase}
          />
          <FlowArrow
            x1={nPsdMg1.x - 13}
            y1={nPsdMg1.y + 9}
            x2={nWheel.x + 10}
            y2={nWheel.y - 11}
            kw={state.flows.carrierToRingKw}
            posColor={COMPONENT_COLORS.mg2.hex}
            negColor={COMPONENT_COLORS.mg2.hex}
            phase={animState.phase}
          />
          <FlowArrow
            x1={nPsdMg1.x}
            y1={nPsdMg1.y + 9.5}
            x2={nMg2Pcu.x}
            y2={nMg2Pcu.y - 9.5}
            kw={state.flows.mg1ToPcuKw}
            posColor={COMPONENT_COLORS.mg1.hex}
            negColor={COMPONENT_COLORS.mg2.hex}
            phase={animState.phase}
          />
          <FlowArrow
            x1={nBatt.x - 23}
            y1={nBatt.y}
            x2={nMg2Pcu.x + 19}
            y2={nMg2Pcu.y}
            kw={state.flows.batteryToPcuKw}
            posColor={COMPONENT_COLORS.battery.hex}
            negColor={COMPONENT_COLORS.mg2.hex}
            phase={animState.phase}
          />
          <FlowArrow
            x1={nMg2Pcu.x - 17}
            y1={nMg2Pcu.y + 4}
            x2={nWheel.x + 13}
            y2={nWheel.y - 4}
            kw={state.flows.mg2ToCounterKw}
            posColor={COMPONENT_COLORS.mg2.hex}
            negColor={COMPONENT_COLORS.battery.hex}
            phase={animState.phase}
          />

          {/* Enlarged Component Nodes */}
          <g transform={`translate(${nIce.x}, ${nIce.y})`}>
            <rect
              x="-17"
              y="-9"
              width="34"
              height="18"
              rx="3.5"
              fill="#1e1b24"
              stroke={COMPONENT_COLORS.ice.hex}
              strokeWidth="1.6"
            />
            <text y="3.2" textAnchor="middle" className="fill-red-300 text-[8.5px] font-bold">
              ICE
            </text>
          </g>

          <g transform={`translate(${nPsdMg1.x}, ${nPsdMg1.y})`}>
            <rect
              x="-19"
              y="-9"
              width="38"
              height="18"
              rx="3.5"
              fill="#1c1917"
              stroke={COMPONENT_COLORS.mg1.hex}
              strokeWidth="1.6"
            />
            <text y="3.2" textAnchor="middle" className="fill-amber-300 text-[8.5px] font-bold">
              MG1
            </text>
          </g>

          <g transform={`translate(${nMg2Pcu.x}, ${nMg2Pcu.y})`}>
            <rect
              x="-19"
              y="-9"
              width="38"
              height="18"
              rx="3.5"
              fill="#0f1f29"
              stroke={COMPONENT_COLORS.mg2.hex}
              strokeWidth="1.6"
            />
            <text y="3.2" textAnchor="middle" className="fill-cyan-300 text-[8.5px] font-bold">
              MG2
            </text>
          </g>

          <g transform={`translate(${nBatt.x}, ${nBatt.y})`}>
            <rect
              x="-23"
              y="-9.5"
              width="46"
              height="19"
              rx="3.5"
              fill="#0b1f1a"
              stroke={COMPONENT_COLORS.battery.hex}
              strokeWidth="1.6"
            />
            <rect
              x="-20"
              y="-6.5"
              width={Math.max(3, (state.socPercent / 100) * 40)}
              height="13"
              rx="2"
              fill={COMPONENT_COLORS.battery.hex}
              fillOpacity="0.34"
            />
            <text y="3.2" textAnchor="middle" className="fill-emerald-300 text-[8.5px] font-bold">
              BATT
            </text>
          </g>

            {/* Front Drive Wheel (Violet) */}
            <g transform={`translate(${nWheel.x}, ${nWheel.y}) rotate(${-animState.wheelAngle})`}>
              <circle r="10.8" fill="#0f172a" stroke={COMPONENT_COLORS.wheel.hex} strokeWidth="2.3" />
              <line x1="-8.5" y1="0" x2="8.5" y2="0" stroke={COMPONENT_COLORS.wheel.hex} strokeWidth="1.5" />
              <line x1="0" y1="-8.5" x2="0" y2="8.5" stroke={COMPONENT_COLORS.wheel.hex} strokeWidth="1.5" />
            </g>

            {/* Rear Wheel */}
            <g transform={`translate(218, 83.5) rotate(${-animState.wheelAngle})`}>
              <circle r="10.8" fill="#0f172a" stroke="#64748b" strokeWidth="2.0" />
              <line x1="-7.8" y1="0" x2="7.8" y2="0" stroke="#64748b" strokeWidth="1.4" />
              <line x1="0" y1="-7.8" x2="0" y2="7.8" stroke="#64748b" strokeWidth="1.4" />
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
};
