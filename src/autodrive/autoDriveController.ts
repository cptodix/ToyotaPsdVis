import {
  AutoDriveEventKind,
  AutoDriveMode,
  AutoDriveStatus,
  GearPosition,
  PowertrainState,
} from '../types/hybrid';
import { IDLE_AUTODRIVE_STATUS } from './idleStatus';
import {
  buildAutoDriveStatusCopy,
  createPhaseConfig,
  isTransitionalPhase,
  pickWeighted,
  randRange,
} from './scenarios';

export interface AutoDriveActuation {
  gear: GearPosition;
  throttlePercent: number;
  brakePercent: number;
  roadGradePercent?: number;
  status: AutoDriveStatus;
}

function approach(current: number, target: number, maxRatePerSec: number, dt: number): number {
  const delta = target - current;
  const maxStep = maxRatePerSec * dt;
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}

/**
 * Realistic Traffic & Terrain AutoDrive Controller
 * Handles smooth cross-mode transitions, weighted random situational scheduling,
 * continuous road grade evolution, B-range descent shifting, and virtual foot-pedal control.
 */
export class AutoDriveController {
  private mode: AutoDriveMode = AutoDriveMode.OFF;
  private phase: AutoDriveEventKind = AutoDriveEventKind.NONE;
  private phaseQueue: AutoDriveEventKind[] = [];
  private phaseTimerSec = 0;
  private phaseDurationSec = 8;
  private baseTargetKmh = 0;
  private waveTimeSec = 0;

  private jamStopsRemaining = 0;
  private jamMoving = true;
  private eventSubStage = 0;

  private activeBaseGrade = 0;
  private smoothRoadGrade = 0;

  private smoothTargetKmh = 0;
  private modeTransitionTimerSec = 0;
  private modeTransitionDurationSec = 0;
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

  public getPhase(): AutoDriveEventKind {
    return this.phase;
  }

  public overrideMountainGrade(gradePercent: number): void {
    this.activeBaseGrade = gradePercent;
    this.smoothRoadGrade = gradePercent;
  }

  public setMode(
    nextMode: AutoDriveMode,
    currentSpeedKmh: number,
    currentThrottlePercent = 0,
    currentBrakePercent = 0,
    currentRoadGradePercent = 0
  ): AutoDriveStatus {
    const prevMode = this.mode;
    this.mode = nextMode;
    this.waveTimeSec = 0;
    this.phaseQueue = [];

    this.smoothThrottle = Math.max(0, Math.min(100, currentThrottlePercent));
    this.smoothBrake = Math.max(0, Math.min(100, currentBrakePercent));
    this.smoothRoadGrade = currentRoadGradePercent;
    this.smoothTargetKmh = Math.max(0, currentSpeedKmh);

    if (nextMode === AutoDriveMode.OFF) {
      this.phase = AutoDriveEventKind.NONE;
      this.smoothThrottle = 0;
      this.smoothBrake = 0;
      this.modeTransitionTimerSec = 0;
      this.modeTransitionDurationSec = 0;
      return { ...IDLE_AUTODRIVE_STATUS };
    }

    const needsSmoothBlend =
      prevMode !== nextMode &&
      (prevMode !== AutoDriveMode.OFF ||
        currentSpeedKmh > 1.5 ||
        currentThrottlePercent > 1 ||
        currentBrakePercent > 1 ||
        Math.abs(currentRoadGradePercent) > 0.5);

    this.modeTransitionTimerSec = 0;
    this.modeTransitionDurationSec = needsSmoothBlend ? 6.5 : 0;

    if (nextMode === AutoDriveMode.CITY) {
      if (prevMode === AutoDriveMode.HIGHWAY || currentSpeedKmh >= 68) {
        this.startSequence([
          AutoDriveEventKind.HIGHWAY_OFFRAMP,
          AutoDriveEventKind.CITY_ENTRY_BOULEVARD,
        ]);
      } else if (prevMode === AutoDriveMode.MOUNTAIN || Math.abs(currentRoadGradePercent) >= 4) {
        this.startSequence([
          AutoDriveEventKind.VALLEY_LEVELOUT,
          AutoDriveEventKind.CITY_ENTRY_BOULEVARD,
        ]);
      } else if (prevMode !== AutoDriveMode.OFF && currentSpeedKmh >= 48) {
        this.startSequence([AutoDriveEventKind.CITY_ENTRY_BOULEVARD]);
      } else if (currentSpeedKmh < 8) {
        this.enterPhase(AutoDriveEventKind.GREEN_LAUNCH);
      } else {
        this.enterPhase(AutoDriveEventKind.URBAN_FLOW);
      }
    } else if (nextMode === AutoDriveMode.HIGHWAY) {
      if (prevMode === AutoDriveMode.MOUNTAIN || Math.abs(currentRoadGradePercent) >= 4) {
        this.startSequence([
          AutoDriveEventKind.VALLEY_LEVELOUT,
          AutoDriveEventKind.HIGHWAY_MERGE,
        ]);
      } else if (currentSpeedKmh < 74) {
        this.startSequence([
          AutoDriveEventKind.ARTERIAL_FEEDER,
          AutoDriveEventKind.HIGHWAY_MERGE,
        ]);
      } else {
        this.enterPhase(AutoDriveEventKind.HIGHWAY_CRUISE);
      }
    } else if (nextMode === AutoDriveMode.MOUNTAIN) {
      if (prevMode === AutoDriveMode.HIGHWAY || currentSpeedKmh >= 72) {
        this.startSequence([
          AutoDriveEventKind.HIGHWAY_OFFRAMP,
          AutoDriveEventKind.FOOTHILLS_APPROACH,
        ]);
      } else if (prevMode === AutoDriveMode.CITY || currentSpeedKmh < 60) {
        this.startSequence([
          AutoDriveEventKind.SUBURBAN_CONNECTOR,
          AutoDriveEventKind.FOOTHILLS_APPROACH,
        ]);
      } else {
        this.startSequence([AutoDriveEventKind.FOOTHILLS_APPROACH]);
      }
    }

    return this.buildStatus(currentSpeedKmh, this.smoothRoadGrade, GearPosition.D);
  }

  private startSequence(sequence: AutoDriveEventKind[]): void {
    const [first, ...rest] = sequence;
    this.phaseQueue = rest;
    if (first) {
      this.enterPhase(first);
    }
  }

  private enterPhase(kind: AutoDriveEventKind): void {
    this.phase = kind;
    this.phaseTimerSec = 0;
    this.eventSubStage = 0;

    const cfg = createPhaseConfig(kind, this.mode);
    this.activeBaseGrade = cfg.activeBaseGrade;
    this.baseTargetKmh = cfg.baseTargetKmh;
    this.phaseDurationSec = cfg.phaseDurationSec;
    if (cfg.jamStopsRemaining !== undefined) {
      this.jamStopsRemaining = cfg.jamStopsRemaining;
    }
    if (cfg.jamMoving !== undefined) {
      this.jamMoving = cfg.jamMoving;
    }
  }

  private advanceQueuedTransition(speedKmh: number): boolean {
    if (!isTransitionalPhase(this.phase)) return false;

    const minHoldElapsed = this.phaseTimerSec >= 2.8;
    const speedSettled = Math.abs(speedKmh - this.baseTargetKmh) <= 4.5;
    const gradeSettled =
      this.phase === AutoDriveEventKind.VALLEY_LEVELOUT
        ? Math.abs(this.smoothRoadGrade) <= 2.5
        : true;
    const timedOut = this.phaseTimerSec >= this.phaseDurationSec;

    if (!((timedOut && gradeSettled) || (minHoldElapsed && speedSettled && gradeSettled))) {
      return true;
    }

    const nextQueued = this.phaseQueue.shift();
    if (nextQueued) {
      this.enterPhase(nextQueued);
      return true;
    }

    if (this.mode === AutoDriveMode.CITY) {
      this.enterPhase(AutoDriveEventKind.URBAN_FLOW);
    } else if (this.mode === AutoDriveMode.HIGHWAY) {
      this.enterPhase(AutoDriveEventKind.HIGHWAY_CRUISE);
    } else if (this.mode === AutoDriveMode.MOUNTAIN) {
      this.enterPhase(AutoDriveEventKind.MOUNTAIN_CLIMB);
    }
    return true;
  }

  private advanceCityStateMachine(speedKmh: number): void {
    if (this.advanceQueuedTransition(speedKmh)) return;

    if (this.phase === AutoDriveEventKind.FLYOVER_RAMP && this.eventSubStage === 0) {
      if (this.phaseTimerSec >= this.phaseDurationSec * 0.5) {
        this.eventSubStage = 1;
        this.activeBaseGrade = -Math.abs(this.activeBaseGrade);
      }
    } else if (
      this.phase === AutoDriveEventKind.SPEED_BUMP_CALMING &&
      this.eventSubStage === 0 &&
      this.phaseTimerSec >= this.phaseDurationSec * 0.58
    ) {
      this.eventSubStage = 1;
      this.baseTargetKmh = Math.round(randRange(27, 34));
    } else if (
      this.phase === AutoDriveEventKind.PEDESTRIAN_CROSSWALK &&
      this.eventSubStage === 0 &&
      Math.abs(speedKmh) < 1.2 &&
      this.phaseTimerSec >= 1.2
    ) {
      this.eventSubStage = 1;
    }

    if (this.phase === AutoDriveEventKind.RED_LIGHT_BRAKE) {
      if (
        (Math.abs(speedKmh) < 0.8 && this.phaseTimerSec > 1.0) ||
        this.phaseTimerSec >= this.phaseDurationSec
      ) {
        this.enterPhase(AutoDriveEventKind.RED_LIGHT_WAIT);
      }
      return;
    }

    if (this.phaseTimerSec < this.phaseDurationSec) return;

    if (
      this.phase === AutoDriveEventKind.RED_LIGHT_WAIT ||
      this.phase === AutoDriveEventKind.PEDESTRIAN_CROSSWALK
    ) {
      this.enterPhase(AutoDriveEventKind.GREEN_LAUNCH);
      return;
    }

    if (this.phase === AutoDriveEventKind.TRAFFIC_JAM) {
      if (this.jamMoving) {
        this.jamMoving = false;
        this.baseTargetKmh = 0;
        this.phaseTimerSec = 0;
        this.phaseDurationSec = randRange(2.2, 4.0);
        return;
      } else if (this.jamStopsRemaining > 1) {
        this.jamStopsRemaining -= 1;
        this.jamMoving = true;
        this.baseTargetKmh = Math.round(randRange(8, 17));
        this.phaseTimerSec = 0;
        this.phaseDurationSec = randRange(3.2, 5.0);
        return;
      } else {
        this.enterPhase(AutoDriveEventKind.GREEN_LAUNCH);
        return;
      }
    }

    if (this.phase === AutoDriveEventKind.GREEN_LAUNCH) {
      const next = pickWeighted<AutoDriveEventKind>([
        { item: AutoDriveEventKind.URBAN_FLOW, weight: 32 },
        { item: AutoDriveEventKind.URBAN_COAST_GLIDE, weight: 22 },
        { item: AutoDriveEventKind.HEAVY_TRAFFIC, weight: 18 },
        { item: AutoDriveEventKind.ROUNDABOUT_YIELD, weight: 14 },
        { item: AutoDriveEventKind.FLYOVER_RAMP, weight: 14 },
      ]);
      this.enterPhase(next);
      return;
    }

    const candidates: Array<{ item: AutoDriveEventKind; weight: number }> = [
      { item: AutoDriveEventKind.URBAN_FLOW, weight: 18 },
      { item: AutoDriveEventKind.URBAN_COAST_GLIDE, weight: 12 },
      { item: AutoDriveEventKind.RED_LIGHT_BRAKE, weight: 17 },
      { item: AutoDriveEventKind.HEAVY_TRAFFIC, weight: 11 },
      { item: AutoDriveEventKind.TRAFFIC_JAM, weight: 9 },
      { item: AutoDriveEventKind.SCHOOL_ZONE, weight: 8 },
      { item: AutoDriveEventKind.SPEED_BUMP_CALMING, weight: 7 },
      { item: AutoDriveEventKind.ROUNDABOUT_YIELD, weight: 7 },
      { item: AutoDriveEventKind.PEDESTRIAN_CROSSWALK, weight: 7 },
      { item: AutoDriveEventKind.BUS_LANE_PAUSE, weight: 6 },
      { item: AutoDriveEventKind.FLYOVER_RAMP, weight: 8 },
    ].filter((c) => c.item !== this.phase);

    this.enterPhase(pickWeighted(candidates));
  }

  private advanceHighwayStateMachine(speedKmh: number): void {
    if (this.advanceQueuedTransition(speedKmh)) return;

    if (
      this.phase === AutoDriveEventKind.TOLL_PLAZA_APPROACH &&
      this.eventSubStage === 0 &&
      this.phaseTimerSec >= this.phaseDurationSec * 0.56
    ) {
      this.eventSubStage = 1;
      this.baseTargetKmh = Math.round(randRange(58, 72));
    }

    if (this.phase === AutoDriveEventKind.HIGHWAY_MERGE) {
      if (speedKmh >= this.baseTargetKmh - 3 || this.phaseTimerSec >= this.phaseDurationSec) {
        this.enterPhase(AutoDriveEventKind.HIGHWAY_CRUISE);
      }
      return;
    }

    if (this.phaseTimerSec < this.phaseDurationSec) return;

    if (this.phase === AutoDriveEventKind.TOLL_PLAZA_APPROACH) {
      this.enterPhase(AutoDriveEventKind.HIGHWAY_MERGE);
      return;
    }

    if (
      this.phase === AutoDriveEventKind.TRUCK_CONVOY_PACE ||
      this.phase === AutoDriveEventKind.TRAFFIC_SLOWDOWN
    ) {
      this.enterPhase(
        Math.random() < 0.62 ? AutoDriveEventKind.OVERTAKE : AutoDriveEventKind.HIGHWAY_CRUISE
      );
      return;
    }

    if (
      this.phase === AutoDriveEventKind.OVERTAKE ||
      this.phase === AutoDriveEventKind.FAST_LANE_SPRINT
    ) {
      this.enterPhase(
        Math.random() < 0.6
          ? AutoDriveEventKind.HIGHWAY_CRUISE
          : AutoDriveEventKind.ECO_CRUISE_GLIDE
      );
      return;
    }

    const candidates: Array<{ item: AutoDriveEventKind; weight: number }> = [
      { item: AutoDriveEventKind.HIGHWAY_CRUISE, weight: 22 },
      { item: AutoDriveEventKind.ECO_CRUISE_GLIDE, weight: 15 },
      { item: AutoDriveEventKind.TRAFFIC_SLOWDOWN, weight: 12 },
      { item: AutoDriveEventKind.TRUCK_CONVOY_PACE, weight: 11 },
      { item: AutoDriveEventKind.OVERTAKE, weight: 12 },
      { item: AutoDriveEventKind.FAST_LANE_SPRINT, weight: 8 },
      { item: AutoDriveEventKind.HIGHWAY_VIADUCT, weight: 9 },
      { item: AutoDriveEventKind.WORK_ZONE_LANE_DROP, weight: 7 },
      { item: AutoDriveEventKind.TOLL_PLAZA_APPROACH, weight: 6 },
      { item: AutoDriveEventKind.RAIN_SPRAY_CAUTION, weight: 6 },
    ].filter((c) => c.item !== this.phase);

    this.enterPhase(pickWeighted(candidates));
  }

  private advanceMountainStateMachine(speedKmh: number): void {
    if (this.advanceQueuedTransition(speedKmh)) return;

    if (
      this.phase === AutoDriveEventKind.HAIRPIN_SWITCHBACK &&
      this.eventSubStage === 0 &&
      this.phaseTimerSec >= this.phaseDurationSec * 0.55
    ) {
      this.eventSubStage = 1;
      this.baseTargetKmh = Math.round(randRange(42, 52));
    }

    if (this.phaseTimerSec < this.phaseDurationSec) return;

    if (this.phase === AutoDriveEventKind.SLOW_TRUCK_TAIL) {
      this.enterPhase(
        Math.random() < 0.72
          ? AutoDriveEventKind.MOUNTAIN_PASSING_ZONE
          : AutoDriveEventKind.MOUNTAIN_CLIMB
      );
      return;
    }

    if (
      this.phase === AutoDriveEventKind.MOUNTAIN_CLIMB ||
      this.phase === AutoDriveEventKind.MOUNTAIN_PASSING_ZONE
    ) {
      const next = pickWeighted<AutoDriveEventKind>([
        { item: AutoDriveEventKind.SUMMIT_CREST, weight: 40 },
        { item: AutoDriveEventKind.SCENIC_LOOKOUT_SLOW, weight: 18 },
        { item: AutoDriveEventKind.HAIRPIN_SWITCHBACK, weight: 22 },
        { item: AutoDriveEventKind.MOUNTAIN_DESCENT, weight: 20 },
      ]);
      this.enterPhase(next);
      return;
    }

    if (
      this.phase === AutoDriveEventKind.SUMMIT_CREST ||
      this.phase === AutoDriveEventKind.SCENIC_LOOKOUT_SLOW
    ) {
      const next = pickWeighted<AutoDriveEventKind>([
        { item: AutoDriveEventKind.MOUNTAIN_DESCENT, weight: 45 },
        { item: AutoDriveEventKind.STEEP_CANYON_PLUNGE, weight: 30 },
        { item: AutoDriveEventKind.VILLAGE_MOUNTAIN_PASS, weight: 25 },
      ]);
      this.enterPhase(next);
      return;
    }

    if (
      this.phase === AutoDriveEventKind.MOUNTAIN_DESCENT ||
      this.phase === AutoDriveEventKind.STEEP_CANYON_PLUNGE
    ) {
      const next = pickWeighted<AutoDriveEventKind>([
        { item: AutoDriveEventKind.ROLLING_RIVER_VALLEY, weight: 26 },
        { item: AutoDriveEventKind.COUNTRYSIDE_WINDING, weight: 22 },
        { item: AutoDriveEventKind.VILLAGE_MOUNTAIN_PASS, weight: 18 },
        { item: AutoDriveEventKind.HAIRPIN_SWITCHBACK, weight: 18 },
        { item: AutoDriveEventKind.MOUNTAIN_CLIMB, weight: 16 },
      ]);
      this.enterPhase(next);
      return;
    }

    const candidates: Array<{ item: AutoDriveEventKind; weight: number }> = [
      { item: AutoDriveEventKind.MOUNTAIN_CLIMB, weight: 22 },
      { item: AutoDriveEventKind.SLOW_TRUCK_TAIL, weight: 14 },
      { item: AutoDriveEventKind.MOUNTAIN_DESCENT, weight: 16 },
      { item: AutoDriveEventKind.STEEP_CANYON_PLUNGE, weight: 10 },
      { item: AutoDriveEventKind.HAIRPIN_SWITCHBACK, weight: 12 },
      { item: AutoDriveEventKind.ROLLING_RIVER_VALLEY, weight: 12 },
      { item: AutoDriveEventKind.COUNTRYSIDE_WINDING, weight: 12 },
      { item: AutoDriveEventKind.VILLAGE_MOUNTAIN_PASS, weight: 8 },
    ].filter((c) => c.item !== this.phase);

    this.enterPhase(pickWeighted(candidates));
  }

  private computeDynamicTargetSpeed(): number {
    if (this.phase === AutoDriveEventKind.URBAN_FLOW) {
      return Math.max(28, this.baseTargetKmh + Math.sin(this.waveTimeSec * 0.65) * 4.2);
    }
    if (this.phase === AutoDriveEventKind.URBAN_COAST_GLIDE) {
      return Math.max(44, this.baseTargetKmh + Math.sin(this.waveTimeSec * 0.45) * 2.5);
    }
    if (this.phase === AutoDriveEventKind.HEAVY_TRAFFIC) {
      return Math.max(14, this.baseTargetKmh + Math.sin(this.waveTimeSec * 0.9) * 3.5);
    }
    if (
      this.phase === AutoDriveEventKind.HIGHWAY_CRUISE ||
      this.phase === AutoDriveEventKind.ECO_CRUISE_GLIDE
    ) {
      return this.baseTargetKmh + Math.sin(this.waveTimeSec * 0.42) * 1.8;
    }
    if (
      this.phase === AutoDriveEventKind.COUNTRYSIDE_WINDING ||
      this.phase === AutoDriveEventKind.ROLLING_RIVER_VALLEY ||
      this.phase === AutoDriveEventKind.MOUNTAIN_CLIMB
    ) {
      return this.baseTargetKmh + Math.sin(this.waveTimeSec * 0.55) * 2.8;
    }
    return this.baseTargetKmh;
  }

  private computeTargetPhaseGrade(): number {
    if (
      this.phase === AutoDriveEventKind.COUNTRYSIDE_WINDING ||
      this.phase === AutoDriveEventKind.ROLLING_RIVER_VALLEY
    ) {
      return this.activeBaseGrade + Math.sin(this.waveTimeSec * 0.72) * 3.4;
    }
    if (
      this.phase === AutoDriveEventKind.MOUNTAIN_CLIMB ||
      this.phase === AutoDriveEventKind.MOUNTAIN_DESCENT ||
      this.phase === AutoDriveEventKind.STEEP_CANYON_PLUNGE
    ) {
      return this.activeBaseGrade + Math.sin(this.waveTimeSec * 0.58) * 1.6;
    }
    return this.activeBaseGrade;
  }

  private buildStatus(
    currentSpeedKmh: number,
    activeGradePercent: number,
    activeGear: GearPosition
  ): AutoDriveStatus {
    const isStop =
      this.phase === AutoDriveEventKind.RED_LIGHT_BRAKE ||
      this.phase === AutoDriveEventKind.RED_LIGHT_WAIT ||
      this.phase === AutoDriveEventKind.PEDESTRIAN_CROSSWALK;
    const targetRounded = isStop
      ? 0
      : Math.round(
          isTransitionalPhase(this.phase) ||
            (this.modeTransitionDurationSec > 0 &&
              this.modeTransitionTimerSec < this.modeTransitionDurationSec)
            ? this.smoothTargetKmh
            : this.computeDynamicTargetSpeed()
        );
    const remSec = Math.max(1, Math.ceil(this.phaseDurationSec - this.phaseTimerSec));

    return buildAutoDriveStatusCopy({
      mode: this.mode,
      phase: this.phase,
      targetRounded,
      remSec,
      currentSpeedKmh,
      activeGradePercent,
      activeGear,
      eventSubStage: this.eventSubStage,
      jamMoving: this.jamMoving,
    });
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
    this.modeTransitionTimerSec += dt;

    const rawBlend =
      this.modeTransitionDurationSec > 0
        ? Math.min(1, this.modeTransitionTimerSec / this.modeTransitionDurationSec)
        : 1;
    const transitionBlend = rawBlend * rawBlend * (3 - 2 * rawBlend);
    const inTransitionalPhase = isTransitionalPhase(this.phase);

    let activeGrade = state.roadGradePercent;
    let gradeUpdate: number | undefined;
    let targetGear: GearPosition =
      state.gear === GearPosition.D || state.gear === GearPosition.B
        ? state.gear
        : GearPosition.D;

    if (this.mode === AutoDriveMode.CITY) {
      this.advanceCityStateMachine(state.speedKmh);
    } else if (this.mode === AutoDriveMode.HIGHWAY) {
      this.advanceHighwayStateMachine(state.speedKmh);
    } else if (this.mode === AutoDriveMode.MOUNTAIN) {
      this.advanceMountainStateMachine(state.speedKmh);
    }

    const desiredGrade =
      this.mode === AutoDriveMode.MOUNTAIN ||
      this.phase === AutoDriveEventKind.FLYOVER_RAMP ||
      this.phase === AutoDriveEventKind.HIGHWAY_VIADUCT
        ? this.computeTargetPhaseGrade()
        : 0;

    if (
      this.mode === AutoDriveMode.MOUNTAIN ||
      Math.abs(desiredGrade) > 0.05 ||
      Math.abs(this.smoothRoadGrade) > 0.05 ||
      Math.abs(state.roadGradePercent) > 0
    ) {
      const gradeRate = inTransitionalPhase ? 1.8 : 2.5;
      this.smoothRoadGrade = approach(this.smoothRoadGrade, desiredGrade, gradeRate, dt);
      activeGrade = Math.round(this.smoothRoadGrade);
      gradeUpdate = activeGrade;
    }

    if (this.mode === AutoDriveMode.MOUNTAIN) {
      if (
        (this.phase === AutoDriveEventKind.MOUNTAIN_DESCENT ||
          this.phase === AutoDriveEventKind.STEEP_CANYON_PLUNGE ||
          this.phase === AutoDriveEventKind.HAIRPIN_SWITCHBACK) &&
        activeGrade <= -10
      ) {
        targetGear = GearPosition.B;
      } else if (activeGrade >= -5) {
        targetGear = GearPosition.D;
      }
    } else if (state.gear === GearPosition.B && activeGrade >= -6) {
      targetGear = GearPosition.D;
    }

    const desiredTargetKmh = this.computeDynamicTargetSpeed();
    const isStopPhase =
      this.phase === AutoDriveEventKind.RED_LIGHT_BRAKE ||
      this.phase === AutoDriveEventKind.RED_LIGHT_WAIT ||
      this.phase === AutoDriveEventKind.PEDESTRIAN_CROSSWALK;

    if (this.phase === AutoDriveEventKind.RED_LIGHT_WAIT) {
      this.smoothTargetKmh = 0;
    } else if (desiredTargetKmh >= this.smoothTargetKmh) {
      const upRate = inTransitionalPhase
        ? 4.8 + 3.2 * transitionBlend
        : 6.0 + 8.5 * transitionBlend;
      this.smoothTargetKmh = approach(this.smoothTargetKmh, desiredTargetKmh, upRate, dt);
    } else {
      const downRate = isStopPhase
        ? 13.5
        : inTransitionalPhase
          ? 4.8 + 2.4 * transitionBlend
          : 5.2 + 3.8 * transitionBlend;
      this.smoothTargetKmh = approach(this.smoothTargetKmh, desiredTargetKmh, downRate, dt);
    }

    const targetKmh = this.smoothTargetKmh;
    const speedErrKmh = targetKmh - state.speedKmh;

    const uphillThrottleBias = activeGrade > 0 ? activeGrade * 2.45 : 0;
    const downhillBrakeBias = activeGrade < -2 ? Math.abs(activeGrade) * 1.3 : 0;

    let cmdThrottle = 0;
    let cmdBrake = 0;

    if (
      this.phase === AutoDriveEventKind.RED_LIGHT_WAIT ||
      (desiredTargetKmh === 0 && Math.abs(state.speedKmh) < 0.7)
    ) {
      cmdThrottle = 0;
      cmdBrake = Math.min(85, 28 + Math.abs(activeGrade) * 1.4);
    } else if (isStopPhase && desiredTargetKmh === 0 && state.speedKmh >= 0.7) {
      cmdThrottle = 0;
      const baseStopBrake = Math.min(46, 13 + state.speedKmh * 0.46);
      cmdBrake = Math.min(85, baseStopBrake + downhillBrakeBias);
    } else if (
      this.phase === AutoDriveEventKind.OVERTAKE ||
      this.phase === AutoDriveEventKind.MOUNTAIN_PASSING_ZONE
    ) {
      if (speedErrKmh > 3) {
        cmdThrottle = Math.min(96, 58 + speedErrKmh * 1.35 + uphillThrottleBias);
        cmdBrake = 0;
      } else {
        cmdThrottle = Math.max(0, Math.min(88, 22 + speedErrKmh * 2.3 + uphillThrottleBias));
        cmdBrake = 0;
      }
    } else if (this.phase === AutoDriveEventKind.HIGHWAY_MERGE) {
      if (speedErrKmh > 3.5) {
        const mergeGain = 0.6 + 0.32 * transitionBlend;
        const mergeBase = 24 + 26 * transitionBlend;
        cmdThrottle = Math.min(86, mergeBase + speedErrKmh * mergeGain + uphillThrottleBias);
      } else {
        cmdThrottle = Math.max(0, 22 + speedErrKmh * 2.1 + uphillThrottleBias);
      }
      cmdBrake = 0;
    } else {
      const aeroCruiseFeedforward =
        targetKmh > 6 ? 4.8 + 0.075 * targetKmh + 0.00105 * targetKmh * targetKmh : 2.0;

      const netFeedforward =
        aeroCruiseFeedforward + uphillThrottleBias - downhillBrakeBias * 0.85;

      if (speedErrKmh >= -3.6 && netFeedforward + speedErrKmh * 1.7 > 0.5) {
        const kp = inTransitionalPhase
          ? 1.35
          : this.mode === AutoDriveMode.CITY
            ? 1.65
            : 1.95;
        const maxPhaseThrottle =
          this.phase === AutoDriveEventKind.TRAFFIC_JAM
            ? 24
            : this.phase === AutoDriveEventKind.GREEN_LAUNCH
              ? 54
              : inTransitionalPhase
                ? 54
                : 88;
        cmdThrottle = Math.max(
          0,
          Math.min(maxPhaseThrottle + uphillThrottleBias * 0.72, netFeedforward + speedErrKmh * kp)
        );
        cmdThrottle = Math.min(98, cmdThrottle);
        cmdBrake = 0;
      } else if (speedErrKmh > -5.2 && activeGrade >= -6) {
        cmdThrottle = 0;
        cmdBrake = 0;
      } else if (activeGrade < -6 && speedErrKmh > -2.5) {
        cmdThrottle = 0;
        cmdBrake = Math.max(
          0,
          (-speedErrKmh + 0.5) * 2.5 + Math.max(0, Math.abs(activeGrade) - 10) * 1.65
        );
      } else {
        cmdThrottle = 0;
        const rawDecelBrake = Math.min(
          84,
          Math.max(5, (-speedErrKmh - 2.6) * 1.7 + downhillBrakeBias * 0.78)
        );
        const cap = inTransitionalPhase
          ? 18 + 12 * transitionBlend
          : 22 + 62 * transitionBlend;
        cmdBrake = Math.min(cap, rawDecelBrake);
      }
    }

    const releaseRate = inTransitionalPhase ? 34 + 36 * transitionBlend : 45 + 115 * transitionBlend;
    const throttleRate = inTransitionalPhase ? 18 + 20 * transitionBlend : 22 + 53 * transitionBlend;
    const brakeRate = inTransitionalPhase ? 18 + 20 * transitionBlend : 24 + 61 * transitionBlend;
    const idleRate = inTransitionalPhase ? 26 + 24 * transitionBlend : 36 + 59 * transitionBlend;

    if (cmdThrottle > 0.5) {
      this.smoothBrake = approach(this.smoothBrake, 0, releaseRate, dt);
      if (this.smoothBrake < 1.5) {
        this.smoothThrottle = approach(this.smoothThrottle, cmdThrottle, throttleRate, dt);
      }
    } else if (cmdBrake > 0.5) {
      this.smoothThrottle = approach(this.smoothThrottle, 0, releaseRate, dt);
      if (this.smoothThrottle < 1.5) {
        this.smoothBrake = approach(this.smoothBrake, cmdBrake, brakeRate, dt);
      }
    } else {
      this.smoothThrottle = approach(this.smoothThrottle, 0, idleRate, dt);
      this.smoothBrake = approach(this.smoothBrake, 0, idleRate, dt);
    }

    return {
      gear: targetGear,
      throttlePercent: Math.round(this.smoothThrottle),
      brakePercent: Math.round(this.smoothBrake),
      roadGradePercent: gradeUpdate,
      status: this.buildStatus(state.speedKmh, activeGrade, targetGear),
    };
  }
}
