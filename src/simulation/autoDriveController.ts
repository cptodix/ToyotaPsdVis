import {
  AutoDriveEventKind,
  AutoDriveMode,
  AutoDriveStatus,
  GearPosition,
  PowertrainState,
} from '../types/hybrid';

export interface AutoDriveActuation {
  gear: GearPosition;
  throttlePercent: number;
  brakePercent: number;
  roadGradePercent?: number;
  status: AutoDriveStatus;
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function approach(current: number, target: number, maxRatePerSec: number, dt: number): number {
  const delta = target - current;
  const maxStep = maxRatePerSec * dt;
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}

export const IDLE_AUTODRIVE_STATUS: AutoDriveStatus = {
  mode: AutoDriveMode.OFF,
  eventKind: AutoDriveEventKind.NONE,
  eventBadge: '',
  contextText: '',
  targetSpeedKmh: 0,
};

/**
 * Realistic Traffic & Terrain AutoDrive Controller
 * - CITY: Random traffic lights (red approach + stationary wait + green launch),
 *         medium-to-heavy urban traffic waves, and occasional multi-stop traffic jams.
 * - HIGHWAY: On-ramp merge, mostly stable high-speed cruising (104–116 km/h),
 *            occasional slower-traffic slowdowns, and occasional passing overtakes.
 * - MOUNTAIN: Countryside mountainous road with frequent steep climbs (+11% to +19%),
 *             scenic pass summits, rolling hills, and steep descents (-10% to -18%)
 *             with automatic B-range fuel-cut engine braking & regen recovery.
 */
export class AutoDriveController {
  private mode: AutoDriveMode = AutoDriveMode.OFF;
  private phase: AutoDriveEventKind = AutoDriveEventKind.NONE;
  private phaseTimerSec = 0;
  private phaseDurationSec = 8;
  private baseTargetKmh = 0;
  private waveTimeSec = 0;

  // Traffic jam internal sub-cycle counter
  private jamStopsRemaining = 0;
  private jamMoving = true;

  // Mountain road dynamic grade state
  private mountainBaseGrade = 0;
  private smoothMountainGrade = 0;

  // Smooth virtual foot pedals
  private smoothThrottle = 0;
  private smoothBrake = 0;

  constructor(initialMode: AutoDriveMode = AutoDriveMode.OFF, initialSpeedKmh = 0) {
    if (initialMode !== AutoDriveMode.OFF) {
      this.setMode(initialMode, initialSpeedKmh);
    }
  }

  public getMode(): AutoDriveMode {
    return this.mode;
  }

  public overrideMountainGrade(gradePercent: number): void {
    this.mountainBaseGrade = gradePercent;
    this.smoothMountainGrade = gradePercent;
  }

  public setMode(nextMode: AutoDriveMode, currentSpeedKmh: number): AutoDriveStatus {
    this.mode = nextMode;
    this.waveTimeSec = 0;

    if (nextMode === AutoDriveMode.OFF) {
      this.phase = AutoDriveEventKind.NONE;
      this.smoothThrottle = 0;
      this.smoothBrake = 0;
      return { ...IDLE_AUTODRIVE_STATUS };
    }

    if (nextMode === AutoDriveMode.CITY) {
      if (currentSpeedKmh < 8) {
        this.enterCityPhase(AutoDriveEventKind.GREEN_LAUNCH);
      } else if (currentSpeedKmh > 65) {
        this.enterCityPhase(AutoDriveEventKind.HEAVY_TRAFFIC);
      } else {
        this.enterCityPhase(AutoDriveEventKind.URBAN_FLOW);
      }
    } else if (nextMode === AutoDriveMode.HIGHWAY) {
      if (currentSpeedKmh < 78) {
        this.enterHighwayPhase(AutoDriveEventKind.HIGHWAY_MERGE);
      } else {
        this.enterHighwayPhase(AutoDriveEventKind.HIGHWAY_CRUISE);
      }
    } else if (nextMode === AutoDriveMode.MOUNTAIN) {
      this.smoothMountainGrade = 6;
      this.enterMountainPhase(AutoDriveEventKind.MOUNTAIN_CLIMB);
    }

    return this.buildStatus(currentSpeedKmh, this.smoothMountainGrade, GearPosition.D);
  }

  private enterCityPhase(kind: AutoDriveEventKind): void {
    this.phase = kind;
    this.phaseTimerSec = 0;

    switch (kind) {
      case AutoDriveEventKind.GREEN_LAUNCH:
        this.baseTargetKmh = Math.round(randRange(40, 56));
        this.phaseDurationSec = randRange(5.5, 8.0);
        break;

      case AutoDriveEventKind.URBAN_FLOW:
        this.baseTargetKmh = Math.round(randRange(38, 54));
        this.phaseDurationSec = randRange(7.5, 12.5);
        break;

      case AutoDriveEventKind.HEAVY_TRAFFIC:
        this.baseTargetKmh = Math.round(randRange(20, 31));
        this.phaseDurationSec = randRange(6.5, 11.0);
        break;

      case AutoDriveEventKind.RED_LIGHT_BRAKE:
        this.baseTargetKmh = 0;
        this.phaseDurationSec = 14.0;
        break;

      case AutoDriveEventKind.RED_LIGHT_WAIT:
        this.baseTargetKmh = 0;
        this.phaseDurationSec = randRange(4.2, 8.2);
        break;

      case AutoDriveEventKind.TRAFFIC_JAM:
        this.jamStopsRemaining = Math.floor(randRange(2, 4.5));
        this.jamMoving = true;
        this.baseTargetKmh = Math.round(randRange(9, 16));
        this.phaseDurationSec = randRange(3.5, 5.5);
        break;

      default:
        this.baseTargetKmh = 42;
        this.phaseDurationSec = 8;
        break;
    }
  }

  private advanceCityStateMachine(speedKmh: number): void {
    if (this.phase === AutoDriveEventKind.RED_LIGHT_BRAKE) {
      if (Math.abs(speedKmh) < 0.8 && this.phaseTimerSec > 1.0) {
        this.enterCityPhase(AutoDriveEventKind.RED_LIGHT_WAIT);
      } else if (this.phaseTimerSec >= this.phaseDurationSec) {
        this.enterCityPhase(AutoDriveEventKind.RED_LIGHT_WAIT);
      }
      return;
    }

    if (this.phaseTimerSec < this.phaseDurationSec) return;

    if (this.phase === AutoDriveEventKind.RED_LIGHT_WAIT) {
      this.enterCityPhase(AutoDriveEventKind.GREEN_LAUNCH);
      return;
    }

    if (this.phase === AutoDriveEventKind.TRAFFIC_JAM) {
      if (this.jamMoving) {
        this.jamMoving = false;
        this.baseTargetKmh = 0;
        this.phaseTimerSec = 0;
        this.phaseDurationSec = randRange(2.2, 4.2);
        return;
      } else if (this.jamStopsRemaining > 1) {
        this.jamStopsRemaining -= 1;
        this.jamMoving = true;
        this.baseTargetKmh = Math.round(randRange(8, 17));
        this.phaseTimerSec = 0;
        this.phaseDurationSec = randRange(3.2, 5.2);
        return;
      } else {
        this.enterCityPhase(AutoDriveEventKind.GREEN_LAUNCH);
        return;
      }
    }

    if (this.phase === AutoDriveEventKind.GREEN_LAUNCH) {
      const r = Math.random();
      if (r < 0.58) {
        this.enterCityPhase(AutoDriveEventKind.URBAN_FLOW);
      } else {
        this.enterCityPhase(AutoDriveEventKind.HEAVY_TRAFFIC);
      }
      return;
    }

    const roll = Math.random();
    if (roll < 0.36) {
      this.enterCityPhase(AutoDriveEventKind.RED_LIGHT_BRAKE);
    } else if (roll < 0.58) {
      this.enterCityPhase(
        this.phase === AutoDriveEventKind.URBAN_FLOW
          ? AutoDriveEventKind.HEAVY_TRAFFIC
          : AutoDriveEventKind.URBAN_FLOW
      );
    } else if (roll < 0.8) {
      this.enterCityPhase(AutoDriveEventKind.TRAFFIC_JAM);
    } else {
      this.enterCityPhase(AutoDriveEventKind.URBAN_FLOW);
    }
  }

  private enterHighwayPhase(kind: AutoDriveEventKind): void {
    this.phase = kind;
    this.phaseTimerSec = 0;

    switch (kind) {
      case AutoDriveEventKind.HIGHWAY_MERGE:
        this.baseTargetKmh = Math.round(randRange(104, 114));
        this.phaseDurationSec = 18.0;
        break;

      case AutoDriveEventKind.HIGHWAY_CRUISE:
        this.baseTargetKmh = Math.round(randRange(104, 116));
        this.phaseDurationSec = randRange(9.0, 15.0);
        break;

      case AutoDriveEventKind.TRAFFIC_SLOWDOWN:
        this.baseTargetKmh = Math.round(randRange(76, 89));
        this.phaseDurationSec = randRange(6.5, 10.0);
        break;

      case AutoDriveEventKind.OVERTAKE:
        this.baseTargetKmh = Math.round(randRange(126, 136));
        this.phaseDurationSec = randRange(5.5, 8.0);
        break;

      default:
        this.baseTargetKmh = 108;
        this.phaseDurationSec = 10.0;
        break;
    }
  }

  private advanceHighwayStateMachine(speedKmh: number): void {
    if (this.phase === AutoDriveEventKind.HIGHWAY_MERGE) {
      if (speedKmh >= this.baseTargetKmh - 3 || this.phaseTimerSec >= this.phaseDurationSec) {
        this.enterHighwayPhase(AutoDriveEventKind.HIGHWAY_CRUISE);
      }
      return;
    }

    if (this.phaseTimerSec < this.phaseDurationSec) return;

    if (this.phase === AutoDriveEventKind.OVERTAKE) {
      this.enterHighwayPhase(AutoDriveEventKind.HIGHWAY_CRUISE);
      return;
    }

    if (this.phase === AutoDriveEventKind.TRAFFIC_SLOWDOWN) {
      if (Math.random() < 0.58) {
        this.enterHighwayPhase(AutoDriveEventKind.OVERTAKE);
      } else {
        this.enterHighwayPhase(AutoDriveEventKind.HIGHWAY_CRUISE);
      }
      return;
    }

    const roll = Math.random();
    if (roll < 0.44) {
      this.enterHighwayPhase(AutoDriveEventKind.HIGHWAY_CRUISE);
    } else if (roll < 0.74) {
      this.enterHighwayPhase(AutoDriveEventKind.TRAFFIC_SLOWDOWN);
    } else {
      this.enterHighwayPhase(AutoDriveEventKind.OVERTAKE);
    }
  }

  private enterMountainPhase(kind: AutoDriveEventKind): void {
    this.phase = kind;
    this.phaseTimerSec = 0;

    switch (kind) {
      case AutoDriveEventKind.MOUNTAIN_CLIMB:
        this.mountainBaseGrade = Math.round(randRange(11, 19));
        this.baseTargetKmh = Math.round(randRange(50, 64));
        this.phaseDurationSec = randRange(8.0, 12.0);
        break;

      case AutoDriveEventKind.SUMMIT_CREST:
        this.mountainBaseGrade = Math.round(randRange(-1, 2));
        this.baseTargetKmh = Math.round(randRange(56, 68));
        this.phaseDurationSec = randRange(4.5, 6.8);
        break;

      case AutoDriveEventKind.MOUNTAIN_DESCENT:
        this.mountainBaseGrade = -Math.round(randRange(10, 18));
        this.baseTargetKmh = Math.round(randRange(48, 60));
        this.phaseDurationSec = randRange(8.5, 12.5);
        break;

      case AutoDriveEventKind.COUNTRYSIDE_WINDING:
      default:
        this.mountainBaseGrade = Math.round(randRange(3, 8)) * (Math.random() < 0.65 ? 1 : -1);
        this.baseTargetKmh = Math.round(randRange(62, 74));
        this.phaseDurationSec = randRange(6.5, 9.5);
        break;
    }
  }

  private advanceMountainStateMachine(): void {
    if (this.phaseTimerSec < this.phaseDurationSec) return;

    if (this.phase === AutoDriveEventKind.MOUNTAIN_CLIMB) {
      if (Math.random() < 0.68) {
        this.enterMountainPhase(AutoDriveEventKind.SUMMIT_CREST);
      } else {
        this.enterMountainPhase(AutoDriveEventKind.MOUNTAIN_DESCENT);
      }
      return;
    }

    if (this.phase === AutoDriveEventKind.SUMMIT_CREST) {
      this.enterMountainPhase(AutoDriveEventKind.MOUNTAIN_DESCENT);
      return;
    }

    if (this.phase === AutoDriveEventKind.MOUNTAIN_DESCENT) {
      if (Math.random() < 0.55) {
        this.enterMountainPhase(AutoDriveEventKind.COUNTRYSIDE_WINDING);
      } else {
        this.enterMountainPhase(AutoDriveEventKind.MOUNTAIN_CLIMB);
      }
      return;
    }

    // From COUNTRYSIDE_WINDING: frequent climbs & descents
    if (Math.random() < 0.65) {
      this.enterMountainPhase(AutoDriveEventKind.MOUNTAIN_CLIMB);
    } else {
      this.enterMountainPhase(AutoDriveEventKind.MOUNTAIN_DESCENT);
    }
  }

  private computeDynamicTargetSpeed(): number {
    if (this.phase === AutoDriveEventKind.URBAN_FLOW) {
      return Math.max(28, this.baseTargetKmh + Math.sin(this.waveTimeSec * 0.65) * 4.2);
    }
    if (this.phase === AutoDriveEventKind.HEAVY_TRAFFIC) {
      return Math.max(14, this.baseTargetKmh + Math.sin(this.waveTimeSec * 0.9) * 3.5);
    }
    if (this.phase === AutoDriveEventKind.HIGHWAY_CRUISE) {
      return this.baseTargetKmh + Math.sin(this.waveTimeSec * 0.42) * 1.8;
    }
    if (
      this.phase === AutoDriveEventKind.COUNTRYSIDE_WINDING ||
      this.phase === AutoDriveEventKind.MOUNTAIN_CLIMB
    ) {
      return this.baseTargetKmh + Math.sin(this.waveTimeSec * 0.55) * 2.8;
    }
    return this.baseTargetKmh;
  }

  private computeTargetMountainGrade(): number {
    if (this.phase === AutoDriveEventKind.COUNTRYSIDE_WINDING) {
      return this.mountainBaseGrade + Math.sin(this.waveTimeSec * 0.75) * 3.2;
    }
    if (
      this.phase === AutoDriveEventKind.MOUNTAIN_CLIMB ||
      this.phase === AutoDriveEventKind.MOUNTAIN_DESCENT
    ) {
      return this.mountainBaseGrade + Math.sin(this.waveTimeSec * 0.6) * 1.6;
    }
    return this.mountainBaseGrade;
  }

  private buildStatus(
    currentSpeedKmh: number,
    activeGradePercent: number,
    activeGear: GearPosition
  ): AutoDriveStatus {
    const targetRounded = Math.round(this.computeDynamicTargetSpeed());
    const remSec = Math.max(1, Math.ceil(this.phaseDurationSec - this.phaseTimerSec));
    const gRound = Math.round(activeGradePercent);
    const gradeStr = gRound > 0 ? `+${gRound}%` : `${gRound}%`;

    switch (this.phase) {
      case AutoDriveEventKind.GREEN_LAUNCH:
        return {
          mode: this.mode,
          eventKind: this.phase,
          eventBadge: 'GREEN LIGHT',
          contextText: `Signal turned green — accelerating smoothly with urban flow to ${targetRounded} km/h`,
          targetSpeedKmh: targetRounded,
        };

      case AutoDriveEventKind.URBAN_FLOW:
        return {
          mode: this.mode,
          eventKind: this.phase,
          eventBadge: 'CITY FLOW',
          contextText: `Medium urban traffic — pacing lead vehicles around ${targetRounded} km/h (EV pulse & glide)`,
          targetSpeedKmh: targetRounded,
        };

      case AutoDriveEventKind.HEAVY_TRAFFIC:
        return {
          mode: this.mode,
          eventKind: this.phase,
          eventBadge: 'HEAVY TRAFFIC',
          contextText: `Dense city corridor — following slower traffic queue at ${targetRounded} km/h`,
          targetSpeedKmh: targetRounded,
        };

      case AutoDriveEventKind.RED_LIGHT_BRAKE:
        return {
          mode: this.mode,
          eventKind: this.phase,
          eventBadge: 'RED LIGHT AHEAD',
          contextText: `Approaching red traffic light — regenerative braking from ${Math.round(
            currentSpeedKmh
          )} km/h to 0 km/h`,
          targetSpeedKmh: 0,
        };

      case AutoDriveEventKind.RED_LIGHT_WAIT:
        return {
          mode: this.mode,
          eventKind: this.phase,
          eventBadge: `RED LIGHT (${remSec}s)`,
          contextText: `Stopped at red light (${remSec}s) — silent 0 RPM EV standby unless low SoC requires charge`,
          targetSpeedKmh: 0,
        };

      case AutoDriveEventKind.TRAFFIC_JAM:
        return {
          mode: this.mode,
          eventKind: this.phase,
          eventBadge: 'TRAFFIC JAM',
          contextText: this.jamMoving
            ? `Stop-and-go traffic jam — creeping forward on electric MG2 torque (${targetRounded} km/h)`
            : `Stop-and-go traffic jam — briefly halted behind congested queue (0 km/h)`,
          targetSpeedKmh: targetRounded,
        };

      case AutoDriveEventKind.HIGHWAY_MERGE:
        return {
          mode: this.mode,
          eventKind: this.phase,
          eventBadge: 'ON-RAMP MERGE',
          contextText: `Highway entrance ramp — brisk hybrid acceleration up to ${targetRounded} km/h`,
          targetSpeedKmh: targetRounded,
        };

      case AutoDriveEventKind.HIGHWAY_CRUISE:
        return {
          mode: this.mode,
          eventKind: this.phase,
          eventBadge: 'HIGHWAY CRUISE',
          contextText: `Steady highway flow at ${targetRounded} km/h — low-RPM Atkinson split & overdrive`,
          targetSpeedKmh: targetRounded,
        };

      case AutoDriveEventKind.TRAFFIC_SLOWDOWN:
        return {
          mode: this.mode,
          eventKind: this.phase,
          eventBadge: 'LANE SLOWDOWN',
          contextText: `Slower vehicle ahead — easing speed down to ${targetRounded} km/h with regen recovery`,
          targetSpeedKmh: targetRounded,
        };

      case AutoDriveEventKind.OVERTAKE:
        return {
          mode: this.mode,
          eventKind: this.phase,
          eventBadge: 'OVERTAKING',
          contextText: `Passing slower traffic — kickdown Dual Boost (ICE + HV Battery) to ${targetRounded} km/h`,
          targetSpeedKmh: targetRounded,
        };

      case AutoDriveEventKind.MOUNTAIN_CLIMB:
        return {
          mode: this.mode,
          eventKind: this.phase,
          eventBadge: `CLIMB ${gradeStr}`,
          contextText: `Steep mountain ascent (${gradeStr} grade) — M20A-FXS + MG2 climbing switchbacks at ${targetRounded} km/h`,
          targetSpeedKmh: targetRounded,
        };

      case AutoDriveEventKind.SUMMIT_CREST:
        return {
          mode: this.mode,
          eventKind: this.phase,
          eventBadge: 'PASS SUMMIT',
          contextText: `Cresting mountain ridge (${gradeStr} grade) — easing throttle into EV glide / Atkinson cruise at ${targetRounded} km/h`,
          targetSpeedKmh: targetRounded,
        };

      case AutoDriveEventKind.MOUNTAIN_DESCENT:
        return {
          mode: this.mode,
          eventKind: this.phase,
          eventBadge: `DESCENT ${gradeStr}`,
          contextText:
            activeGear === GearPosition.B
              ? `Steep mountain descent (${gradeStr} grade) — B-range fuel-cut engine pumping + MG2 regen holding ${targetRounded} km/h`
              : `Mountain downhill (${gradeStr} grade) — zero-fuel MG2 regenerative braking holding ${targetRounded} km/h`,
          targetSpeedKmh: targetRounded,
        };

      case AutoDriveEventKind.COUNTRYSIDE_WINDING:
        return {
          mode: this.mode,
          eventKind: this.phase,
          eventBadge: `HILLS ${gradeStr}`,
          contextText: `Winding countryside road (${gradeStr} grade) — rolling valley curves at ${targetRounded} km/h`,
          targetSpeedKmh: targetRounded,
        };

      default:
        return { ...IDLE_AUTODRIVE_STATUS };
    }
  }

  public step(state: PowertrainState, dt: number): AutoDriveActuation {
    if (this.mode === AutoDriveMode.OFF) {
      return {
        gear: state.gear,
        throttlePercent: state.throttlePercent,
        brakePercent: state.brakePercent,
        status: { ...IDLE_AUTODRIVE_STATUS },
      };
    }

    this.phaseTimerSec += dt;
    this.waveTimeSec += dt;

    let activeGrade = state.roadGradePercent;
    let targetGear: GearPosition =
      state.gear === GearPosition.D || state.gear === GearPosition.B
        ? state.gear
        : GearPosition.D;

    if (this.mode === AutoDriveMode.CITY) {
      this.advanceCityStateMachine(state.speedKmh);
    } else if (this.mode === AutoDriveMode.HIGHWAY) {
      this.advanceHighwayStateMachine(state.speedKmh);
    } else if (this.mode === AutoDriveMode.MOUNTAIN) {
      this.advanceMountainStateMachine();
      const desiredGrade = this.computeTargetMountainGrade();
      this.smoothMountainGrade = approach(this.smoothMountainGrade, desiredGrade, 4.2, dt);
      activeGrade = Math.round(this.smoothMountainGrade);

      // Automatically shift to B-range on steep descents (<= -10%) and return to D on climbs/flats
      if (this.phase === AutoDriveEventKind.MOUNTAIN_DESCENT && activeGrade <= -10) {
        targetGear = GearPosition.B;
      } else if (activeGrade >= -5) {
        targetGear = GearPosition.D;
      }
    }

    const targetKmh = this.computeDynamicTargetSpeed();
    const speedErrKmh = targetKmh - state.speedKmh;

    // Feedforward throttle/brake bias for road inclination
    const uphillThrottleBias = activeGrade > 0 ? activeGrade * 1.65 : 0;
    const downhillBrakeBias = activeGrade < -2 ? Math.abs(activeGrade) * 1.25 : 0;

    let cmdThrottle = 0;
    let cmdBrake = 0;

    if (
      this.phase === AutoDriveEventKind.RED_LIGHT_WAIT ||
      (targetKmh === 0 && Math.abs(state.speedKmh) < 0.7)
    ) {
      cmdThrottle = 0;
      cmdBrake = Math.min(85, 28 + Math.abs(activeGrade) * 1.4);
    } else if (
      this.phase === AutoDriveEventKind.RED_LIGHT_BRAKE ||
      (targetKmh === 0 && state.speedKmh >= 0.7)
    ) {
      cmdThrottle = 0;
      const baseStopBrake = Math.min(48, 12 + state.speedKmh * 0.52);
      cmdBrake = Math.min(85, baseStopBrake + downhillBrakeBias);
    } else if (this.phase === AutoDriveEventKind.OVERTAKE) {
      if (speedErrKmh > 3) {
        cmdThrottle = Math.min(96, 68 + speedErrKmh * 1.3 + uphillThrottleBias);
        cmdBrake = 0;
      } else {
        cmdThrottle = Math.max(0, Math.min(85, 24 + speedErrKmh * 2.2 + uphillThrottleBias));
        cmdBrake = 0;
      }
    } else if (this.phase === AutoDriveEventKind.HIGHWAY_MERGE) {
      if (speedErrKmh > 4) {
        cmdThrottle = Math.min(88, 52 + speedErrKmh * 0.75 + uphillThrottleBias);
      } else {
        cmdThrottle = Math.max(0, 18 + speedErrKmh * 2.0 + uphillThrottleBias);
      }
      cmdBrake = 0;
    } else {
      const aeroCruiseFeedforward =
        targetKmh > 6
          ? 3.2 + 0.015 * targetKmh + 0.00112 * targetKmh * targetKmh
          : 1.5;

      const netFeedforward =
        aeroCruiseFeedforward + uphillThrottleBias - downhillBrakeBias * 0.85;

      if (speedErrKmh >= -3.6 && netFeedforward + speedErrKmh * 1.65 > 0.5) {
        const kp = this.mode === AutoDriveMode.CITY ? 1.55 : 1.85;
        const maxPhaseThrottle =
          this.phase === AutoDriveEventKind.TRAFFIC_JAM
            ? 24
            : this.phase === AutoDriveEventKind.GREEN_LAUNCH
              ? 48
              : 86;
        cmdThrottle = Math.max(
          0,
          Math.min(maxPhaseThrottle + uphillThrottleBias * 0.7, netFeedforward + speedErrKmh * kp)
        );
        cmdThrottle = Math.min(98, cmdThrottle);
        cmdBrake = 0;
      } else if (speedErrKmh > -5.2 && activeGrade >= -6) {
        // Gentle coasting / lift-off regen (or B-mode engine braking) before touching brake pedal
        cmdThrottle = 0;
        cmdBrake = 0;
      } else if (activeGrade < -6 && speedErrKmh > -2.5) {
        // Let B-range / lift-off regen hold speed on mountain descents unless speed creeps above target
        cmdThrottle = 0;
        cmdBrake = Math.max(0, (-speedErrKmh + 0.5) * 2.4 + Math.max(0, Math.abs(activeGrade) - 11) * 1.6);
      } else {
        cmdThrottle = 0;
        cmdBrake = Math.min(
          82,
          Math.max(6, (-speedErrKmh - 2.8) * 2.0 + downhillBrakeBias * 0.75)
        );
      }
    }

    // Realistic foot-pedal slew rate & mutual exclusion
    if (cmdThrottle > 0.5) {
      this.smoothBrake = approach(this.smoothBrake, 0, 160, dt);
      if (this.smoothBrake < 1.5) {
        this.smoothThrottle = approach(this.smoothThrottle, cmdThrottle, 75, dt);
      }
    } else if (cmdBrake > 0.5) {
      this.smoothThrottle = approach(this.smoothThrottle, 0, 160, dt);
      if (this.smoothThrottle < 1.5) {
        this.smoothBrake = approach(this.smoothBrake, cmdBrake, 85, dt);
      }
    } else {
      this.smoothThrottle = approach(this.smoothThrottle, 0, 95, dt);
      this.smoothBrake = approach(this.smoothBrake, 0, 95, dt);
    }

    return {
      gear: targetGear,
      throttlePercent: Math.round(this.smoothThrottle),
      brakePercent: Math.round(this.smoothBrake),
      roadGradePercent:
        this.mode === AutoDriveMode.MOUNTAIN ? activeGrade : undefined,
      status: this.buildStatus(state.speedKmh, activeGrade, targetGear),
    };
  }
}
