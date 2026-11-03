import {
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

  ICE_MAX_RPM: 5200,
  ICE_IDLE_RPM: 1150,
  MG1_MAX_RPM: 10500,
  MG2_MAX_RPM: 16500,
} as const;

export const KW_TO_HP = 1.34102;
export const TOTAL_PSD_TEETH = PSD_CONSTANTS.Z_SUN + PSD_CONSTANTS.Z_RING; // 108
export const SUN_CARRIER_SHARE = PSD_CONSTANTS.Z_SUN / TOTAL_PSD_TEETH; // 0.2778
export const RING_CARRIER_SHARE = PSD_CONSTANTS.Z_RING / TOTAL_PSD_TEETH; // 0.7222

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
 * Computes ICE vs EV propulsion split (%, hp, shaft Nm) and Regen vs Mechanical Brake split (%, hp, wheel Nm)
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

  // True shaft torques: ICE crankshaft Nm & MG2 rotor Nm (clamped smoothly near 0 RPM launch)
  const effIceRpm = Math.max(850, Math.abs(iceRpm));
  const iceTorqueNm =
    iceActiveKw > 0.1 ? Math.min(206, (iceActiveKw * 9549) / effIceRpm) : 0;

  const effMg2Rpm = Math.max(480, Math.abs(mg2Rpm));
  const evTorqueNm =
    evPropKw > 0.1 ? Math.min(265, (evPropKw * 9549) / effMg2Rpm) : 0;

  const propulsionSplit: PropulsionSplitMetrics = {
    icePercent,
    evPercent,
    iceHp: iceActiveKw * KW_TO_HP,
    evHp: evPropKw * KW_TO_HP,
    iceTorqueNm,
    evTorqueNm,
  };

  // 2. Braking Split: Regenerative Braking vs Mechanical (Hydraulic Friction + B-Mode Engine Pumping)
  const regenKw = flows.mg2ToCounterKw < -0.1 ? Math.abs(flows.mg2ToCounterKw) : 0;
  const enginePumpDragKw = !iceFuelActive && flows.iceToCarrierKw < -0.1 ? Math.abs(flows.iceToCarrierKw) : 0;
  const mechKw = Math.max(0, flows.frictionBrakeKw) + enginePumpDragKw;
  const sumBrakeKw = regenKw + mechKw;

  const regenPercent = sumBrakeKw > 0.15 ? Math.round((regenKw / sumBrakeKw) * 100) : 0;
  const mechPercent = sumBrakeKw > 0.15 ? 100 - regenPercent : 0;

  const effWheelRpm = Math.max(45, Math.abs(wheelRpm));
  const regenTorqueNm = regenKw > 0.1 ? Math.min(1800, (regenKw * 9549) / effWheelRpm) : 0;
  const mechTorqueNm = mechKw > 0.1 ? Math.min(2600, (mechKw * 9549) / effWheelRpm) : 0;

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
    socPercent: 64,
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
      'Ring Gear and Wheels are held at 0 RPM. ICE spins the Carrier CW (1,300 RPM), driving Sun Gear (MG1) fast CW (+4,680 RPM) to charge the Li-Ion battery.',
    iceRpm: 1300,
    ringRpm: 0,
    iceFuelActive: true,
    gear: GearPosition.P,
    socPercent: 34,
    hsiValue: 18,
    hsiZone: HsiZone.ECO_HYBRID,
    flows: {
      iceToCarrierKw: 12.5,
      carrierToRingKw: 0,
      carrierToSunKw: 12.5,
      mg1ToPcuKw: 11.6,
      pcuToMg2Kw: 0,
      batteryToPcuKw: -11.2,
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
      'HV Battery powers MG2 to drive the Ring Gear and Wheels forward. ICE Carrier stays at 0 RPM while Planet Gears spin Sun Gear (MG1) freely in CCW reverse.',
    iceRpm: 0,
    ringRpm: 1150,
    iceFuelActive: false,
    gear: GearPosition.D,
    socPercent: 72,
    hsiValue: 32,
    hsiZone: HsiZone.ECO_EV,
    flows: {
      iceToCarrierKw: 0,
      carrierToRingKw: 0,
      carrierToSunKw: 0,
      mg1ToPcuKw: 0,
      pcuToMg2Kw: 16.4,
      batteryToPcuKw: 17.2,
      mg2ToCounterKw: 15.6,
      counterToWheelKw: 15.6,
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
    iceRpm: 1050,
    ringRpm: 1250,
    iceFuelActive: true,
    gear: GearPosition.D,
    socPercent: 58,
    hsiValue: 48,
    hsiZone: HsiZone.ECO_HYBRID,
    flows: {
      iceToCarrierKw: 4.0,
      carrierToRingKw: 8.5,
      carrierToSunKw: -4.5,
      mg1ToPcuKw: -4.9,
      pcuToMg2Kw: 14.2,
      batteryToPcuKw: 19.6,
      mg2ToCounterKw: 13.5,
      counterToWheelKw: 22.0,
      frictionBrakeKw: 0,
    },
  },
  {
    id: OperationModeId.NORMAL_SPLIT,
    shortLabel: 'Normal Split',
    title: 'Optimal Atkinson Power-Split Cruise',
    phaseBadge: '72% MECH · 28% ELEC',
    summary:
      'PSD splits ICE torque 72.2% mechanically to the Ring Gear and 27.8% to the Sun Gear (MG1), which generates electricity for MG2 and charges the battery.',
    iceRpm: 1850,
    ringRpm: 1720,
    iceFuelActive: true,
    gear: GearPosition.D,
    socPercent: 60,
    hsiValue: 56,
    hsiZone: HsiZone.ECO_HYBRID,
    flows: {
      iceToCarrierKw: 28.0,
      carrierToRingKw: 18.8,
      carrierToSunKw: 9.2,
      mg1ToPcuKw: 8.6,
      pcuToMg2Kw: 5.8,
      batteryToPcuKw: -2.6,
      mg2ToCounterKw: 5.5,
      counterToWheelKw: 24.3,
      frictionBrakeKw: 0,
    },
  },
  {
    id: OperationModeId.POWER_BOOST,
    shortLabel: 'Power Boost',
    title: 'Full-Load Dual Boost (ICE + Li-Ion)',
    phaseBadge: 'ICE + LI-ION BOOST',
    summary:
      'ICE runs at high output (4,200 RPM) driving Ring Gear + MG1 generator, while the Li-Ion HV battery discharges extra boost power into MG2 for peak acceleration.',
    iceRpm: 4200,
    ringRpm: 2450,
    iceFuelActive: true,
    gear: GearPosition.D,
    socPercent: 66,
    hsiValue: 92,
    hsiZone: HsiZone.PWR,
    flows: {
      iceToCarrierKw: 96.0,
      carrierToRingKw: 40.4,
      carrierToSunKw: 55.6,
      mg1ToPcuKw: 52.8,
      pcuToMg2Kw: 84.0,
      batteryToPcuKw: 33.2,
      mg2ToCounterKw: 80.2,
      counterToWheelKw: 120.6,
      frictionBrakeKw: 0,
    },
  },
  {
    id: OperationModeId.HIGHWAY_OVERDRIVE,
    shortLabel: 'Overdrive',
    title: 'Highway e-CVT Overdrive (Power Circulation)',
    phaseBadge: 'OVERDRIVE',
    summary:
      'At high cruise speed (~128 km/h) with low ICE RPM (1,950 RPM), Sun Gear (MG1) spins CCW (< 0 RPM) as a reverse motor powered by slight MG2 generation.',
    iceRpm: 1950,
    ringRpm: 3420,
    iceFuelActive: true,
    gear: GearPosition.D,
    socPercent: 63,
    hsiValue: 61,
    hsiZone: HsiZone.ECO_HYBRID,
    flows: {
      iceToCarrierKw: 34.0,
      carrierToRingKw: 43.1,
      carrierToSunKw: -9.1,
      mg1ToPcuKw: -9.6,
      pcuToMg2Kw: -9.8,
      batteryToPcuKw: -0.2,
      mg2ToCounterKw: -10.3,
      counterToWheelKw: 32.8,
      frictionBrakeKw: 0,
    },
  },
  {
    id: OperationModeId.REGEN_BRAKE,
    shortLabel: 'Regen Brake',
    title: 'Cooperative Regenerative Braking (CHG)',
    phaseBadge: 'KINETIC RECOVERY',
    summary:
      'Fuel is cut to ICE (0 RPM Carrier). Wheel momentum drives MG2 as a generator to recharge the HV battery, blended seamlessly with hydraulic friction brakes.',
    iceRpm: 0,
    ringRpm: 1580,
    iceFuelActive: false,
    gear: GearPosition.D,
    socPercent: 55,
    hsiValue: -68,
    hsiZone: HsiZone.CHG,
    flows: {
      iceToCarrierKw: 0,
      carrierToRingKw: 0,
      carrierToSunKw: 0,
      mg1ToPcuKw: 0,
      pcuToMg2Kw: -29.5,
      batteryToPcuKw: -28.0,
      mg2ToCounterKw: -31.2,
      counterToWheelKw: -31.2,
      frictionBrakeKw: 3.5,
    },
  },
  {
    id: OperationModeId.B_MODE_DESCENT,
    shortLabel: 'B-Mode Brake',
    title: 'B-Range Downhill Engine Pumping Brake',
    phaseBadge: 'B-RANGE · FUEL CUT',
    summary:
      'On descents in B range, MG2 regenerates braking power and routes part to MG1, which spins the fuel-cut ICE (2,950 RPM) as an air pump to prevent battery overcharge.',
    iceRpm: 2950,
    ringRpm: 1680,
    iceFuelActive: false,
    gear: GearPosition.B,
    socPercent: 86,
    hsiValue: -88,
    hsiZone: HsiZone.CHG,
    flows: {
      iceToCarrierKw: -16.5,
      carrierToRingKw: -5.2,
      carrierToSunKw: -11.3,
      mg1ToPcuKw: -12.1,
      pcuToMg2Kw: -24.5,
      batteryToPcuKw: -11.6,
      mg2ToCounterKw: -26.0,
      counterToWheelKw: -31.2,
      frictionBrakeKw: 0,
    },
  },
  {
    id: OperationModeId.REVERSE_EV,
    shortLabel: 'Reverse EV',
    title: 'Gearless Electric Reverse Propulsion',
    phaseBadge: 'REVERSE · MG2 CCW',
    summary:
      'PCU reverses AC phase sequence so MG2 spins CCW, driving the Countershaft CW and Ring Gear/Wheels backward (-19 km/h) while ICE stays at 0 RPM.',
    iceRpm: 0,
    ringRpm: -510,
    iceFuelActive: false,
    gear: GearPosition.R,
    socPercent: 68,
    hsiValue: 26,
    hsiZone: HsiZone.ECO_EV,
    flows: {
      iceToCarrierKw: 0,
      carrierToRingKw: 0,
      carrierToSunKw: 0,
      mg1ToPcuKw: 0,
      pcuToMg2Kw: 9.8,
      batteryToPcuKw: 10.4,
      mg2ToCounterKw: 9.2,
      counterToWheelKw: 9.2,
      frictionBrakeKw: 0,
    },
  },
];

export function buildStateFromMode(mode: OperationModeSpec): PowertrainState {
  const mg1Rpm = solveMg1Rpm(mode.iceRpm, mode.ringRpm);
  const sec = deriveSecondarySpeeds(mode.iceRpm, mg1Rpm, mode.ringRpm);
  const splits = computeSplits(mode.iceRpm, sec.mg2Rpm, sec.wheelRpm, mode.iceFuelActive, mode.flows);

  return {
    iceRpm: mode.iceRpm,
    mg1Rpm,
    ringRpm: mode.ringRpm,
    mg2Rpm: sec.mg2Rpm,
    counterRpm: sec.counterRpm,
    wheelRpm: sec.wheelRpm,
    planetLocalRpm: sec.planetLocalRpm,
    speedKmh: sec.speedKmh,
    socPercent: mode.socPercent,
    iceFuelActive: mode.iceFuelActive,
    gear: mode.gear,
    evModeRequested: mode.id === OperationModeId.EV_DRIVE,
    throttlePercent: mode.hsiValue > 0 ? Math.round(mode.hsiValue * 0.75) : 0,
    brakePercent: mode.hsiValue < 0 ? Math.round(Math.abs(mode.hsiValue) * 0.5) : 0,
    roadGradePercent: mode.id === OperationModeId.B_MODE_DESCENT ? -7 : 0,
    hsiValue: mode.hsiValue,
    hsiZone: mode.hsiZone,
    evIndicatorOn: !mode.iceFuelActive && mode.iceRpm < 50,
    activePhaseTitle: mode.title,
    activePhaseSummary: mode.summary,
    activeModeId: mode.id,
    flows: { ...mode.flows },
    ...splits,
  };
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
      : Math.max(3, 0.08 * Math.abs(sec.speedKmh) + 0.00042 * sec.speedKmh * sec.speedKmh);

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
    const evKw = Math.min(45, estRoadLoadKw);
    flows = {
      iceToCarrierKw: iceRpm < -30 ? -4 : 0,
      carrierToRingKw: 0,
      carrierToSunKw: 0,
      mg1ToPcuKw: 0,
      pcuToMg2Kw: evKw,
      batteryToPcuKw: evKw * 1.05,
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
    const iceKw = Math.min(95, Math.max(8, (iceRpm / 5200) * 88));
    const omegaC = (iceRpm * 2 * Math.PI) / 60;
    const omegaS = (mg1Rpm * 2 * Math.PI) / 60;
    const omegaR = (ringRpm * 2 * Math.PI) / 60;
    const torqueCarrierNm = omegaC !== 0 ? (iceKw * 1000) / omegaC : 0;
    const carrierToRingKw = (RING_CARRIER_SHARE * torqueCarrierNm * omegaR) / 1000;
    const carrierToSunKw = (SUN_CARRIER_SHARE * torqueCarrierNm * omegaS) / 1000;
    const mg1ToPcuKw = carrierToSunKw * 0.95;
    const targetWheelKw = Math.abs(ringRpm) < 15 ? 0 : Math.max(estRoadLoadKw, iceKw * 0.82);
    const mg2ToCounterKw = Math.abs(ringRpm) < 15 ? 0 : targetWheelKw - carrierToRingKw;
    const pcuToMg2Kw = mg2ToCounterKw * 1.04;
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
    iceFuelActive: iceActive,
    evIndicatorOn: !iceActive && Math.abs(iceRpm) < 40,
    hsiValue: Math.max(-100, Math.min(100, (flows.counterToWheelKw / 95) * 100)),
    hsiZone: !iceActive ? HsiZone.ECO_EV : flows.counterToWheelKw > 55 ? HsiZone.PWR : HsiZone.ECO_HYBRID,
    activePhaseTitle: phaseTitle,
    activePhaseSummary: phaseSummary,
    flows,
    ...splits,
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
}

export function stepDrivingSimulation(
  prev: PowertrainState,
  inputs: DrivingInputs,
  dtRaw: number
): PowertrainState {
  const dt = Math.min(dtRaw, 0.05);
  const { gear, evModeRequested, throttlePercent, brakePercent, roadGradePercent } = inputs;

  const throttle = Math.max(0, Math.min(100, throttlePercent)) / 100;
  const brake = Math.max(0, Math.min(100, brakePercent)) / 100;

  const massKg = 1460;
  const g = 9.81;
  const vPrevMs = prev.speedKmh / 3.6;
  const absVMs = Math.abs(vPrevMs);

  const fAero = 0.5 * 1.225 * 0.27 * 2.18 * vPrevMs * absVMs;
  const fRoll = absVMs > 0.08 ? 0.011 * massKg * g * Math.sign(vPrevMs) : 0;
  const gradeRad = Math.atan(roadGradePercent / 100);
  const fGrade = massKg * g * Math.sin(gradeRad);

  let targetIceRpm = 0;
  let iceFuelActive = false;
  let propulsiveForceN = 0;
  let regenPowerKw = 0;
  let frictionBrakeKw = 0;
  let bModeEngineDragKw = 0;
  let phaseTitle = 'Ready / EV Standby';
  let phaseSummary = '';
  let modeId = OperationModeId.STOP;

  const maxSystemPowerKw = 144;
  // EV Mode switch raises electric power threshold from 29 kW up to 52 kW (if SoC >= 28% and throttle < 78% kickdown)
  const baseEvThreshold = prev.socPercent > 35 ? 29 : 12;
  const maxEvPowerKw =
    evModeRequested && prev.socPercent >= 28 && throttle < 0.78 ? 52 : baseEvThreshold;

  // ==========================================================================
  // PARK (P): Mechanical parking pawl locks Ring/Counter/Wheel at 0 RPM!
  //           Inverters stay ACTIVE so ICE can charge HV battery in Park!
  // ==========================================================================
  if (gear === GearPosition.P) {
    const nextVMs = Math.abs(vPrevMs) < 0.4 ? 0 : damp(vPrevMs, 0, 12, dt);
    const speedKmh = nextVMs * 3.6;
    const ringRpm = ringRpmFromKmh(speedKmh);

    const needsParkCharge = prev.socPercent < 35 || (prev.socPercent < 44 && prev.iceFuelActive);
    const revvingInPark = throttle > 0.05 && !evModeRequested;

    if (needsParkCharge || revvingInPark) {
      iceFuelActive = true;
      targetIceRpm = revvingInPark ? 1250 + throttle * 1650 : 1300;
      modeId = OperationModeId.IDLE_CHARGE;
      phaseTitle = 'Park (P) · Stationary HV Battery Charging';
      phaseSummary =
        'Parking pawl locks Ring Gear & Wheels at 0 RPM while inverters stay active: ICE spins Carrier CW to drive MG1 as a generator charging the battery.';
    } else {
      iceFuelActive = false;
      targetIceRpm = 0;
      modeId = OperationModeId.STOP;
      phaseTitle = 'Park (P) · Ready EV Standby';
      phaseSummary =
        'Mechanical parking pawl locks final drive at 0 km/h. ICE and motors rest at 0 RPM with HV system Ready.';
    }

    const iceRpm = damp(prev.iceRpm, targetIceRpm, 4.0, dt);
    const cleanIceRpm = Math.abs(iceRpm) < 12 && targetIceRpm === 0 ? 0 : iceRpm;
    const mg1Rpm = solveMg1Rpm(cleanIceRpm, ringRpm);
    const sec = deriveSecondarySpeeds(cleanIceRpm, mg1Rpm, ringRpm);

    const parkGenKw = iceFuelActive ? 10.5 + throttle * 14 : 0;
    const flows: PowerFlowsKw = {
      iceToCarrierKw: parkGenKw,
      carrierToRingKw: 0,
      carrierToSunKw: parkGenKw,
      mg1ToPcuKw: parkGenKw * 0.94,
      pcuToMg2Kw: 0,
      batteryToPcuKw: -parkGenKw * 0.91,
      mg2ToCounterKw: 0,
      counterToWheelKw: 0,
      frictionBrakeKw: 0,
    };

    const socDelta = (-flows.batteryToPcuKw / 1350) * dt * 100;
    const socPercent = Math.max(22, Math.min(92, prev.socPercent + socDelta));
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
      socPercent,
      iceFuelActive,
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
    };
  }

  if (gear === GearPosition.N) {
    targetIceRpm = prev.iceFuelActive && prev.iceRpm > 600 ? PSD_CONSTANTS.ICE_IDLE_RPM : 0;
    iceFuelActive = targetIceRpm > 0;
    const brakeForceN = brake * 9500 * (absVMs > 0.05 ? Math.sign(vPrevMs) : 0);
    propulsiveForceN = -brakeForceN;
    frictionBrakeKw = (Math.abs(brakeForceN) * absVMs) / 1000;
    phaseTitle = 'Neutral (N) · Inverter Shutdown';
    phaseSummary =
      'PCU opens MG1 and MG2 inverter gates. Zero regenerative braking or battery charging can occur in Neutral; only mechanical friction brakes slow the car.';
    modeId = OperationModeId.STOP;
  } else if (gear === GearPosition.R) {
    const revThrottle = brake > 0.05 ? 0 : throttle;
    const targetRevForceN = -revThrottle * 4600;
    const brakeForceN =
      brake > 0
        ? brake * 9500 * (absVMs > 0.05 ? Math.sign(vPrevMs) : 0)
        : vPrevMs > 0.2
          ? 2800
          : revThrottle === 0 && vPrevMs > -1.8
            ? -320
            : 0;

    propulsiveForceN = targetRevForceN - brakeForceN;
    if (prev.socPercent < 28) {
      targetIceRpm = 1350;
      iceFuelActive = true;
    } else {
      targetIceRpm = 0;
      iceFuelActive = false;
    }

    if (brake > 0.05 && vPrevMs < -1.0) {
      regenPowerKw = Math.min(16, (Math.abs(brakeForceN) * absVMs * 0.65) / 1000);
      frictionBrakeKw = Math.max(0, (Math.abs(brakeForceN) * absVMs) / 1000 - regenPowerKw);
    }

    phaseTitle = 'Reverse (R) · MG2 Phase Reversal';
    phaseSummary =
      'PCU reverses MG2 AC phase sequence so MG2 & Ring Gear spin CCW backward without any mechanical reverse gear.';
    modeId = OperationModeId.REVERSE_EV;
  } else {
    // D or B
    const isBMode = gear === GearPosition.B;
    const effThrottle = brake > 0.04 ? 0 : throttle;

    const creepForceN =
      effThrottle === 0 && brake === 0 && prev.speedKmh < 8.5 && prev.speedKmh > -1
        ? 460 * (1 - Math.max(0, prev.speedKmh) / 8.5)
        : 0;

    const speedFactor = Math.max(4.5, absVMs);
    const uphillLoadKw =
      roadGradePercent > 0 && effThrottle > 0
        ? (Math.max(0, fGrade) * speedFactor * effThrottle) / 1000
        : 0;
    const driverDemandKw =
      effThrottle > 0
        ? Math.min(
            maxSystemPowerKw,
            Math.pow(effThrottle, 1.25) * Math.min(maxSystemPowerKw, (6400 * speedFactor) / 1000 + 34) +
              uphillLoadKw * 0.65
          )
        : 0;

    // Include steep downhill coasting regen when roadGradePercent < 0
    const downhillExtraFactor = roadGradePercent < -2 ? Math.abs(roadGradePercent) * 0.018 : 0;
    const liftOffDecelKw =
      effThrottle === 0 && prev.speedKmh > 4
        ? ((isBMode ? 0.28 : 0.085) + downhillExtraFactor * (isBMode ? 1.35 : 0.65)) * prev.speedKmh
        : 0;
    const brakePedalDecelKw =
      brake > 0 && prev.speedKmh > 1.5 ? (brake * 15500 * absVMs) / 1000 : 0;
    const totalBrakingDemandKw = liftOffDecelKw + brakePedalDecelKw;

    const mg1OverspeedGuard = prev.speedKmh > 112;
    const lowSocChargeReqKw =
      prev.socPercent < 30 ? 11 : prev.socPercent < 37 && prev.iceFuelActive ? 7 : 0;

    if (totalBrakingDemandKw > 0.5 && effThrottle === 0) {
      const maxBatteryAcceptKw = prev.socPercent > 88 ? 6 : prev.socPercent > 80 ? 20 : 44;

      if (isBMode && prev.speedKmh > 10) {
        iceFuelActive = false;
        const steepDownhillRpm = roadGradePercent < 0 ? Math.abs(roadGradePercent) * 28 : 0;
        targetIceRpm = Math.min(
          4600,
          1350 + prev.speedKmh * 22 + brake * 650 + steepDownhillRpm
        );
        bModeEngineDragKw = Math.min(34, (targetIceRpm / 4200) * 29);
        const remainingForBattery = Math.max(0, totalBrakingDemandKw - bModeEngineDragKw);
        regenPowerKw = Math.min(maxBatteryAcceptKw, remainingForBattery * 0.85);
        frictionBrakeKw = Math.max(0, totalBrakingDemandKw - bModeEngineDragKw - regenPowerKw);
        modeId = OperationModeId.B_MODE_DESCENT;
        phaseTitle = 'B-Range · Engine Pumping Brake + Regen';
        phaseSummary =
          'Fuel is cut to ICE while MG1 uses part of MG2’s regenerated power to spin the engine as an air pump, preventing battery overcharge on steep descents.';
      } else {
        iceFuelActive = false;
        targetIceRpm = mg1OverspeedGuard ? 1100 : 0;
        const regenShareFactor = brake > 0.48 ? Math.max(0.32, 1 - (brake - 0.48) * 1.15) : 0.92;
        const coopRegenCap = Math.min(maxBatteryAcceptKw, 44);
        regenPowerKw =
          prev.speedKmh > 4
            ? Math.min(coopRegenCap, totalBrakingDemandKw * regenShareFactor)
            : 0;
        frictionBrakeKw = Math.max(0, totalBrakingDemandKw - regenPowerKw);
        modeId = OperationModeId.REGEN_BRAKE;
        phaseTitle = 'Cooperative Regenerative Braking (CHG)';
        phaseSummary =
          'ICE fuel is cut (0 RPM). MG2 regenerates kinetic energy into the Li-Ion battery while hydraulic mechanical brakes blend in for stronger stops.';
      }

      const decelForceN = absVMs > 0.3 ? (totalBrakingDemandKw * 1000) / absVMs : brake * 15500;
      propulsiveForceN = -decelForceN * Math.sign(vPrevMs || 1);
    } else if (driverDemandKw === 0 && lowSocChargeReqKw === 0 && !mg1OverspeedGuard) {
      iceFuelActive = false;
      targetIceRpm = 0;
      // Hill-Start Assist holds stationary when brake pressed; extreme unbraked grade can overpower light EV creep
      const holdBrakeN = brake > 0 ? brake * 15500 * Math.sign(vPrevMs || 1) : 0;
      propulsiveForceN = creepForceN - holdBrakeN;
      if (Math.abs(prev.speedKmh) < 1.2 && (creepForceN === 0 || brake > 0.15)) {
        modeId = OperationModeId.STOP;
        phaseTitle =
          brake > 0.15 && Math.abs(roadGradePercent) >= 8
            ? 'Hill-Hold Standby · Brakes Engaged'
            : evModeRequested
              ? 'EV Mode Ready · Standby'
              : 'Ready / EV Standby';
        phaseSummary =
          brake > 0.15 && Math.abs(roadGradePercent) >= 8
            ? `Hydraulic hill-hold keeps the vehicle stationary on the ${Math.round(roadGradePercent)}% grade with 0 RPM fuel-free standby.`
            : 'Vehicle stationary in Ready state with 0 RPM fuel-free standby.';
      } else {
        modeId = OperationModeId.EV_DRIVE;
        phaseTitle = 'EV Low-Speed Creep';
        phaseSummary = 'MG2 provides smooth electric torque with ICE stationary at 0 RPM.';
      }
    } else if (driverDemandKw === 0 && lowSocChargeReqKw > 0 && Math.abs(prev.speedKmh) < 2.5) {
      iceFuelActive = true;
      targetIceRpm = 1300;
      propulsiveForceN = 0;
      modeId = OperationModeId.IDLE_CHARGE;
      phaseTitle = 'Stationary HV Battery Charge';
      phaseSummary =
        'Low HV Battery SoC starts ICE at 1,300 RPM, spinning MG1 CW to recharge the Li-Ion pack.';
    } else {
      const evCeilingKw = prev.iceFuelActive ? maxEvPowerKw * 0.72 : maxEvPowerKw;
      const steepClimbRequiresIce = roadGradePercent >= 18 && effThrottle > 0.32;
      const canStayEv =
        driverDemandKw <= evCeilingKw &&
        !steepClimbRequiresIce &&
        !mg1OverspeedGuard &&
        lowSocChargeReqKw === 0 &&
        prev.speedKmh < 112;

      if (canStayEv) {
        iceFuelActive = false;
        targetIceRpm = 0;
        propulsiveForceN = Math.min(6400, (driverDemandKw * 1000) / speedFactor + creepForceN);
        modeId = OperationModeId.EV_DRIVE;
        phaseTitle = evModeRequested
          ? 'Dedicated EV Mode Active (100% Electric)'
          : '5th-Gen EV Propulsion Mode';
        phaseSummary =
          'Li-Ion HV battery drives MG2 directly (100% EV propulsion). ICE stays at 0 RPM while Planet Gears spin MG1 freely in CCW reverse.';
      } else {
        iceFuelActive = true;
        const boostRequested =
          effThrottle > 0.65 || driverDemandKw > 65 || (roadGradePercent >= 20 && effThrottle > 0.4);
        const targetIcePowerKw = boostRequested
          ? Math.min(112, driverDemandKw * 0.76 + lowSocChargeReqKw)
          : Math.min(98, Math.max(14, driverDemandKw + lowSocChargeReqKw));

        targetIceRpm = Math.min(
          PSD_CONSTANTS.ICE_MAX_RPM,
          Math.max(1250, 1180 + (targetIcePowerKw / 112) * 4020)
        );

        // 5th-gen MG2 (9.78:1) + Ring (3.18:1) delivers up to ~9,600 N low-speed climb tractive effort
        propulsiveForceN = Math.min(9600, (driverDemandKw * 1000) / speedFactor);

        const evOverrideNote = evModeRequested
          ? mg1OverspeedGuard
            ? ' (EV Mode overridden above 112 km/h to protect MG1 speed)'
            : lowSocChargeReqKw > 0
              ? ' (EV Mode paused: low SoC requires engine charging)'
              : steepClimbRequiresIce
                ? ` (EV Mode overridden by steep +${Math.round(roadGradePercent)}% climb load)`
                : ' (EV Mode overridden by high throttle demand)'
          : '';

        if (!prev.iceFuelActive && prev.iceRpm < 950) {
          modeId = OperationModeId.ICE_START;
          phaseTitle = 'In-Motion ICE Start (MG1 Cranking)';
          phaseSummary = `MG1 draws battery power to pull Sun Gear upward and crank ICE past 1,000 RPM while MG2 holds smooth road torque${evOverrideNote}.`;
        } else if (boostRequested) {
          modeId = OperationModeId.POWER_BOOST;
          phaseTitle = 'Full-Load Dual Boost (ICE + Li-Ion)';
          phaseSummary = `ICE delivers high mechanical & MG1 power while the Li-Ion battery adds peak electric boost into MG2${evOverrideNote}.`;
        } else {
          const estRing = ringRpmFromKmh(prev.speedKmh);
          const estMg1 = solveMg1Rpm(targetIceRpm, estRing);
          if (estMg1 < -150 && prev.speedKmh > 92) {
            modeId = OperationModeId.HIGHWAY_OVERDRIVE;
            phaseTitle = 'Highway e-CVT Overdrive (Power Circulation)';
            phaseSummary =
              'At high speed with low ICE RPM, MG1 spins CCW (< 0 RPM) as a reverse motor powered by slight MG2 generation.';
          } else {
            modeId = OperationModeId.NORMAL_SPLIT;
            phaseTitle = 'Optimal Atkinson Power-Split Cruise';
            phaseSummary = `ICE torque splits 72.2% mechanically to the Ring Gear and 27.8% to MG1 to power MG2 and balance battery SoC${evOverrideNote}.`;
          }
        }
      }
    }
  }

  let netForceN = propulsiveForceN - fAero - fRoll - fGrade;
  // Static hill-hold when brake is firmly pressed near 0 km/h even on extreme ±50% incline
  if (brake > 0.18 && throttle === 0 && Math.abs(vPrevMs) < 0.45 && brake * 15500 >= Math.abs(fGrade)) {
    netForceN = 0;
  }

  let nextVMs = vPrevMs + (netForceN / massKg) * dt;

  if (brake > 0.18 && Math.abs(nextVMs) < 0.35 && throttle === 0 && brake * 15500 >= Math.abs(fGrade)) {
    nextVMs = 0;
  }
  // Electronic anti-rollback holds up to +14% grade with 0 brake; steeper extreme climbs allow realistic rollback if unbraked
  if (gear !== GearPosition.R && nextVMs < 0 && roadGradePercent >= 0 && roadGradePercent <= 14) {
    nextVMs = 0;
  }
  if (gear === GearPosition.R) {
    nextVMs = Math.max(-35 / 3.6, Math.min(8 / 3.6, nextVMs));
  } else {
    nextVMs = Math.max(-18 / 3.6, Math.min(185 / 3.6, nextVMs));
  }

  const speedKmh = nextVMs * 3.6;
  const ringRpm = ringRpmFromKmh(speedKmh);
  const iceRpm = damp(prev.iceRpm, targetIceRpm, targetIceRpm > prev.iceRpm ? 4.2 : 3.4, dt);
  const cleanIceRpm = Math.abs(iceRpm) < 12 && targetIceRpm === 0 ? 0 : iceRpm;
  const mg1Rpm = solveMg1Rpm(cleanIceRpm, ringRpm);
  const sec = deriveSecondarySpeeds(cleanIceRpm, mg1Rpm, ringRpm);

  const wheelMechPowerKw = (propulsiveForceN * nextVMs) / 1000;
  let flows: PowerFlowsKw;

  if (gear === GearPosition.N || (Math.abs(speedKmh) < 0.4 && cleanIceRpm < 50 && frictionBrakeKw < 0.1)) {
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
    const mg1ToPcuKw = carrierToSunKw * 1.05;
    const mg2GenKw = regenPowerKw + Math.abs(mg1ToPcuKw);
    flows = {
      iceToCarrierKw: -bModeEngineDragKw,
      carrierToRingKw,
      carrierToSunKw,
      mg1ToPcuKw,
      pcuToMg2Kw: -mg2GenKw,
      batteryToPcuKw: -regenPowerKw,
      mg2ToCounterKw: -mg2GenKw * 1.04,
      counterToWheelKw: -(regenPowerKw + bModeEngineDragKw + frictionBrakeKw),
      frictionBrakeKw,
    };
  } else if (!iceFuelActive) {
    if (regenPowerKw > 0.1 || frictionBrakeKw > 0.1) {
      flows = {
        iceToCarrierKw: 0,
        carrierToRingKw: 0,
        carrierToSunKw: 0,
        mg1ToPcuKw: 0,
        pcuToMg2Kw: -regenPowerKw * 1.04,
        batteryToPcuKw: -regenPowerKw,
        mg2ToCounterKw: -regenPowerKw * 1.08,
        counterToWheelKw: -(regenPowerKw * 1.08 + frictionBrakeKw),
        frictionBrakeKw,
      };
    } else {
      const evKw = Math.max(0, wheelMechPowerKw);
      flows = {
        iceToCarrierKw: 0,
        carrierToRingKw: 0,
        carrierToSunKw: 0,
        mg1ToPcuKw: 0,
        pcuToMg2Kw: evKw * 1.04,
        batteryToPcuKw: evKw * 1.08,
        mg2ToCounterKw: evKw,
        counterToWheelKw: evKw,
        frictionBrakeKw,
      };
    }
  } else if (modeId === OperationModeId.ICE_START) {
    const crankKw = 4.6;
    const wheelKw = Math.max(2, wheelMechPowerKw);
    flows = {
      iceToCarrierKw: 2.5,
      carrierToRingKw: 2.5 + crankKw,
      carrierToSunKw: -crankKw,
      mg1ToPcuKw: -crankKw * 1.06,
      pcuToMg2Kw: Math.max(0, wheelKw - 4) * 1.04,
      batteryToPcuKw: crankKw * 1.06 + Math.max(0, wheelKw - 4) * 1.06,
      mg2ToCounterKw: Math.max(0, wheelKw - 4),
      counterToWheelKw: wheelKw,
      frictionBrakeKw: 0,
    };
  } else {
    const boostExtraBatteryKw =
      modeId === OperationModeId.POWER_BOOST ? Math.min(34, (throttle - 0.65) * 95) : 0;
    const chargeTargetKw = prev.socPercent < 36 ? 10.5 : prev.socPercent < 55 ? 2.4 : 0;
    const iceKw = Math.min(
      112,
      Math.max(9.5, Math.max(0, wheelMechPowerKw) - boostExtraBatteryKw + chargeTargetKw)
    );
    const omegaC = Math.max(60, (cleanIceRpm * 2 * Math.PI) / 60);
    const omegaS = (mg1Rpm * 2 * Math.PI) / 60;
    const omegaR = (ringRpm * 2 * Math.PI) / 60;
    const torqueCarrierNm = (iceKw * 1000) / omegaC;

    const carrierToRingKw = (RING_CARRIER_SHARE * torqueCarrierNm * omegaR) / 1000;
    const carrierToSunKw = (SUN_CARRIER_SHARE * torqueCarrierNm * omegaS) / 1000;
    const mg1ToPcuKw = carrierToSunKw * 0.95;
    const mg2ToCounterKw = Math.max(0, wheelMechPowerKw) - carrierToRingKw;
    const pcuToMg2Kw = mg2ToCounterKw * 1.04;
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

  const socDelta = (-flows.batteryToPcuKw / 1350) * dt * 100;
  const socPercent = Math.max(22, Math.min(92, prev.socPercent + socDelta));

  let targetHsi = 0;
  let hsiZone = HsiZone.OFF;
  if (gear === GearPosition.N) {
    targetHsi = 0;
    hsiZone = HsiZone.OFF;
  } else if (flows.counterToWheelKw < -0.5 || regenPowerKw > 0.3) {
    const chgRatio = Math.min(1, Math.abs(flows.counterToWheelKw) / 42);
    targetHsi = -chgRatio * 100;
    hsiZone = HsiZone.CHG;
  } else if (!iceFuelActive && cleanIceRpm < 100) {
    const evRatio = Math.min(1, Math.max(0, flows.counterToWheelKw) / maxEvPowerKw);
    targetHsi = evRatio * 42;
    hsiZone = targetHsi > 1 ? HsiZone.ECO_EV : HsiZone.OFF;
  } else if (modeId === OperationModeId.POWER_BOOST || throttle > 0.68) {
    const pwrRatio = Math.min(1, Math.max(0, (throttle - 0.65) / 0.35));
    targetHsi = 72 + pwrRatio * 28;
    hsiZone = HsiZone.PWR;
  } else {
    const ecoRatio = Math.min(1, Math.max(0, flows.iceToCarrierKw) / 68);
    targetHsi = 43 + ecoRatio * 28;
    hsiZone = HsiZone.ECO_HYBRID;
  }

  const hsiValue = damp(prev.hsiValue, targetHsi, 8.0, dt);
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
    socPercent,
    iceFuelActive,
    gear,
    evModeRequested,
    throttlePercent,
    brakePercent,
    roadGradePercent,
    hsiValue,
    hsiZone,
    evIndicatorOn: !iceFuelActive && cleanIceRpm < 80 && gear !== GearPosition.N,
    activePhaseTitle: phaseTitle,
    activePhaseSummary: phaseSummary,
    activeModeId: modeId,
    flows,
    ...splits,
  };
}
