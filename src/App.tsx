import { useCallback, useEffect, useRef, useState } from 'react';
import { HybridAudioEngine } from './audio/hybridAudioEngine';
import { BottomControlDock } from './components/BottomControlDock';
import { PowertrainViewport } from './components/PowertrainViewport';
import {
  AutoDriveController,
  IDLE_AUTODRIVE_STATUS,
} from './simulation/autoDriveController';
import {
  buildStateFromMode,
  OPERATION_MODES,
  solveManualKinematics,
  stepDrivingSimulation,
} from './simulation/ths5Engine';
import {
  AutoDriveMode,
  CameraPresetId,
  GearPosition,
  OperationModeId,
  PowertrainState,
  SolveTarget,
  WorkspaceTab,
} from './types/hybrid';

function createInitialCityDriveState(controller: AutoDriveController): PowertrainState {
  const stopSpec =
    OPERATION_MODES.find((m) => m.id === OperationModeId.STOP) || OPERATION_MODES[0];
  const base = buildStateFromMode(stopSpec);
  const autoStatus = controller.setMode(AutoDriveMode.CITY, 0);

  return {
    ...base,
    gear: GearPosition.D,
    socPercent: 60,
    odometerKm: 0,
    totalFuelLiters: 0,
    throttlePercent: 0,
    brakePercent: 0,
    roadGradePercent: 0,
    evModeRequested: false,
    autoDrive: autoStatus,
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(WorkspaceTab.SIMULATOR);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  // Default on page load: Sound OFF, AutoDrive in CITY
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [autoDriveMode, setAutoDriveMode] = useState<AutoDriveMode>(AutoDriveMode.CITY);
  const [timeScale, setTimeScale] = useState<number>(1);

  const autoDriveRef = useRef<AutoDriveController | null>(null);
  const initialStateRef = useRef<PowertrainState | null>(null);
  if (!autoDriveRef.current || !initialStateRef.current) {
    const ctrl = new AutoDriveController();
    autoDriveRef.current = ctrl;
    initialStateRef.current = createInitialCityDriveState(ctrl);
  }

  const initialState = initialStateRef.current;
  const [uiState, setUiState] = useState<PowertrainState>(initialState);
  const stateRef = useRef<PowertrainState>(initialState);

  const timeScaleRef = useRef<number>(timeScale);
  timeScaleRef.current = timeScale;

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

  // Unlock Web Audio when user gestures if sound has been enabled, and dispose cleanly on unmount
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

  const cancelAutoDriveOnManualOverride = useCallback(() => {
    const ctrl = autoDriveRef.current;
    if (ctrl && ctrl.getMode() !== AutoDriveMode.OFF) {
      ctrl.setMode(AutoDriveMode.OFF, stateRef.current.speedKmh);
      setAutoDriveMode(AutoDriveMode.OFF);
      stateRef.current = {
        ...stateRef.current,
        autoDrive: { ...IDLE_AUTODRIVE_STATUS },
      };
    }
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

  const handleSelectAutoDriveMode = useCallback((mode: AutoDriveMode) => {
    const ctrl = autoDriveRef.current;
    if (!ctrl) return;
    const prevMode = ctrl.getMode();
    const status = ctrl.setMode(mode, stateRef.current.speedKmh);
    setAutoDriveMode(mode);

    if (mode !== AutoDriveMode.OFF) {
      if (
        driverInputsRef.current.gear !== GearPosition.D &&
        driverInputsRef.current.gear !== GearPosition.B
      ) {
        driverInputsRef.current.gear = GearPosition.D;
      }
      if (prevMode === AutoDriveMode.MOUNTAIN && mode !== AutoDriveMode.MOUNTAIN) {
        driverInputsRef.current.roadGradePercent = 0;
        driverInputsRef.current.gear = GearPosition.D;
      }
      driverInputsRef.current.sliderBrake = 0;
    } else {
      driverInputsRef.current.sliderThrottle = 0;
      driverInputsRef.current.sliderBrake = 0;
    }

    const updated: PowertrainState = {
      ...stateRef.current,
      gear: driverInputsRef.current.gear,
      throttlePercent: driverInputsRef.current.sliderThrottle,
      brakePercent: driverInputsRef.current.sliderBrake,
      roadGradePercent: driverInputsRef.current.roadGradePercent,
      autoDrive: status,
    };
    stateRef.current = updated;
    setUiState(updated);
  }, []);

  const handleTickSimulation = useCallback((rawDt: number) => {
    const scale = timeScaleRef.current;
    const simDt = rawDt * scale;
    const ctrl = autoDriveRef.current;

    if (activeTabRef.current === WorkspaceTab.SIMULATOR) {
      const inp = driverInputsRef.current;
      let effectiveThrottle: number;
      let effectiveBrake: number;
      let autoStatus = IDLE_AUTODRIVE_STATUS;

      if (ctrl && ctrl.getMode() !== AutoDriveMode.OFF) {
        const act = ctrl.step(stateRef.current, simDt);
        inp.gear = act.gear;
        inp.sliderThrottle = act.throttlePercent;
        inp.sliderBrake = act.brakePercent;
        if (act.roadGradePercent !== undefined) {
          inp.roadGradePercent = act.roadGradePercent;
        }
        effectiveThrottle = act.throttlePercent;
        effectiveBrake = act.brakePercent;
        autoStatus = act.status;
      } else {
        effectiveThrottle = inp.keyBrakeHeld
          ? 0
          : inp.keyThrottleHeld
            ? Math.max(inp.sliderThrottle, 68)
            : inp.sliderThrottle;
        effectiveBrake = inp.keyBrakeHeld ? Math.max(inp.sliderBrake, 65) : inp.sliderBrake;
      }

      const next = stepDrivingSimulation(
        stateRef.current,
        {
          gear: inp.gear,
          evModeRequested: inp.evModeRequested,
          throttlePercent: effectiveThrottle,
          brakePercent: effectiveBrake,
          roadGradePercent: inp.roadGradePercent,
          autoDrive: autoStatus,
        },
        simDt
      );
      stateRef.current = next;

      uiSyncTimerRef.current += rawDt;
      if (uiSyncTimerRef.current >= 0.055) {
        uiSyncTimerRef.current = 0;
        setUiState(next);
      }
    }

    audioRef.current?.update(stateRef.current, scale);
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
          cancelAutoDriveOnManualOverride();
          driverInputsRef.current.keyThrottleHeld = true;
          driverInputsRef.current.sliderBrake = 0;
        } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
          cancelAutoDriveOnManualOverride();
          driverInputsRef.current.keyBrakeHeld = true;
          driverInputsRef.current.sliderThrottle = 0;
        } else if (e.code === 'Space') {
          e.preventDefault();
          cancelAutoDriveOnManualOverride();
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
  }, [cancelAutoDriveOnManualOverride]);

  const handleSelectTab = (tab: WorkspaceTab) => {
    if (tab !== WorkspaceTab.SIMULATOR) {
      cancelAutoDriveOnManualOverride();
    }
    setActiveTab(tab);
  };

  const handleGearChange = (gear: GearPosition) => {
    if (gear !== GearPosition.D && gear !== GearPosition.B) {
      cancelAutoDriveOnManualOverride();
    }
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
    cancelAutoDriveOnManualOverride();
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
    cancelAutoDriveOnManualOverride();
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

  const handleNetPowerChange = (netPercent: number) => {
    cancelAutoDriveOnManualOverride();
    const clamped = Math.max(-100, Math.min(100, netPercent));
    const throttle = clamped > 0 ? clamped : 0;
    const brake = clamped < 0 ? Math.abs(clamped) : 0;
    driverInputsRef.current.sliderThrottle = throttle;
    driverInputsRef.current.sliderBrake = brake;
    const updated = {
      ...stateRef.current,
      throttlePercent: throttle,
      brakePercent: brake,
    };
    stateRef.current = updated;
    setUiState(updated);
  };

  const handleRoadGradeChange = (val: number) => {
    const ctrl = autoDriveRef.current;
    if (ctrl && ctrl.getMode() === AutoDriveMode.MOUNTAIN) {
      ctrl.overrideMountainGrade(val);
    }
    driverInputsRef.current.roadGradePercent = val;
    const updated = {
      ...stateRef.current,
      roadGradePercent: val,
    };
    stateRef.current = updated;
    setUiState(updated);
  };

  const handleSelectOperationMode = (modeId: OperationModeId) => {
    cancelAutoDriveOnManualOverride();
    const spec = OPERATION_MODES.find((m) => m.id === modeId);
    if (!spec) return;
    const next = buildStateFromMode(spec, {
      odometerKm: stateRef.current.odometerKm,
      totalFuelLiters: stateRef.current.totalFuelLiters,
    });
    driverInputsRef.current.gear = next.gear;
    driverInputsRef.current.evModeRequested = next.evModeRequested;
    driverInputsRef.current.sliderThrottle = next.throttlePercent;
    driverInputsRef.current.sliderBrake = next.brakePercent;
    driverInputsRef.current.roadGradePercent = next.roadGradePercent;
    stateRef.current = next;
    setUiState(next);
  };

  const handleManualShaftChange = (shaft: 'ICE' | 'MG1' | 'WHEEL_MG2', rpm: number) => {
    cancelAutoDriveOnManualOverride();
    const next = solveManualKinematics(stateRef.current, shaft, rpm, solveTarget);
    stateRef.current = next;
    setUiState(next);
  };

  const handleSelectCameraPreset = (preset: CameraPresetId) => {
    setCameraPreset(preset);
    setCameraPresetTrigger((c) => c + 1);
  };

  const handleResetSystem = () => {
    const ctrl = autoDriveRef.current;
    if (!ctrl) return;

    const fresh = createInitialCityDriveState(ctrl);
    setAutoDriveMode(AutoDriveMode.CITY);
    setTimeScale(1);

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
          activeTab={activeTab}
          onTickSimulation={handleTickSimulation}
          cameraPreset={cameraPreset}
          cameraPresetTrigger={cameraPresetTrigger}
          explodeFactor={explodeFactor}
          visualSpinScale={timeScale}
          showStreams={true}
        />
      </main>

      <BottomControlDock
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        collapsed={dockCollapsed}
        onToggleCollapse={() => setDockCollapsed((prev) => !prev)}
        state={uiState}
        onGearChange={handleGearChange}
        onToggleEvMode={handleToggleEvMode}
        autoDriveMode={autoDriveMode}
        onSelectAutoDriveMode={handleSelectAutoDriveMode}
        onThrottleChange={handleThrottleChange}
        onBrakeChange={handleBrakeChange}
        onNetPowerChange={handleNetPowerChange}
        onRoadGradeChange={handleRoadGradeChange}
        onSelectOperationMode={handleSelectOperationMode}
        solveTarget={solveTarget}
        onChangeSolveTarget={setSolveTarget}
        onManualShaftChange={handleManualShaftChange}
        cameraPreset={cameraPreset}
        onSelectCameraPreset={handleSelectCameraPreset}
        explodeFactor={explodeFactor}
        onExplodeChange={setExplodeFactor}
        timeScale={timeScale}
        onTimeScaleChange={setTimeScale}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        onReset={handleResetSystem}
      />
    </div>
  );
}
