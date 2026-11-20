import {
  BrakingSplitMetrics,
  IceCombustionMode,
  IceOperatingStatus,
  PowerFlowsKw,
  PropulsionSplitMetrics,
} from '../types/hybrid';
import {
  KW_TO_HP,
  maxIceTorqueAtRpm,
  MG2_TO_WHEEL_RATIO,
  PSD_CONSTANTS,
} from './vehicleSpecs';

/**
 * Classifies whether the M20A-FXS ICE is actively igniting fuel and producing drive power,
 * firing at unloaded idle, motoring unfueled as a B-mode air pump, spinning under fuel-cut,
 * or stationary. Shared as single source of truth across 3D piston glow, HUD badges, and tests.
 */
export function classifyIceOperatingStatus(
  iceRpm: number,
  iceFuelActive: boolean,
  iceToCarrierKw: number
): IceOperatingStatus {
  const absRpm = Math.abs(iceRpm);
  if (absRpm <= 18) {
    return {
      mode: IceCombustionMode.STOPPED,
      isCombusting: false,
      loadFraction: 0,
      badgeText: '■ OFF · STANDBY',
      badgeTone: 'off',
    };
  }

  if (iceFuelActive && absRpm >= 220) {
    if (iceToCarrierKw > 0.35) {
      return {
        mode: IceCombustionMode.PRODUCING_POWER,
        isCombusting: true,
        loadFraction: Math.max(0.18, Math.min(1, iceToCarrierKw / PSD_CONSTANTS.ICE_MAX_POWER_KW)),
        badgeText: `◆ FIRING · +${iceToCarrierKw.toFixed(1)} kW`,
        badgeTone: 'power',
      };
    }

    return {
      mode: IceCombustionMode.FIRING_IDLE,
      isCombusting: true,
      loadFraction: 0.14,
      badgeText: '● FIRING · IDLE 0 kW',
      badgeTone: 'idle',
    };
  }

  if (iceToCarrierKw < -0.5) {
    return {
      mode: IceCombustionMode.MOTORING_AIR_PUMP,
      isCombusting: false,
      loadFraction: 0,
      badgeText: '○ NO FUEL · AIR PUMP',
      badgeTone: 'unfueled',
    };
  }

  return {
    mode: IceCombustionMode.SPINNING_FUEL_CUT,
    isCombusting: false,
    loadFraction: 0,
    badgeText: '○ SPINNING · NO FUEL',
    badgeTone: 'unfueled',
  };
}

export function mechToPcuElectrical(mechGenKw: number): number {
  // Positive = generating into PCU (* 0.95 eff); Negative = motoring drawing from PCU (/ 0.95 eff)
  return mechGenKw >= 0 ? mechGenKw * 0.95 : mechGenKw / 0.95;
}

export function mg2MechToPcuDemand(mg2MotorKw: number): number {
  // Positive = MG2 motoring drawing from PCU (/ 0.95 eff); Negative = MG2 generating into PCU (* 0.95 eff)
  return mg2MotorKw >= 0 ? mg2MotorKw / 0.95 : mg2MotorKw * 0.95;
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
 * Internal overdrive power circulation (when vehicle is propelling forward) never falsely triggers Braking Split.
 */
export function computeSplits(
  iceRpm: number,
  mg2Rpm: number,
  wheelRpm: number,
  iceFuelActive: boolean,
  flows: PowerFlowsKw
): { propulsionSplit: PropulsionSplitMetrics; brakingSplit: BrakingSplitMetrics } {
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

  const combinedKw = !iceFuelActive
    ? evPropKw
    : Math.min(
        PSD_CONSTANTS.SYSTEM_MAX_POWER_KW,
        iceActiveKw + Math.max(0, flows.batteryToPcuKw * 0.95)
      );

  const propulsionSplit: PropulsionSplitMetrics = {
    combinedHp: combinedKw * KW_TO_HP,
    combinedKw,
    icePercent,
    evPercent,
    iceHp: iceActiveKw * KW_TO_HP,
    evHp: evPropKw * KW_TO_HP,
    iceTorqueNm,
    evTorqueNm,
  };

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
  const mechTorqueNm = mechKw > 0.1 ? Math.min(3400, (mechKw * 9549) / effWheelRpm) : 0;

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
