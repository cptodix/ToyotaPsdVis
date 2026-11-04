import React from 'react';
import { GearPosition, HsiZone, PowertrainState } from '../types/hybrid';

interface HybridPowerMeterProps {
  state: PowertrainState;
  className?: string;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

/**
 * Translucent 5th-Gen Toyota Power Meter (CHG / ECO / PWR),
 * Digital Speedometer, and Trip Computer (Odometer km, Avg km/L, Total Fuel L).
 */
export const HybridPowerMeter: React.FC<HybridPowerMeterProps> = ({ state, className = '' }) => {
  const hsi = state.hsiValue;
  let needleDeg = -48;
  if (hsi < 0) {
    needleDeg = -48 + (hsi / 100) * 67;
  } else if (hsi <= 42) {
    needleDeg = -48 + (hsi / 42) * 60;
  } else if (hsi <= 72) {
    needleDeg = 12 + ((hsi - 42) / 30) * 56;
  } else {
    needleDeg = 68 + ((hsi - 72) / 28) * 47;
  }

  const cx = 86;
  const cy = 78;
  const r = 60;
  const needleTip = polarToCartesian(cx, cy, r - 4, needleDeg);
  const needleBase = polarToCartesian(cx, cy, 34, needleDeg);

  const absKmh = Math.abs(Math.round(state.speedKmh));

  const zoneLabel =
    state.gear === GearPosition.P
      ? state.flows.batteryToPcuKw < -0.5
        ? 'P·CHG'
        : 'PARK'
      : state.gear === GearPosition.N
        ? 'NEUT'
        : state.hsiZone === HsiZone.CHG
          ? 'CHG'
          : state.hsiZone === HsiZone.PWR
            ? 'PWR'
            : state.evIndicatorOn
              ? 'EV ECO'
              : 'HV ECO';

  const odoNum = state.odometerKm < 100 ? state.odometerKm.toFixed(2) : state.odometerKm.toFixed(1);
  const avgNum =
    state.odometerKm < 0.005
      ? '--.-'
      : state.totalFuelLiters <= 0.00001
        ? '99.9'
        : Math.min(99.9, state.odometerKm / state.totalFuelLiters).toFixed(1);
  const fuelNum =
    state.totalFuelLiters < 10 ? state.totalFuelLiters.toFixed(2) : state.totalFuelLiters.toFixed(1);

  return (
    <div
      className={`grid grid-cols-[1.04fr_0.96fr] min-[760px]:grid-cols-[1.14fr_0.86fr] min-[960px]:grid-cols-[1.20fr_0.80fr] items-stretch gap-1 min-[760px]:gap-1.5 px-1.5 min-[960px]:px-2 py-1 rounded-lg bg-slate-900/45 border border-slate-700/45 w-full min-w-0 overflow-hidden ${className}`}
    >
      {/* Sub-Col-A: Power Meter Dial + Speedometer + Zone / kW */}
      <div className="min-w-0 flex flex-col items-center justify-between">
        <svg
          viewBox="2 1 168 83"
          preserveAspectRatio="xMidYMid meet"
          className="w-full max-w-[116px] h-[36px] min-[720px]:h-[44px] min-[960px]:h-[50px] block shrink-0 overflow-hidden"
          aria-label="Hybrid Power Meter and Speedometer"
        >
          <path
            d={describeArc(cx, cy, r, -115, 115)}
            fill="none"
            stroke="#1e293b"
            strokeWidth="10"
          />
          <path
            d={describeArc(cx, cy, r, -115, -50)}
            fill="none"
            stroke="#06b6d4"
            strokeOpacity={hsi < -1 ? 0.95 : 0.35}
            strokeWidth="10"
          />
          <path
            d={describeArc(cx, cy, r, -46, 10)}
            fill="none"
            stroke="#10b981"
            strokeOpacity={hsi > 1 && hsi <= 42 ? 0.95 : 0.35}
            strokeWidth="10"
          />
          <path
            d={describeArc(cx, cy, r, 14, 66)}
            fill="none"
            stroke="#34d399"
            strokeOpacity={hsi > 42 && hsi <= 72 ? 0.95 : 0.32}
            strokeWidth="10"
          />
          <path
            d={describeArc(cx, cy, r, 70, 115)}
            fill="none"
            stroke="#ef4444"
            strokeOpacity={hsi > 72 ? 0.98 : 0.35}
            strokeWidth="10"
          />

          <text x="8" y="78" className="fill-cyan-400 text-[10.5px] font-semibold">
            CHG
          </text>
          <text x="52" y="13" className="fill-emerald-400 text-[10.5px] font-semibold">
            ECO
          </text>
          <text x="137" y="78" className="fill-red-400 text-[10.5px] font-semibold">
            PWR
          </text>

          <line
            x1={needleBase.x}
            y1={needleBase.y}
            x2={needleTip.x}
            y2={needleTip.y}
            stroke="#f8fafc"
            strokeWidth="3.1"
            strokeLinecap="round"
          />

          <text
            x={cx}
            y={cy - 9}
            textAnchor="middle"
            className="fill-slate-50 font-mono text-[27px] font-bold"
          >
            {state.speedKmh < -0.5 ? `-${absKmh}` : absKmh}
          </text>
          <text
            x={cx}
            y={cy + 5}
            textAnchor="middle"
            className="fill-slate-400 text-[10.5px] font-medium"
          >
            km/h
          </text>
        </svg>

        <div className="w-full flex items-center justify-center gap-1 text-[8px] min-[760px]:text-[9px] min-[960px]:text-[10px] font-mono tabular-nums leading-none mt-0.5 whitespace-nowrap">
          <span
            className={`font-semibold ${
              state.evIndicatorOn ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {zoneLabel}
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-200">
            {state.flows.counterToWheelKw >= 0 ? '+' : ''}
            {Math.round(state.flows.counterToWheelKw)}kW
          </span>
        </div>
      </div>

      {/* Sub-Col-B: ODO, AVG, FUEL Stacked Vertically & Evenly Distributed */}
      <div className="min-w-0 flex flex-col justify-between divide-y divide-slate-800/65 pl-1 min-[760px]:pl-1.5 min-[960px]:pl-2 border-l border-slate-800/85 font-mono tabular-nums">
        <div
          className="flex-1 flex items-center justify-between gap-0.5 leading-none"
          title="Trip Odometer in km (resets on Reset)"
        >
          <span className="text-[8px] min-[760px]:text-[8.5px] min-[960px]:text-[9.5px] font-sans font-medium text-slate-400 shrink-0">
            ODO
          </span>
          <span className="text-[8.5px] min-[760px]:text-[9px] min-[960px]:text-[10px] font-semibold text-slate-100 whitespace-nowrap">
            {odoNum}
            <span className="text-[7.5px] min-[960px]:text-[8.5px] font-normal text-slate-400 ml-[1.5px]">
              km
            </span>
          </span>
        </div>

        <div
          className="flex-1 flex items-center justify-between gap-0.5 leading-none"
          title="Average Fuel Consumption in km/L (resets on Reset)"
        >
          <span className="text-[8px] min-[760px]:text-[8.5px] min-[960px]:text-[9.5px] font-sans font-medium text-slate-400 shrink-0">
            AVG
          </span>
          <span className="text-[8.5px] min-[760px]:text-[9px] min-[960px]:text-[10px] font-semibold text-emerald-300 whitespace-nowrap">
            {avgNum}
            <span className="text-[7.5px] min-[960px]:text-[8.5px] font-normal text-emerald-400/85 ml-[1.5px]">
              km/L
            </span>
          </span>
        </div>

        <div
          className="flex-1 flex items-center justify-between gap-0.5 leading-none"
          title="Total Gasoline Consumed in Liters (resets on Reset)"
        >
          <span className="text-[8px] min-[760px]:text-[8.5px] min-[960px]:text-[9.5px] font-sans font-medium text-slate-400 shrink-0">
            FUEL
          </span>
          <span className="text-[8.5px] min-[760px]:text-[9px] min-[960px]:text-[10px] font-semibold text-amber-300 whitespace-nowrap">
            {fuelNum}
            <span className="text-[7.5px] min-[960px]:text-[8.5px] font-normal text-amber-400/85 ml-[1.5px]">
              L
            </span>
          </span>
        </div>
      </div>
    </div>
  );
};
