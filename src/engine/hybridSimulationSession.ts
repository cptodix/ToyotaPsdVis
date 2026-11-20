import { AutoDriveController, IDLE_AUTODRIVE_STATUS } from '../autodrive';
import {
  buildStateFromMode,
  OPERATION_MODES,
  PsdTransitionTracker,
  solveManualKinematics,
  stepDrivingSimulation,
} from '../drivetrain';
import {
  AnimationSpeedMode,
  AutoDriveMode,
  GearPosition,
  OperationModeId,
  PowertrainState,
  PsdLogEntry,
  SolveTarget,
  WorkspaceTab,
} from '../types/hybrid';

export const MAX_LOG_ENTRIES = 100;

export interface DriverInputsState {
  gear: GearPosition;
  evModeRequested: boolean;
  sliderThrottle: number;
  sliderBrake: number;
  roadGradePercent: number;
  keyThrottleHeld: boolean;
  keyBrakeHeld: boolean;
}

export interface SessionTickResult {
  state: PowertrainState;
  effectiveTimeScale: number;
  autoSloMoActive: boolean;
  autoSloMoActiveChanged: boolean;
  newLogEntries: PsdLogEntry[];
  latestNotification: PsdLogEntry | null;
}

export function createInitialCityDriveState(controller: AutoDriveController): PowertrainState {
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

/**
 * Framework-agnostic Hybrid Simulation Orchestrator ("Backend" Session Engine).
 * Coordinates drivetrain physics, AutoDrive scheduling, PSD transition event logging (100-entry ring cap),
 * Auto Slo-Mo hold timing, and manual driver overrides without any React or DOM dependencies.
 */
export class HybridSimulationSession {
  public readonly autoDrive = new AutoDriveController();
  public readonly tracker = new PsdTransitionTracker();

  public state: PowertrainState;
  public inputs: DriverInputsState;
  public logEntries: PsdLogEntry[] = [];

  public autoDriveMode: AutoDriveMode = AutoDriveMode.CITY;
  public animationSpeedMode: AnimationSpeedMode = AnimationSpeedMode.NORMAL;
  public manualTimeScale = 1;
  public autoSloMo = false;
  public autoSloMoActive = false;
  public autoSloMoHoldSec = 0;
  public logNotifEnabled = false;

  constructor() {
    this.state = createInitialCityDriveState(this.autoDrive);
    this.tracker.reset(this.state);
    this.inputs = {
      gear: this.state.gear,
      evModeRequested: this.state.evModeRequested,
      sliderThrottle: this.state.throttlePercent,
      sliderBrake: this.state.brakePercent,
      roadGradePercent: this.state.roadGradePercent,
      keyThrottleHeld: false,
      keyBrakeHeld: false,
    };
  }

  public getEffectiveTimeScale(): number {
    return this.autoSloMo ? (this.autoSloMoActive ? 0.5 : 1) : this.manualTimeScale;
  }

  public inspectTransition(
    prevState: PowertrainState,
    nextState: PowertrainState,
    dtSimSec: number,
    isDiscreteJump: boolean
  ): {
    newEntries: PsdLogEntry[];
    latestNotification: PsdLogEntry | null;
    autoSloMoActiveChanged: boolean;
  } {
    const result = this.tracker.inspect(prevState, nextState, dtSimSec, isDiscreteJump);

    if (result.entries.length > 0) {
      this.logEntries = [...result.entries, ...this.logEntries].slice(0, MAX_LOG_ENTRIES);
    }

    let autoSloMoActiveChanged = false;
    if (this.autoSloMo) {
      if (result.triggerPostSloMo) {
        this.autoSloMoHoldSec = Math.max(this.autoSloMoHoldSec, 1.8);
      } else if (result.triggerPreSloMo) {
        this.autoSloMoHoldSec = Math.max(this.autoSloMoHoldSec, 1.1);
      }
      if (this.autoSloMoHoldSec > 0 && !this.autoSloMoActive) {
        this.autoSloMoActive = true;
        autoSloMoActiveChanged = true;
      }
    }

    return {
      newEntries: result.entries,
      latestNotification:
        this.logNotifEnabled && result.entries.length > 0 ? result.entries[0] : null,
      autoSloMoActiveChanged,
    };
  }

  public cancelAutoDriveOnManualOverride(): boolean {
    if (this.autoDrive.getMode() === AutoDriveMode.OFF) return false;
    this.autoDrive.setMode(AutoDriveMode.OFF, this.state.speedKmh);
    this.autoDriveMode = AutoDriveMode.OFF;
    this.state = {
      ...this.state,
      autoDrive: { ...IDLE_AUTODRIVE_STATUS },
    };
    return true;
  }

  public toggleAutoSloMo(): {
    autoSloMo: boolean;
    autoSloMoActive: boolean;
    manualTimeScale: number;
    logNotifEnabled: boolean;
  } {
    const enabling = !this.autoSloMo;
    this.autoSloMo = enabling;
    this.autoSloMoHoldSec = 0;
    this.autoSloMoActive = false;

    if (enabling) {
      this.manualTimeScale = 1;
      this.logNotifEnabled = true;
    } else {
      this.logNotifEnabled = false;
    }

    return {
      autoSloMo: this.autoSloMo,
      autoSloMoActive: this.autoSloMoActive,
      manualTimeScale: this.manualTimeScale,
      logNotifEnabled: this.logNotifEnabled,
    };
  }

  public setManualTimeScale(scale: number): void {
    if (this.autoSloMo) {
      this.autoSloMo = false;
      this.autoSloMoHoldSec = 0;
      this.autoSloMoActive = false;
      this.logNotifEnabled = false;
    }
    this.manualTimeScale = scale;
  }

  public setAnimationSpeedMode(mode: AnimationSpeedMode): void {
    this.animationSpeedMode = mode;
  }

  public selectAutoDriveMode(mode: AutoDriveMode): PowertrainState {
    const cur = this.state;
    const status = this.autoDrive.setMode(
      mode,
      cur.speedKmh,
      this.inputs.sliderThrottle,
      this.inputs.sliderBrake,
      this.inputs.roadGradePercent
    );
    this.autoDriveMode = mode;

    if (mode !== AutoDriveMode.OFF) {
      if (this.inputs.gear !== GearPosition.D && this.inputs.gear !== GearPosition.B) {
        this.inputs.gear = GearPosition.D;
      }
    } else {
      this.inputs.sliderThrottle = 0;
      this.inputs.sliderBrake = 0;
    }

    this.state = {
      ...cur,
      gear: this.inputs.gear,
      throttlePercent: this.inputs.sliderThrottle,
      brakePercent: this.inputs.sliderBrake,
      roadGradePercent: this.inputs.roadGradePercent,
      autoDrive: status,
    };
    return this.state;
  }

  public setGear(gear: GearPosition) {
    if (gear !== GearPosition.D && gear !== GearPosition.B) {
      this.cancelAutoDriveOnManualOverride();
    }
    const prev = this.state;
    this.inputs.gear = gear;
    this.state = { ...prev, gear };
    const inspection = this.inspectTransition(prev, this.state, 0, true);
    return { state: this.state, inspection };
  }

  public toggleEvMode(): PowertrainState {
    const nextEv = !this.inputs.evModeRequested;
    this.inputs.evModeRequested = nextEv;
    this.state = { ...this.state, evModeRequested: nextEv };
    return this.state;
  }

  public setThrottle(val: number): PowertrainState {
    this.cancelAutoDriveOnManualOverride();
    this.inputs.sliderThrottle = val;
    if (val > 0) this.inputs.sliderBrake = 0;
    this.state = {
      ...this.state,
      throttlePercent: val,
      brakePercent: val > 0 ? 0 : this.state.brakePercent,
    };
    return this.state;
  }

  public setBrake(val: number): PowertrainState {
    this.cancelAutoDriveOnManualOverride();
    this.inputs.sliderBrake = val;
    if (val > 0) this.inputs.sliderThrottle = 0;
    this.state = {
      ...this.state,
      brakePercent: val,
      throttlePercent: val > 0 ? 0 : this.state.throttlePercent,
    };
    return this.state;
  }

  public setNetPower(netPercent: number): PowertrainState {
    this.cancelAutoDriveOnManualOverride();
    const clamped = Math.max(-100, Math.min(100, netPercent));
    const throttle = clamped > 0 ? clamped : 0;
    const brake = clamped < 0 ? Math.abs(clamped) : 0;
    this.inputs.sliderThrottle = throttle;
    this.inputs.sliderBrake = brake;
    this.state = {
      ...this.state,
      throttlePercent: throttle,
      brakePercent: brake,
    };
    return this.state;
  }

  public setRoadGrade(val: number): PowertrainState {
    if (this.autoDrive.getMode() === AutoDriveMode.MOUNTAIN) {
      this.autoDrive.overrideMountainGrade(val);
    }
    this.inputs.roadGradePercent = val;
    this.state = { ...this.state, roadGradePercent: val };
    return this.state;
  }

  public selectOperationMode(modeId: OperationModeId) {
    this.cancelAutoDriveOnManualOverride();
    const spec = OPERATION_MODES.find((m) => m.id === modeId);
    if (!spec) return null;

    const prev = this.state;
    const next = buildStateFromMode(spec, {
      odometerKm: prev.odometerKm,
      totalFuelLiters: prev.totalFuelLiters,
    });
    this.inputs.gear = next.gear;
    this.inputs.evModeRequested = next.evModeRequested;
    this.inputs.sliderThrottle = next.throttlePercent;
    this.inputs.sliderBrake = next.brakePercent;
    this.inputs.roadGradePercent = next.roadGradePercent;
    this.state = next;

    const inspection = this.inspectTransition(prev, next, 0, true);
    return { state: next, inspection };
  }

  public setManualShaftRpm(
    shaft: 'ICE' | 'MG1' | 'WHEEL_MG2',
    rpm: number,
    solveTarget: SolveTarget
  ) {
    this.cancelAutoDriveOnManualOverride();
    const prev = this.state;
    const next = solveManualKinematics(prev, shaft, rpm, solveTarget);
    this.state = next;
    const inspection = this.inspectTransition(prev, next, 0, true);
    return { state: next, inspection };
  }

  public clearLogs(): void {
    this.logEntries = [];
  }

  public reset(): PowertrainState {
    const fresh = createInitialCityDriveState(this.autoDrive);
    this.autoDriveMode = AutoDriveMode.CITY;
    this.animationSpeedMode = AnimationSpeedMode.NORMAL;
    this.manualTimeScale = 1;
    this.autoSloMo = false;
    this.autoSloMoActive = false;
    this.autoSloMoHoldSec = 0;
    this.logNotifEnabled = false;
    this.logEntries = [];
    this.tracker.reset(fresh);

    this.inputs = {
      gear: fresh.gear,
      evModeRequested: fresh.evModeRequested,
      sliderThrottle: fresh.throttlePercent,
      sliderBrake: fresh.brakePercent,
      roadGradePercent: fresh.roadGradePercent,
      keyThrottleHeld: false,
      keyBrakeHeld: false,
    };
    this.state = fresh;
    return fresh;
  }

  public tick(rawDt: number, activeTab: WorkspaceTab): SessionTickResult {
    const scale = this.getEffectiveTimeScale();
    const simDt = rawDt * scale;
    const isAutoDriveActive = this.autoDrive.getMode() !== AutoDriveMode.OFF;

    let newLogEntries: PsdLogEntry[] = [];
    let latestNotification: PsdLogEntry | null = null;
    let autoSloMoActiveChanged = false;

    if (
      activeTab === WorkspaceTab.SIMULATOR ||
      (activeTab === WorkspaceTab.MANUAL && isAutoDriveActive)
    ) {
      const inp = this.inputs;
      let effectiveThrottle: number;
      let effectiveBrake: number;
      let autoStatus = IDLE_AUTODRIVE_STATUS;

      if (isAutoDriveActive) {
        const act = this.autoDrive.step(this.state, simDt);
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

      const prevState = this.state;
      const next = stepDrivingSimulation(
        prevState,
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
      this.state = next;

      const inspection = this.inspectTransition(prevState, next, simDt, false);
      newLogEntries = inspection.newEntries;
      latestNotification = inspection.latestNotification;
      autoSloMoActiveChanged = inspection.autoSloMoActiveChanged;
    }

    if (this.autoSloMo) {
      if (this.autoSloMoHoldSec > 0) {
        this.autoSloMoHoldSec = Math.max(0, this.autoSloMoHoldSec - rawDt);
      }
      const nowActive = this.autoSloMoHoldSec > 0;
      if (nowActive !== this.autoSloMoActive) {
        this.autoSloMoActive = nowActive;
        autoSloMoActiveChanged = true;
      }
    }

    return {
      state: this.state,
      effectiveTimeScale: this.getEffectiveTimeScale(),
      autoSloMoActive: this.autoSloMoActive,
      autoSloMoActiveChanged,
      newLogEntries,
      latestNotification,
    };
  }
}
