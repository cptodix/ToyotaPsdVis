import {
  AutoDriveStatus,
  BrakingSplitMetrics,
  GearPosition,
  HsiZone,
  OperationModeId,
  OperationModeSpec,
  PowerFlowsKw,
  PowertrainState,
  PropulsionSplitMetrics,
  RotationDir,
  SolveTarget,
} from '../types/hybrid';
import { IDLE_AUTODRIVE_STATUS } from './autoDriveController';

/**
 * Audited 5th-Generation Toyota Hybrid System (THS V — 2.0L M20A-FXS + 1VM MG2) Constants
 * Reference vehicle: 5th-Gen Toyota Prius / Corolla Cross Hybrid 2.0L FWD (196 hp / 144 kW)
 * - ICE (M20A-FXS): 112 kW (150 hp) @ 6,000 RPM, 188 Nm peak @ 4,400–5,200 RPM (41% peak thermal eff.)
 * - MG2 (1VM): 83 kW (111 hp), 206 Nm peak torque, 17,000 RPM max
 * - MG1 (1VM-G): ~48 kW peak generation, 10,500 RPM normal operating ceiling
 * - HV Battery: 60-cell 222V 4.08 Ah (~0.91 kWh) Li-Ion (~34 kW discharge boost / ~38 kW regen)
 * - Performance: 0–100 km/h in ~7.3 s, 180 km/h governed top speed
 */
export const PSD_CONSTANTS = {
  Z_SUN: 30,
  Z_PLANET: 24,
  Z_RING: 78,
  N_PLANETS: 4,

  Z_RING_COUNTER_DRIVE: 40,
  Z_COUNTER_DRIVEN: 44,
  Z_MG2_PINION: 13,
  Z_FINAL_PINION: 18,
  Z_FINAL_RING: 52,

  TIRE_CIRCUMFERENCE_M: 1.985,

  ICE_MAX_RPM: 6000,
  ICE_IDLE_RPM: 1150,
  ICE_MAX_POWER_KW: 112,
  ICE_MAX_TORQUE_NM: 188,

  MG1_MAX_RPM: 10500,
  MG2_MAX_RPM: 17000,
  MG2_MAX_POWER_KW: 83,
  MG2_MAX_TORQUE_NM: 206,

  SYSTEM_MAX_POWER_KW: 144,
  HV_BATTERY_CAPACITY_KJ: 3100, // ~0.86 kWh nominal Li-Ion cell energy scale
} as const;

export const KW_TO_HP = 1.34102;
export const TOTAL_PSD_TEETH = PSD_CONSTANTS.Z_SUN + PSD_CONSTANTS.Z_RING; // 108
export const SUN_CARRIER_SHARE = PSD_CONSTANTS.Z_SUN / TOTAL_PSD_TEETH; // 0.2778 (27.8%)
export const RING_CARRIER_SHARE = PSD_CONSTANTS.Z_RING / TOTAL_PSD_TEETH; // 0.7222 (72.2%)

export const COUNTER_TO_RING_RATIO =
  -PSD_CONSTANTS.Z_RING_COUNTER_DRIVE / PSD_CONSTANTS.Z_COUNTER_DRIVEN; // -40/44
export const RING_TO_WHEEL_RATIO =
  (PSD_CONSTANTS.Z_COUNTER_DRIVEN / PSD_CONSTANTS.Z_RING_COUNTER_DRIVE) *
  (PSD_CONSTANTS.Z_FINAL_RING / PSD_CONSTANTS.Z_FINAL_PINION); // 3.1778
export const MG2_TO_RING_RATIO =
  PSD_CONSTANTS.Z_RING_COUNTER_DRIVE / PSD_CONSTANTS.Z_MG2_PINION; // 3.0769
export const MG2_TO_WHEEL_RATIO = MG2_TO_RING_RATIO * RING_TO_WHEEL_RATIO; // 9.7778

export function getRotationDirection(rpm: number, deadband = 10): RotationDir {
  if (rpm > deadband) return RotationDir.CW;
  if (rpm < -deadband) return RotationDir.CCW;
  return RotationDir.STOP;
}

export function formatDirectionLabel(rpm: number, isVehicleOutput = false): string {
  const dir = getRotationDirection(rpm);
  if (dir === RotationDir.STOP) return 'STOP';
  if (isVehicleOutput) {
    return dir === RotationDir.CW ? 'CW · FWD' : 'CCW · REV';
  }
  return dir === RotationDir.CW ? 'CW (+)' : 'CCW (-)';
}

export function solveMg1Rpm(iceRpm: number, ringRpm: number): number {
  return (TOTAL_PSD_TEETH * iceRpm - PSD_CONSTANTS.Z_RING * ringRpm) / PSD_CONSTANTS.Z_SUN;
}

export function solveRingRpm(iceRpm: number, mg1Rpm: number): number {
  return (TOTAL_PSD_TEETH * iceRpm - PSD_CONSTANTS.Z_SUN * mg1Rpm) / PSD_CONSTANTS.Z_RING;
}

export function solveIceRpm(mg1Rpm: number, ringRpm: number): number {
  return (PSD_CONSTANTS.Z_SUN * mg1Rpm + PSD_CONSTANTS.Z_RING * ringRpm) / TOTAL_PSD_TEETH;
}

export function deriveSecondarySpeeds(iceRpm: number, mg1Rpm: number, ringRpm: number) {
  const mg2Rpm = ringRpm * MG2_TO_RING_RATIO;
  const counterRpm = ringRpm * COUNTER_TO_RING_RATIO;
  const wheelRpm = ringRpm / RING_TO_WHEEL_RATIO;
  const planetLocalRpm = -(mg1Rpm - iceRpm) * (PSD_CONSTANTS.Z_SUN / PSD_CONSTANTS.Z_PLANET);
  const speedKmh = (wheelRpm * PSD_CONSTANTS.TIRE_CIRCUMFERENCE_M * 60) / 1000;
  return { mg2Rpm, counterRpm, wheelRpm, planetLocalRpm, speedKmh };
}

export function wheelRpmFromKmh(speedKmh: number): number {
  return (speedKmh * 1000) / (PSD_CONSTANTS.TIRE_CIRCUMFERENCE_M * 60);
}

export function ringRpmFromKmh(speedKmh: number): number {
  return wheelRpmFromKmh(speedKmh) * RING_TO_WHEEL_RATIO;
}

/**
 * M20A-FXS 2.0L Atkinson Wide-Open-Throttle Torque Envelope (Nm vs RPM):
 * ~150 Nm @ 1,200 RPM -> 176 Nm @ 2,800 RPM -> 188 Nm peak @ 4,400–5,200 RPM -> 178.3 Nm @ 6,000 RPM (112 kW)
 */
export function maxIceTorqueAtRpm(rpm: number): number {
  const r = Math.max(1000, Math.min(PSD_CONSTANTS.ICE_MAX_RPM, Math.abs(rpm)));
  if (r <= 2800) {
    return 148 + ((r - 1000) / 1800) * 28;
  }
  if (r <= 4800) {
    return 176 + ((r - 2800) / 2000) * 12;
  }
  return 188 - ((r - 4800) / 1200) * 9.7;
}

/**
 * Optimal Atkinson BSFC e-CVT Operating Line (RPM for requested ICE kW):
 * Keeps M20A-FXS inside its 41% thermal efficiency island (high load, low friction RPM)
 * at cruise, rising smoothly to 6,000 RPM for 112 kW peak power.
 */
export function optimalAtkinsonRpmForPower(icePowerKw: number, ringRpm: number): number {
  const kw = Math.max(8, Math.min(PSD_CONSTANTS.ICE_MAX_POWER_KW, icePowerKw));
  let optRpm: number;
  if (kw <= 36) {
    // High-efficiency Atkinson cruise band: 1,180 -> 2,150 RPM
    optRpm = 1150 + ((kw - 8) / 28) * 1000;
  } else if (kw <= 78) {
    // Mid-high acceleration band: 2,150 -> 4,250 RPM
    optRpm = 2150 + ((kw - 36) / 42) * 2100;
  } else {
    // Full power WOT band: 4,250 -> 6,000 RPM (112 kW @ 6,000 RPM)
    optRpm = 4250 + ((kw - 78) / 34) * 1750;
  }

  // Enforce MG1 ±9,800 RPM safe operating window via planetary kinematic relation
  const minIceForMg1NegLimit =
    (PSD_CONSTANTS.Z_RING * ringRpm - PSD_CONSTANTS.Z_SUN * 9800) / TOTAL_PSD_TEETH;
  const maxIceForMg1PosLimit =
    (PSD_CONSTANTS.Z_RING * ringRpm + PSD_CONSTANTS.Z_SUN * 9800) / TOTAL_PSD_TEETH;

  const bounded = Math.max(
    PSD_CONSTANTS.ICE_IDLE_RPM,
    minIceForMg1NegLimit,
    Math.min(PSD_CONSTANTS.ICE_MAX_RPM, maxIceForMg1PosLimit, optRpm)
  );
  return bounded;
}

/**
 * Thermodynamic Fuel Consumption Rate (L/s) for 5th-Gen 2.0L M20A-FXS Atkinson Engine:
 * - Zero fuel (0.000 L/s) whenever fuel is cut (EV Drive, Ready Stop, Regen, B-Mode air pumping).
 * - Peak 41% brake thermal efficiency in the Atkinson cruise island (16–48 kW), tapering
 *   realistically at low-load stationary charge (~36%) and 6,000 RPM WOT enrichment (~33–35%).
 * - Regular gasoline Lower Heating Value (LHV) = 32,400 kJ/L.
 */
export function computeFuelRateLitersPerSec(
  iceFuelActive: boolean,
  iceRpm: number,
  iceToCarrierKw: number
): number {
  if (!iceFuelActive || iceRpm < 350) return 0;
  if (iceToCarrierKw < 0.5) return 0.00018; // ~0.65 L/h warm unloaded idle in Neutral

  const shaftKw = Math.max(0.5, iceToCarrierKw) + 0.42;
  let thermalEff = 0.408;
  if (shaftKw < 16) {
    thermalEff = 0.358 + ((shaftKw - 0.5) / 15.5) * 0.05;
  } else if (shaftKw > 48) {
    thermalEff = 0.408 - Math.min(1, (shaftKw - 48) / 64) * 0.06;
  }
  if (iceRpm > 3800) {
    thermalEff -= Math.min(0.025, ((iceRpm - 3800) / 2200) * 0.018);
  }
  thermalEff = Math.max(0.32, Math.min(0.41, thermalEff));

  const fuelThermalKw = shaftKw / thermalEff;
  return fuelThermalKw / 32400;
}

/**
 * Computes ICE vs EV propulsion split (%, hp, shaft Nm) and Regen vs Mechanical Brake split (%, hp, wheel Nm).
 * Audited fix: Internal overdrive power circulation (when vehicle is propelling forward) never falsely triggers Braking Split.
 */
export function computeSplits(
  iceRpm: number,
  mg2Rpm: number,
  wheelRpm: number,
  iceFuelActive: boolean,
  flows: PowerFlowsKw
): { propulsionSplit: PropulsionSplitMetrics; brakingSplit: BrakingSplitMetrics } {
  // 1. Propulsion Split: ICE Engine Output vs MG2 Electric Traction Output
  const iceActiveKw = iceFuelActive ? Math.max(0, flows.iceToCarrierKw) : 0;
  const evPropKw = Math.max(0, flows.mg2ToCounterKw);
  const sumPropKw = iceActiveKw + evPropKw;

  const icePercent = sumPropKw > 0.15 ? Math.round((iceActiveKw / sumPropKw) * 100) : 0;
  const evPercent = sumPropKw > 0.15 ? 100 - icePercent : 0;

  const effIceRpm = Math.max(950, Math.abs(iceRpm));
  const iceTorqueNm =
    iceActiveKw > 0.1
      ? Math.min(maxIceTorqueAtRpm(effIceRpm), (iceActiveKw * 9549) / effIceRpm)
      : 0;

  const effMg2Rpm = Math.max(420, Math.abs(mg2Rpm));
  const evTorqueNm =
    evPropKw > 0.1
      ? Math.min(PSD_CONSTANTS.MG2_MAX_TORQUE_NM, (evPropKw * 9549) / effMg2Rpm)
      : 0;

  const propulsionSplit: PropulsionSplitMetrics = {
    icePercent,
    evPercent,
    iceHp: iceActiveKw * KW_TO_HP,
    evHp: evPropKw * KW_TO_HP,
    iceTorqueNm,
    evTorqueNm,
  };

  // 2. Braking Split: Strictly active ONLY when retarding the wheels (never during forward Overdrive circulation!)
  const isVehicleBraking = flows.counterToWheelKw < -0.15 || flows.frictionBrakeKw > 0.1;
  const regenKw =
    isVehicleBraking && flows.mg2ToCounterKw < -0.1 ? Math.abs(flows.mg2ToCounterKw) : 0;
  const enginePumpDragKw =
    isVehicleBraking && !iceFuelActive && flows.iceToCarrierKw < -0.1
      ? Math.abs(flows.iceToCarrierKw)
      : 0;
  const mechKw = isVehicleBraking ? Math.max(0, flows.frictionBrakeKw) + enginePumpDragKw : 0;
  const sumBrakeKw = regenKw + mechKw;

  const regenPercent = sumBrakeKw > 0.15 ? Math.round((regenKw / sumBrakeKw) * 100) : 0;
  const mechPercent = sumBrakeKw > 0.15 ? 100 - regenPercent : 0;

  const effWheelRpm = Math.max(45, Math.abs(wheelRpm));
  const regenTorqueNm =
    regenKw > 0.1
      ? Math.min(PSD_CONSTANTS.MG2_MAX_TORQUE_NM * MG2_TO_WHEEL_RATIO, (regenKw * 9549) / effWheelRpm)
      : 0;
  const mechTorqueNm = mechKw > 0.1 ? Math.min(2800, (mechKw * 9549) / effWheelRpm) : 0;

  const brakingSplit: BrakingSplitMetrics = {
    regenPercent,
    mechPercent,
    regenHp: regenKw * KW_TO_HP,
    mechHp: mechKw * KW_TO_HP,
    regenTorqueNm,
    mechTorqueNm,
  };

  return { propulsionSplit, brakingSplit };
}

export const OPERATION_MODES: OperationModeSpec[] = [
  {
    id: OperationModeId.STOP,
    shortLabel: 'Ready Stop',
    title: 'Ready / Stationary EV Standby',
    phaseBadge: 'READY · ZERO RPM',
    summary:
      'Vehicle is stationary in Ready state. ICE is off and MG1/MG2 remain at 0 RPM with zero fuel use.',
    iceRpm: 0,
    ringRpm: 0,
    iceFuelActive: false,
    gear: GearPosition.P,
    socPercent: 60,
    hsiValue: 0,
    hsiZone: HsiZone.OFF,
    flows: {
      iceToCarrierKw: 0,
      carrierToRingKw: 0,
      carrierToSunKw: 0,
      mg1ToPcuKw: 0,
      pcuToMg2Kw: 0,
      batteryToPcuKw: 0,
      mg2ToCounterKw: 0,
      counterToWheelKw: 0,
      frictionBrakeKw: 0,
    },
  },
  {
    id: OperationModeId.IDLE_CHARGE,
    shortLabel: 'Park Charge',
    title: 'Park / Stationary HV Battery Charging',
    phaseBadge: 'STATIONARY GEN',
    summary:
      'Ring Gear and Wheels are locked at 0 RPM. ICE spins Carrier CW (1,300 RPM), driving Sun Gear (MG1) CW (+4,680 RPM) to recharge the Li-Ion pack.',
    iceRpm: 1300,
    ringRpm: 0,
    iceFuelActive: true,
    gear: GearPosition.P,
    socPercent: 36,
    hsiValue: 18,
    hsiZone: HsiZone.ECO_HYBRID,
    flows: {
      iceToCarrierKw: 11.8,
      carrierToRingKw: 0,
      carrierToSunKw: 11.8,
      mg1ToPcuKw: 11.2,
      pcuToMg2Kw: 0,
      batteryToPcuKw: -10.8,
      mg2ToCounterKw: 0,
      counterToWheelKw: 0,
      frictionBrakeKw: 0,
    },
  },
  {
    id: OperationModeId.EV_DRIVE,
    shortLabel: 'EV Drive',
    title: 'Pure Electric Propulsion (EV Mode)',
    phaseBadge: 'EV PROPULSION',
    summary:
      'Li-Ion HV Battery powers MG2 (up to 83 kW / 206 Nm) to drive Ring Gear & Wheels forward. ICE stays at 0 RPM while Planet Gears spin MG1 freely CCW.',
    iceRpm: 0,
    ringRpm: 1150,
    iceFuelActive: false,
    gear: GearPosition.D,
    socPercent: 68,
    hsiValue: 30,
    hsiZone: HsiZone.ECO_EV,
    flows: {
      iceToCarrierKw: 0,
      carrierToRingKw: 0,
      carrierToSunKw: 0,
      mg1ToPcuKw: 0,
      pcuToMg2Kw: 15.2,
      batteryToPcuKw: 15.8,
      mg2ToCounterKw: 14.5,
      counterToWheelKw: 14.5,
      frictionBrakeKw: 0,
    },
  },
  {
    id: OperationModeId.ICE_START,
    shortLabel: 'ICE Start',
    title: 'In-Motion Engine Cranking Phase',
    phaseBadge: 'MG1 CRANKING',
    summary:
      'While MG2 propels the car, MG1 uses battery power as a starter motor to lift the Sun Gear from negative RPM and spin the Carrier (ICE) to ignition speed.',
    iceRpm: 1080,
    ringRpm: 1250,
    iceFuelActive: true,
    gear: GearPosition.D,
    socPercent: 58,
    hsiValue: 48,
    hsiZone: HsiZone.ECO_HYBRID,
    flows: {
      iceToCarrierKw: 4.5,
      carrierToRingKw: 9.0,
      carrierToSunKw: -4.5,
      mg1ToPcuKw: -4.8,
      pcuToMg2Kw: 14.2,
      batteryToPcuKw: 19.4,
      mg2ToCounterKw: 13.5,
      counterToWheelKw: 22.5,
      frictionBrakeKw: 0,
    },
  },
  {
    id: OperationModeId.NORMAL_SPLIT,
    shortLabel: 'Normal Split',
    title: 'Optimal Atkinson Power-Split Cruise',
    phaseBadge: '72% MECH · 28% ELEC',
    summary:
      'M20A-FXS runs on its 41%-efficiency BSFC line (1,780 RPM): PSD splits torque 72.2% mechanically to Ring Gear and 27.8% to MG1 to feed MG2 and regulate SoC.',
    iceRpm: 1780,
    ringRpm: 1620,
    iceFuelActive: true,
    gear: GearPosition.D,
    socPercent: 58,
    hsiValue: 54,
    hsiZone: HsiZone.ECO_HYBRID,
    flows: {
      iceToCarrierKw: 29.5,
      carrierToRingKw: 19.4,
      carrierToSunKw: 10.1,
      mg1ToPcuKw: 9.6,
      pcuToMg2Kw: 7.2,
      batteryToPcuKw: -2.4,
      mg2ToCounterKw: 6.8,
      counterToWheelKw: 26.2,
      frictionBrakeKw: 0,
    },
  },
  {
    id: OperationModeId.POWER_BOOST,
    shortLabel: 'Power Boost',
    title: 'Full-Load Dual Boost (196 hp Combined)',
    phaseBadge: '112kW ICE + 33kW BATT',
    summary:
      'M20A-FXS delivers peak 112 kW (150 hp @ 6,000 RPM) split via Ring + MG1, while the Li-Ion battery adds 33 kW into MG2 (83 kW / 111 hp) for full 196 hp acceleration.',
    iceRpm: 5850,
    ringRpm: 2550,
    iceFuelActive: true,
    gear: GearPosition.D,
    socPercent: 64,
    hsiValue: 96,
    hsiZone: HsiZone.PWR,
    flows: {
      iceToCarrierKw: 110.0,
      carrierToRingKw: 34.7,
      carrierToSunKw: 75.3,
      mg1ToPcuKw: 53.5,
      pcuToMg2Kw: 86.5,
      batteryToPcuKw: 33.0,
      mg2ToCounterKw: 82.2,
      counterToWheelKw: 136.0,
      frictionBrakeKw: 0,
    },
  },
  {
    id: OperationModeId.HIGHWAY_OVERDRIVE,
    shortLabel: 'Overdrive',
    title: 'Highway e-CVT Overdrive (Power Circulation)',
    phaseBadge: 'OVERDRIVE · MG1 CCW',
    summary:
      'At steady 112 km/h (2,988 RPM Ring) with relaxed 1,720 RPM ICE, Sun Gear (MG1) spins CCW (-1,583 RPM) as a reverse motor fed by slight MG2 generation.',
    iceRpm: 1720,
    ringRpm: 2988,
    iceFuelActive: true,
    gear: GearPosition.D,
    socPercent: 59,
    hsiValue: 56,
    hsiZone: HsiZone.ECO_HYBRID,
    flows: {
      iceToCarrierKw: 24.0,
      carrierToRingKw: 30.1,
      carrierToSunKw: -6.1,
      mg1ToPcuKw: -6.4,
      pcuToMg2Kw: -6.5,
      batteryToPcuKw: -0.1,
      mg2ToCounterKw: -6.8,
      counterToWheelKw: 23.3,
      frictionBrakeKw: 0,
    },
  },
  {
    id: OperationModeId.REGEN_BRAKE,
    shortLabel: 'Regen Brake',
    title: 'Cooperative Regenerative Braking (CHG)',
    phaseBadge: 'KINETIC RECOVERY',
    summary:
      'Fuel is cut to ICE (0 RPM Carrier). Wheel momentum drives MG2 as a generator (up to 38 kW into Li-Ion pack), blended seamlessly with hydraulic friction brakes.',
    iceRpm: 0,
    ringRpm: 1580,
    iceFuelActive: false,
    gear: GearPosition.D,
    socPercent: 54,
    hsiValue: -68,
    hsiZone: HsiZone.CHG,
    flows: {
      iceToCarrierKw: 0,
      carrierToRingKw: 0,
      carrierToSunKw: 0,
      mg1ToPcuKw: 0,
      pcuToMg2Kw: -29.5,
      batteryToPcuKw: -28.5,
      mg2ToCounterKw: -31.0,
      counterToWheelKw: -31.0,
      frictionBrakeKw: 3.5,
    },
  },
  {
    id: OperationModeId.B_MODE_DESCENT,
    shortLabel: 'B-Mode Brake',
    title: 'B-Range Downhill Engine Pumping Brake',
    phaseBadge: 'B-RANGE · FUEL CUT',
    summary:
      'On descents in B range, MG2 regenerates braking power and routes part to MG1, spinning the fuel-cut ICE (3,100 RPM) as an air pump to prevent battery overcharge.',
    iceRpm: 3100,
    ringRpm: 1680,
    iceFuelActive: false,
    gear: GearPosition.B,
    socPercent: 79,
    hsiValue: -88,
    hsiZone: HsiZone.CHG,
    flows: {
      iceToCarrierKw: -17.5,
      carrierToRingKw: -5.4,
      carrierToSunKw: -12.1,
      mg1ToPcuKw: -12.7,
      pcuToMg2Kw: -24.8,
      batteryToPcuKw: -12.1,
      mg2ToCounterKw: -26.1,
      counterToWheelKw: -31.5,
      frictionBrakeKw: 0,
    },
  },
  {
    id: OperationModeId.REVERSE_EV,
    shortLabel: 'Reverse EV',
    title: 'Gearless Electric Reverse Propulsion',
    phaseBadge: 'REVERSE · MG2 CCW',
    summary:
      'PCU reverses AC phase sequence so MG2 spins CCW, driving Countershaft CW and Ring Gear/Wheels backward (-19 km/h) while ICE stays at 0 RPM.',
    iceRpm: 0,
    ringRpm: -510,
    iceFuelActive: false,
    gear: GearPosition.R,
    socPercent: 62,
    hsiValue: 26,
    hsiZone: HsiZone.ECO_EV,
    flows: {
      iceToCarrierKw: 0,
      carrierToRingKw: 0,
      carrierToSunKw: 0,
      mg1ToPcuKw: 0,
      pcuToMg2Kw: 9.8,
      batteryToPcuKw: 10.3,
      mg2ToCounterKw: 9.3,
      counterToWheelKw: 9.3,
      frictionBrakeKw: 0,
    },
  },
];

export function buildStateFromMode(
  mode: OperationModeSpec,
  preserveTrip?: { odometerKm: number; totalFuelLiters: number }
): PowertrainState {
  const mg1Rpm = solveMg1Rpm(mode.iceRpm, mode.ringRpm);
  const sec = deriveSecondarySpeeds(mode.iceRpm, mg1Rpm, mode.ringRpm);
  const splits = computeSplits(mode.iceRpm, sec.mg2Rpm, sec.wheelRpm, mode.iceFuelActive, mode.flows);
  const fuelRateLps = computeFuelRateLitersPerSec(
    mode.iceFuelActive,
    mode.iceRpm,
    mode.flows.iceToCarrierKw
  );

  return {
    iceRpm: mode.iceRpm,
    mg1Rpm,
    ringRpm: mode.ringRpm,
    mg2Rpm: sec.mg2Rpm,
    counterRpm: sec.counterRpm,
    wheelRpm: sec.wheelRpm,
    planetLocalRpm: sec.planetLocalRpm,
    speedKmh: sec.speedKmh,
    odometerKm: preserveTrip?.odometerKm ?? 0,
    totalFuelLiters: preserveTrip?.totalFuelLiters ?? 0,
    instantFuelLph: fuelRateLps * 3600,
    socPercent: mode.socPercent,
    iceFuelActive: mode.iceFuelActive,
    iceMinRunTimerSec: mode.iceFuelActive ? 2.5 : 0,
    forcedChargeActive: mode.id === OperationModeId.IDLE_CHARGE,
    gear: mode.gear,
    evModeRequested: mode.id === OperationModeId.EV_DRIVE,
    throttlePercent: mode.hsiValue > 0 ? Math.round(mode.hsiValue * 0.72) : 0,
    brakePercent: mode.hsiValue < 0 ? Math.round(Math.abs(mode.hsiValue) * 0.48) : 0,
    roadGradePercent: mode.id === OperationModeId.B_MODE_DESCENT ? -8 : 0,
    hsiValue: mode.hsiValue,
    hsiZone: mode.hsiZone,
    evIndicatorOn: !mode.iceFuelActive && mode.iceRpm < 50,
    activePhaseTitle: mode.title,
    activePhaseSummary: mode.summary,
    activeModeId: mode.id,
    flows: { ...mode.flows },
    ...splits,
    autoDrive: { ...IDLE_AUTODRIVE_STATUS },
  };
}

function mechToPcuElectrical(mechGenKw: number): number {
  // Positive = generating into PCU (* 0.95 eff); Negative = motoring drawing from PCU (/ 0.95 eff)
  return mechGenKw >= 0 ? mechGenKw * 0.95 : mechGenKw / 0.95;
}

function mg2MechToPcuDemand(mg2MotorKw: number): number {
  // Positive = MG2 motoring drawing from PCU (/ 0.95 eff); Negative = MG2 generating into PCU (* 0.95 eff)
  return mg2MotorKw >= 0 ? mg2MotorKw / 0.95 : mg2MotorKw * 0.95;
}

export function solveManualKinematics(
  current: PowertrainState,
  changed: 'ICE' | 'MG1' | 'WHEEL_MG2',
  newValueRpm: number,
  solveTarget: SolveTarget
): PowertrainState {
  let iceRpm = current.iceRpm;
  let mg1Rpm = current.mg1Rpm;
  let ringRpm = current.ringRpm;

  if (changed === 'ICE') {
    iceRpm = Math.max(-2500, Math.min(PSD_CONSTANTS.ICE_MAX_RPM, newValueRpm));
    if (solveTarget === SolveTarget.WHEEL) {
      ringRpm = solveRingRpm(iceRpm, mg1Rpm);
    } else {
      mg1Rpm = solveMg1Rpm(iceRpm, ringRpm);
    }
  } else if (changed === 'MG1') {
    mg1Rpm = Math.max(-PSD_CONSTANTS.MG1_MAX_RPM, Math.min(PSD_CONSTANTS.MG1_MAX_RPM, newValueRpm));
    if (solveTarget === SolveTarget.ICE) {
      iceRpm = solveIceRpm(mg1Rpm, ringRpm);
    } else {
      ringRpm = solveRingRpm(iceRpm, mg1Rpm);
    }
  } else {
    ringRpm = Math.max(-2200, Math.min(4800, newValueRpm));
    if (solveTarget === SolveTarget.ICE) {
      iceRpm = solveIceRpm(mg1Rpm, ringRpm);
    } else {
      mg1Rpm = solveMg1Rpm(iceRpm, ringRpm);
    }
  }

  mg1Rpm = Math.max(-13500, Math.min(13500, mg1Rpm));
  ringRpm = Math.max(-3000, Math.min(5400, ringRpm));
  if (changed !== 'MG1' && solveTarget === SolveTarget.MG1) {
    mg1Rpm = solveMg1Rpm(iceRpm, ringRpm);
  } else if (changed !== 'WHEEL_MG2' && solveTarget === SolveTarget.WHEEL) {
    ringRpm = solveRingRpm(iceRpm, mg1Rpm);
  } else {
    iceRpm = solveIceRpm(mg1Rpm, ringRpm);
  }

  const sec = deriveSecondarySpeeds(iceRpm, mg1Rpm, ringRpm);
  const iceActive = iceRpm > 400;

  const estRoadLoadKw =
    Math.abs(sec.speedKmh) < 1
      ? 0
      : Math.max(3, 0.075 * Math.abs(sec.speedKmh) + 0.00038 * sec.speedKmh * sec.speedKmh);

  let flows: PowerFlowsKw;
  let phaseTitle = 'Manual Kinematic State';
  let phaseSummary = '';

  if (!iceActive && Math.abs(ringRpm) < 15) {
    flows = {
      iceToCarrierKw: 0,
      carrierToRingKw: 0,
      carrierToSunKw: 0,
      mg1ToPcuKw: 0,
      pcuToMg2Kw: 0,
      batteryToPcuKw: 0,
      mg2ToCounterKw: 0,
      counterToWheelKw: 0,
      frictionBrakeKw: 0,
    };
    phaseTitle = 'Stationary Standby (Manual)';
    phaseSummary = 'All planetary members are near 0 RPM with zero active power transfer.';
  } else if (!iceActive) {
    const evKw = Math.min(PSD_CONSTANTS.MG2_MAX_POWER_KW, estRoadLoadKw);
    flows = {
      iceToCarrierKw: iceRpm < -30 ? -4 : 0,
      carrierToRingKw: 0,
      carrierToSunKw: 0,
      mg1ToPcuKw: 0,
      pcuToMg2Kw: mg2MechToPcuDemand(evKw),
      batteryToPcuKw: mg2MechToPcuDemand(evKw),
      mg2ToCounterKw: evKw,
      counterToWheelKw: evKw,
      frictionBrakeKw: 0,
    };
    if (iceRpm < -25) {
      phaseTitle = 'Hypothetical Reverse ICE (Manual Sandbox)';
      phaseSummary =
        'In a real 4-stroke Toyota hybrid, ICE cannot spin backward; MG1 regulates Sun speed to keep Carrier >= 0 RPM.';
    } else if (ringRpm < -15) {
      phaseTitle = 'Electric Reverse Kinematics (Manual)';
      phaseSummary =
        'MG2 & Ring Gear spin CCW backward while stationary Carrier forces Sun Gear (MG1) to spin CW.';
    } else {
      phaseTitle = 'EV Propulsion Kinematics (Manual)';
      phaseSummary =
        'With ICE Carrier near 0 RPM, forward Ring Gear rotation causes Planet Gears to spin Sun Gear (MG1) in CCW reverse.';
    }
  } else {
    const iceKw = Math.min(
      PSD_CONSTANTS.ICE_MAX_POWER_KW,
      Math.max(9, (iceRpm / PSD_CONSTANTS.ICE_MAX_RPM) * PSD_CONSTANTS.ICE_MAX_POWER_KW)
    );
    const omegaC = (iceRpm * 2 * Math.PI) / 60;
    const omegaS = (mg1Rpm * 2 * Math.PI) / 60;
    const omegaR = (ringRpm * 2 * Math.PI) / 60;
    const torqueCarrierNm = omegaC !== 0 ? (iceKw * 1000) / omegaC : 0;
    const carrierToRingKw = (RING_CARRIER_SHARE * torqueCarrierNm * omegaR) / 1000;
    const carrierToSunKw = (SUN_CARRIER_SHARE * torqueCarrierNm * omegaS) / 1000;
    const mg1ToPcuKw = mechToPcuElectrical(carrierToSunKw);
    const targetWheelKw = Math.abs(ringRpm) < 15 ? 0 : Math.max(estRoadLoadKw, iceKw * 0.85);
    const mg2ToCounterKw =
      Math.abs(ringRpm) < 15
        ? 0
        : Math.max(
            -PSD_CONSTANTS.MG2_MAX_POWER_KW,
            Math.min(PSD_CONSTANTS.MG2_MAX_POWER_KW, targetWheelKw - carrierToRingKw)
          );
    const pcuToMg2Kw = mg2MechToPcuDemand(mg2ToCounterKw);
    const batteryToPcuKw = pcuToMg2Kw - mg1ToPcuKw;

    flows = {
      iceToCarrierKw: iceKw,
      carrierToRingKw,
      carrierToSunKw,
      mg1ToPcuKw,
      pcuToMg2Kw,
      batteryToPcuKw,
      mg2ToCounterKw,
      counterToWheelKw: carrierToRingKw + mg2ToCounterKw,
      frictionBrakeKw: 0,
    };

    if (Math.abs(ringRpm) < 15) {
      phaseTitle = 'Stationary Charging Kinematics (Manual)';
      phaseSummary =
        'Ring Gear is stationary (0 RPM) while ICE drives the Carrier CW, forcing MG1 (Sun) fast CW to generate electricity.';
    } else if (mg1Rpm < -50 && ringRpm > 0) {
      phaseTitle = 'Overdrive Power Circulation (Manual)';
      phaseSummary =
        'Ring Gear outruns Carrier so MG1 spins CCW (< 0 RPM) and acts as a reverse motor fed by slight MG2 generation.';
    } else {
      phaseTitle = 'Hybrid Power-Split Kinematics (Manual)';
      phaseSummary = `Carrier splits ICE torque 72.2% to Ring Gear and 27.8% to MG1 (${Math.round(
        mg1Rpm
      )} RPM).`;
    }
  }

  const splits = computeSplits(iceRpm, sec.mg2Rpm, sec.wheelRpm, iceActive, flows);
  const manualFuelLps = computeFuelRateLitersPerSec(iceActive, iceRpm, flows.iceToCarrierKw);

  return {
    ...current,
    iceRpm,
    mg1Rpm,
    ringRpm,
    mg2Rpm: sec.mg2Rpm,
    counterRpm: sec.counterRpm,
    wheelRpm: sec.wheelRpm,
    planetLocalRpm: sec.planetLocalRpm,
    speedKmh: sec.speedKmh,
    instantFuelLph: manualFuelLps * 3600,
    iceFuelActive: iceActive,
    evIndicatorOn: !iceActive && Math.abs(iceRpm) < 40,
    hsiValue: Math.max(-100, Math.min(100, (flows.counterToWheelKw / 110) * 100)),
    hsiZone: !iceActive
      ? HsiZone.ECO_EV
      : flows.counterToWheelKw > 70
        ? HsiZone.PWR
        : HsiZone.ECO_HYBRID,
    activePhaseTitle: phaseTitle,
    activePhaseSummary: phaseSummary,
    flows,
    ...splits,
    autoDrive: { ...IDLE_AUTODRIVE_STATUS },
  };
}

function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export interface DrivingInputs {
  gear: GearPosition;
  evModeRequested: boolean;
  throttlePercent: number;
  brakePercent: number;
  roadGradePercent: number;
  autoDrive?: AutoDriveStatus;
}

/**
 * Audited 5th-Generation Toyota Hybrid (THS V — 2.0L M20A-FXS 196 hp) Real-Time Control Law
 */
export function stepDrivingSimulation(
  prev: PowertrainState,
  inputs: DrivingInputs,
  dtRaw: number
): PowertrainState {
  const dt = Math.min(dtRaw, 0.05);
  const { gear, evModeRequested, throttlePercent, brakePercent, roadGradePercent } = inputs;
  const autoDrive = inputs.autoDrive ?? IDLE_AUTODRIVE_STATUS;

  const throttle = Math.max(0, Math.min(100, throttlePercent)) / 100;
  const brake = Math.max(0, Math.min(100, brakePercent)) / 100;

  // 5th-Gen 2.0L Prius / Corolla Cross Hybrid kerb + driver mass & aero
  const massKg = 1440;
  const g = 9.81;
  const vPrevMs = prev.speedKmh / 3.6;
  const absVMs = Math.abs(vPrevMs);

  const fAero = 0.5 * 1.225 * 0.27 * 2.16 * vPrevMs * absVMs;
  const fRoll = absVMs > 0.08 ? 0.0098 * massKg * g * Math.sign(vPrevMs) : 0;
  const gradeRad = Math.atan(roadGradePercent / 100);
  const fGrade = massKg * g * Math.sin(gradeRad);

  // Hysteresis-regulated Forced Battery Charging (< 39% start -> >= 47% stop)
  const forcedChargeActive = prev.forcedChargeActive
    ? prev.socPercent < 47.0
    : prev.socPercent < 39.0;

  let iceMinRunTimerSec = Math.max(0, prev.iceMinRunTimerSec - dt);

  let targetIceRpm = 0;
  let iceFuelActive = false;
  let propulsiveForceN = 0;
  let regenPowerKw = 0;
  let frictionBrakeKw = 0;
  let bModeEngineDragKw = 0;
  let phaseTitle = 'Ready / EV Standby';
  let phaseSummary = '';
  let modeId = OperationModeId.STOP;

  // ==========================================================================
  // 1. PARK (P): Mechanical parking pawl locks Ring/Counter/Wheel at 0 RPM;
  //              PCU inverters stay ACTIVE for stationary ICE -> MG1 charging.
  // ==========================================================================
  if (gear === GearPosition.P) {
    const nextVMs = Math.abs(vPrevMs) < 0.4 ? 0 : damp(vPrevMs, 0, 14, dt);
    const speedKmh = nextVMs * 3.6;
    const ringRpm = ringRpmFromKmh(speedKmh);

    const revvingInPark = throttle > 0.05 && !evModeRequested;

    if (forcedChargeActive || revvingInPark) {
      iceFuelActive = true;
      targetIceRpm = revvingInPark ? 1250 + throttle * 1600 : 1300;
      modeId = OperationModeId.IDLE_CHARGE;
      phaseTitle = 'Park (P) · Stationary HV Battery Charging';
      phaseSummary =
        'Parking pawl locks Ring Gear & Wheels at 0 RPM while inverters stay active: ICE spins Carrier CW to drive MG1 as a generator charging the Li-Ion pack.';
    } else {
      iceFuelActive = false;
      targetIceRpm = 0;
      modeId = OperationModeId.STOP;
      phaseTitle = 'Park (P) · Ready EV Standby';
      phaseSummary =
        'Mechanical parking pawl locks final drive at 0 km/h. ICE and motors rest at 0 RPM with HV system Ready.';
    }

    const iceRpm = damp(prev.iceRpm, targetIceRpm, 4.2, dt);
    const cleanIceRpm = Math.abs(iceRpm) < 12 && targetIceRpm === 0 ? 0 : iceRpm;
    const mg1Rpm = solveMg1Rpm(cleanIceRpm, ringRpm);
    const sec = deriveSecondarySpeeds(cleanIceRpm, mg1Rpm, ringRpm);

    const parkGenKw = iceFuelActive ? 10.5 + throttle * 13 : 0;
    const flows: PowerFlowsKw = {
      iceToCarrierKw: parkGenKw,
      carrierToRingKw: 0,
      carrierToSunKw: parkGenKw,
      mg1ToPcuKw: parkGenKw * 0.95,
      pcuToMg2Kw: 0,
      batteryToPcuKw: -parkGenKw * 0.92,
      mg2ToCounterKw: 0,
      counterToWheelKw: 0,
      frictionBrakeKw: 0,
    };

    const socDelta = (-flows.batteryToPcuKw / PSD_CONSTANTS.HV_BATTERY_CAPACITY_KJ) * dt * 100;
    const socPercent = Math.max(24, Math.min(86, prev.socPercent + socDelta));
    const parkFuelLps = computeFuelRateLitersPerSec(iceFuelActive, cleanIceRpm, flows.iceToCarrierKw);
    const odometerKm = prev.odometerKm + (Math.abs(speedKmh) / 3600) * dt;
    const totalFuelLiters = prev.totalFuelLiters + parkFuelLps * dt;
    const splits = computeSplits(cleanIceRpm, sec.mg2Rpm, sec.wheelRpm, iceFuelActive, flows);

    return {
      iceRpm: cleanIceRpm,
      mg1Rpm,
      ringRpm,
      mg2Rpm: sec.mg2Rpm,
      counterRpm: sec.counterRpm,
      wheelRpm: sec.wheelRpm,
      planetLocalRpm: sec.planetLocalRpm,
      speedKmh,
      odometerKm,
      totalFuelLiters,
      instantFuelLph: parkFuelLps * 3600,
      socPercent,
      iceFuelActive,
      iceMinRunTimerSec: 0,
      forcedChargeActive,
      gear,
      evModeRequested,
      throttlePercent,
      brakePercent,
      roadGradePercent,
      hsiValue: damp(prev.hsiValue, iceFuelActive ? 18 : 0, 8, dt),
      hsiZone: iceFuelActive ? HsiZone.ECO_HYBRID : HsiZone.OFF,
      evIndicatorOn: !iceFuelActive,
      activePhaseTitle: phaseTitle,
      activePhaseSummary: phaseSummary,
      activeModeId: modeId,
      flows,
      ...splits,
      autoDrive,
    };
  }

  // ==========================================================================
  // 2. NEUTRAL (N): PCU shuts down MG1/MG2 inverter gates (no regen / no charge)
  // ==========================================================================
  if (gear === GearPosition.N) {
    targetIceRpm = prev.iceFuelActive && prev.iceRpm > 600 ? PSD_CONSTANTS.ICE_IDLE_RPM : 0;
    iceFuelActive = targetIceRpm > 0;
    const brakeForceN = brake * 14500 * (absVMs > 0.05 ? Math.sign(vPrevMs) : 0);
    propulsiveForceN = -brakeForceN;
    frictionBrakeKw = (Math.abs(brakeForceN) * absVMs) / 1000;
    phaseTitle = 'Neutral (N) · Inverter Gate Shutdown';
    phaseSummary =
      'PCU de-energizes MG1 & MG2 inverters. Zero regenerative braking or battery charging occurs in Neutral; only hydraulic friction brakes slow the car.';
    modeId = OperationModeId.STOP;
  } else if (gear === GearPosition.R) {
    // ========================================================================
    // 3. REVERSE (R): Gearless MG2 CCW electric reverse (with ICE gen if low SoC)
    // ========================================================================
    const revThrottle = brake > 0.05 ? 0 : throttle;
    const targetRevForceN = -revThrottle * 4800;
    const brakeForceN =
      brake > 0
        ? brake * 14500 * (absVMs > 0.05 ? Math.sign(vPrevMs) : 0)
        : vPrevMs > 0.2
          ? 2800
          : revThrottle === 0 && vPrevMs > -1.8
            ? -340
            : 0;

    propulsiveForceN = targetRevForceN - brakeForceN;
    if (forcedChargeActive) {
      targetIceRpm = 1320;
      iceFuelActive = true;
    } else {
      targetIceRpm = 0;
      iceFuelActive = false;
    }

    if (brake > 0.05 && vPrevMs < -1.0) {
      regenPowerKw = Math.min(18, (Math.abs(brakeForceN) * absVMs * 0.72) / 1000);
      frictionBrakeKw = Math.max(0, (Math.abs(brakeForceN) * absVMs) / 1000 - regenPowerKw);
    }

    phaseTitle = 'Reverse (R) · MG2 AC Phase Reversal';
    phaseSummary =
      'PCU reverses MG2 AC phase sequence so MG2 & Ring Gear spin CCW backward without a mechanical reverse gear.';
    modeId = OperationModeId.REVERSE_EV;
  } else {
    // ========================================================================
    // 4. FORWARD DRIVE (D / B): Audited 5th-Gen Toyota Hybrid Control Algorithm
    // ========================================================================
    const isBMode = gear === GearPosition.B;
    const effThrottle = brake > 0.04 ? 0 : throttle;

    // Smooth MG2 electric idle creep (~8 km/h on flat ground, like an automatic torque converter)
    const creepForceN =
      effThrottle === 0 && brake === 0 && prev.speedKmh < 8.5 && prev.speedKmh > -1
        ? 450 * (1 - Math.max(0, prev.speedKmh) / 8.5)
        : 0;

    // Audited 5th-Gen Pedal-to-Wheel Power & Torque Curve:
    // - Low-speed tractive force ceiling: ~7,550 N (206 Nm MG2 * 9.78 + Ring share -> 0–100 km/h in ~7.3s!)
    // - Net wheel power ceiling: 136 kW (from 144 kW / 196 hp combined shaft output * 0.945 driveline eff.)
    // - Electronic top-speed governor tapers demand smoothly approaching 180 km/h.
    const govFactor =
      prev.speedKmh > 172 ? Math.max(0, 1 - (prev.speedKmh - 172) / 9) : 1;
    const maxWheelPowerAtSpeedKw = Math.min(136, (7550 * Math.max(3.2, absVMs)) / 1000 + 14);
    const uphillAssistKw =
      roadGradePercent > 0 && effThrottle > 0
        ? (Math.max(0, fGrade) * Math.max(3.2, absVMs) * effThrottle * 0.55) / 1000
        : 0;

    const driverWheelDemandKw =
      effThrottle > 0
        ? Math.min(
            136,
            (Math.pow(effThrottle, 1.32) * maxWheelPowerAtSpeedKw + uphillAssistKw) * govFactor
          )
        : 0;

    // Lift-off & Pedal Regenerative / Cooperative Braking Demand
    const downhillExtraFactor = roadGradePercent < -2 ? Math.abs(roadGradePercent) * 0.018 : 0;
    const liftOffDecelKw =
      effThrottle === 0 && prev.speedKmh > 4
        ? ((isBMode ? 0.27 : 0.08) + downhillExtraFactor * (isBMode ? 1.35 : 0.65)) * prev.speedKmh
        : 0;
    const brakePedalDecelKw =
      brake > 0 && prev.speedKmh > 1.5 ? (brake * 15500 * absVMs) / 1000 : 0;
    const totalBrakingDemandKw = liftOffDecelKw + brakePedalDecelKw;

    // MG1 Overspeed Guard: at > 125 km/h with ICE=0, MG1 exceeds -8,700 RPM; THS V spins ICE >= 1,050 RPM
    const mg1OverspeedGuard = prev.speedKmh > 125;

    // Li-Ion HV Battery Regen Acceptance Ceiling (~38 kW peak, tapering above 74% SoC)
    const maxBatteryRegenAcceptKw =
      prev.socPercent > 82
        ? 4
        : prev.socPercent > 74
          ? 38 * (1 - ((prev.socPercent - 74) / 8) * 0.85)
          : 38;

    // Speed-Dependent Automatic HV EV Power Threshold vs. Console EV Mode Button:
    // - Dedicated EV Mode button: up to 38 kW for urban speeds <= 50 km/h (if SoC >= 36% & throttle < 72%)
    // - Normal HV Auto Mode: 22 kW urban (0–32 km/h) -> 14.5 kW suburban (70 km/h) -> 11.5 kW highway glide (up to 122 km/h)
    const socEvBonus = prev.socPercent > 64 ? 2.5 : prev.socPercent < 44 ? -4.0 : 0;
    let autoHvEvCeilingKw = 22.0;
    if (prev.speedKmh > 32 && prev.speedKmh <= 75) {
      autoHvEvCeilingKw = 22.0 - ((prev.speedKmh - 32) / 43) * 7.5;
    } else if (prev.speedKmh > 75) {
      autoHvEvCeilingKw = 14.5 - Math.min(1, (prev.speedKmh - 75) / 47) * 3.5;
    }
    autoHvEvCeilingKw = Math.max(6.5, autoHvEvCeilingKw + socEvBonus);

    const dedicatedEvActive =
      evModeRequested &&
      prev.socPercent >= 36 &&
      prev.speedKmh <= 50 &&
      effThrottle < 0.72 &&
      !forcedChargeActive;

    const evStartIceThresholdKw = dedicatedEvActive ? 38.0 : autoHvEvCeilingKw;
    // 25% power hysteresis prevents rapid engine start/stop chatter
    const evShutoffIceThresholdKw = evStartIceThresholdKw * 0.76;

    if (totalBrakingDemandKw > 0.5 && effThrottle === 0) {
      iceMinRunTimerSec = 0; // Fuel cuts immediately on braking/lift-off decel!

      if ((isBMode && prev.speedKmh > 12) || (prev.socPercent > 80 && totalBrakingDemandKw > 16 && prev.speedKmh > 25)) {
        iceFuelActive = false;
        const steepDownhillRpm = roadGradePercent < 0 ? Math.abs(roadGradePercent) * 28 : 0;
        targetIceRpm = Math.min(
          4600,
          1350 + prev.speedKmh * 21 + brake * 650 + steepDownhillRpm
        );
        bModeEngineDragKw = Math.min(32, (targetIceRpm / 4200) * 27);
        const remainingForBattery = Math.max(0, totalBrakingDemandKw - bModeEngineDragKw);
        regenPowerKw = Math.min(maxBatteryRegenAcceptKw, remainingForBattery * 0.88);
        frictionBrakeKw = Math.max(0, totalBrakingDemandKw - bModeEngineDragKw - regenPowerKw);
        modeId = OperationModeId.B_MODE_DESCENT;
        phaseTitle = isBMode
          ? 'B-Range · Engine Pumping Brake + Regen'
          : 'High-SoC Engine Pumping Assist + Regen';
        phaseSummary =
          'Fuel is cut to ICE while MG1 uses part of MG2’s regenerated power to spin the engine as an air pump, preventing Li-Ion overcharge on descents.';
      } else {
        iceFuelActive = false;
        targetIceRpm = mg1OverspeedGuard ? 1080 : 0;
        // Cooperative Brake Blending: up to 38 kW pure MG2 regen on light/moderate braking, hydraulic blends smoothly above
        const regenShareFactor = brake > 0.5 ? Math.max(0.35, 1 - (brake - 0.5) * 1.1) : 0.94;
        regenPowerKw =
          prev.speedKmh > 4.5
            ? Math.min(maxBatteryRegenAcceptKw, totalBrakingDemandKw * regenShareFactor)
            : 0;
        frictionBrakeKw = Math.max(0, totalBrakingDemandKw - regenPowerKw);
        modeId = OperationModeId.REGEN_BRAKE;
        phaseTitle = 'Cooperative Regenerative Braking (CHG)';
        phaseSummary = mg1OverspeedGuard
          ? 'MG2 regenerates kinetic energy into the HV battery while unfueled ICE idles at 1,080 RPM to protect MG1 from >125 km/h overspeed.'
          : 'ICE fuel is cut (0 RPM). MG2 regenerates up to 38 kW into the Li-Ion pack while hydraulic brakes blend in for harder stops.';
      }

      const decelForceN = absVMs > 0.3 ? (totalBrakingDemandKw * 1000) / absVMs : brake * 15500;
      propulsiveForceN = -decelForceN * Math.sign(vPrevMs || 1);
    } else if (driverWheelDemandKw === 0 && !forcedChargeActive && !mg1OverspeedGuard) {
      iceFuelActive = false;
      iceMinRunTimerSec = 0;
      targetIceRpm = 0;
      const holdBrakeN = brake > 0 ? brake * 15500 * Math.sign(vPrevMs || 1) : 0;
      propulsiveForceN = creepForceN - holdBrakeN;

      if (Math.abs(prev.speedKmh) < 1.2 && (creepForceN === 0 || brake > 0.15)) {
        modeId = OperationModeId.STOP;
        phaseTitle =
          brake > 0.15 && Math.abs(roadGradePercent) >= 8
            ? 'Hill-Hold Standby · Brakes Engaged'
            : dedicatedEvActive
              ? 'EV Mode Ready · Silent Standby'
              : 'Ready / EV Standby';
        phaseSummary =
          brake > 0.15 && Math.abs(roadGradePercent) >= 8
            ? `Hydraulic hill-hold keeps the vehicle stationary on the ${Math.round(roadGradePercent)}% grade with 0 RPM fuel-free standby.`
            : 'Vehicle stationary in Ready state with 0 RPM fuel-free standby.';
      } else {
        modeId = OperationModeId.EV_DRIVE;
        phaseTitle = 'EV Low-Speed Creep';
        phaseSummary = 'MG2 provides smooth electric creep torque with ICE stationary at 0 RPM.';
      }
    } else if (driverWheelDemandKw === 0 && forcedChargeActive && Math.abs(prev.speedKmh) < 2.5) {
      iceFuelActive = true;
      targetIceRpm = 1300;
      const holdBrakeN = brake > 0 ? brake * 15500 * Math.sign(vPrevMs || 1) : 0;
      propulsiveForceN = creepForceN - holdBrakeN;
      modeId = OperationModeId.IDLE_CHARGE;
      phaseTitle = 'Stationary Low-SoC Battery Charge';
      phaseSummary =
        'HV Battery SoC reached <39%: M20A-FXS starts automatically at 1,300 RPM to recharge the pack up to 47% via MG1.';
    } else {
      const steepClimbRequiresIce = roadGradePercent >= 16 && effThrottle > 0.28;
      const evThreshold = prev.iceFuelActive ? evShutoffIceThresholdKw : evStartIceThresholdKw;
      const keepWarmRunning = prev.iceFuelActive && iceMinRunTimerSec > 0 && driverWheelDemandKw > 3.5;

      const canOperatePureEv =
        driverWheelDemandKw <= evThreshold &&
        !keepWarmRunning &&
        !steepClimbRequiresIce &&
        !mg1OverspeedGuard &&
        !forcedChargeActive &&
        prev.speedKmh <= 122;

      if (canOperatePureEv) {
        iceFuelActive = false;
        targetIceRpm = 0;
        const maxEvForceN = dedicatedEvActive ? 5400 : 4600;
        propulsiveForceN = Math.min(
          maxEvForceN,
          (driverWheelDemandKw * 1000) / Math.max(2.8, absVMs) + creepForceN
        );
        modeId = OperationModeId.EV_DRIVE;
        phaseTitle = dedicatedEvActive
          ? 'Dedicated EV Mode Active (<= 50 km/h)'
          : prev.speedKmh > 72
            ? 'High-Speed EV Glide (Fuel-Cut 0 RPM)'
            : '5th-Gen EV Propulsion Mode';
        phaseSummary =
          prev.speedKmh > 72
            ? 'Light cruising load (<12 kW) allows THS V to shut off fuel completely at highway speed while MG2 sustains velocity and MG1 spins CCW.'
            : 'Li-Ion HV battery drives MG2 directly (100% EV propulsion). ICE stays at 0 RPM while Planet Gears spin MG1 freely in CCW reverse.';
      } else {
        if (!prev.iceFuelActive) {
          iceMinRunTimerSec = 3.2; // Smooth minimum run dwell prevents rapid on/off cycling
        }
        iceFuelActive = true;

        const boostRequested =
          effThrottle > 0.66 ||
          driverWheelDemandKw > 72 ||
          (roadGradePercent >= 18 && effThrottle > 0.38);

        // SoC Regulation Power (+charging when below 56%, -electric assist when high SoC or PWR boost)
        const socChargeBiasKw = forcedChargeActive
          ? 10.5
          : prev.socPercent < 55
            ? (56 - prev.socPercent) * 0.32
            : prev.socPercent > 65
              ? -(prev.socPercent - 62) * 0.25
              : 0;

        const boostBatteryAssistKw = boostRequested
          ? Math.min(
              33,
              prev.socPercent > 32
                ? Math.max(8, (effThrottle - 0.58) * 78 + (driverWheelDemandKw > 95 ? 14 : 0))
                : 0
            )
          : 0;

        const estShaftDemandKw = driverWheelDemandKw / 0.945;
        const targetIcePowerKw = Math.min(
          PSD_CONSTANTS.ICE_MAX_POWER_KW,
          Math.max(10.5, estShaftDemandKw - boostBatteryAssistKw + socChargeBiasKw)
        );

        const estRingRpm = ringRpmFromKmh(prev.speedKmh);
        targetIceRpm = optimalAtkinsonRpmForPower(targetIcePowerKw, estRingRpm);

        // Low-speed launch force capped at realistic 7,550 N (or up to 8,800 N under steep-grade full boost)
        const tractiveCapN = roadGradePercent > 15 ? 8800 : 7550;
        propulsiveForceN = Math.min(
          tractiveCapN,
          (driverWheelDemandKw * 1000) / Math.max(2.6, absVMs)
        );

        const evOverrideNote = evModeRequested
          ? prev.speedKmh > 50
            ? ' (EV Mode switch on standby >50 km/h)'
            : forcedChargeActive
              ? ' (EV Mode paused: <39% SoC charge)'
              : effThrottle >= 0.72 || steepClimbRequiresIce
                ? ' (EV Mode overridden by high load)'
                : ''
          : '';

        if (!prev.iceFuelActive && prev.iceRpm < 950) {
          modeId = OperationModeId.ICE_START;
          phaseTitle = 'In-Motion ICE Start (MG1 Cranking)';
          phaseSummary = `MG1 draws battery power to lift Sun Gear RPM and crank M20A-FXS past 1,000 RPM while MG2 holds smooth road torque${evOverrideNote}.`;
        } else if (boostRequested) {
          modeId = OperationModeId.POWER_BOOST;
          phaseTitle = 'Full-Load Dual Boost (ICE + Li-Ion)';
          phaseSummary = `M20A-FXS revs toward ${Math.round(
            targetIceRpm
          )} RPM while the Li-Ion pack adds electric boost into MG2 (up to 196 hp combined)${evOverrideNote}.`;
        } else {
          const estMg1 = solveMg1Rpm(targetIceRpm, estRingRpm);
          if (estMg1 < -120 && prev.speedKmh > 82) {
            modeId = OperationModeId.HIGHWAY_OVERDRIVE;
            phaseTitle = 'Highway e-CVT Overdrive (Power Circulation)';
            phaseSummary = `Steady cruise at ${Math.round(
              prev.speedKmh
            )} km/h with relaxed ${Math.round(
              targetIceRpm
            )} RPM ICE: MG1 spins CCW (${Math.round(
              estMg1
            )} RPM) as a reverse motor fed by slight MG2 generation.`;
          } else {
            modeId = OperationModeId.NORMAL_SPLIT;
            phaseTitle = 'Optimal Atkinson Power-Split Cruise';
            phaseSummary = `ICE runs on its 41%-efficiency BSFC line (${Math.round(
              targetIceRpm
            )} RPM), splitting torque 72.2% to Ring Gear and 27.8% to MG1${evOverrideNote}.`;
          }
        }
      }
    }
  }

  let netForceN = propulsiveForceN - fAero - fRoll - fGrade;
  if (brake > 0.18 && throttle === 0 && Math.abs(vPrevMs) < 0.45 && brake * 15500 >= Math.abs(fGrade)) {
    netForceN = 0;
  }

  let nextVMs = vPrevMs + (netForceN / massKg) * dt;

  if (brake > 0.18 && Math.abs(nextVMs) < 0.35 && throttle === 0 && brake * 15500 >= Math.abs(fGrade)) {
    nextVMs = 0;
  }
  if (gear !== GearPosition.R && nextVMs < 0 && roadGradePercent >= 0 && roadGradePercent <= 14) {
    nextVMs = 0;
  }
  if (gear === GearPosition.R) {
    nextVMs = Math.max(-35 / 3.6, Math.min(8 / 3.6, nextVMs));
  } else {
    nextVMs = Math.max(-18 / 3.6, Math.min(180 / 3.6, nextVMs));
  }

  const speedKmh = nextVMs * 3.6;
  const ringRpm = ringRpmFromKmh(speedKmh);
  const iceRpm = damp(prev.iceRpm, targetIceRpm, targetIceRpm > prev.iceRpm ? 4.4 : 3.6, dt);
  const cleanIceRpm = Math.abs(iceRpm) < 12 && targetIceRpm === 0 ? 0 : iceRpm;
  const mg1Rpm = solveMg1Rpm(cleanIceRpm, ringRpm);
  const sec = deriveSecondarySpeeds(cleanIceRpm, mg1Rpm, ringRpm);

  const wheelMechPowerKw = (propulsiveForceN * nextVMs) / 1000;
  let flows: PowerFlowsKw;

  if (
    gear === GearPosition.N ||
    (Math.abs(speedKmh) < 0.4 && cleanIceRpm < 50 && frictionBrakeKw < 0.1)
  ) {
    flows = {
      iceToCarrierKw: 0,
      carrierToRingKw: 0,
      carrierToSunKw: 0,
      mg1ToPcuKw: 0,
      pcuToMg2Kw: 0,
      batteryToPcuKw: 0,
      mg2ToCounterKw: 0,
      counterToWheelKw: -frictionBrakeKw,
      frictionBrakeKw,
    };
  } else if (!iceFuelActive && bModeEngineDragKw > 0) {
    const carrierToRingKw = -bModeEngineDragKw * 0.28;
    const carrierToSunKw = -bModeEngineDragKw * 0.72;
    const mg1ToPcuKw = mechToPcuElectrical(carrierToSunKw); // Negative: draws from PCU to spin ICE
    const mg2GenAtPcuKw = regenPowerKw + Math.abs(mg1ToPcuKw);
    const mg2CounterDragKw = -(mg2GenAtPcuKw / 0.95);
    flows = {
      iceToCarrierKw: -bModeEngineDragKw,
      carrierToRingKw,
      carrierToSunKw,
      mg1ToPcuKw,
      pcuToMg2Kw: -mg2GenAtPcuKw,
      batteryToPcuKw: -regenPowerKw,
      mg2ToCounterKw: mg2CounterDragKw,
      counterToWheelKw: -(regenPowerKw + bModeEngineDragKw + frictionBrakeKw),
      frictionBrakeKw,
    };
  } else if (!iceFuelActive) {
    if (regenPowerKw > 0.1 || frictionBrakeKw > 0.1) {
      const mg2CounterRegenKw = -Math.min(PSD_CONSTANTS.MG2_MAX_POWER_KW, regenPowerKw / 0.94);
      const pcuFromMg2Kw = mg2CounterRegenKw * 0.95;
      flows = {
        iceToCarrierKw: 0,
        carrierToRingKw: 0,
        carrierToSunKw: 0,
        mg1ToPcuKw: 0,
        pcuToMg2Kw: pcuFromMg2Kw,
        batteryToPcuKw: pcuFromMg2Kw,
        mg2ToCounterKw: mg2CounterRegenKw,
        counterToWheelKw: mg2CounterRegenKw - frictionBrakeKw,
        frictionBrakeKw,
      };
    } else {
      const evKw = Math.min(PSD_CONSTANTS.MG2_MAX_POWER_KW, Math.max(0, wheelMechPowerKw));
      const pcuDemand = mg2MechToPcuDemand(evKw);
      flows = {
        iceToCarrierKw: 0,
        carrierToRingKw: 0,
        carrierToSunKw: 0,
        mg1ToPcuKw: 0,
        pcuToMg2Kw: pcuDemand,
        batteryToPcuKw: pcuDemand,
        mg2ToCounterKw: evKw,
        counterToWheelKw: evKw,
        frictionBrakeKw,
      };
    }
  } else if (modeId === OperationModeId.ICE_START) {
    const crankKw = 4.6;
    const wheelKw = Math.max(2, wheelMechPowerKw);
    const mg2AssistKw = Math.min(PSD_CONSTANTS.MG2_MAX_POWER_KW, Math.max(0, wheelKw - 4));
    const mg1DrawKw = -crankKw / 0.94;
    const mg2DrawKw = mg2MechToPcuDemand(mg2AssistKw);
    flows = {
      iceToCarrierKw: 2.5,
      carrierToRingKw: 2.5 + crankKw,
      carrierToSunKw: -crankKw,
      mg1ToPcuKw: mg1DrawKw,
      pcuToMg2Kw: mg2DrawKw,
      batteryToPcuKw: mg2DrawKw - mg1DrawKw,
      mg2ToCounterKw: mg2AssistKw,
      counterToWheelKw: wheelKw,
      frictionBrakeKw: 0,
    };
  } else {
    // Active Fueled Hybrid Operation (Normal Split, Highway Overdrive, Dual Boost, Low-Speed Charge)
    const boostExtraBatteryKw =
      modeId === OperationModeId.POWER_BOOST && prev.socPercent > 32
        ? Math.min(33, Math.max(6, (throttle - 0.58) * 78))
        : 0;
    const chargeTargetKw = forcedChargeActive
      ? 10.5
      : prev.socPercent < 55
        ? (56 - prev.socPercent) * 0.32
        : 0;

    // Limit ICE output to realistic M20A-FXS torque envelope at current RPM
    const maxIceKwAtCurrentRpm = Math.min(
      PSD_CONSTANTS.ICE_MAX_POWER_KW,
      (maxIceTorqueAtRpm(cleanIceRpm) * Math.max(1000, cleanIceRpm)) / 9549
    );

    const requestedIceKw =
      Math.max(0, wheelMechPowerKw) / 0.95 - boostExtraBatteryKw + chargeTargetKw;
    const iceKw = Math.min(maxIceKwAtCurrentRpm, Math.max(9.5, requestedIceKw));

    const omegaC = Math.max(60, (cleanIceRpm * 2 * Math.PI) / 60);
    const omegaS = (mg1Rpm * 2 * Math.PI) / 60;
    const omegaR = (ringRpm * 2 * Math.PI) / 60;
    const torqueCarrierNm = (iceKw * 1000) / omegaC;

    const carrierToRingKw = (RING_CARRIER_SHARE * torqueCarrierNm * omegaR) / 1000;
    const carrierToSunKw = (SUN_CARRIER_SHARE * torqueCarrierNm * omegaS) / 1000;
    const mg1ToPcuKw = mechToPcuElectrical(carrierToSunKw);

    // Clamp MG2 output to real 1VM 83 kW / 206 Nm hardware limit & battery 34 kW discharge ceiling
    const rawMg2Kw = Math.max(0, wheelMechPowerKw) - carrierToRingKw;
    const maxMg2FromBattAndMg1 = Math.min(
      PSD_CONSTANTS.MG2_MAX_POWER_KW,
      (mg1ToPcuKw + (prev.socPercent > 30 ? 34 : 6)) * 0.95
    );
    const mg2ToCounterKw = Math.max(
      -PSD_CONSTANTS.MG2_MAX_POWER_KW,
      Math.min(maxMg2FromBattAndMg1, rawMg2Kw)
    );

    const pcuToMg2Kw = mg2MechToPcuDemand(mg2ToCounterKw);
    const batteryToPcuKw = pcuToMg2Kw - mg1ToPcuKw;

    flows = {
      iceToCarrierKw: iceKw,
      carrierToRingKw,
      carrierToSunKw,
      mg1ToPcuKw,
      pcuToMg2Kw,
      batteryToPcuKw,
      mg2ToCounterKw,
      counterToWheelKw: carrierToRingKw + mg2ToCounterKw,
      frictionBrakeKw,
    };
  }

  const socDelta = (-flows.batteryToPcuKw / PSD_CONSTANTS.HV_BATTERY_CAPACITY_KJ) * dt * 100;
  const socPercent = Math.max(24, Math.min(86, prev.socPercent + socDelta));

  let targetHsi = 0;
  let hsiZone = HsiZone.OFF;
  if (gear === GearPosition.N) {
    targetHsi = 0;
    hsiZone = HsiZone.OFF;
  } else if (flows.counterToWheelKw < -0.5 || regenPowerKw > 0.3) {
    const chgRatio = Math.min(1, Math.abs(flows.counterToWheelKw) / 38);
    targetHsi = -chgRatio * 100;
    hsiZone = HsiZone.CHG;
  } else if (!iceFuelActive && cleanIceRpm < 100) {
    const evRefKw = Math.max(12, evModeRequested && speedKmh <= 50 ? 38 : 22);
    const evRatio = Math.min(1, Math.max(0, flows.counterToWheelKw) / evRefKw);
    targetHsi = evRatio * 42;
    hsiZone = targetHsi > 1 ? HsiZone.ECO_EV : HsiZone.OFF;
  } else if (modeId === OperationModeId.POWER_BOOST || throttle > 0.66) {
    const pwrRatio = Math.min(1, Math.max(0, (flows.counterToWheelKw - 65) / 71));
    targetHsi = 72 + pwrRatio * 28;
    hsiZone = HsiZone.PWR;
  } else {
    const ecoRatio = Math.min(1, Math.max(0, flows.iceToCarrierKw) / 68);
    targetHsi = 43 + ecoRatio * 28;
    hsiZone = HsiZone.ECO_HYBRID;
  }

  const hsiValue = damp(prev.hsiValue, targetHsi, 8.0, dt);
  const fuelRateLps = computeFuelRateLitersPerSec(iceFuelActive, cleanIceRpm, flows.iceToCarrierKw);
  const odometerKm = prev.odometerKm + (Math.abs(speedKmh) / 3600) * dt;
  const totalFuelLiters = prev.totalFuelLiters + fuelRateLps * dt;
  const splits = computeSplits(cleanIceRpm, sec.mg2Rpm, sec.wheelRpm, iceFuelActive, flows);

  return {
    iceRpm: cleanIceRpm,
    mg1Rpm,
    ringRpm,
    mg2Rpm: sec.mg2Rpm,
    counterRpm: sec.counterRpm,
    wheelRpm: sec.wheelRpm,
    planetLocalRpm: sec.planetLocalRpm,
    speedKmh,
    odometerKm,
    totalFuelLiters,
    instantFuelLph: fuelRateLps * 3600,
    socPercent,
    iceFuelActive,
    iceMinRunTimerSec,
    forcedChargeActive,
    gear,
    evModeRequested,
    throttlePercent,
    brakePercent,
    roadGradePercent,
    hsiValue,
    hsiZone,
    evIndicatorOn: !iceFuelActive && cleanIceRpm < 80,
    activePhaseTitle: phaseTitle,
    activePhaseSummary: phaseSummary,
    activeModeId: modeId,
    flows,
    ...splits,
    autoDrive,
  };
}
