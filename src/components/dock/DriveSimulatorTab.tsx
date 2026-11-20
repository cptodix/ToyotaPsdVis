import React from 'react';
import { Leaf } from 'lucide-react';
import { AutoDriveMode, GearPosition, PowertrainState } from '../../types/hybrid';
import { CarEnergyFlowPreview } from '../CarEnergyFlowPreview';
import { HybridPowerMeter } from '../HybridPowerMeter';
import { PowerAndBrakingSplitCard } from './PowerAndBrakingSplitCard';

interface DriveSimulatorTabProps {
  state: PowertrainState;
  timeScale: number;
  autoDriveMode: AutoDriveMode;
  onGearChange: (gear: GearPosition) => void;
  onToggleEvMode: () => void;
  onSelectAutoDriveMode: (mode: AutoDriveMode) => void;
  onThrottleChange: (val: number) => void;
  onBrakeChange: (val: number) => void;
  onRoadGradeChange: (val: number) => void;
}

export const DriveSimulatorTab: React.FC<DriveSimulatorTabProps> = ({
  state,
  timeScale,
  autoDriveMode,
  onGearChange,
  onToggleEvMode,
  onSelectAutoDriveMode,
  onThrottleChange,
  onBrakeChange,
  onRoadGradeChange,
}) => {
  const roundedGrade = Math.round(state.roadGradePercent);

  return (
    <div className="grid grid-cols-1 min-[560px]:grid-cols-[0.80fr_1.45fr_1.05fr_1.18fr_1.00fr] items-stretch gap-0.5 min-[760px]:gap-1 w-full min-w-0">
      {/* COL-1 (LOCKED): Sub-Col-A (Vertical PRNDB) + Sub-Col-B (EV Mode, AutoDrive, Selector) */}
      <div className="flex items-stretch gap-0.5 min-[760px]:gap-1 px-1 py-1 rounded-lg bg-slate-900/45 border border-slate-700/45 w-full min-w-0 overflow-hidden">
        <div
          className="flex flex-col justify-between gap-0.5 shrink-0"
          aria-label="Transmission Gear Selector"
        >
          {[
            GearPosition.P,
            GearPosition.R,
            GearPosition.N,
            GearPosition.D,
            GearPosition.B,
          ].map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onGearChange(g)}
              className={`w-4 min-[920px]:w-5 h-[13px] min-[920px]:h-[14px] text-[9px] min-[920px]:text-[9.5px] leading-none font-mono font-bold rounded flex items-center justify-center transition-colors ${
                state.gear === g
                  ? g === GearPosition.P
                    ? 'bg-sky-400 text-slate-950'
                    : g === GearPosition.B
                      ? 'bg-amber-500 text-slate-950'
                      : g === GearPosition.D
                        ? 'bg-emerald-500 text-slate-950'
                        : g === GearPosition.R
                          ? 'bg-red-500 text-white'
                          : 'bg-slate-200 text-slate-950'
                  : 'bg-slate-950/70 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-between gap-0.5 pl-0.5 min-[760px]:pl-1 border-l border-slate-800/85">
          <button
            type="button"
            onClick={onToggleEvMode}
            title="Dedicated EV Mode (<= 42 km/h when SoC >= 40%)"
            className={`inline-flex items-center justify-center gap-0.5 px-0.5 h-[16px] min-[920px]:h-[17px] w-full rounded text-[8.5px] min-[920px]:text-[9.5px] font-semibold border transition-colors whitespace-nowrap ${
              state.evModeRequested
                ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                : 'bg-slate-950/65 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/15'
            }`}
          >
            <Leaf className="w-2.5 h-2.5 shrink-0" />
            <span>
              {state.evModeRequested ? (
                'EV ON'
              ) : (
                <>
                  <span className="min-[920px]:hidden">EV</span>
                  <span className="hidden min-[920px]:inline">EV Mode</span>
                </>
              )}
            </span>
          </button>

          <span className="text-[8px] min-[920px]:text-[8.5px] font-medium text-slate-400 leading-none text-center whitespace-nowrap">
            AutoDrive
          </span>

          <div className="grid grid-cols-2 gap-0.5 p-0.5 rounded bg-slate-950/70 border border-slate-800">
            {(
              [
                { id: AutoDriveMode.OFF, label: 'Off', title: 'Manual Driving' },
                { id: AutoDriveMode.CITY, label: 'City', title: 'City Traffic & Lights' },
                { id: AutoDriveMode.HIGHWAY, label: 'Hwy', title: 'Highway Cruise & Overtake' },
                {
                  id: AutoDriveMode.MOUNTAIN,
                  label: 'Mtn',
                  title: 'Countryside Mountainous Road (Climbs & Descents)',
                },
              ] as const
            ).map((m) => {
              const active = autoDriveMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  title={m.title}
                  onClick={() => onSelectAutoDriveMode(m.id)}
                  className={`h-[15px] min-[920px]:h-[16px] rounded text-[8.5px] min-[920px]:text-[9px] leading-none font-medium transition-colors whitespace-nowrap ${
                    active
                      ? m.id === AutoDriveMode.OFF
                        ? 'bg-slate-200 text-slate-950 font-semibold'
                        : m.id === AutoDriveMode.CITY
                          ? 'bg-amber-400 text-slate-950 font-semibold'
                          : m.id === AutoDriveMode.HIGHWAY
                            ? 'bg-cyan-400 text-slate-950 font-semibold'
                            : 'bg-emerald-400 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* COL-2: Sub-Col-A (Power Meter) + Sub-Col-B (ODO, AVG, FUEL stacked vertically) */}
      <HybridPowerMeter state={state} />

      {/* COL-3: Throttle, Brake & Incline Sliders */}
      <div className="flex flex-col justify-between gap-1 px-1 min-[760px]:px-1.5 py-1 rounded-lg bg-slate-900/45 border border-slate-700/45 w-full min-w-0 overflow-hidden">
        <div className="flex items-center gap-0.5 min-[760px]:gap-1 text-[8.5px] min-[760px]:text-[9.5px] min-[960px]:text-[10px] min-w-0">
          <label
            htmlFor="sim-throttle"
            title="Throttle (0–100%)"
            className="w-5 min-[960px]:w-10 text-slate-200 shrink-0 whitespace-nowrap"
          >
            <span className="min-[960px]:hidden">Thr</span>
            <span className="hidden min-[960px]:inline">Throttle</span>
          </label>
          <input
            id="sim-throttle"
            type="range"
            min={0}
            max={100}
            step={1}
            value={state.throttlePercent}
            onChange={(e) => onThrottleChange(Number(e.target.value))}
            className="ths-slider flex-1 min-w-0 text-emerald-400"
          />
          <span className="w-6 min-[760px]:w-7 text-right font-mono tabular-nums text-emerald-400 shrink-0 whitespace-nowrap">
            {Math.round(state.throttlePercent)}%
          </span>
        </div>

        <div className="flex items-center gap-0.5 min-[760px]:gap-1 text-[8.5px] min-[760px]:text-[9.5px] min-[960px]:text-[10px] min-w-0">
          <label
            htmlFor="sim-brake"
            title="Brake (0–100%)"
            className="w-5 min-[960px]:w-10 text-slate-200 shrink-0 whitespace-nowrap"
          >
            <span className="min-[960px]:hidden">Brk</span>
            <span className="hidden min-[960px]:inline">Brake</span>
          </label>
          <input
            id="sim-brake"
            type="range"
            min={0}
            max={100}
            step={1}
            value={state.brakePercent}
            onChange={(e) => onBrakeChange(Number(e.target.value))}
            className="ths-slider flex-1 min-w-0 text-red-400"
          />
          <span className="w-6 min-[760px]:w-7 text-right font-mono tabular-nums text-red-400 shrink-0 whitespace-nowrap">
            {Math.round(state.brakePercent)}%
          </span>
        </div>

        <div className="flex items-center gap-0.5 min-[760px]:gap-1 text-[8.5px] min-[760px]:text-[9.5px] min-[960px]:text-[10px] min-w-0">
          <label
            htmlFor="sim-grade"
            title="Road Incline (-50% to +50%)"
            className="w-5 min-[960px]:w-10 text-slate-200 shrink-0 whitespace-nowrap"
          >
            <span className="min-[960px]:hidden">Inc</span>
            <span className="hidden min-[960px]:inline">Incline</span>
          </label>
          <input
            id="sim-grade"
            type="range"
            min={-50}
            max={50}
            step={1}
            value={roundedGrade}
            onChange={(e) => onRoadGradeChange(Number(e.target.value))}
            className="ths-slider flex-1 min-w-0 text-amber-400"
          />
          <button
            type="button"
            onClick={() => onRoadGradeChange(0)}
            title="Road Incline (-50% to +50%). Click value to reset to 0%."
            className="w-6 min-[760px]:w-7 text-right font-mono tabular-nums text-amber-300 hover:text-white shrink-0 whitespace-nowrap"
          >
            {roundedGrade > 0 ? `+${roundedGrade}%` : `${roundedGrade}%`}
          </button>
        </div>
      </div>

      {/* COL-4: Power & Decel Split Indicator */}
      <PowerAndBrakingSplitCard state={state} />

      {/* COL-5 (LOCKED): Miniature Car Energy Flow */}
      <CarEnergyFlowPreview state={state} timeScale={timeScale} />
    </div>
  );
};
