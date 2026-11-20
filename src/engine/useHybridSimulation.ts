import { useCallback, useEffect, useRef, useState } from 'react';
import { HybridAudioEngine } from '../audio/hybridAudioEngine';
import {
  AnimationSpeedMode,
  AutoDriveMode,
  CameraPresetId,
  GearPosition,
  OperationModeId,
  PowertrainState,
  PsdLogEntry,
  SolveTarget,
  WorkspaceTab,
} from '../types/hybrid';
import { HybridSimulationSession } from './hybridSimulationSession';

/**
 * React binding hook over HybridSimulationSession & HybridAudioEngine.
 * Keeps React state synchronized smoothly while delegating physics, AutoDrive, and transition logic
 * cleanly to pure TypeScript domain classes.
 */
export function useHybridSimulation() {
  const sessionRef = useRef<HybridSimulationSession | null>(null);
  const audioRef = useRef<HybridAudioEngine | null>(null);

  if (!sessionRef.current) {
    sessionRef.current = new HybridSimulationSession();
  }
  if (!audioRef.current) {
    audioRef.current = new HybridAudioEngine();
  }

  const session = sessionRef.current;

  const [activeTab, setActiveTab] = useState<WorkspaceTab>(WorkspaceTab.SIMULATOR);
  const activeTabRef = useRef<WorkspaceTab>(activeTab);
  activeTabRef.current = activeTab;

  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [autoDriveMode, setAutoDriveMode] = useState<AutoDriveMode>(session.autoDriveMode);
  const [animationSpeedMode, setAnimationSpeedMode] = useState<AnimationSpeedMode>(
    session.animationSpeedMode
  );
  const [manualTimeScale, setManualTimeScale] = useState<number>(session.manualTimeScale);
  const [autoSloMo, setAutoSloMo] = useState<boolean>(session.autoSloMo);
  const [autoSloMoActive, setAutoSloMoActive] = useState<boolean>(session.autoSloMoActive);

  const [logEntries, setLogEntries] = useState<PsdLogEntry[]>(session.logEntries);
  const [logModalOpen, setLogModalOpen] = useState<boolean>(false);
  const [logNotifEnabled, setLogNotifEnabled] = useState<boolean>(session.logNotifEnabled);
  const [activeNotification, setActiveNotification] = useState<PsdLogEntry | null>(null);

  const [uiState, setUiState] = useState<PowertrainState>(session.state);
  const stateRef = useRef<PowertrainState>(session.state);

  const [solveTarget, setSolveTarget] = useState<SolveTarget>(SolveTarget.MG1);
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>(CameraPresetId.OVERVIEW);
  const [cameraPresetTrigger, setCameraPresetTrigger] = useState(0);
  const [explodeFactor, setExplodeFactor] = useState(0);

  const notifTimerRef = useRef<number | null>(null);
  const uiSyncTimerRef = useRef(0);

  const clearNotifTimer = useCallback(() => {
    if (notifTimerRef.current !== null) {
      window.clearTimeout(notifTimerRef.current);
      notifTimerRef.current = null;
    }
  }, []);

  const syncInspectionToUi = useCallback(
    (inspection: {
      newEntries: PsdLogEntry[];
      latestNotification: PsdLogEntry | null;
      autoSloMoActiveChanged: boolean;
    }) => {
      if (inspection.newEntries.length > 0) {
        setLogEntries(session.logEntries);
      }
      if (inspection.latestNotification) {
        setActiveNotification(inspection.latestNotification);
        clearNotifTimer();
        notifTimerRef.current = window.setTimeout(() => {
          setActiveNotification(null);
          notifTimerRef.current = null;
        }, 6500);
      }
      if (inspection.autoSloMoActiveChanged) {
        setAutoSloMoActive(session.autoSloMoActive);
      }
    },
    [clearNotifTimer, session]
  );

  // Unlock Web Audio on first user gesture when sound is enabled
  useEffect(() => {
    const audio = audioRef.current;
    const unlockAudio = () => audio?.unlock();
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio);
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      audio?.dispose();
      clearNotifTimer();
    };
  }, [clearNotifTimer]);

  // Keyboard controls (W/ArrowUp = throttle, S/ArrowDown = brake, Space = release, H = collapse dock)
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
          if (session.cancelAutoDriveOnManualOverride()) {
            setAutoDriveMode(AutoDriveMode.OFF);
            stateRef.current = session.state;
          }
          session.inputs.keyThrottleHeld = true;
          session.inputs.sliderBrake = 0;
        } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
          if (session.cancelAutoDriveOnManualOverride()) {
            setAutoDriveMode(AutoDriveMode.OFF);
            stateRef.current = session.state;
          }
          session.inputs.keyBrakeHeld = true;
          session.inputs.sliderThrottle = 0;
        } else if (e.code === 'Space') {
          e.preventDefault();
          if (session.cancelAutoDriveOnManualOverride()) {
            setAutoDriveMode(AutoDriveMode.OFF);
            stateRef.current = session.state;
          }
          session.inputs.sliderThrottle = 0;
          session.inputs.sliderBrake = 0;
          session.inputs.keyThrottleHeld = false;
          session.inputs.keyBrakeHeld = false;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
        session.inputs.keyThrottleHeld = false;
      } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
        session.inputs.keyBrakeHeld = false;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [session]);

  const handleDismissNotification = useCallback(() => {
    clearNotifTimer();
    setActiveNotification(null);
  }, [clearNotifTimer]);

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

  const handleToggleAutoSloMo = useCallback(() => {
    const res = session.toggleAutoSloMo();
    setAutoSloMo(res.autoSloMo);
    setAutoSloMoActive(res.autoSloMoActive);
    setManualTimeScale(res.manualTimeScale);
    setLogNotifEnabled(res.logNotifEnabled);
    if (!res.logNotifEnabled) {
      clearNotifTimer();
      setActiveNotification(null);
    }
  }, [clearNotifTimer, session]);

  const handleManualTimeScaleChange = useCallback(
    (scale: number) => {
      if (session.autoSloMo) {
        setAutoSloMo(false);
        setAutoSloMoActive(false);
        setLogNotifEnabled(false);
        clearNotifTimer();
        setActiveNotification(null);
      }
      session.setManualTimeScale(scale);
      setManualTimeScale(scale);
    },
    [clearNotifTimer, session]
  );

  const handleSelectAnimationSpeedMode = useCallback(
    (mode: AnimationSpeedMode) => {
      session.setAnimationSpeedMode(mode);
      setAnimationSpeedMode(mode);
    },
    [session]
  );

  const handleToggleLogNotif = useCallback(() => {
    const next = !session.logNotifEnabled;
    session.logNotifEnabled = next;
    setLogNotifEnabled(next);
    if (!next) {
      clearNotifTimer();
      setActiveNotification(null);
    }
  }, [clearNotifTimer, session]);

  const handleSelectAutoDriveMode = useCallback(
    (mode: AutoDriveMode) => {
      const updated = session.selectAutoDriveMode(mode);
      setAutoDriveMode(mode);
      stateRef.current = updated;
      setUiState(updated);
    },
    [session]
  );

  const handleTickSimulation = useCallback(
    (rawDt: number) => {
      const res = session.tick(rawDt, activeTabRef.current);
      stateRef.current = res.state;

      if (res.newLogEntries.length > 0 || res.latestNotification || res.autoSloMoActiveChanged) {
        syncInspectionToUi({
          newEntries: res.newLogEntries,
          latestNotification: res.latestNotification,
          autoSloMoActiveChanged: res.autoSloMoActiveChanged,
        });
      }

      if (
        activeTabRef.current === WorkspaceTab.SIMULATOR ||
        (activeTabRef.current === WorkspaceTab.MANUAL &&
          session.autoDrive.getMode() !== AutoDriveMode.OFF)
      ) {
        uiSyncTimerRef.current += rawDt;
        if (uiSyncTimerRef.current >= 0.055) {
          uiSyncTimerRef.current = 0;
          setUiState(res.state);
        }
      }

      audioRef.current?.update(res.state, res.effectiveTimeScale);
    },
    [session, syncInspectionToUi]
  );

  const handleSelectTab = useCallback(
    (tab: WorkspaceTab) => {
      if (tab === WorkspaceTab.MODES && session.cancelAutoDriveOnManualOverride()) {
        setAutoDriveMode(AutoDriveMode.OFF);
        stateRef.current = session.state;
        setUiState(session.state);
      }
      setActiveTab(tab);
    },
    [session]
  );

  const handleGearChange = useCallback(
    (gear: GearPosition) => {
      const { state, inspection } = session.setGear(gear);
      setAutoDriveMode(session.autoDriveMode);
      stateRef.current = state;
      setUiState(state);
      syncInspectionToUi(inspection);
    },
    [session, syncInspectionToUi]
  );

  const handleToggleEvMode = useCallback(() => {
    const state = session.toggleEvMode();
    stateRef.current = state;
    setUiState(state);
  }, [session]);

  const handleThrottleChange = useCallback(
    (val: number) => {
      const state = session.setThrottle(val);
      setAutoDriveMode(session.autoDriveMode);
      stateRef.current = state;
      setUiState(state);
    },
    [session]
  );

  const handleBrakeChange = useCallback(
    (val: number) => {
      const state = session.setBrake(val);
      setAutoDriveMode(session.autoDriveMode);
      stateRef.current = state;
      setUiState(state);
    },
    [session]
  );

  const handleNetPowerChange = useCallback(
    (netPercent: number) => {
      const state = session.setNetPower(netPercent);
      setAutoDriveMode(session.autoDriveMode);
      stateRef.current = state;
      setUiState(state);
    },
    [session]
  );

  const handleRoadGradeChange = useCallback(
    (val: number) => {
      const state = session.setRoadGrade(val);
      stateRef.current = state;
      setUiState(state);
    },
    [session]
  );

  const handleSelectOperationMode = useCallback(
    (modeId: OperationModeId) => {
      const res = session.selectOperationMode(modeId);
      if (!res) return;
      setAutoDriveMode(session.autoDriveMode);
      stateRef.current = res.state;
      setUiState(res.state);
      syncInspectionToUi(res.inspection);
    },
    [session, syncInspectionToUi]
  );

  const handleManualShaftChange = useCallback(
    (shaft: 'ICE' | 'MG1' | 'WHEEL_MG2', rpm: number) => {
      const { state, inspection } = session.setManualShaftRpm(shaft, rpm, solveTarget);
      setAutoDriveMode(session.autoDriveMode);
      stateRef.current = state;
      setUiState(state);
      syncInspectionToUi(inspection);
    },
    [session, solveTarget, syncInspectionToUi]
  );

  const handleSelectCameraPreset = useCallback((preset: CameraPresetId) => {
    setCameraPreset(preset);
    setCameraPresetTrigger((c) => c + 1);
  }, []);

  const handleClearLogs = useCallback(() => {
    session.clearLogs();
    setLogEntries([]);
  }, [session]);

  const handleResetSystem = useCallback(() => {
    const fresh = session.reset();
    setAutoDriveMode(AutoDriveMode.CITY);
    setAnimationSpeedMode(AnimationSpeedMode.NORMAL);
    setManualTimeScale(1);
    setAutoSloMo(false);
    setAutoSloMoActive(false);
    setLogNotifEnabled(false);
    clearNotifTimer();
    setActiveNotification(null);
    setLogEntries([]);
    stateRef.current = fresh;
    setUiState(fresh);
    setExplodeFactor(0);
    handleSelectCameraPreset(CameraPresetId.OVERVIEW);
    setActiveTab(WorkspaceTab.SIMULATOR);
  }, [clearNotifTimer, handleSelectCameraPreset, session]);

  const effectiveTimeScale = autoSloMo ? (autoSloMoActive ? 0.5 : 1) : manualTimeScale;

  return {
    activeTab,
    dockCollapsed,
    setDockCollapsed,
    soundEnabled,
    autoDriveMode,
    animationSpeedMode,
    effectiveTimeScale,
    autoSloMo,
    autoSloMoActive,
    logEntries,
    logModalOpen,
    setLogModalOpen,
    logNotifEnabled,
    activeNotification,
    uiState,
    stateRef,
    solveTarget,
    setSolveTarget,
    cameraPreset,
    cameraPresetTrigger,
    explodeFactor,
    setExplodeFactor,
    handleDismissNotification,
    handleToggleSound,
    handleToggleAutoSloMo,
    handleManualTimeScaleChange,
    handleSelectAnimationSpeedMode,
    handleToggleLogNotif,
    handleSelectAutoDriveMode,
    handleTickSimulation,
    handleSelectTab,
    handleGearChange,
    handleToggleEvMode,
    handleThrottleChange,
    handleBrakeChange,
    handleNetPowerChange,
    handleRoadGradeChange,
    handleSelectOperationMode,
    handleManualShaftChange,
    handleSelectCameraPreset,
    handleClearLogs,
    handleResetSystem,
  };
}
