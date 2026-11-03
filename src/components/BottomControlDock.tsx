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
} from '../simulation/ths5Engine';
import {
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
  soundEnabled: boolean;
  onToggleSound: () => void;
  onReset: () => void;
}

/**
 * Zero-waste compact split readout displaying:
 * 1) ICE vs EV Power (% share, hp, and shaft Nm torque)
 * 2) Regen vs Mechanical Brake (% share, hp, and wheel Nm torque)
 */
const PowerAndBrakingSplitCard: React.FC<{ state: PowertrainState; horizontal?: boolean }> = ({
  state,
  horizontal = false,
}) => {
  const { propulsionSplit: prop, brakingSplit: brk } = state;
  const propActive = prop.icePercent + prop.evPercent > 0;
  const brkActive = brk.regenPercent + brk.mechPercent > 0;

  return (
    <div
      className={`flex px-2.5 py-1.5 rounded-lg bg-slate-900/45 border border-slate-700/45 ${
        horizontal
          ? 'flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full'
          : 'flex-col justify-between gap-1 flex-1 min-w-[208px]'
      }`}
    >
      {/* 1. ICE vs EV Power & Torque Split */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5 text-[10px] font-mono whitespace-nowrap">
          <span className="text-red-400 font-semibold w-[50px]">ICE {prop.icePercent}%</span>
          <div className="h-1.5 flex-1 rounded-full bg-slate-800 overflow-hidden flex">
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
          <span className="text-cyan-400 font-semibold w-[46px] text-right">{prop.evPercent}% EV</span>
        </div>
        <div className="flex items-center justify-between text-[9.5px] font-mono text-slate-300 whitespace-nowrap">
          <span className="text-red-200/90">
            {Math.round(prop.iceHp)}hp · {Math.round(prop.iceTorqueNm)}Nm
          </span>
          <span className="text-cyan-200/90">
            {Math.round(prop.evHp)}hp · {Math.round(prop.evTorqueNm)}Nm
          </span>
        </div>
      </div>

      {horizontal ? (
        <div className="hidden sm:block w-px h-7 bg-slate-700/60" />
      ) : (
        <div className="border-t border-slate-800/80" />
      )}

      {/* 2. Regenerative vs Mechanical Braking Split */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5 text-[10px] font-mono whitespace-nowrap">
          <span className="text-emerald-400 font-semibold w-[50px]">Reg {brk.regenPercent}%</span>
          <div className="h-1.5 flex-1 rounded-full bg-slate-800 overflow-hidden flex">
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
          <span className="text-amber-400 font-semibold w-[46px] text-right">
            {brk.mechPercent}% Mch
          </span>
        </div>
        <div className="flex items-center justify-between text-[9.5px] font-mono text-slate-300 whitespace-nowrap">
          <span className="text-emerald-200/90">
            {Math.round(brk.regenHp)}hp · {Math.round(brk.regenTorqueNm)}Nm
          </span>
          <span className="text-amber-200/90">
            {Math.round(brk.mechHp)}hp · {Math.round(brk.mechTorqueNm)}Nm
          </span>
        </div>
      </div>
    </div>
  );
};

export const BottomControlDock: React.FC<BottomControlDockProps> = ({
  activeTab,
  onSelectTab,
  collapsed,
  onToggleCollapse,
  state,
  onGearChange,
  onToggleEvMode,
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
      className={`fixed bottom-2 left-1/2 -translate-x-1/2 z-30 w-[min(884px,96vw)] transition-transform duration-200 ease-out ${
        collapsed ? 'translate-y-[calc(100%-28px)]' : 'translate-y-0'
      }`}
    >
      {/* Slim Top Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-1 mb-1 px-0.5">
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-950/70 border border-slate-700/60">
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
              className={`px-2.5 py-0.5 text-[11.5px] font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === t.id
                  ? 'bg-slate-100 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <div className="hidden sm:flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-950/70 border border-slate-700/60 text-[10.5px]">
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
                className={`px-1.5 py-0.5 rounded transition-colors whitespace-nowrap ${
                  cameraPreset === cam.id
                    ? 'bg-slate-700/90 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {cam.label}
              </button>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-950/70 border border-slate-700/60 text-[10.5px] text-slate-300">
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
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10.5px] font-medium transition-colors whitespace-nowrap ${
              soundEnabled
                ? 'bg-slate-950/70 border-emerald-500/50 text-emerald-300 hover:text-emerald-200'
                : 'bg-slate-950/70 border-slate-700/60 text-slate-400 hover:text-white'
            }`}
            title={soundEnabled ? 'Mute Hybrid System Sound' : 'Enable Hybrid System Sound'}
          >
            {soundEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
            <span>{soundEnabled ? 'Sound' : 'Muted'}</span>
          </button>

          <button
            type="button"
            onClick={onReset}
            className="px-2 py-0.5 rounded-lg bg-slate-950/70 border border-slate-700/60 text-[10.5px] font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap"
          >
            Reset
          </button>

          <button
            type="button"
            onClick={onToggleCollapse}
            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-lg bg-slate-950/70 border border-slate-700/60 text-[10.5px] font-medium text-slate-200 hover:text-white transition-colors whitespace-nowrap"
          >
            {collapsed ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            <span>{collapsed ? 'Show' : 'Hide'}</span>
          </button>
        </div>
      </div>

      {/* Translucent Compact Dock Surface */}
      <div className="rounded-xl bg-slate-950/58 border border-slate-700/55 shadow-xl p-2 space-y-1.5">
        {/* COMPACT UNIVERSAL CURRENT HYBRID MODE & EXPLANATION (Across ALL Tabs) */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-900/55 border border-slate-700/45 text-[11px] leading-tight">
          <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600/70 font-mono font-bold text-[10px] text-slate-100 shrink-0">
            {state.gear}
          </span>
          {state.evIndicatorOn ? (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/50 font-mono font-bold text-[9.5px] text-emerald-300 whitespace-nowrap shrink-0">
              EV
            </span>
          ) : state.iceFuelActive ? (
            <span className="px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/45 font-mono font-bold text-[9.5px] text-red-300 whitespace-nowrap shrink-0">
              ICE
            </span>
          ) : Math.abs(state.iceRpm) > 300 ? (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/45 font-mono font-bold text-[9.5px] text-amber-300 whitespace-nowrap shrink-0">
              PUMP
            </span>
          ) : null}
          <p className="text-slate-300 min-w-0 line-clamp-2 sm:line-clamp-1" title={`${state.activePhaseTitle}: ${state.activePhaseSummary}`}>
            <strong className="text-slate-100 font-semibold">{state.activePhaseTitle}:</strong>{' '}
            {state.activePhaseSummary}
          </p>
        </div>

        {/* ================================================================== */}
        {/* TAB 1: COMPACT ZERO-WASTE DRIVING SIMULATOR                         */}
        {/* ================================================================== */}
        {activeTab === WorkspaceTab.SIMULATOR && (
          <div className="grid grid-cols-1 sm:grid-cols-2 min-[820px]:flex min-[820px]:flex-row items-stretch gap-1.5">
            {/* 1. Compact Driver Controls (P/R/N/D/B + EV + Throttle + Brake + Extreme ±50% Incline) */}
            <div className="flex flex-col justify-between gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900/45 border border-slate-700/45 min-[820px]:w-[224px] shrink-0">
              <div className="flex items-center justify-between gap-1.5">
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
                      className={`w-5.5 h-4.5 text-[10.5px] font-mono font-bold rounded transition-colors ${
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
                          : 'bg-slate-950/60 text-slate-400 hover:text-white border border-slate-800'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={onToggleEvMode}
                  className={`inline-flex items-center gap-1 px-1.5 h-4.5 rounded text-[10px] font-semibold border transition-colors whitespace-nowrap ${
                    state.evModeRequested
                      ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                      : 'bg-slate-950/65 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/15'
                  }`}
                >
                  <Leaf className="w-2.5 h-2.5" />
                  <span>EV Mode</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5 text-[10.5px]">
                <label htmlFor="sim-throttle" className="w-11 text-slate-300 shrink-0">
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
                  className="ths-slider flex-1 text-emerald-400"
                />
                <span className="w-8 text-right font-mono text-emerald-400 shrink-0">
                  {Math.round(state.throttlePercent)}%
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-[10.5px]">
                <label htmlFor="sim-brake" className="w-11 text-slate-300 shrink-0">
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
                  className="ths-slider flex-1 text-red-400"
                />
                <span className="w-8 text-right font-mono text-red-400 shrink-0">
                  {Math.round(state.brakePercent)}%
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-[10.5px]">
                <label htmlFor="sim-grade" className="w-11 text-slate-300 shrink-0">
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
                  className="ths-slider flex-1 text-amber-400"
                />
                <button
                  type="button"
                  onClick={() => onRoadGradeChange(0)}
                  title="Extreme Road Incline (-50% to +50%). Click to reset to 0%."
                  className="w-8 text-right font-mono text-amber-300 hover:text-white shrink-0 whitespace-nowrap"
                >
                  {roundedGrade > 0 ? `+${roundedGrade}%` : `${roundedGrade}%`}
                </button>
              </div>
            </div>

            {/* 2. Compact HSI Power Meter & Speedometer */}
            <HybridPowerMeter state={state} />

            {/* 3. Compact ICE/EV & Regen/Mech Splits (%, hp, Nm) */}
            <PowerAndBrakingSplitCard state={state} />

            {/* 4. Compact Car Energy Flow & Extreme Incline Preview */}
            <CarEnergyFlowPreview state={state} />
          </div>
        )}

        {/* ================================================================== */}
        {/* TAB 2: ALL 10 OPERATION MODES & PHASES                              */}
        {/* ================================================================== */}
        {activeTab === WorkspaceTab.MODES && (
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1">
              {OPERATION_MODES.map((m) => {
                const selected = state.activeModeId === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onSelectOperationMode(m.id)}
                    className={`px-2 py-1 rounded-lg border text-[11.5px] font-medium transition-colors truncate ${
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
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[10.5px] text-slate-300">
              <span>Adjust speed &amp; rotation direction of each power source:</span>
              <div className="flex items-center gap-1">
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
                    className={`px-1.5 py-0.5 rounded font-medium transition-colors whitespace-nowrap ${
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
              {/* ICE */}
              <div className="p-2 rounded-lg bg-slate-900/45 border border-red-500/35 space-y-1">
                <div className="flex items-center justify-between text-[10.5px]">
                  <span className="font-semibold text-red-400">ICE · Carrier</span>
                  <span className="font-mono text-slate-100">{Math.round(state.iceRpm)} RPM</span>
                </div>
                <input
                  aria-label="ICE Speed RPM"
                  type="range"
                  min={-2000}
                  max={5200}
                  step={25}
                  value={Math.round(state.iceRpm)}
                  onChange={(e) => onManualShaftChange('ICE', Number(e.target.value))}
                  className="ths-slider w-full text-red-500"
                />
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setShaftDirection('ICE', state.iceRpm, 1200, RotationDir.CCW)}
                    className={`inline-flex items-center justify-center gap-0.5 py-0.5 rounded ${
                      getRotationDirection(state.iceRpm) === RotationDir.CCW
                        ? 'bg-red-500 text-white font-semibold'
                        : 'bg-slate-950/60 text-slate-400 hover:text-white'
                    }`}
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>CCW</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShaftDirection('ICE', state.iceRpm, 0, RotationDir.STOP)}
                    className={`inline-flex items-center justify-center gap-0.5 py-0.5 rounded ${
                      getRotationDirection(state.iceRpm) === RotationDir.STOP
                        ? 'bg-slate-200 text-slate-950 font-semibold'
                        : 'bg-slate-950/60 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Square className="w-2 h-2" />
                    <span>0</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShaftDirection('ICE', state.iceRpm, 1800, RotationDir.CW)}
                    className={`inline-flex items-center justify-center gap-0.5 py-0.5 rounded ${
                      getRotationDirection(state.iceRpm) === RotationDir.CW
                        ? 'bg-red-500 text-white font-semibold'
                        : 'bg-slate-950/60 text-slate-400 hover:text-white'
                    }`}
                  >
                    <RotateCw className="w-2.5 h-2.5" />
                    <span>CW</span>
                  </button>
                </div>
              </div>

              {/* MG1 */}
              <div className="p-2 rounded-lg bg-slate-900/45 border border-amber-500/35 space-y-1">
                <div className="flex items-center justify-between text-[10.5px]">
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
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setShaftDirection('MG1', state.mg1Rpm, 3000, RotationDir.CCW)}
                    className={`inline-flex items-center justify-center gap-0.5 py-0.5 rounded ${
                      getRotationDirection(state.mg1Rpm) === RotationDir.CCW
                        ? 'bg-amber-500 text-slate-950 font-semibold'
                        : 'bg-slate-950/60 text-slate-400 hover:text-white'
                    }`}
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>CCW</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShaftDirection('MG1', state.mg1Rpm, 0, RotationDir.STOP)}
                    className={`inline-flex items-center justify-center gap-0.5 py-0.5 rounded ${
                      getRotationDirection(state.mg1Rpm) === RotationDir.STOP
                        ? 'bg-slate-200 text-slate-950 font-semibold'
                        : 'bg-slate-950/60 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Square className="w-2 h-2" />
                    <span>0</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShaftDirection('MG1', state.mg1Rpm, 3000, RotationDir.CW)}
                    className={`inline-flex items-center justify-center gap-0.5 py-0.5 rounded ${
                      getRotationDirection(state.mg1Rpm) === RotationDir.CW
                        ? 'bg-amber-500 text-slate-950 font-semibold'
                        : 'bg-slate-950/60 text-slate-400 hover:text-white'
                    }`}
                  >
                    <RotateCw className="w-2.5 h-2.5" />
                    <span>CW</span>
                  </button>
                </div>
              </div>

              {/* MG2 / Ring / Wheel */}
              <div className="p-2 rounded-lg bg-slate-900/45 border border-cyan-500/35 space-y-1">
                <div className="flex items-center justify-between text-[10.5px]">
                  <span className="font-semibold text-cyan-400">MG2 · Ring</span>
                  <span className="font-mono text-slate-100">{Math.round(state.mg2Rpm)} RPM</span>
                </div>
                <input
                  aria-label="MG2 and Ring Speed RPM"
                  type="range"
                  min={-1800}
                  max={4400}
                  step={20}
                  value={Math.round(state.ringRpm)}
                  onChange={(e) => onManualShaftChange('WHEEL_MG2', Number(e.target.value))}
                  className="ths-slider w-full text-cyan-400"
                />
                <div className="grid grid-cols-3 gap-1 text-[10px]">
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
                    className={`inline-flex items-center justify-center gap-0.5 py-0.5 rounded ${
                      getRotationDirection(state.ringRpm) === RotationDir.CCW
                        ? 'bg-cyan-500 text-slate-950 font-semibold'
                        : 'bg-slate-950/60 text-slate-400 hover:text-white'
                    }`}
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>REV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setShaftDirection('WHEEL_MG2', state.ringRpm, 0, RotationDir.STOP)
                    }
                    className={`inline-flex items-center justify-center gap-0.5 py-0.5 rounded ${
                      getRotationDirection(state.ringRpm) === RotationDir.STOP
                        ? 'bg-slate-200 text-slate-950 font-semibold'
                        : 'bg-slate-950/60 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Square className="w-2 h-2" />
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
                    className={`inline-flex items-center justify-center gap-0.5 py-0.5 rounded ${
                      getRotationDirection(state.ringRpm) === RotationDir.CW
                        ? 'bg-cyan-500 text-slate-950 font-semibold'
                        : 'bg-slate-950/60 text-slate-400 hover:text-white'
                    }`}
                  >
                    <RotateCw className="w-2.5 h-2.5" />
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
