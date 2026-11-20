import { AutoDriveEventKind, AutoDriveMode, AutoDriveStatus, GearPosition } from '../types/hybrid';
import { IDLE_AUTODRIVE_STATUS } from './idleStatus';

export function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function pickWeighted<T>(items: Array<{ item: T; weight: number }>): T {
  const total = items.reduce((sum, entry) => sum + entry.weight, 0);
  let r = Math.random() * total;
  for (const entry of items) {
    r -= entry.weight;
    if (r <= 0) return entry.item;
  }
  return items[items.length - 1].item;
}

export function isTransitionalPhase(kind: AutoDriveEventKind): boolean {
  return (
    kind === AutoDriveEventKind.HIGHWAY_OFFRAMP ||
    kind === AutoDriveEventKind.CITY_ENTRY_BOULEVARD ||
    kind === AutoDriveEventKind.ARTERIAL_FEEDER ||
    kind === AutoDriveEventKind.SUBURBAN_CONNECTOR ||
    kind === AutoDriveEventKind.FOOTHILLS_APPROACH ||
    kind === AutoDriveEventKind.VALLEY_LEVELOUT
  );
}

export interface PhaseInitialConfig {
  activeBaseGrade: number;
  baseTargetKmh: number;
  phaseDurationSec: number;
  jamStopsRemaining?: number;
  jamMoving?: boolean;
}

export function createPhaseConfig(
  kind: AutoDriveEventKind,
  mode: AutoDriveMode
): PhaseInitialConfig {
  switch (kind) {
    // --- Transitional Real-World Phases ---
    case AutoDriveEventKind.HIGHWAY_OFFRAMP:
      return {
        activeBaseGrade: 0,
        baseTargetKmh:
          mode === AutoDriveMode.MOUNTAIN
            ? Math.round(randRange(68, 76))
            : Math.round(randRange(60, 68)),
        phaseDurationSec: randRange(4.4, 5.6),
      };

    case AutoDriveEventKind.CITY_ENTRY_BOULEVARD:
      return {
        activeBaseGrade: 0,
        baseTargetKmh: Math.round(randRange(42, 48)),
        phaseDurationSec: randRange(4.2, 5.4),
      };

    case AutoDriveEventKind.ARTERIAL_FEEDER:
      return {
        activeBaseGrade: 0,
        baseTargetKmh: Math.round(randRange(64, 72)),
        phaseDurationSec: randRange(4.0, 5.2),
      };

    case AutoDriveEventKind.SUBURBAN_CONNECTOR:
      return {
        activeBaseGrade: 2,
        baseTargetKmh: Math.round(randRange(54, 62)),
        phaseDurationSec: randRange(3.8, 5.0),
      };

    case AutoDriveEventKind.FOOTHILLS_APPROACH:
      return {
        activeBaseGrade: Math.round(randRange(4, 7)),
        baseTargetKmh: Math.round(randRange(58, 66)),
        phaseDurationSec: randRange(4.6, 5.8),
      };

    case AutoDriveEventKind.VALLEY_LEVELOUT:
      return {
        activeBaseGrade: 0,
        baseTargetKmh:
          mode === AutoDriveMode.HIGHWAY
            ? Math.round(randRange(68, 76))
            : Math.round(randRange(50, 58)),
        phaseDurationSec: randRange(4.2, 5.5),
      };

    // --- City Situations ---
    case AutoDriveEventKind.GREEN_LAUNCH:
      return {
        activeBaseGrade: 0,
        baseTargetKmh: Math.round(randRange(40, 55)),
        phaseDurationSec: randRange(5.0, 7.5),
      };

    case AutoDriveEventKind.URBAN_FLOW:
      return {
        activeBaseGrade: 0,
        baseTargetKmh: Math.round(randRange(38, 52)),
        phaseDurationSec: randRange(6.5, 10.5),
      };

    case AutoDriveEventKind.URBAN_COAST_GLIDE:
      return {
        activeBaseGrade: 0,
        baseTargetKmh: Math.round(randRange(50, 58)),
        phaseDurationSec: randRange(5.5, 8.5),
      };

    case AutoDriveEventKind.HEAVY_TRAFFIC:
      return {
        activeBaseGrade: 0,
        baseTargetKmh: Math.round(randRange(19, 30)),
        phaseDurationSec: randRange(5.8, 9.5),
      };

    case AutoDriveEventKind.RED_LIGHT_BRAKE:
      return {
        activeBaseGrade: 0,
        baseTargetKmh: 0,
        phaseDurationSec: 14.0,
      };

    case AutoDriveEventKind.RED_LIGHT_WAIT:
      return {
        activeBaseGrade: 0,
        baseTargetKmh: 0,
        phaseDurationSec: randRange(4.0, 7.8),
      };

    case AutoDriveEventKind.TRAFFIC_JAM:
      return {
        activeBaseGrade: 0,
        jamStopsRemaining: Math.floor(randRange(2, 4.5)),
        jamMoving: true,
        baseTargetKmh: Math.round(randRange(9, 16)),
        phaseDurationSec: randRange(3.2, 5.0),
      };

    case AutoDriveEventKind.SCHOOL_ZONE:
      return {
        activeBaseGrade: 0,
        baseTargetKmh: Math.round(randRange(20, 26)),
        phaseDurationSec: randRange(5.5, 8.2),
      };

    case AutoDriveEventKind.SPEED_BUMP_CALMING:
      return {
        activeBaseGrade: 0,
        baseTargetKmh: Math.round(randRange(14, 19)),
        phaseDurationSec: randRange(5.2, 7.4),
      };

    case AutoDriveEventKind.ROUNDABOUT_YIELD:
      return {
        activeBaseGrade: 0,
        baseTargetKmh: Math.round(randRange(17, 25)),
        phaseDurationSec: randRange(4.8, 7.0),
      };

    case AutoDriveEventKind.PEDESTRIAN_CROSSWALK:
      return {
        activeBaseGrade: 0,
        baseTargetKmh: 0,
        phaseDurationSec: randRange(5.8, 8.2),
      };

    case AutoDriveEventKind.BUS_LANE_PAUSE:
      return {
        activeBaseGrade: 0,
        baseTargetKmh: Math.round(randRange(12, 20)),
        phaseDurationSec: randRange(4.6, 6.8),
      };

    case AutoDriveEventKind.FLYOVER_RAMP:
      return {
        activeBaseGrade: Math.round(randRange(5, 7)),
        baseTargetKmh: Math.round(randRange(46, 56)),
        phaseDurationSec: randRange(7.5, 10.0),
      };

    // --- Highway Situations ---
    case AutoDriveEventKind.HIGHWAY_MERGE:
      return {
        activeBaseGrade: 0,
        baseTargetKmh: Math.round(randRange(104, 114)),
        phaseDurationSec: 20.0,
      };

    case AutoDriveEventKind.HIGHWAY_CRUISE:
      return {
        activeBaseGrade: 0,
        baseTargetKmh: Math.round(randRange(104, 116)),
        phaseDurationSec: randRange(7.5, 12.5),
      };

    case AutoDriveEventKind.ECO_CRUISE_GLIDE:
      return {
        activeBaseGrade: 0,
        baseTargetKmh: Math.round(randRange(94, 102)),
        phaseDurationSec: randRange(7.0, 11.0),
      };

    case AutoDriveEventKind.FAST_LANE_SPRINT:
      return {
        activeBaseGrade: 0,
        baseTargetKmh: Math.round(randRange(122, 134)),
        phaseDurationSec: randRange(6.0, 9.2),
      };

    case AutoDriveEventKind.TRAFFIC_SLOWDOWN:
      return {
        activeBaseGrade: 0,
        baseTargetKmh: Math.round(randRange(76, 88)),
        phaseDurationSec: randRange(5.8, 8.8),
      };

    case AutoDriveEventKind.TRUCK_CONVOY_PACE:
      return {
        activeBaseGrade: 0,
        baseTargetKmh: Math.round(randRange(80, 88)),
        phaseDurationSec: randRange(6.0, 9.0),
      };

    case AutoDriveEventKind.OVERTAKE:
      return {
        activeBaseGrade: 0,
        baseTargetKmh: Math.round(randRange(126, 138)),
        phaseDurationSec: randRange(5.2, 7.8),
      };

    case AutoDriveEventKind.TOLL_PLAZA_APPROACH:
      return {
        activeBaseGrade: 0,
        baseTargetKmh: Math.round(randRange(26, 36)),
        phaseDurationSec: randRange(7.5, 9.8),
      };

    case AutoDriveEventKind.WORK_ZONE_LANE_DROP:
      return {
        activeBaseGrade: 0,
        baseTargetKmh: Math.round(randRange(64, 74)),
        phaseDurationSec: randRange(6.5, 9.5),
      };

    case AutoDriveEventKind.HIGHWAY_VIADUCT:
      return {
        activeBaseGrade:
          Math.random() < 0.55 ? Math.round(randRange(6, 8)) : -Math.round(randRange(5, 7)),
        baseTargetKmh: Math.round(randRange(96, 108)),
        phaseDurationSec: randRange(7.5, 10.5),
      };

    case AutoDriveEventKind.RAIN_SPRAY_CAUTION:
      return {
        activeBaseGrade: 0,
        baseTargetKmh: Math.round(randRange(82, 92)),
        phaseDurationSec: randRange(6.5, 9.8),
      };

    // --- Mountain & Countryside Situations ---
    case AutoDriveEventKind.MOUNTAIN_CLIMB:
      return {
        activeBaseGrade: Math.round(randRange(11, 18)),
        baseTargetKmh: Math.round(randRange(50, 64)),
        phaseDurationSec: randRange(7.5, 11.0),
      };

    case AutoDriveEventKind.SLOW_TRUCK_TAIL:
      return {
        activeBaseGrade: Math.round(randRange(12, 16)),
        baseTargetKmh: Math.round(randRange(30, 38)),
        phaseDurationSec: randRange(6.0, 8.8),
      };

    case AutoDriveEventKind.MOUNTAIN_PASSING_ZONE:
      return {
        activeBaseGrade: Math.round(randRange(9, 14)),
        baseTargetKmh: Math.round(randRange(72, 84)),
        phaseDurationSec: randRange(5.5, 8.0),
      };

    case AutoDriveEventKind.HAIRPIN_SWITCHBACK:
      return {
        activeBaseGrade:
          Math.random() < 0.5 ? Math.round(randRange(9, 13)) : -Math.round(randRange(9, 13)),
        baseTargetKmh: Math.round(randRange(24, 32)),
        phaseDurationSec: randRange(6.2, 8.5),
      };

    case AutoDriveEventKind.SUMMIT_CREST:
      return {
        activeBaseGrade: Math.round(randRange(-1, 2)),
        baseTargetKmh: Math.round(randRange(56, 68)),
        phaseDurationSec: randRange(4.5, 6.8),
      };

    case AutoDriveEventKind.SCENIC_LOOKOUT_SLOW:
      return {
        activeBaseGrade: Math.round(randRange(-2, 3)),
        baseTargetKmh: Math.round(randRange(42, 50)),
        phaseDurationSec: randRange(5.5, 8.0),
      };

    case AutoDriveEventKind.MOUNTAIN_DESCENT:
      return {
        activeBaseGrade: -Math.round(randRange(10, 15)),
        baseTargetKmh: Math.round(randRange(48, 60)),
        phaseDurationSec: randRange(7.5, 11.5),
      };

    case AutoDriveEventKind.STEEP_CANYON_PLUNGE:
      return {
        activeBaseGrade: -Math.round(randRange(16, 20)),
        baseTargetKmh: Math.round(randRange(42, 50)),
        phaseDurationSec: randRange(7.5, 10.5),
      };

    case AutoDriveEventKind.VILLAGE_MOUNTAIN_PASS:
      return {
        activeBaseGrade: Math.round(randRange(-2, 2)),
        baseTargetKmh: Math.round(randRange(34, 42)),
        phaseDurationSec: randRange(5.8, 8.5),
      };

    case AutoDriveEventKind.ROLLING_RIVER_VALLEY:
      return {
        activeBaseGrade: Math.round(randRange(4, 7)) * (Math.random() < 0.5 ? 1 : -1),
        baseTargetKmh: Math.round(randRange(64, 74)),
        phaseDurationSec: randRange(6.8, 9.8),
      };

    case AutoDriveEventKind.COUNTRYSIDE_WINDING:
    default:
      return {
        activeBaseGrade: Math.round(randRange(3, 8)) * (Math.random() < 0.65 ? 1 : -1),
        baseTargetKmh: Math.round(randRange(60, 72)),
        phaseDurationSec: randRange(6.2, 9.2),
      };
  }
}

export interface PhaseStatusContext {
  mode: AutoDriveMode;
  phase: AutoDriveEventKind;
  targetRounded: number;
  remSec: number;
  currentSpeedKmh: number;
  activeGradePercent: number;
  activeGear: GearPosition;
  eventSubStage: number;
  jamMoving: boolean;
}

export function buildAutoDriveStatusCopy(ctx: PhaseStatusContext): AutoDriveStatus {
  const {
    mode,
    phase,
    targetRounded,
    remSec,
    currentSpeedKmh,
    activeGradePercent,
    activeGear,
    eventSubStage,
    jamMoving,
  } = ctx;

  const gRound = Math.round(activeGradePercent);
  const gradeStr = gRound > 0 ? `+${gRound}%` : `${gRound}%`;

  switch (phase) {
    // --- Transitional Phases ---
    case AutoDriveEventKind.HIGHWAY_OFFRAMP:
      return {
        mode,
        eventKind: phase,
        eventBadge: 'OFF-RAMP EXIT',
        contextText:
          mode === AutoDriveMode.MOUNTAIN
            ? `Taking mountain interchange exit ramp — easing off throttle into EV coast & gentle regen toward ${targetRounded} km/h`
            : `Exiting highway via curved off-ramp — lifting off throttle into silent EV coast & progressive regen toward ${targetRounded} km/h`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.CITY_ENTRY_BOULEVARD:
      return {
        mode,
        eventKind: phase,
        eventBadge: 'CITY GATEWAY',
        contextText: `Entering urban boulevard zone — smoothly matching ${targetRounded} km/h city speed limit before traffic signals`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.ARTERIAL_FEEDER:
      return {
        mode,
        eventKind: phase,
        eventBadge: 'ACCESS FEEDER',
        contextText: `Joining highway access road — building momentum smoothly toward ${targetRounded} km/h ahead of the entrance ramp`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.SUBURBAN_CONNECTOR:
      return {
        mode,
        eventKind: phase,
        eventBadge: 'SUBURBAN ROAD',
        contextText: `Leaving urban streets onto open rural connector (${gradeStr} grade) — pacing smoothly at ${targetRounded} km/h`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.FOOTHILLS_APPROACH:
      return {
        mode,
        eventKind: phase,
        eventBadge: `FOOTHILLS ${gradeStr}`,
        contextText: `Entering rolling mountain foothills (${gradeStr} grade) — transitioning smoothly before steep switchbacks at ${targetRounded} km/h`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.VALLEY_LEVELOUT:
      return {
        mode,
        eventKind: phase,
        eventBadge: `VALLEY EXIT ${gradeStr}`,
        contextText:
          mode === AutoDriveMode.HIGHWAY
            ? `Descending onto level highway connector (${gradeStr} grade) — settling smoothly toward ${targetRounded} km/h before expressway merge`
            : `Exiting mountain pass onto flat valley road (${gradeStr} grade) — returning smoothly to ${targetRounded} km/h`,
        targetSpeedKmh: targetRounded,
      };

    // --- City Situations ---
    case AutoDriveEventKind.GREEN_LAUNCH:
      return {
        mode,
        eventKind: phase,
        eventBadge: 'GREEN LIGHT',
        contextText: `Signal turned green — accelerating smoothly on MG2 & Atkinson split toward ${targetRounded} km/h`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.URBAN_FLOW:
      return {
        mode,
        eventKind: phase,
        eventBadge: 'CITY FLOW',
        contextText: `Medium urban traffic — pacing lead vehicles around ${targetRounded} km/h (EV pulse & glide)`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.URBAN_COAST_GLIDE:
      return {
        mode,
        eventKind: phase,
        eventBadge: 'GREEN WAVE',
        contextText: `Synchronized green lights — cruising effortlessly at ${targetRounded} km/h on high-efficiency EV glide`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.HEAVY_TRAFFIC:
      return {
        mode,
        eventKind: phase,
        eventBadge: 'HEAVY TRAFFIC',
        contextText: `Dense city corridor — following slower traffic queue at ${targetRounded} km/h`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.RED_LIGHT_BRAKE:
      return {
        mode,
        eventKind: phase,
        eventBadge: 'RED LIGHT AHEAD',
        contextText: `Approaching red traffic light — regenerative braking from ${Math.round(
          currentSpeedKmh
        )} km/h to 0 km/h`,
        targetSpeedKmh: 0,
      };

    case AutoDriveEventKind.RED_LIGHT_WAIT:
      return {
        mode,
        eventKind: phase,
        eventBadge: `RED LIGHT (${remSec}s)`,
        contextText: `Stopped at red light (${remSec}s) — silent 0 RPM EV standby unless low SoC requires charge`,
        targetSpeedKmh: 0,
      };

    case AutoDriveEventKind.TRAFFIC_JAM:
      return {
        mode,
        eventKind: phase,
        eventBadge: 'TRAFFIC JAM',
        contextText: jamMoving
          ? `Stop-and-go traffic jam — creeping forward on electric MG2 torque (${targetRounded} km/h)`
          : `Stop-and-go traffic jam — briefly halted behind congested queue (0 km/h)`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.SCHOOL_ZONE:
      return {
        mode,
        eventKind: phase,
        eventBadge: 'SCHOOL ZONE',
        contextText: `Active school crossing zone — quiet zero-emission EV Drive glide held gently at ${targetRounded} km/h`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.SPEED_BUMP_CALMING:
      return {
        mode,
        eventKind: phase,
        eventBadge: 'SPEED BUMPS',
        contextText:
          eventSubStage === 0
            ? `Residential speed humps ahead — gentle regen braking down to ${targetRounded} km/h`
            : `Cleared speed humps — softly rolling back up to ${targetRounded} km/h on electric MG2`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.ROUNDABOUT_YIELD:
      return {
        mode,
        eventKind: phase,
        eventBadge: 'ROUNDABOUT',
        contextText: `Yielding into city roundabout — smooth regenerative deceleration to ${targetRounded} km/h`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.PEDESTRIAN_CROSSWALK:
      return {
        mode,
        eventKind: phase,
        eventBadge: eventSubStage === 1 ? `CROSSWALK (${remSec}s)` : 'CROSSWALK YIELD',
        contextText:
          eventSubStage === 1
            ? `Yielding at zebra crossing (${remSec}s) — silent 0 RPM EV hold while pedestrians cross`
            : `Pedestrians at crosswalk ahead — smooth regen stop from ${Math.round(
                currentSpeedKmh
              )} km/h`,
        targetSpeedKmh: 0,
      };

    case AutoDriveEventKind.BUS_LANE_PAUSE:
      return {
        mode,
        eventKind: phase,
        eventBadge: 'BUS YIELD',
        contextText: `City bus pulling away from stop — matching slow lane pace at ${targetRounded} km/h`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.FLYOVER_RAMP:
      return {
        mode,
        eventKind: phase,
        eventBadge: `FLYOVER ${gradeStr}`,
        contextText:
          activeGradePercent >= 0
            ? `Climbing city overpass (${gradeStr} grade) — Atkinson power-split sustaining ${targetRounded} km/h`
            : `Descending city overpass (${gradeStr} grade) — zero-fuel MG2 regen recovering energy at ${targetRounded} km/h`,
        targetSpeedKmh: targetRounded,
      };

    // --- Highway Situations ---
    case AutoDriveEventKind.HIGHWAY_MERGE:
      return {
        mode,
        eventKind: phase,
        eventBadge: 'ON-RAMP MERGE',
        contextText: `Highway entrance ramp — progressive hybrid acceleration up to ${targetRounded} km/h`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.HIGHWAY_CRUISE:
      return {
        mode,
        eventKind: phase,
        eventBadge: 'HIGHWAY CRUISE',
        contextText: `Steady highway flow at ${targetRounded} km/h — low-RPM Atkinson split & overdrive`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.ECO_CRUISE_GLIDE:
      return {
        mode,
        eventKind: phase,
        eventBadge: 'ECO OVERDRIVE',
        contextText: `Light expressway traffic — relaxed ${targetRounded} km/h cruise in high-efficiency MG1 CCW overdrive`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.FAST_LANE_SPRINT:
      return {
        mode,
        eventKind: phase,
        eventBadge: 'FAST LANE',
        contextText: `Clear fast lane ahead — brisk expressway pace at ${targetRounded} km/h with responsive power-split`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.TRAFFIC_SLOWDOWN:
      return {
        mode,
        eventKind: phase,
        eventBadge: 'LANE SLOWDOWN',
        contextText: `Slower vehicle ahead — easing speed down to ${targetRounded} km/h with regen recovery`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.TRUCK_CONVOY_PACE:
      return {
        mode,
        eventKind: phase,
        eventBadge: 'TRUCK CONVOY',
        contextText: `Following heavy cargo convoy — pacing patiently at ${targetRounded} km/h waiting for passing gap`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.OVERTAKE:
      return {
        mode,
        eventKind: phase,
        eventBadge: 'OVERTAKING',
        contextText: `Passing slower traffic — kickdown Dual Boost (ICE + HV Battery) to ${targetRounded} km/h`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.TOLL_PLAZA_APPROACH:
      return {
        mode,
        eventKind: phase,
        eventBadge: eventSubStage === 0 ? 'TOLL PLAZA' : 'TOLL EXIT',
        contextText:
          eventSubStage === 0
            ? `Approaching highway e-toll gantry — smooth regenerative slowing toward ${targetRounded} km/h`
            : `Cleared e-toll lane — rolling briskly back up through ${targetRounded} km/h`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.WORK_ZONE_LANE_DROP:
      return {
        mode,
        eventKind: phase,
        eventBadge: 'ROADWORK ZONE',
        contextText: `Highway construction lane narrowing — steady ${targetRounded} km/h speed-limit cruise`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.HIGHWAY_VIADUCT:
      return {
        mode,
        eventKind: phase,
        eventBadge: `VIADUCT ${gradeStr}`,
        contextText:
          activeGradePercent >= 0
            ? `Long elevated highway viaduct (${gradeStr} grade) — smooth Atkinson power-split holding ${targetRounded} km/h`
            : `Descending elevated highway viaduct (${gradeStr} grade) — fuel-cut regen glide at ${targetRounded} km/h`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.RAIN_SPRAY_CAUTION:
      return {
        mode,
        eventKind: phase,
        eventBadge: 'RAIN CAUTION',
        contextText: `Heavy rain spray & wet asphalt — conservative ${targetRounded} km/h cruise with smooth throttle modulation`,
        targetSpeedKmh: targetRounded,
      };

    // --- Mountain & Countryside Situations ---
    case AutoDriveEventKind.MOUNTAIN_CLIMB:
      return {
        mode,
        eventKind: phase,
        eventBadge: `CLIMB ${gradeStr}`,
        contextText: `Steep mountain ascent (${gradeStr} grade) — M20A-FXS + MG2 climbing switchbacks at ${targetRounded} km/h`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.SLOW_TRUCK_TAIL:
      return {
        mode,
        eventKind: phase,
        eventBadge: `TRUCK CRAWL ${gradeStr}`,
        contextText: `Behind slow climbing truck (${gradeStr} grade) — holding steady ${targetRounded} km/h waiting for passing lane`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.MOUNTAIN_PASSING_ZONE:
      return {
        mode,
        eventKind: phase,
        eventBadge: `PASS LANE ${gradeStr}`,
        contextText: `Uphill passing lane opened (${gradeStr} grade) — Dual Boost (186 PS) overtaking cleanly at ${targetRounded} km/h`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.HAIRPIN_SWITCHBACK:
      return {
        mode,
        eventKind: phase,
        eventBadge: `HAIRPIN ${gradeStr}`,
        contextText:
          eventSubStage === 0
            ? `Tight 180° mountain hairpin (${gradeStr} grade) — braking smoothly into apex at ${targetRounded} km/h`
            : `Exiting tight hairpin (${gradeStr} grade) — strong MG2 + ICE torque pulling back toward ${targetRounded} km/h`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.SUMMIT_CREST:
      return {
        mode,
        eventKind: phase,
        eventBadge: 'PASS SUMMIT',
        contextText: `Cresting mountain ridge (${gradeStr} grade) — easing throttle into EV glide / Atkinson cruise at ${targetRounded} km/h`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.SCENIC_LOOKOUT_SLOW:
      return {
        mode,
        eventKind: phase,
        eventBadge: `RIDGE ${gradeStr}`,
        contextText: `Narrow scenic ridge overlook (${gradeStr} grade) — gentle EV-biased sightseeing pace at ${targetRounded} km/h`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.MOUNTAIN_DESCENT:
      return {
        mode,
        eventKind: phase,
        eventBadge: `DESCENT ${gradeStr}`,
        contextText:
          activeGear === GearPosition.B
            ? `Steep mountain descent (${gradeStr} grade) — B-range fuel-cut engine pumping + MG2 regen holding ${targetRounded} km/h`
            : `Mountain downhill (${gradeStr} grade) — zero-fuel MG2 regenerative braking holding ${targetRounded} km/h`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.STEEP_CANYON_PLUNGE:
      return {
        mode,
        eventKind: phase,
        eventBadge: `CANYON ${gradeStr}`,
        contextText: `Very steep canyon grade (${gradeStr}) — strong B-range fuel-cut engine braking + MG2 regen protecting brakes at ${targetRounded} km/h`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.VILLAGE_MOUNTAIN_PASS:
      return {
        mode,
        eventKind: phase,
        eventBadge: 'MTN VILLAGE',
        contextText: `Passing quiet mountain roadside village (${gradeStr} grade) — serene EV glide at ${targetRounded} km/h`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.ROLLING_RIVER_VALLEY:
      return {
        mode,
        eventKind: phase,
        eventBadge: `VALLEY ${gradeStr}`,
        contextText: `Sweeping river-valley highway (${gradeStr} grade) — rhythmic EV regen & Atkinson cruise at ${targetRounded} km/h`,
        targetSpeedKmh: targetRounded,
      };

    case AutoDriveEventKind.COUNTRYSIDE_WINDING:
      return {
        mode,
        eventKind: phase,
        eventBadge: `HILLS ${gradeStr}`,
        contextText: `Winding countryside road (${gradeStr} grade) — rolling valley curves at ${targetRounded} km/h`,
        targetSpeedKmh: targetRounded,
      };

    default:
      return { ...IDLE_AUTODRIVE_STATUS };
  }
}
