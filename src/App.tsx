import { useCallback, useEffect, useRef, useState } from 'react';
import { HybridAudioEngine } from './audio/hybridAudioEngine';
import { BottomControlDock } from './components/BottomControlDock';
import { PowertrainViewport } from './components/PowertrainViewport';
import {
  buildStateFromMode,
  OPERATION_MODES,
  solveManualKinematics,
  stepDrivingSimulation,
} from './simulation/ths5Engine';
import {
  CameraPresetId,
  GearPosition,
  OperationModeId,
  PowertrainState,
  SolveTarget,
  WorkspaceTab,
} from './types/hybrid';

function createInitialSimulatorState(): PowertrainState {
  const splitMode =
    OPERATION_MODES.find((m) => m.id === OperationModeId.NORMAL_SPLIT) || OPERATION_MODES[4];
  const base = buildStateFromMode(splitMode);
  return {
    ...base,
    throttlePercent: 34,
    brakePercent: 0,
    roadGradePercent: 0,
    evModeRequested: false,
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(WorkspaceTab.SIMULATOR);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const initialState = createInitialSimulatorState();
  const [uiState, setUiState] = useState<PowertrainState>(initialState);
  const stateRef = useRef<PowertrainState>(initialState);

  const audioRef = useRef<HybridAudioEngine | null>(null);
  if (!audioRef.current) {
    audioRef.current = new HybridAudioEngine();
  }

  const driverInputsRef = useRef({
    gear: initialState.gear,
    evModeRequested: initialState.evModeRequested,
    sliderThrottle: initialState.throttlePercent,
    sliderBrake: initialState.brakePercent,
    roadGradePercent: initialState.roadGradePercent,
    keyThrottleHeld: false,
    keyBrakeHeld: false,
  });

  const activeTabRef = useRef<WorkspaceTab>(activeTab);
  activeTabRef.current = activeTab;

  const [solveTarget, setSolveTarget] = useState<SolveTarget>(SolveTarget.MG1);
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>(CameraPresetId.OVERVIEW);
  const [cameraPresetTrigger, setCameraPresetTrigger] = useState(0);
  const [explodeFactor, setExplodeFactor] = useState(0);

  const uiSyncTimerRef = useRef(0);

  // Unlock Web Audio on first user gesture and dispose cleanly on unmount
  useEffect(() => {
    const audio = audioRef.current;
    const unlockAudio = () => {
      audio?.unlock();
    };
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio);
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      audio?.dispose();
    };
  }, []);

  const handleToggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      if (next) {
        audioRef.current?.setEnabled(true);
        audioRef.current?.unlock();
      } else {
        audioRef.current?.setEnabled(false);
      }
      return next;
    });
  }, []);

  const handleTickSimulation = useCallback((dt: number) => {
    if (activeTabRef.current === WorkspaceTab.SIMULATOR) {
      const inp = driverInputsRef.current;
      const effectiveThrottle = inp.keyBrakeHeld
        ? 0
        : inp.keyThrottleHeld
          ? Math.max(inp.sliderThrottle, 68)
          : inp.sliderThrottle;
      const effectiveBrake = inp.keyBrakeHeld ? Math.max(inp.sliderBrake, 65) : inp.sliderBrake;

      const next = stepDrivingSimulation(
        stateRef.current,
        {
          gear: inp.gear,
          evModeRequested: inp.evModeRequested,
          throttlePercent: effectiveThrottle,
          brakePercent: effectiveBrake,
          roadGradePercent: inp.roadGradePercent,
        },
        dt
      );
      stateRef.current = next;

      uiSyncTimerRef.current += dt;
      if (uiSyncTimerRef.current >= 0.055) {
        uiSyncTimerRef.current = 0;
        setUiState(next);
      }
    }

    audioRef.current?.update(stateRef.current);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key.toLowerCase() !== 'h') return;
      }

      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
        return;
      }

      if (activeTabRef.current === WorkspaceTab.SIMULATOR) {
        if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
          driverInputsRef.current.keyThrottleHeld = true;
          driverInputsRef.current.sliderBrake = 0;
        } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
          driverInputsRef.current.keyBrakeHeld = true;
          driverInputsRef.current.sliderThrottle = 0;
        } else if (e.code === 'Space') {
          e.preventDefault();
          driverInputsRef.current.sliderThrottle = 0;
          driverInputsRef.current.sliderBrake = 0;
          driverInputsRef.current.keyThrottleHeld = false;
          driverInputsRef.current.keyBrakeHeld = false;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
        driverInputsRef.current.keyThrottleHeld = false;
      } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
        driverInputsRef.current.keyBrakeHeld = false;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const handleGearChange = (gear: GearPosition) => {
    driverInputsRef.current.gear = gear;
    const updated = { ...stateRef.current, gear };
    stateRef.current = updated;
    setUiState(updated);
  };

  const handleToggleEvMode = () => {
    const nextEv = !driverInputsRef.current.evModeRequested;
    driverInputsRef.current.evModeRequested = nextEv;
    const updated = { ...stateRef.current, evModeRequested: nextEv };
    stateRef.current = updated;
    setUiState(updated);
  };

  const handleThrottleChange = (val: number) => {
    driverInputsRef.current.sliderThrottle = val;
    if (val > 0) driverInputsRef.current.sliderBrake = 0;
    const updated = {
      ...stateRef.current,
      throttlePercent: val,
      brakePercent: val > 0 ? 0 : stateRef.current.brakePercent,
    };
    stateRef.current = updated;
    setUiState(updated);
  };

  const handleBrakeChange = (val: number) => {
    driverInputsRef.current.sliderBrake = val;
    if (val > 0) driverInputsRef.current.sliderThrottle = 0;
    const updated = {
      ...stateRef.current,
      brakePercent: val,
      throttlePercent: val > 0 ? 0 : stateRef.current.throttlePercent,
    };
    stateRef.current = updated;
    setUiState(updated);
  };

  const handleRoadGradeChange = (val: number) => {
    driverInputsRef.current.roadGradePercent = val;
    const updated = {
      ...stateRef.current,
      roadGradePercent: val,
    };
    stateRef.current = updated;
    setUiState(updated);
  };

  const handleSelectOperationMode = (modeId: OperationModeId) => {
    const spec = OPERATION_MODES.find((m) => m.id === modeId);
    if (!spec) return;
    const next = buildStateFromMode(spec);
    driverInputsRef.current.gear = next.gear;
    driverInputsRef.current.evModeRequested = next.evModeRequested;
    driverInputsRef.current.sliderThrottle = next.throttlePercent;
    driverInputsRef.current.sliderBrake = next.brakePercent;
    driverInputsRef.current.roadGradePercent = next.roadGradePercent;
    stateRef.current = next;
    setUiState(next);
  };

  const handleManualShaftChange = (shaft: 'ICE' | 'MG1' | 'WHEEL_MG2', rpm: number) => {
    const next = solveManualKinematics(stateRef.current, shaft, rpm, solveTarget);
    stateRef.current = next;
    setUiState(next);
  };

  const handleSelectCameraPreset = (preset: CameraPresetId) => {
    setCameraPreset(preset);
    setCameraPresetTrigger((c) => c + 1);
  };

  const handleResetSystem = () => {
    const fresh = createInitialSimulatorState();
    driverInputsRef.current = {
      gear: fresh.gear,
      evModeRequested: fresh.evModeRequested,
      sliderThrottle: fresh.throttlePercent,
      sliderBrake: fresh.brakePercent,
      roadGradePercent: fresh.roadGradePercent,
      keyThrottleHeld: false,
      keyBrakeHeld: false,
    };
    stateRef.current = fresh;
    setUiState(fresh);
    setExplodeFactor(0);
    handleSelectCameraPreset(CameraPresetId.OVERVIEW);
    setActiveTab(WorkspaceTab.SIMULATOR);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#090d16] text-slate-100">
      <main className="w-full h-full">
        <PowertrainViewport
          stateRef={stateRef}
          uiState={uiState}
          onTickSimulation={handleTickSimulation}
          cameraPreset={cameraPreset}
          cameraPresetTrigger={cameraPresetTrigger}
          explodeFactor={explodeFactor}
          visualSpinScale={1}
          showStreams={true}
        />
      </main>

      <BottomControlDock
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        collapsed={dockCollapsed}
        onToggleCollapse={() => setDockCollapsed((prev) => !prev)}
        state={uiState}
        onGearChange={handleGearChange}
        onToggleEvMode={handleToggleEvMode}
        onThrottleChange={handleThrottleChange}
        onBrakeChange={handleBrakeChange}
        onRoadGradeChange={handleRoadGradeChange}
        onSelectOperationMode={handleSelectOperationMode}
        solveTarget={solveTarget}
        onChangeSolveTarget={setSolveTarget}
        onManualShaftChange={handleManualShaftChange}
        cameraPreset={cameraPreset}
        onSelectCameraPreset={handleSelectCameraPreset}
        explodeFactor={explodeFactor}
        onExplodeChange={setExplodeFactor}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        onReset={handleResetSystem}
      />
    </div>
  );
}
