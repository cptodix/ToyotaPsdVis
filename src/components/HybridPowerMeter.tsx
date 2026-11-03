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
        ? 'PARK·CHG'
        : 'PARK'
      : state.gear === GearPosition.N
        ? 'NEUTRAL'
        : state.hsiZone === HsiZone.CHG
          ? 'CHG'
          : state.hsiZone === HsiZone.PWR
            ? 'PWR'
            : state.evIndicatorOn
              ? 'EV ECO'
              : 'HV ECO';

  const odoText =
    state.odometerKm < 100
      ? `${state.odometerKm.toFixed(2)} km`
      : `${state.odometerKm.toFixed(1)} km`;

  const avgText =
    state.odometerKm < 0.005
      ? '--.- km/L'
      : state.totalFuelLiters <= 0.00001
        ? '99.9 km/L'
        : `${Math.min(99.9, state.odometerKm / state.totalFuelLiters).toFixed(1)} km/L`;

  const fuelText =
    state.totalFuelLiters < 10
      ? `${state.totalFuelLiters.toFixed(3)} L`
      : `${state.totalFuelLiters.toFixed(2)} L`;

  return (
    <div
      className={`flex flex-col justify-between px-2 py-1.5 rounded-lg bg-slate-900/45 border border-slate-700/45 w-full min-w-0 overflow-hidden ${className}`}
    >
      <div className="flex items-center justify-center gap-2 min-w-0">
        <svg
          viewBox="0 0 172 90"
          className="w-[106px] h-[58px] shrink-0 overflow-hidden"
          aria-label="Hybrid Power Meter and Speedometer"
        >
          <path
            d={describeArc(cx, cy, r, -115, 115)}
            fill="none"
            stroke="#1e293b"
            strokeWidth="9"
          />
          <path
            d={describeArc(cx, cy, r, -115, -50)}
            fill="none"
            stroke="#06b6d4"
            strokeOpacity={hsi < -1 ? 0.95 : 0.35}
            strokeWidth="9"
          />
          <path
            d={describeArc(cx, cy, r, -46, 10)}
            fill="none"
            stroke="#10b981"
            strokeOpacity={hsi > 1 && hsi <= 42 ? 0.95 : 0.35}
            strokeWidth="9"
          />
          <path
            d={describeArc(cx, cy, r, 14, 66)}
            fill="none"
            stroke="#34d399"
            strokeOpacity={hsi > 42 && hsi <= 72 ? 0.95 : 0.32}
            strokeWidth="9"
          />
          <path
            d={describeArc(cx, cy, r, 70, 115)}
            fill="none"
            stroke="#ef4444"
            strokeOpacity={hsi > 72 ? 0.98 : 0.35}
            strokeWidth="9"
          />

          <text x="10" y="77" className="fill-cyan-400 text-[9px] font-semibold">
            CHG
          </text>
          <text x="53" y="13" className="fill-emerald-400 text-[9px] font-semibold">
            ECO
          </text>
          <text x="139" y="77" className="fill-red-400 text-[9px] font-semibold">
            PWR
          </text>

          <line
            x1={needleBase.x}
            y1={needleBase.y}
            x2={needleTip.x}
            y2={needleTip.y}
            stroke="#f8fafc"
            strokeWidth="2.8"
            strokeLinecap="round"
          />

          <text
            x={cx}
            y={cy - 10}
            textAnchor="middle"
            className="fill-slate-50 font-mono text-[24px] font-bold"
          >
            {state.speedKmh < -0.5 ? `-${absKmh}` : absKmh}
          </text>
          <text
            x={cx}
            y={cy + 4}
            textAnchor="middle"
            className="fill-slate-400 text-[9.5px] font-medium"
          >
            km/h
          </text>
        </svg>

        <div className="flex flex-col justify-center gap-0.5 min-w-[58px]">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Gear</span>
            <span className="font-mono font-bold text-slate-100">{state.gear}</span>
          </div>
          <div
            className={`text-[11px] font-semibold whitespace-nowrap ${
              state.evIndicatorOn ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {zoneLabel}
          </div>
          <div className="font-mono text-[11px] text-slate-200 whitespace-nowrap">
            {state.flows.counterToWheelKw >= 0 ? '+' : ''}
            {Math.round(state.flows.counterToWheelKw)} kW
          </div>
        </div>
      </div>

      {/* Trip Odometer (km), Avg Fuel Consumption (km/L) & Total Fuel Consumed (L) */}
      <div className="grid grid-cols-3 gap-1 pt-1.5 mt-1 border-t border-slate-800/85 text-center font-mono">
        <div className="min-w-0" title="Trip Odometer (resets on Reset)">
          <div className="text-[9px] font-sans font-medium text-slate-400 leading-none">ODO</div>
          <div className="text-[10.5px] font-semibold text-slate-100 whitespace-nowrap mt-0.5">
            {odoText}
          </div>
        </div>
        <div
          className="min-w-0 border-x border-slate-800/80 px-0.5"
          title="Average Fuel Consumption in km/L (resets on Reset)"
        >
          <div className="text-[9px] font-sans font-medium text-slate-400 leading-none">AVG</div>
          <div className="text-[10.5px] font-semibold text-emerald-300 whitespace-nowrap mt-0.5">
            {avgText}
          </div>
        </div>
        <div className="min-w-0" title="Total Gasoline Consumed in Liters (resets on Reset)">
          <div className="text-[9px] font-sans font-medium text-slate-400 leading-none">FUEL</div>
          <div className="text-[10.5px] font-semibold text-amber-300 whitespace-nowrap mt-0.5">
            {fuelText}
          </div>
        </div>
      </div>
    </div>
  );
};
