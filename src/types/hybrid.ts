export enum WorkspaceTab {
  SIMULATOR = 'SIMULATOR',
  MODES = 'MODES',
  MANUAL = 'MANUAL',
}

export enum GearPosition {
  P = 'P',
  R = 'R',
  N = 'N',
  D = 'D',
  B = 'B',
}

export enum RotationDir {
  CW = 'CW',
  CCW = 'CCW',
  STOP = 'STOP',
}

export enum SolveTarget {
  MG1 = 'MG1',
  WHEEL = 'WHEEL',
  ICE = 'ICE',
}

export enum CameraPresetId {
  OVERVIEW = 'OVERVIEW',
  PLANETARY = 'PLANETARY',
  PARALLEL_SHAFTS = 'PARALLEL_SHAFTS',
  WHEEL_DIFF = 'WHEEL_DIFF',
}

export enum OperationModeId {
  STOP = 'STOP',
  IDLE_CHARGE = 'IDLE_CHARGE',
  EV_DRIVE = 'EV_DRIVE',
  ICE_START = 'ICE_START',
  NORMAL_SPLIT = 'NORMAL_SPLIT',
  POWER_BOOST = 'POWER_BOOST',
  HIGHWAY_OVERDRIVE = 'HIGHWAY_OVERDRIVE',
  REGEN_BRAKE = 'REGEN_BRAKE',
  B_MODE_DESCENT = 'B_MODE_DESCENT',
  REVERSE_EV = 'REVERSE_EV',
}

export enum HsiZone {
  CHG = 'CHG',
  ECO_EV = 'ECO_EV',
  ECO_HYBRID = 'ECO_HYBRID',
  PWR = 'PWR',
  OFF = 'OFF',
}

export interface PowerFlowsKw {
  iceToCarrierKw: number;
  carrierToRingKw: number;
  carrierToSunKw: number;
  mg1ToPcuKw: number;
  pcuToMg2Kw: number;
  batteryToPcuKw: number;
  mg2ToCounterKw: number;
  counterToWheelKw: number;
  frictionBrakeKw: number;
}

export interface PropulsionSplitMetrics {
  icePercent: number;
  evPercent: number;
  iceHp: number;
  evHp: number;
  iceTorqueNm: number;
  evTorqueNm: number;
}

export interface BrakingSplitMetrics {
  regenPercent: number;
  mechPercent: number;
  regenHp: number;
  mechHp: number;
  regenTorqueNm: number;
  mechTorqueNm: number;
}

export interface PowertrainState {
  iceRpm: number;
  mg1Rpm: number;
  ringRpm: number;
  mg2Rpm: number;
  counterRpm: number;
  wheelRpm: number;
  planetLocalRpm: number;

  speedKmh: number;
  socPercent: number;
  iceFuelActive: boolean;

  gear: GearPosition;
  evModeRequested: boolean;
  throttlePercent: number;
  brakePercent: number;
  roadGradePercent: number;

  hsiValue: number;
  hsiZone: HsiZone;
  evIndicatorOn: boolean;

  activePhaseTitle: string;
  activePhaseSummary: string;
  activeModeId: OperationModeId;

  flows: PowerFlowsKw;
  propulsionSplit: PropulsionSplitMetrics;
  brakingSplit: BrakingSplitMetrics;
}

export interface OperationModeSpec {
  id: OperationModeId;
  shortLabel: string;
  title: string;
  phaseBadge: string;
  summary: string;
  iceRpm: number;
  ringRpm: number;
  iceFuelActive: boolean;
  gear: GearPosition;
  socPercent: number;
  flows: PowerFlowsKw;
  hsiValue: number;
  hsiZone: HsiZone;
}

export interface ComponentColorSpec {
  id: 'ice' | 'mg1' | 'mg2' | 'wheel' | 'battery';
  name: string;
  shortName: string;
  gearPart: string;
  hex: string;
  threeHex: number;
  textClass: string;
  bgSubtleClass: string;
  borderClass: string;
}

export const COMPONENT_COLORS: Record<
  'ice' | 'mg1' | 'mg2' | 'wheel' | 'battery',
  ComponentColorSpec
> = {
  ice: {
    id: 'ice',
    name: 'ICE Engine',
    shortName: 'ICE',
    gearPart: 'Carrier & Planet Gears',
    hex: '#ef4444',
    threeHex: 0xef4444,
    textClass: 'text-red-400',
    bgSubtleClass: 'bg-red-500/12',
    borderClass: 'border-red-500/40',
  },
  mg1: {
    id: 'mg1',
    name: 'MG1 Generator',
    shortName: 'MG1',
    gearPart: 'Sun Gear (30T)',
    hex: '#f59e0b',
    threeHex: 0xf59e0b,
    textClass: 'text-amber-400',
    bgSubtleClass: 'bg-amber-500/12',
    borderClass: 'border-amber-500/40',
  },
  mg2: {
    id: 'mg2',
    name: 'MG2 Traction Motor',
    shortName: 'MG2',
    gearPart: 'Ring Gear (78T) & Counter',
    hex: '#06b6d4',
    threeHex: 0x06b6d4,
    textClass: 'text-cyan-400',
    bgSubtleClass: 'bg-cyan-500/12',
    borderClass: 'border-cyan-500/40',
  },
  wheel: {
    id: 'wheel',
    name: 'Drive Wheel',
    shortName: 'Wheel',
    gearPart: 'Final Axle & Diff',
    hex: '#8b5cf6',
    threeHex: 0x8b5cf6,
    textClass: 'text-violet-400',
    bgSubtleClass: 'bg-violet-500/12',
    borderClass: 'border-violet-500/40',
  },
  battery: {
    id: 'battery',
    name: 'Li-Ion HV Battery',
    shortName: 'HV Batt',
    gearPart: 'PCU Inverter',
    hex: '#10b981',
    threeHex: 0x10b981,
    textClass: 'text-emerald-400',
    bgSubtleClass: 'bg-emerald-500/12',
    borderClass: 'border-emerald-500/40',
  },
};
