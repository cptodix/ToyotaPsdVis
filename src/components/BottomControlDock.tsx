import React from 'react';
import {
  AnimationSpeedMode,
  AutoDriveMode,
  CameraPresetId,
  GearPosition,
  OperationModeId,
  PowertrainState,
  SolveTarget,
  WorkspaceTab,
} from '../types/hybrid';
import { DriveSimulatorTab } from './dock/DriveSimulatorTab';
import { ManualShaftTab } from './dock/ManualShaftTab';
import { OperationModesTab } from './dock/OperationModesTab';
import { SimulatorToolbar } from './dock/SimulatorToolbar';
import { StatusTelemetryBanner } from './dock/StatusTelemetryBanner';

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
  animationSpeedMode: AnimationSpeedMode;
  onSelectAnimationSpeedMode: (mode: AnimationSpeedMode) => void;
  timeScale: number;
  onTimeScaleChange: (scale: number) => void;
  autoSloMo: boolean;
  autoSloMoActive: boolean;
  onToggleAutoSloMo: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onReset: () => void;
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
  animationSpeedMode,
  onSelectAnimationSpeedMode,
  timeScale,
  onTimeScaleChange,
  autoSloMo,
  autoSloMoActive,
  onToggleAutoSloMo,
  soundEnabled,
  onToggleSound,
  onReset,
}) => {
  return (
    <div
      id="bottom-control-dock"
      className={`fixed bottom-1.5 left-1/2 -translate-x-1/2 z-30 w-[min(1120px,99vw)] max-w-[calc(100vw-6px)] transition-transform duration-200 ease-out ${
        collapsed ? 'translate-y-[calc(100%-26px)]' : 'translate-y-0'
      }`}
    >
      <SimulatorToolbar
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        cameraPreset={cameraPreset}
        onSelectCameraPreset={onSelectCameraPreset}
        explodeFactor={explodeFactor}
        onExplodeChange={onExplodeChange}
        animationSpeedMode={animationSpeedMode}
        onSelectAnimationSpeedMode={onSelectAnimationSpeedMode}
        timeScale={timeScale}
        onTimeScaleChange={onTimeScaleChange}
        autoSloMo={autoSloMo}
        autoSloMoActive={autoSloMoActive}
        onToggleAutoSloMo={onToggleAutoSloMo}
        soundEnabled={soundEnabled}
        onToggleSound={onToggleSound}
        onReset={onReset}
      />

      <StatusTelemetryBanner autoDriveMode={autoDriveMode} state={state} />

      <div className="rounded-xl bg-slate-950/64 border border-slate-700/55 shadow-xl p-1 overflow-x-hidden max-h-[calc(100vh-40px)] overflow-y-auto">
        {activeTab === WorkspaceTab.SIMULATOR && (
          <DriveSimulatorTab
            state={state}
            timeScale={timeScale}
            autoDriveMode={autoDriveMode}
            onGearChange={onGearChange}
            onToggleEvMode={onToggleEvMode}
            onSelectAutoDriveMode={onSelectAutoDriveMode}
            onThrottleChange={onThrottleChange}
            onBrakeChange={onBrakeChange}
            onRoadGradeChange={onRoadGradeChange}
          />
        )}

        {activeTab === WorkspaceTab.MODES && (
          <OperationModesTab state={state} onSelectOperationMode={onSelectOperationMode} />
        )}

        {activeTab === WorkspaceTab.MANUAL && (
          <ManualShaftTab
            state={state}
            solveTarget={solveTarget}
            onChangeSolveTarget={onChangeSolveTarget}
            onManualShaftChange={onManualShaftChange}
          />
        )}
      </div>
    </div>
  );
};
