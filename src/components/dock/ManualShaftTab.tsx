import React from 'react';
import { RotateCcw, RotateCw, Square } from 'lucide-react';
import { getRotationDirection, MG2_TO_RING_RATIO, PSD_CONSTANTS } from '../../drivetrain';
import { useI18n } from '../../i18n/I18nContext';
import { PowertrainState, RotationDir, SolveTarget } from '../../types/hybrid';

interface ManualShaftTabProps {
  state: PowertrainState;
  solveTarget: SolveTarget;
  onChangeSolveTarget: (target: SolveTarget) => void;
  onManualShaftChange: (shaft: 'ICE' | 'MG1' | 'WHEEL_MG2', rpm: number) => void;
}

export const ManualShaftTab: React.FC<ManualShaftTabProps> = ({
  state,
  solveTarget,
  onChangeSolveTarget,
  onManualShaftChange,
}) => {
  const { t } = useI18n();
  const mt = t.manualTab;

  const setShaftDirection = (
    shaft: 'ICE' | 'MG1' | 'WHEEL_MG2',
    currentRpm: number,
    defaultMag: number,
    dir: RotationDir
  ) => {
    if (dir === RotationDir.STOP) {
      onManualShaftChange(shaft, 0);
      return;
    }
    const mag = Math.abs(currentRpm) > 60 ? Math.abs(currentRpm) : defaultMag;
    onManualShaftChange(shaft, dir === RotationDir.CW ? mag : -mag);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[13px] text-slate-300">
        <span>{mt.instruction}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">{mt.autoSolve}</span>
          {(
            [
              { id: SolveTarget.MG1, label: 'MG1' },
              { id: SolveTarget.WHEEL, label: mt.mg2Wheel },
              { id: SolveTarget.ICE, label: 'ICE' },
            ] as const
          ).map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => onChangeSolveTarget(st.id)}
              className={`px-2 py-0.5 rounded font-medium transition-colors whitespace-nowrap ${
                solveTarget === st.id
                  ? 'bg-slate-100 text-slate-950 font-semibold'
                  : 'bg-slate-900/55 text-slate-400 hover:text-white border border-slate-700/60'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {/* ICE (Real life: CW >= 0 only; cannot spin CCW left of middle) */}
        <div className="p-2.5 rounded-lg bg-slate-900/45 border border-red-500/35 space-y-1.5">
          <div className="flex items-center justify-between gap-1 text-[13px]">
            <span className="font-semibold text-red-400 whitespace-nowrap">{mt.iceCarrier}</span>
            <span className="font-mono tabular-nums text-slate-100 whitespace-nowrap">
              {Math.round(Math.max(0, state.iceRpm))} RPM
            </span>
          </div>
          <div className="relative flex items-center">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-0 right-1/2 h-1.5 rounded-l bg-slate-950/90 border-r border-slate-500/75"
            />
            <input
              aria-label="ICE Speed RPM"
              type="range"
              min={-PSD_CONSTANTS.ICE_MAX_RPM}
              max={PSD_CONSTANTS.ICE_MAX_RPM}
              step={25}
              value={Math.round(Math.max(0, state.iceRpm))}
              onChange={(e) => {
                const raw = Number(e.target.value);
                if (raw < 0) {
                  e.currentTarget.value = '0';
                  if (Math.round(state.iceRpm) !== 0) {
                    onManualShaftChange('ICE', 0);
                  }
                  return;
                }
                onManualShaftChange('ICE', raw);
              }}
              title={mt.iceNoCcwTooltip}
              className="ths-slider w-full relative z-10 text-red-500"
            />
          </div>
          <div className="grid grid-cols-3 gap-1 text-xs">
            <button
              type="button"
              disabled
              aria-disabled="true"
              title={mt.iceNoCcwTooltip}
              className="inline-flex items-center justify-center gap-1 py-0.5 rounded bg-slate-900/45 text-slate-600 border border-slate-800/50 cursor-not-allowed opacity-55 line-through"
            >
              <RotateCcw className="w-3 h-3" />
              <span className="line-through">CCW</span>
            </button>
            <button
              type="button"
              onClick={() => setShaftDirection('ICE', state.iceRpm, 0, RotationDir.STOP)}
              className={`inline-flex items-center justify-center gap-1 py-0.5 rounded ${
                getRotationDirection(state.iceRpm) === RotationDir.STOP
                  ? 'bg-slate-200 text-slate-950 font-semibold'
                  : 'bg-slate-950/60 text-slate-400 hover:text-white'
              }`}
            >
              <Square className="w-2.5 h-2.5" />
              <span>0</span>
            </button>
            <button
              type="button"
              onClick={() => setShaftDirection('ICE', state.iceRpm, 1800, RotationDir.CW)}
              className={`inline-flex items-center justify-center gap-1 py-0.5 rounded ${
                getRotationDirection(state.iceRpm) === RotationDir.CW
                  ? 'bg-red-500 text-white font-semibold'
                  : 'bg-slate-950/60 text-slate-400 hover:text-white'
              }`}
            >
              <RotateCw className="w-3 h-3" />
              <span>CW</span>
            </button>
          </div>
        </div>

        {/* MG1 (Real life: spins both CCW & CW) */}
        <div className="p-2.5 rounded-lg bg-slate-900/45 border border-amber-500/35 space-y-1.5">
          <div className="flex items-center justify-between gap-1 text-[13px]">
            <span className="font-semibold text-amber-400 whitespace-nowrap">{mt.mg1Sun}</span>
            <span className="font-mono tabular-nums text-slate-100 whitespace-nowrap">
              {Math.round(state.mg1Rpm)} RPM
            </span>
          </div>
          <div className="relative flex items-center">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 -translate-x-1/2 w-px h-3 bg-slate-500/75"
            />
            <input
              aria-label="MG1 Speed RPM"
              type="range"
              min={-PSD_CONSTANTS.MG1_MAX_RPM}
              max={PSD_CONSTANTS.MG1_MAX_RPM}
              step={50}
              value={Math.round(
                Math.max(
                  -PSD_CONSTANTS.MG1_MAX_RPM,
                  Math.min(PSD_CONSTANTS.MG1_MAX_RPM, state.mg1Rpm)
                )
              )}
              onChange={(e) => onManualShaftChange('MG1', Number(e.target.value))}
              className="ths-slider w-full relative z-10 text-amber-500"
            />
          </div>
          <div className="grid grid-cols-3 gap-1 text-xs">
            <button
              type="button"
              onClick={() => setShaftDirection('MG1', state.mg1Rpm, 3000, RotationDir.CCW)}
              className={`inline-flex items-center justify-center gap-1 py-0.5 rounded ${
                getRotationDirection(state.mg1Rpm) === RotationDir.CCW
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'bg-slate-950/60 text-slate-400 hover:text-white'
              }`}
            >
              <RotateCcw className="w-3 h-3" />
              <span>CCW</span>
            </button>
            <button
              type="button"
              onClick={() => setShaftDirection('MG1', state.mg1Rpm, 0, RotationDir.STOP)}
              className={`inline-flex items-center justify-center gap-1 py-0.5 rounded ${
                getRotationDirection(state.mg1Rpm) === RotationDir.STOP
                  ? 'bg-slate-200 text-slate-950 font-semibold'
                  : 'bg-slate-950/60 text-slate-400 hover:text-white'
              }`}
            >
              <Square className="w-2.5 h-2.5" />
              <span>0</span>
            </button>
            <button
              type="button"
              onClick={() => setShaftDirection('MG1', state.mg1Rpm, 3000, RotationDir.CW)}
              className={`inline-flex items-center justify-center gap-1 py-0.5 rounded ${
                getRotationDirection(state.mg1Rpm) === RotationDir.CW
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'bg-slate-950/60 text-slate-400 hover:text-white'
              }`}
            >
              <RotateCw className="w-3 h-3" />
              <span>CW</span>
            </button>
          </div>
        </div>

        {/* MG2 / Ring / Wheel (Real life: REV CCW & FWD CW, center 0, RPM + km/h) */}
        <div className="p-2.5 rounded-lg bg-slate-900/45 border border-cyan-500/35 space-y-1.5">
          <div className="flex items-center justify-between gap-1 text-[13px]">
            <span className="font-semibold text-cyan-400 whitespace-nowrap">{mt.mg2Ring}</span>
            <span className="font-mono tabular-nums text-slate-100 whitespace-nowrap">
              {Math.round(state.mg2Rpm)} RPM{' '}
              <span className="text-cyan-300 font-semibold">
                · {Math.round(state.speedKmh)} km/h
              </span>
            </span>
          </div>
          <div className="relative flex items-center">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-0 w-[31.25%] h-1.5 rounded-l bg-slate-950/85 border-r border-slate-600/60"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 -translate-x-1/2 w-px h-3 bg-slate-500/75"
            />
            <input
              aria-label="MG2 and Ring Speed RPM"
              type="range"
              min={-4800}
              max={4800}
              step={20}
              value={Math.round(Math.max(-1800, Math.min(4800, state.ringRpm)))}
              onChange={(e) => {
                const raw = Number(e.target.value);
                if (raw < -1800) {
                  e.currentTarget.value = '-1800';
                  if (Math.round(state.ringRpm) !== -1800) {
                    onManualShaftChange('WHEEL_MG2', -1800);
                  }
                  return;
                }
                onManualShaftChange('WHEEL_MG2', raw);
              }}
              className="ths-slider w-full relative z-10 text-cyan-400"
            />
          </div>
          <div className="grid grid-cols-3 gap-1 text-xs">
            <button
              type="button"
              onClick={() =>
                setShaftDirection(
                  'WHEEL_MG2',
                  state.ringRpm,
                  Math.round(2400 / MG2_TO_RING_RATIO),
                  RotationDir.CCW
                )
              }
              className={`inline-flex items-center justify-center gap-1 py-0.5 rounded ${
                getRotationDirection(state.ringRpm) === RotationDir.CCW
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'bg-slate-950/60 text-slate-400 hover:text-white'
              }`}
            >
              <RotateCcw className="w-3 h-3" />
              <span>{t.badges.rev}</span>
            </button>
            <button
              type="button"
              onClick={() => setShaftDirection('WHEEL_MG2', state.ringRpm, 0, RotationDir.STOP)}
              className={`inline-flex items-center justify-center gap-1 py-0.5 rounded ${
                getRotationDirection(state.ringRpm) === RotationDir.STOP
                  ? 'bg-slate-200 text-slate-950 font-semibold'
                  : 'bg-slate-950/60 text-slate-400 hover:text-white'
              }`}
            >
              <Square className="w-2.5 h-2.5" />
              <span>0</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setShaftDirection(
                  'WHEEL_MG2',
                  state.ringRpm,
                  Math.round(4500 / MG2_TO_RING_RATIO),
                  RotationDir.CW
                )
              }
              className={`inline-flex items-center justify-center gap-1 py-0.5 rounded ${
                getRotationDirection(state.ringRpm) === RotationDir.CW
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'bg-slate-950/60 text-slate-400 hover:text-white'
              }`}
            >
              <RotateCw className="w-3 h-3" />
              <span>{t.badges.fwd}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
