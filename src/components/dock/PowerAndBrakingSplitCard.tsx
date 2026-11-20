import React from 'react';
import { PowertrainState } from '../../types/hybrid';

interface PowerAndBrakingSplitCardProps {
  state: PowertrainState;
  horizontal?: boolean;
  className?: string;
}

/**
 * Propulsion (Combined Power + ICE vs EV %, hp, Nm) & Braking (Regen vs Mech %, hp, Nm) Split Card
 */
export const PowerAndBrakingSplitCard: React.FC<PowerAndBrakingSplitCardProps> = ({
  state,
  horizontal = false,
  className = '',
}) => {
  const { propulsionSplit: prop, brakingSplit: brk } = state;
  const propActive = prop.icePercent + prop.evPercent > 0;
  const brkActive = brk.regenPercent + brk.mechPercent > 0;
  const totalBrakeHp = Math.round(brk.regenHp + brk.mechHp);

  return (
    <div
      className={`flex px-1 min-[760px]:px-1.5 py-1 rounded-lg bg-slate-900/45 border border-slate-700/45 w-full min-w-0 overflow-hidden ${
        horizontal
          ? 'flex-col md:flex-row md:items-center gap-2 md:gap-4'
          : 'flex-col justify-between gap-0.5'
      } ${className}`}
    >
      {/* 1. ICE vs EV Power & Torque Split + Combined System Power */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center justify-between gap-0.5 text-[7.5px] min-[760px]:text-[8.5px] min-[960px]:text-[9.5px] font-mono tabular-nums whitespace-nowrap">
          <span className="text-red-400 font-semibold">ICE {prop.icePercent}%</span>
          <span
            className="text-slate-100 font-semibold"
            title={`Net Combined Propulsion Power: ${Math.round(prop.combinedHp)} hp (${Math.round(
              prop.combinedKw
            )} kW)`}
          >
            <span className="hidden min-[1020px]:inline">Comb </span>
            {Math.round(prop.combinedHp)}hp
          </span>
          <span className="text-cyan-400 font-semibold text-right">{prop.evPercent}% EV</span>
        </div>

        <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden flex">
          {propActive && (
            <>
              <div
                className="h-full bg-red-500 transition-all duration-150"
                style={{ width: `${prop.icePercent}%` }}
              />
              <div
                className="h-full bg-cyan-400 transition-all duration-150"
                style={{ width: `${prop.evPercent}%` }}
              />
            </>
          )}
        </div>

        <div className="flex items-center justify-between text-[7px] min-[760px]:text-[8px] min-[960px]:text-[9px] font-mono tabular-nums text-slate-300 whitespace-nowrap">
          <span className="text-red-200/95">
            {Math.round(prop.iceHp)}hp·{Math.round(prop.iceTorqueNm)}Nm
          </span>
          <span className="text-cyan-200/95">
            {Math.round(prop.evHp)}hp·{Math.round(prop.evTorqueNm)}Nm
          </span>
        </div>
      </div>

      {horizontal ? (
        <div className="hidden md:block w-px h-8 bg-slate-700/60" />
      ) : (
        <div className="border-t border-slate-800/80" />
      )}

      {/* 2. Regenerative vs Mechanical Braking Split */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center justify-between gap-0.5 text-[7.5px] min-[760px]:text-[8.5px] min-[960px]:text-[9.5px] font-mono tabular-nums whitespace-nowrap">
          <span className="text-emerald-400 font-semibold">
            <span className="min-[960px]:hidden">Reg </span>
            <span className="hidden min-[960px]:inline">Regen </span>
            {brk.regenPercent}%
          </span>
          <span className="text-slate-400">{totalBrakeHp > 0 ? `${totalBrakeHp}hp` : '0hp'}</span>
          <span className="text-amber-400 font-semibold text-right">
            {brk.mechPercent}%
            <span className="min-[960px]:hidden"> Mch</span>
            <span className="hidden min-[960px]:inline"> Mech</span>
          </span>
        </div>

        <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden flex">
          {brkActive && (
            <>
              <div
                className="h-full bg-emerald-400 transition-all duration-150"
                style={{ width: `${brk.regenPercent}%` }}
              />
              <div
                className="h-full bg-amber-500 transition-all duration-150"
                style={{ width: `${brk.mechPercent}%` }}
              />
            </>
          )}
        </div>

        <div className="flex items-center justify-between text-[7px] min-[760px]:text-[8px] min-[960px]:text-[9px] font-mono tabular-nums text-slate-300 whitespace-nowrap">
          <span className="text-emerald-200/95">
            {Math.round(brk.regenHp)}hp·{Math.round(brk.regenTorqueNm)}Nm
          </span>
          <span className="text-amber-200/95">
            {Math.round(brk.mechHp)}hp·{Math.round(brk.mechTorqueNm)}Nm
          </span>
        </div>
      </div>
    </div>
  );
};
