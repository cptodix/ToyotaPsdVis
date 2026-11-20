import { AutoDriveEventKind, AutoDriveMode } from '../../types/hybrid';

export function getAutoDriveEventBadgeClass(kind: AutoDriveEventKind): string {
  switch (kind) {
    case AutoDriveEventKind.RED_LIGHT_BRAKE:
    case AutoDriveEventKind.RED_LIGHT_WAIT:
    case AutoDriveEventKind.PEDESTRIAN_CROSSWALK:
    case AutoDriveEventKind.HAIRPIN_SWITCHBACK:
      return 'bg-red-500/20 border-red-500/50 text-red-300';
    case AutoDriveEventKind.GREEN_LAUNCH:
    case AutoDriveEventKind.SUMMIT_CREST:
    case AutoDriveEventKind.URBAN_COAST_GLIDE:
    case AutoDriveEventKind.ECO_CRUISE_GLIDE:
    case AutoDriveEventKind.VILLAGE_MOUNTAIN_PASS:
      return 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300';
    case AutoDriveEventKind.HIGHWAY_OFFRAMP:
    case AutoDriveEventKind.VALLEY_LEVELOUT:
    case AutoDriveEventKind.CITY_ENTRY_BOULEVARD:
    case AutoDriveEventKind.RAIN_SPRAY_CAUTION:
    case AutoDriveEventKind.SCENIC_LOOKOUT_SLOW:
      return 'bg-sky-500/20 border-sky-400/55 text-sky-200';
    case AutoDriveEventKind.ARTERIAL_FEEDER:
    case AutoDriveEventKind.SUBURBAN_CONNECTOR:
    case AutoDriveEventKind.FOOTHILLS_APPROACH:
    case AutoDriveEventKind.ROUNDABOUT_YIELD:
    case AutoDriveEventKind.ROLLING_RIVER_VALLEY:
      return 'bg-teal-500/20 border-teal-400/55 text-teal-200';
    case AutoDriveEventKind.TRAFFIC_JAM:
    case AutoDriveEventKind.HEAVY_TRAFFIC:
    case AutoDriveEventKind.SCHOOL_ZONE:
    case AutoDriveEventKind.SPEED_BUMP_CALMING:
    case AutoDriveEventKind.BUS_LANE_PAUSE:
    case AutoDriveEventKind.TRAFFIC_SLOWDOWN:
    case AutoDriveEventKind.TRUCK_CONVOY_PACE:
    case AutoDriveEventKind.WORK_ZONE_LANE_DROP:
    case AutoDriveEventKind.TOLL_PLAZA_APPROACH:
    case AutoDriveEventKind.MOUNTAIN_CLIMB:
    case AutoDriveEventKind.SLOW_TRUCK_TAIL:
      return 'bg-amber-500/20 border-amber-500/50 text-amber-300';
    case AutoDriveEventKind.OVERTAKE:
    case AutoDriveEventKind.FAST_LANE_SPRINT:
    case AutoDriveEventKind.HIGHWAY_MERGE:
    case AutoDriveEventKind.MOUNTAIN_PASSING_ZONE:
    case AutoDriveEventKind.MOUNTAIN_DESCENT:
    case AutoDriveEventKind.STEEP_CANYON_PLUNGE:
      return 'bg-violet-500/25 border-violet-400/55 text-violet-200';
    default:
      return 'bg-cyan-500/20 border-cyan-500/45 text-cyan-300';
  }
}

export function getAutoDriveModeLabel(mode: AutoDriveMode): string {
  if (mode === AutoDriveMode.CITY) return 'CITY AUTO';
  if (mode === AutoDriveMode.HIGHWAY) return 'HWY AUTO';
  if (mode === AutoDriveMode.MOUNTAIN) return 'MTN AUTO';
  return 'AUTO';
}
