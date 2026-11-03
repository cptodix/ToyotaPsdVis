import React from 'react';
import {
  ChevronDown,
  ChevronUp,
  Leaf,
  RotateCcw,
  RotateCw,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  getRotationDirection,
  MG2_TO_RING_RATIO,
  OPERATION_MODES,
  PSD_CONSTANTS,
} from '../simulation/ths5Engine';
import {
  AutoDriveEventKind,
  AutoDriveMode,
  CameraPresetId,
  GearPosition,
  OperationModeId,
  PowertrainState,
  RotationDir,
  SolveTarget,
  WorkspaceTab,
} from '../types/hybrid';
import { CarEnergyFlowPreview } from './CarEnergyFlowPreview';
import { HybridPowerMeter } from './HybridPowerMeter';

interface BottomControlDockProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  state: PowertrainState;

  onGearChange: (gear: GearPosition) => void;
  onToggleEvMode: () => void;
  autoDriveMode: AutoDriveMode;
  onSelectAutoDriveMode: (mode: AutoDriveMode) => void;
  onThrottleChange: (val: number) => void;
  onBrakeChange: (val: number) => void;
  onRoadGradeChange: (val: number) => void;

  onSelectOperationMode: (modeId: OperationModeId) => void;

  solveTarget: SolveTarget;
  onChangeSolveTarget: (target: SolveTarget) => void;
  onManualShaftChange: (shaft: 'ICE' | 'MG1' | 'WHEEL_MG2', rpm: number) => void;

  cameraPreset: CameraPresetId;
  onSelectCameraPreset: (preset: CameraPresetId) => void;
  explodeFactor: number;
  onExplodeChange: (val: number) => void;
  timeScale: number;
  onTimeScaleChange: (scale: number) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onReset: () => void;
}

/**
 * Propulsion (Combined Power + ICE vs EV %, hp, Nm) & Braking (Regen vs Mech %, hp, Nm) Split Card
 */
const PowerAndBrakingSplitCard: React.FC<{
  state: PowertrainState;
  horizontal?: boolean;
  className?: string;
}> = ({ state, horizontal = false, className = '' }) => {
  const { propulsionSplit: prop, brakingSplit: brk } = state;
  const propActive = prop.icePercent + prop.evPercent > 0;
  const brkActive = brk.regenPercent + brk.mechPercent > 0;
  const totalBrakeHp = Math.round(brk.regenHp + brk.mechHp);

  return (
    <div
      className={`flex px-2.5 py-1.5 rounded-lg bg-slate-900/45 border border-slate-700/45 w-full min-w-0 overflow-hidden ${
        horizontal
          ? 'flex-col md:flex-row md:items-center gap-2.5 md:gap-4'
          : 'flex-col justify-between gap-1.5'
      } ${className}`}
    >
      {/* 1. ICE vs EV Power & Torque Split + Combined System Power */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-1 text-[10.5px] font-mono tabular-nums whitespace-nowrap">
          <span className="text-red-400 font-semibold">ICE {prop.icePercent}%</span>
          <span
            className="text-slate-100 font-semibold"
            title={`Net Combined Propulsion Power: ${Math.round(prop.combinedHp)} hp (${Math.round(
              prop.combinedKw
            )} kW)`}
          >
            Comb {Math.round(prop.combinedHp)} hp
          </span>
          <span className="text-cyan-400 font-semibold text-right">{prop.evPercent}% EV</span>
        </div>

        <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden flex">
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

        <div className="flex items-center justify-between text-[10.5px] font-mono text-slate-300 whitespace-nowrap">
          <span className="text-red-200/95">
            {Math.round(prop.iceHp)} hp · {Math.round(prop.iceTorqueNm)} Nm
          </span>
          <span className="text-cyan-200/95">
            {Math.round(prop.evHp)} hp · {Math.round(prop.evTorqueNm)} Nm
          </span>
        </div>
      </div>

      {horizontal ? (
        <div className="hidden md:block w-px h-10 bg-slate-700/60" />
      ) : (
        <div className="border-t border-slate-800/80" />
      )}

      {/* 2. Regenerative vs Mechanical Braking Split */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-1.5 text-[11px] font-mono whitespace-nowrap">
          <span className="text-emerald-400 font-semibold">Regen {brk.regenPercent}%</span>
          <span className="text-[10.5px] text-slate-400">
            {totalBrakeHp > 0 ? `Brake ${totalBrakeHp} hp` : 'Braking 0 hp'}
          </span>
          <span className="text-amber-400 font-semibold text-right">{brk.mechPercent}% Mech</span>
        </div>

        <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden flex">
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

        <div className="flex items-center justify-between text-[10.5px] font-mono text-slate-300 whitespace-nowrap">
          <span className="text-emerald-200/95">
            {Math.round(brk.regenHp)} hp · {Math.round(brk.regenTorqueNm)} Nm
          </span>
          <span className="text-amber-200/95">
            {Math.round(brk.mechHp)} hp · {Math.round(brk.mechTorqueNm)} Nm
          </span>
        </div>
      </div>
    </div>
  );
};

function getAutoDriveEventBadgeClass(kind: AutoDriveEventKind): string {
  switch (kind) {
    case AutoDriveEventKind.RED_LIGHT_BRAKE:
    case AutoDriveEventKind.RED_LIGHT_WAIT:
      return 'bg-red-500/20 border-red-500/50 text-red-300';
    case AutoDriveEventKind.GREEN_LAUNCH:
    case AutoDriveEventKind.SUMMIT_CREST:
      return 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300';
    case AutoDriveEventKind.TRAFFIC_JAM:
    case AutoDriveEventKind.HEAVY_TRAFFIC:
    case AutoDriveEventKind.TRAFFIC_SLOWDOWN:
    case AutoDriveEventKind.MOUNTAIN_CLIMB:
      return 'bg-amber-500/20 border-amber-500/50 text-amber-300';
    case AutoDriveEventKind.OVERTAKE:
    case AutoDriveEventKind.HIGHWAY_MERGE:
    case AutoDriveEventKind.MOUNTAIN_DESCENT:
      return 'bg-violet-500/25 border-violet-400/55 text-violet-200';
    default:
      return 'bg-cyan-500/20 border-cyan-500/45 text-cyan-300';
  }
}

function getAutoDriveModeLabel(mode: AutoDriveMode): string {
  if (mode === AutoDriveMode.CITY) return 'CITY AUTO';
  if (mode === AutoDriveMode.HIGHWAY) return 'HWY AUTO';
  if (mode === AutoDriveMode.MOUNTAIN) return 'MTN AUTO';
  return 'AUTO';
}

export const BottomControlDock: React.FC<BottomControlDockProps> = ({
  activeTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
  state,
  onGearChange,
  onToggleEvMode,
  autoDriveMode,
  onSelectAutoDriveMode,
  onThrottleChange,
  onBrakeChange,
  onRoadGradeChange,
  onSelectOperationMode,
  solveTarget,
  onChangeSolveTarget,
  onManualShaftChange,
  cameraPreset,
  onSelectCameraPreset,
  explodeFactor,
  onExplodeChange,
  timeScale,
  onTimeScaleChange,
  soundEnabled,
  onToggleSound,
  onReset,
}) => {
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

  const roundedGrade = Math.round(state.roadGradePercent);

  return (
    <div
      id="bottom-control-dock"
      className={`fixed bottom-2 left-1/2 -translate-x-1/2 z-30 w-[min(1152px,97vw)] max-w-[calc(100vw-12px)] transition-transform duration-200 ease-out ${
        collapsed ? 'translate-y-[calc(100%-32px)]' : 'translate-y-0'
      }`}
    >
      {/* Top Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5 px-0.5">
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-950/75 border border-slate-700/60">
          {(
            [
              { id: WorkspaceTab.SIMULATOR, label: 'Drive' },
              { id: WorkspaceTab.MODES, label: 'Modes' },
              { id: WorkspaceTab.MANUAL, label: 'Manual' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                onSelectTab(t.id);
                if (collapsed) onToggleCollapse();
              }}
              className={`px-3 py-0.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === t.id
                  ? 'bg-slate-100 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Slow-Mo Selector (1x · 0.5x · 0.25x) */}
          <div
            className={`flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-950/75 border text-[11.5px] ${
              timeScale < 1 ? 'border-amber-500/55' : 'border-slate-700/60'
            }`}
            title="Slow-Motion Speed Control (1x, 0.5x, 0.25x)"
          >
            <span className="px-1.5 text-slate-400 whitespace-nowrap">Slow-Mo</span>
            {(
              [
                { val: 1, label: '1x' },
                { val: 0.5, label: '0.5x' },
                { val: 0.25, label: '0.25x' },
              ] as const
            ).map((opt) => {
              const active = Math.abs(timeScale - opt.val) < 0.005;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => onTimeScaleChange(opt.val)}
                  className={`px-2 py-0.5 rounded font-mono transition-colors whitespace-nowrap ${
                    active
                      ? opt.val < 1
                        ? 'bg-amber-400 text-slate-950 font-semibold'
                        : 'bg-slate-700/90 text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="hidden sm:flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-950/75 border border-slate-700/60 text-[11.5px]">
            {(
              [
                { id: CameraPresetId.OVERVIEW, label: 'All' },
                { id: CameraPresetId.PLANETARY, label: 'PSD' },
                { id: CameraPresetId.PARALLEL_SHAFTS, label: 'MG1/2' },
                { id: CameraPresetId.WHEEL_DIFF, label: 'Wheel' },
              ] as const
            ).map((cam) => (
              <button
                key={cam.id}
                type="button"
                onClick={() => onSelectCameraPreset(cam.id)}
                className={`px-2 py-0.5 rounded transition-colors whitespace-nowrap ${
                  cameraPreset === cam.id
                    ? 'bg-slate-700/90 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {cam.label}
              </button>
            ))}
          </div>

          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-slate-950/75 border border-slate-700/60 text-[11.5px] text-slate-300">
            <label htmlFor="dock-explode" className="whitespace-nowrap">
              Spread {Math.round(explodeFactor * 100)}%
            </label>
            <input
              id="dock-explode"
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={explodeFactor}
              onChange={(e) => onExplodeChange(Number(e.target.value))}
              className="ths-slider w-14 text-cyan-400"
            />
          </div>

          <button
            type="button"
            onClick={onToggleSound}
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg border text-[11.5px] font-medium transition-colors whitespace-nowrap ${
              soundEnabled
                ? 'bg-slate-950/75 border-emerald-500/50 text-emerald-300 hover:text-emerald-200'
                : 'bg-slate-950/75 border-slate-700/60 text-slate-400 hover:text-white'
            }`}
            title={soundEnabled ? 'Mute Hybrid System Sound' : 'Enable Hybrid System Sound'}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span>{soundEnabled ? 'Sound' : 'Muted'}</span>
          </button>

          <button
            type="button"
            onClick={onReset}
            className="px-2.5 py-0.5 rounded-lg bg-slate-950/75 border border-slate-700/60 text-[11.5px] font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap"
          >
            Reset
          </button>

          <button
            type="button"
            onClick={onToggleCollapse}
            className="inline-flex items-center gap-0.5 px-2.5 py-0.5 rounded-lg bg-slate-950/75 border border-slate-700/60 text-[11.5px] font-medium text-slate-200 hover:text-white transition-colors whitespace-nowrap"
          >
            {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span>{collapsed ? 'Show' : 'Hide'}</span>
          </button>
        </div>
      </div>

      {/* Translucent Wider Dock Surface */}
      <div className="rounded-xl bg-slate-950/62 border border-slate-700/55 shadow-xl p-2.5 space-y-2 overflow-x-hidden max-h-[calc(100vh-46px)] overflow-y-auto">
        {/* 2-ROW HYBRID STAGE STATUS + LIVE AUTODRIVE SCENARIO BANNER (Never Cut Off) */}
        <div className="px-2.5 py-1.5 rounded-lg bg-slate-900/58 border border-slate-700/45 text-xs leading-snug space-y-1">
          {activeTab === WorkspaceTab.SIMULATOR && state.autoDrive.mode !== AutoDriveMode.OFF && (
            <div className="flex flex-wrap items-center gap-1.5 pb-1 border-b border-slate-700/45">
              <span className="px-1.5 py-0.5 rounded bg-sky-500/20 border border-sky-400/50 font-mono font-bold text-[10.5px] text-sky-200 whitespace-nowrap shrink-0">
                {getAutoDriveModeLabel(state.autoDrive.mode)}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded border font-mono font-bold text-[10.5px] whitespace-nowrap shrink-0 ${getAutoDriveEventBadgeClass(
                  state.autoDrive.eventKind
                )}`}
              >
                {state.autoDrive.eventBadge}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-slate-950/70 border border-slate-700/60 font-mono text-[10.5px] text-slate-300 whitespace-nowrap shrink-0">
                {state.autoDrive.targetSpeedKmh > 0
                  ? `→ ${state.autoDrive.targetSpeedKmh} km/h`
                  : 'STOP'}
              </span>
              <span className="text-slate-200 min-w-[180px] flex-1">
                {state.autoDrive.contextText}
              </span>
            </div>
          )}

          {/* Dedicated 2-Row Hybrid Stage Status so neither Title nor Explanation ever cuts off */}
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600/70 font-mono font-bold text-[10.5px] text-slate-100 shrink-0">
                {state.gear}
              </span>
              {state.evIndicatorOn ? (
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/50 font-mono font-bold text-[10.5px] text-emerald-300 whitespace-nowrap shrink-0">
                  EV
                </span>
              ) : state.iceFuelActive ? (
                <span className="px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/45 font-mono font-bold text-[10.5px] text-red-300 whitespace-nowrap shrink-0">
                  ICE
                </span>
              ) : Math.abs(state.iceRpm) > 300 ? (
                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/45 font-mono font-bold text-[10.5px] text-amber-300 whitespace-nowrap shrink-0">
                  PUMP
                </span>
              ) : null}
              <strong className="text-slate-100 font-semibold text-xs">
                {state.activePhaseTitle}
              </strong>
            </div>
            <p className="text-slate-300 text-xs leading-snug">
              {state.activePhaseSummary}
            </p>
          </div>
        </div>

        {/* ================================================================== */}
        {/* TAB 1: WIDER 5-COLUMN DRIVING SIMULATOR (Overflow-Proof CSS Grid)   */}
        {/* ================================================================== */}
        {activeTab === WorkspaceTab.SIMULATOR && (
          <div className="grid grid-cols-1 sm:grid-cols-2 min-[780px]:grid-cols-6 min-[1080px]:grid-cols-[184px_minmax(178px,0.95fr)_minmax(196px,1.02fr)_minmax(216px,1.16fr)_minmax(212px,1.15fr)] items-stretch gap-2 w-full min-w-0">
            {/* Column 1: Shift Selector (P R N D B), EV Mode & AutoDrive (Off / City / Hwy / Mtn) */}
            <div className="min-[780px]:col-span-2 min-[1080px]:col-span-1 flex flex-col justify-between gap-1.5 px-2 py-1.5 rounded-lg bg-slate-900/45 border border-slate-700/45 w-full min-w-0 overflow-hidden">
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[11.5px] text-slate-300 font-medium shrink-0">Gear</span>
                <div className="flex items-center gap-0.5">
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
                      className={`w-6 h-5.5 text-[11.5px] font-mono font-bold rounded transition-colors ${
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
                          : 'bg-slate-950/65 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[11.5px] text-slate-300 font-medium shrink-0">Drive</span>
                <button
                  type="button"
                  onClick={onToggleEvMode}
                  title="Dedicated EV Mode (<= 50 km/h when SoC >= 36%)"
                  className={`inline-flex items-center justify-center gap-1.5 px-2.5 h-5.5 rounded text-[11px] font-semibold border transition-colors whitespace-nowrap ${
                    state.evModeRequested
                      ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                      : 'bg-slate-950/65 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/15'
                  }`}
                >
                  <Leaf className="w-3 h-3" />
                  <span>{state.evModeRequested ? 'EV Mode ON' : 'EV Mode'}</span>
                </button>
              </div>

              <div className="space-y-0.5">
                <div className="flex items-center justify-between text-[10.5px] text-slate-400 leading-none">
                  <span>AutoDrive</span>
                  <span className="font-mono text-slate-300">
                    {autoDriveMode === AutoDriveMode.OFF ? 'Manual' : autoDriveMode}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-0.5 p-0.5 rounded bg-slate-950/70 border border-slate-800">
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
                        className={`py-0.5 rounded text-[11px] font-medium transition-colors whitespace-nowrap ${
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

            {/* Column 2: Throttle, Brake & Road Incline (-50% to +50%) */}
            <div className="min-[780px]:col-span-2 min-[1080px]:col-span-1 flex flex-col justify-between gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/45 border border-slate-700/45 w-full min-w-0 overflow-hidden">
              <div className="flex items-center gap-1.5 text-[11.5px] min-w-0">
                <label htmlFor="sim-throttle" className="w-12 text-slate-200 shrink-0">
                  Throttle
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
                <span className="w-9 text-right font-mono tabular-nums text-emerald-400 shrink-0 whitespace-nowrap">
                  {Math.round(state.throttlePercent)}%
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-[11.5px] min-w-0">
                <label htmlFor="sim-brake" className="w-12 text-slate-200 shrink-0">
                  Brake
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
                <span className="w-9 text-right font-mono tabular-nums text-red-400 shrink-0 whitespace-nowrap">
                  {Math.round(state.brakePercent)}%
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-[11.5px] min-w-0">
                <label htmlFor="sim-grade" className="w-12 text-slate-200 shrink-0">
                  Incline
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
                  className="w-9 text-right font-mono tabular-nums text-amber-300 hover:text-white shrink-0 whitespace-nowrap"
                >
                  {roundedGrade > 0 ? `+${roundedGrade}%` : `${roundedGrade}%`}
                </button>
              </div>
            </div>

            {/* Column 3: HSI Power Meter, Speedometer & Trip ODO / km/L / Fuel L */}
            <HybridPowerMeter
              state={state}
              className="min-[780px]:col-span-2 min-[1080px]:col-span-1"
            />

            {/* Column 4: Combined Power + ICE/EV & Regen/Mech Splits */}
            <PowerAndBrakingSplitCard
              state={state}
              className="min-[780px]:col-span-3 min-[1080px]:col-span-1"
            />

            {/* Column 5: Enlarged Full-Frame Car Energy Flow Diagram */}
            <CarEnergyFlowPreview
              state={state}
              timeScale={timeScale}
              className="sm:col-span-2 min-[780px]:col-span-3 min-[1080px]:col-span-1"
            />
          </div>
        )}

        {/* ================================================================== */}
        {/* TAB 2: ALL 10 OPERATION MODES & PHASES                              */}
        {/* ================================================================== */}
        {activeTab === WorkspaceTab.MODES && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {OPERATION_MODES.map((m) => {
                const selected = state.activeModeId === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onSelectOperationMode(m.id)}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                      selected
                        ? 'bg-slate-100 text-slate-950 border-white font-semibold'
                        : 'bg-slate-900/45 text-slate-200 border-slate-700/50 hover:border-slate-500'
                    }`}
                  >
                    {m.shortLabel}
                  </button>
                );
              })}
            </div>

            <PowerAndBrakingSplitCard state={state} horizontal />
          </div>
        )}

        {/* ================================================================== */}
        {/* TAB 3: MANUAL SHAFT SPEED & DIRECTION CONTROL                       */}
        {/* ================================================================== */}
        {activeTab === WorkspaceTab.MANUAL && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-300">
              <span>Adjust speed &amp; rotation direction of each power source:</span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Auto-Solve:</span>
                {(
                  [
                    { id: SolveTarget.MG1, label: 'MG1' },
                    { id: SolveTarget.WHEEL, label: 'MG2/Wheel' },
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
              {/* ICE */}
              <div className="p-2.5 rounded-lg bg-slate-900/45 border border-red-500/35 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-red-400">ICE · Carrier</span>
                  <span className="font-mono text-slate-100">{Math.round(state.iceRpm)} RPM</span>
                </div>
                <input
                  aria-label="ICE Speed RPM"
                  type="range"
                  min={-2000}
                  max={PSD_CONSTANTS.ICE_MAX_RPM}
                  step={25}
                  value={Math.round(state.iceRpm)}
                  onChange={(e) => onManualShaftChange('ICE', Number(e.target.value))}
                  className="ths-slider w-full text-red-500"
                />
                <div className="grid grid-cols-3 gap-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setShaftDirection('ICE', state.iceRpm, 1200, RotationDir.CCW)}
                    className={`inline-flex items-center justify-center gap-1 py-0.5 rounded ${
                      getRotationDirection(state.iceRpm) === RotationDir.CCW
                        ? 'bg-red-500 text-white font-semibold'
                        : 'bg-slate-950/60 text-slate-400 hover:text-white'
                    }`}
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>CCW</span>
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

              {/* MG1 */}
              <div className="p-2.5 rounded-lg bg-slate-900/45 border border-amber-500/35 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-amber-400">MG1 · Sun</span>
                  <span className="font-mono text-slate-100">{Math.round(state.mg1Rpm)} RPM</span>
                </div>
                <input
                  aria-label="MG1 Speed RPM"
                  type="range"
                  min={-10500}
                  max={10500}
                  step={50}
                  value={Math.round(state.mg1Rpm)}
                  onChange={(e) => onManualShaftChange('MG1', Number(e.target.value))}
                  className="ths-slider w-full text-amber-500"
                />
                <div className="grid grid-cols-3 gap-1 text-[11px]">
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

              {/* MG2 / Ring / Wheel */}
              <div className="p-2.5 rounded-lg bg-slate-900/45 border border-cyan-500/35 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-cyan-400">MG2 · Ring</span>
                  <span className="font-mono text-slate-100">{Math.round(state.mg2Rpm)} RPM</span>
                </div>
                <input
                  aria-label="MG2 and Ring Speed RPM"
                  type="range"
                  min={-1800}
                  max={4800}
                  step={20}
                  value={Math.round(state.ringRpm)}
                  onChange={(e) => onManualShaftChange('WHEEL_MG2', Number(e.target.value))}
                  className="ths-slider w-full text-cyan-400"
                />
                <div className="grid grid-cols-3 gap-1 text-[11px]">
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
                    <span>REV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setShaftDirection('WHEEL_MG2', state.ringRpm, 0, RotationDir.STOP)
                    }
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
                    <span>FWD</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
