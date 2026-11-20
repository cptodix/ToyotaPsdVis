/**
 * Toyota Kijang Innova Zenix Hybrid (AG10, 5th-Gen THS V) Vehicle & Powertrain Specifications
 * Reference configuration: 1,730 kg kerb + 4 adult passengers (4 × 72.5 kg) = 2,020 kg laden MPV.
 */

export const VEHICLE_KERB_MASS_KG = 1730;
export const PASSENGER_COUNT = 4;
export const AVG_ADULT_MASS_KG = 72.5;
export const VEHICLE_MASS_KG = VEHICLE_KERB_MASS_KG + PASSENGER_COUNT * AVG_ADULT_MASS_KG; // 2,020 kg

export const AERO_CD = 0.32;
export const FRONTAL_AREA_M2 = 2.75; // CdA = 0.88 m²
export const ROLLING_RESISTANCE_COEFF = 0.011;
export const GRAVITY_MPS2 = 9.81;

/** Dynamic front-axle weight share & dry radial tire grip limits (215/60R17 / 225/50R18) */
export const STATIC_FRONT_AXLE_SHARE = 0.47;
export const FRONT_TIRE_MU = 0.82;
export const ALL_WHEEL_BRAKE_MU = 0.92;

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

  TIRE_CIRCUMFERENCE_M: 2.14, // 215/60R17 & 225/50R18 dynamic loaded rolling circumference

  ICE_MAX_RPM: 6000,
  ICE_IDLE_RPM: 1150,
  ICE_MAX_POWER_KW: 112, // 150 hp / 152 PS M20A-FXS @ 6,000 RPM
  ICE_MAX_TORQUE_NM: 188, // 188 Nm @ 4,400–5,200 RPM

  MG1_MAX_RPM: 10500,
  MG2_MAX_RPM: 17000,
  MG2_MAX_POWER_KW: 83, // 111 hp / 113 PS 1VM permanent-magnet motor
  MG2_MAX_TORQUE_NM: 206,

  SYSTEM_MAX_POWER_KW: 137, // 186 PS / 184 hp combined Innova Zenix Hybrid output
  MAX_NET_WHEEL_POWER_KW: 123, // After ~10% transaxle, inverter, & final-drive losses
  HV_BATTERY_CAPACITY_KJ: 4716, // 168-cell 201.6V 6.5Ah (1.31 kWh) NiMH pack
  HV_BATTERY_MAX_BOOST_KW: 26.5,
  HV_BATTERY_MAX_REGEN_KW: 32.0,
} as const;

/**
 * Continuous READY-on cabin load:
 * Inverter A/C compressor (coldest temp, lowest fan ~0.55 kW)
 * + 12V DC-DC converter (infotainment, cluster, ECUs, pumps ~0.35 kW) = 0.90 kW HV bus draw.
 */
export const READY_AUX_LOAD_KW = 0.9;

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

/**
 * M20A-FXS 2.0L Atkinson Wide-Open-Throttle Torque Envelope (Nm vs RPM):
 * ~148 Nm @ 1,000 RPM -> 176 Nm @ 2,800 RPM -> 188 Nm peak @ 4,400–5,200 RPM -> 178.3 Nm @ 6,000 RPM (112 kW)
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
    optRpm = 1150 + ((kw - 8) / 28) * 1000;
  } else if (kw <= 78) {
    optRpm = 2150 + ((kw - 36) / 42) * 2100;
  } else {
    optRpm = 4250 + ((kw - 78) / 34) * 1750;
  }

  // Enforce MG1 ±9,800 RPM safe operating window via planetary kinematic relation
  const minIceForMg1NegLimit =
    (PSD_CONSTANTS.Z_RING * ringRpm - PSD_CONSTANTS.Z_SUN * 9800) / TOTAL_PSD_TEETH;
  const maxIceForMg1PosLimit =
    (PSD_CONSTANTS.Z_RING * ringRpm + PSD_CONSTANTS.Z_SUN * 9800) / TOTAL_PSD_TEETH;

  return Math.max(
    PSD_CONSTANTS.ICE_IDLE_RPM,
    minIceForMg1NegLimit,
    Math.min(PSD_CONSTANTS.ICE_MAX_RPM, maxIceForMg1PosLimit, optRpm)
  );
}

/**
 * Calibrated Toyota 5th-Gen THS V Normal-Mode Accelerator Pedal Progression [0..1] -> [0..1]:
 * Silky low-angle tip-in modulation for urban EV creeping/gliding transitioning cleanly
 * into progressive mid-range torque and steep upper-travel full-power kickdown.
 */
export function evaluateThrottlePedalCurve(throttleNorm: number): number {
  const t = Math.max(0, Math.min(1, throttleNorm));
  if (t === 0) return 0;
  return 0.36 * t + 0.64 * Math.pow(t, 1.48);
}

/**
 * Calibrated Toyota ECB (Electronically Controlled Brake) Pedal Progression [0..1] -> [0..1]:
 * Smooth initial bite (0–20% travel) inside the regenerative braking sweet spot,
 * progressing linearly-firmly up to 0.92g full ABS threshold braking at 100%.
 */
export function evaluateBrakePedalFraction(brakeNorm: number): number {
  const b = Math.max(0, Math.min(1, brakeNorm));
  if (b === 0) return 0;
  return 0.42 * b + 0.58 * Math.pow(b, 1.35);
}
