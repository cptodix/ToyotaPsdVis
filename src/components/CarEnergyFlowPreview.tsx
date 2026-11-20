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
        strokeWidth={active ? 2.5 : 1.3}
        strokeOpacity={active ? 0.68 : 0.38}
      />
      {active &&
        [0, 0.5].map((offset, idx) => {
          const rawT = kw >= 0 ? (phase + offset) % 1 : (1 - ((phase + offset) % 1)) % 1;
          const px = x1 + dx * rawT;
          const py = y1 + dy * rawT;
          const dirSign = kw >= 0 ? 1 : -1;
          const tipX = px + ux * 4.4 * dirSign;
          const tipY = py + uy * 4.4 * dirSign;
          const perpX = -uy * 3.2;
          const perpY = ux * 3.2;
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
 * Simplified Real-Car Hybrid Energy Monitor (BATT · ICE · WHEEL only)
 * framed inside a Toyota Innova Zenix Hybrid (AG10) MPV-crossover silhouette.
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

  // Real-car 3-node positions inside the Innova Zenix silhouette: ICE, BATT, Front WHEEL
  const nIce = { x: 46, y: 47 };
  const nBatt = { x: 162, y: 67 };
  const nWheel = { x: 56, y: 83.5 };
  const nRearWheel = { x: 208, y: 83.5 };

  // Translate THS-5 powers cleanly to real dashboard 3-node arrows (ICE, BATT, WHEEL only)
  const netBattTractionKw = state.flows.batteryToPcuKw - 0.9; // Subtract stationary 0.9 kW A/C+12V aux draw
  const iceToWheelKw =
    state.iceFuelActive && state.flows.counterToWheelKw > 0.35
      ? Math.max(0, state.flows.carrierToRingKw + Math.max(0, state.flows.mg1ToPcuKw))
      : 0;
  const iceToBattKw =
    state.iceFuelActive && state.flows.batteryToPcuKw < -0.35 && state.flows.counterToWheelKw >= -0.4
      ? Math.abs(state.flows.batteryToPcuKw)
      : 0;
  const battToWheelKw =
    state.flows.counterToWheelKw < -0.45 && state.flows.mg2ToCounterKw < -0.45
      ? -Math.max(0.5, Math.abs(state.flows.mg2ToCounterKw))
      : state.flows.counterToWheelKw > 0.35 && netBattTractionKw > 0.35
        ? netBattTractionKw
        : 0;

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
          viewBox="-8 8 272 96"
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full block overflow-hidden"
          aria-label="Toyota Innova Zenix Simplified Energy Flow Diagram"
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
            <line x1="0" y1="95" x2="258" y2="95" stroke="#475569" strokeWidth="1.8" />
            {Array.from({ length: 10 }).map((_, i) => {
              const rx = 10 + ((i * 28 - animState.roadShift + 280) % 248);
              return (
                <line
                  key={i}
                  x1={rx}
                  y1="98"
                  x2={rx + 11}
                  y2="98"
                  stroke="#64748b"
                  strokeWidth="1.6"
                />
              );
            })}

            {/* AutoDrive Traffic Signal Cue */}
            {(isRedSignal || isGreenSignal) && (
              <g transform="translate(3, 35)">
                <line x1="0" y1="23" x2="0" y2="60" stroke="#64748b" strokeWidth="1.6" />
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

            {/* Toyota Innova Zenix Hybrid (AG10) Crossover-MPV Silhouette (Front faces Left) */}
            <path
              d="M 15 80 L 14 70 L 17 50 C 20 42, 34 39, 60 35 L 93 17 C 132 13.5, 188 14, 224 16 L 235 19 L 231 24 L 245 48 C 249 57, 250 71, 246 79 L 222 80 A 14.5 14.5 0 0 0 194 80 L 70 80 A 14.5 14.5 0 0 0 42 80 Z"
              fill="rgba(15, 23, 42, 0.84)"
              stroke="#64748b"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            {/* Innova Zenix Window DLO (Windshield + 3-Row Side Glass + Signature D-pillar Kick) */}
            <path
              d="M 69 34 L 96 20 L 214 19.5 L 226 36 L 204 38 L 194 34 L 72 35 Z"
              fill="rgba(51, 65, 85, 0.34)"
              stroke="#475569"
              strokeWidth="0.9"
              strokeLinejoin="round"
            />
            {/* Innova Zenix Front LED Headlamp & Upright Trapezoidal Nose Detail */}
            <path d="M 16 49 L 29 45" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" />
            {/* Rear LED Taillamp / Brake Light Bar */}
            <line
              x1="242"
              y1="47"
              x2="247"
              y2="56"
              stroke={braking ? '#ef4444' : '#7f1d1d'}
              strokeWidth={braking ? 3.4 : 1.9}
              strokeLinecap="round"
            />

            {/* Simplified 3-Node Real Car Power Flows: ICE <-> WHEEL, ICE -> BATT, BATT <-> WHEEL */}
            {/* 1. ICE -> Front Wheel */}
            <FlowArrow
              x1={nIce.x + 2}
              y1={nIce.y + 9}
              x2={nWheel.x - 1}
              y2={nWheel.y - 11}
              kw={iceToWheelKw}
              posColor={COMPONENT_COLORS.ice.hex}
              negColor={COMPONENT_COLORS.ice.hex}
              phase={animState.phase}
            />
            {/* 2. ICE -> BATT Charging */}
            <FlowArrow
              x1={nIce.x + 17}
              y1={nIce.y + 3}
              x2={nBatt.x - 23}
              y2={nBatt.y - 4}
              kw={iceToBattKw}
              posColor={COMPONENT_COLORS.battery.hex}
              negColor={COMPONENT_COLORS.battery.hex}
              phase={animState.phase}
            />
            {/* 3. BATT <-> Front Wheel (Discharge to Wheel or Regen back to BATT) */}
            <FlowArrow
              x1={nBatt.x - 23}
              y1={nBatt.y + 3}
              x2={nWheel.x + 12}
              y2={nWheel.y - 4}
              kw={battToWheelKw}
              posColor={COMPONENT_COLORS.battery.hex}
              negColor={COMPONENT_COLORS.battery.hex}
              phase={animState.phase}
            />

            {/* Node 1: ICE (Engine Bay) */}
            <g transform={`translate(${nIce.x}, ${nIce.y})`}>
              <rect
                x="-17"
                y="-8.5"
                width="34"
                height="17"
                rx="3.5"
                fill="#1e1b24"
                stroke={COMPONENT_COLORS.ice.hex}
                strokeWidth="1.6"
              />
              <text y="3" textAnchor="middle" className="fill-red-300 text-[8.5px] font-bold">
                ICE
              </text>
            </g>

            {/* Node 2: BATT (Under 2nd-row floor, exact Zenix NiMH location) */}
            <g transform={`translate(${nBatt.x}, ${nBatt.y})`}>
              <rect
                x="-23"
                y="-9"
                width="46"
                height="18"
                rx="3.5"
                fill="#0b1f1a"
                stroke={COMPONENT_COLORS.battery.hex}
                strokeWidth="1.6"
              />
              <rect
                x="-20"
                y="-6"
                width={Math.max(3, (state.socPercent / 100) * 40)}
                height="12"
                rx="2"
                fill={COMPONENT_COLORS.battery.hex}
                fillOpacity="0.34"
              />
              <text y="3" textAnchor="middle" className="fill-emerald-300 text-[8.5px] font-bold">
                BATT
              </text>
            </g>

            {/* Node 3: Front Drive Wheel (Violet) */}
            <g transform={`translate(${nWheel.x}, ${nWheel.y}) rotate(${-animState.wheelAngle})`}>
              <circle r="11" fill="#0f172a" stroke={COMPONENT_COLORS.wheel.hex} strokeWidth="2.3" />
              <line x1="-8.5" y1="0" x2="8.5" y2="0" stroke={COMPONENT_COLORS.wheel.hex} strokeWidth="1.5" />
              <line x1="0" y1="-8.5" x2="0" y2="8.5" stroke={COMPONENT_COLORS.wheel.hex} strokeWidth="1.5" />
            </g>
            <text
              x={nWheel.x + 15}
              y={nWheel.y + 7.5}
              className="fill-violet-300 text-[7px] font-bold tracking-tight"
            >
              WHEEL
            </text>

            {/* Rear Wheel */}
            <g transform={`translate(${nRearWheel.x}, ${nRearWheel.y}) rotate(${-animState.wheelAngle})`}>
              <circle r="11" fill="#0f172a" stroke="#64748b" strokeWidth="2.0" />
              <line x1="-8" y1="0" x2="8" y2="0" stroke="#64748b" strokeWidth="1.4" />
              <line x1="0" y1="-8" x2="0" y2="8" stroke="#64748b" strokeWidth="1.4" />
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
};
