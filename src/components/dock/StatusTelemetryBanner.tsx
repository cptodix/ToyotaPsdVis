import React from 'react';
import { AutoDriveMode, PowertrainState } from '../../types/hybrid';
import { getAutoDriveEventBadgeClass, getAutoDriveModeLabel } from './autoDriveBadges';

interface StatusTelemetryBannerProps {
  autoDriveMode: AutoDriveMode;
  state: PowertrainState;
}

export const StatusTelemetryBanner: React.FC<StatusTelemetryBannerProps> = ({
  autoDriveMode,
  state,
}) => {
  return (
    <div className="mb-1 px-2.5 py-1.5 rounded-xl bg-slate-950/88 border border-slate-700/65 shadow-lg text-[11px] text-slate-200 space-y-1">
      {/* Row 1: Drive Status */}
      <div className="flex flex-wrap items-center gap-1.5 pb-1 border-b border-slate-800/80">
        {autoDriveMode !== AutoDriveMode.OFF ? (
          <>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0 whitespace-nowrap ${getAutoDriveEventBadgeClass(
                state.autoDrive.eventKind
              )}`}
            >
              {getAutoDriveModeLabel(autoDriveMode)}: {state.autoDrive.eventBadge}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-slate-900/85 border border-slate-700/60 font-mono tabular-nums text-[10px] text-slate-300 whitespace-nowrap shrink-0">
              {state.autoDrive.targetSpeedKmh > 0
                ? `→ ${state.autoDrive.targetSpeedKmh} km/h`
                : 'STOP'}
            </span>
            <span className="text-slate-200 text-[11px]">{state.autoDrive.contextText}</span>
          </>
        ) : (
          <>
            <span className="px-1.5 py-0.5 rounded bg-slate-800/90 border border-slate-700 font-mono font-bold text-[10px] text-slate-200 whitespace-nowrap shrink-0">
              MANUAL DRIVE
            </span>
            <span className="font-mono tabular-nums text-[11px] text-slate-300 whitespace-nowrap">
              Thr {Math.round(state.throttlePercent)}% · Brk {Math.round(state.brakePercent)}% · Incline{' '}
              {Math.round(state.roadGradePercent) > 0
                ? `+${Math.round(state.roadGradePercent)}%`
                : `${Math.round(state.roadGradePercent)}%`}
            </span>
          </>
        )}
      </div>

      {/* Row 2: Hybrid Mode & 2-Row Explanation */}
      <div className="space-y-0.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600/70 font-mono font-bold text-[10px] text-slate-100 shrink-0">
            {state.gear}
          </span>
          {state.evIndicatorOn ? (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/50 font-mono font-bold text-[10px] text-emerald-300 whitespace-nowrap shrink-0">
              EV
            </span>
          ) : state.iceFuelActive ? (
            <span className="px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/45 font-mono font-bold text-[10px] text-red-300 whitespace-nowrap shrink-0">
              ICE
            </span>
          ) : Math.abs(state.iceRpm) > 300 ? (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/45 font-mono font-bold text-[10px] text-amber-300 whitespace-nowrap shrink-0">
              PUMP
            </span>
          ) : null}
          <strong className="text-slate-100 font-semibold text-[11.5px] whitespace-nowrap">
            {state.activePhaseTitle}
          </strong>
        </div>
        <p className="text-slate-300 text-[11px] leading-snug">{state.activePhaseSummary}</p>
      </div>
    </div>
  );
};
