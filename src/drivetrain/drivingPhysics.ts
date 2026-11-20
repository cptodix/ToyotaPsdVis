import { IDLE_AUTODRIVE_STATUS } from '../autodrive/idleStatus';
import {
  AutoDriveStatus,
  GearPosition,
  HsiZone,
  OperationModeId,
  PowerFlowsKw,
  PowertrainState,
} from '../types/hybrid';
import {
  computeFuelRateLitersPerSec,
  computeSplits,
  mechToPcuElectrical,
  mg2MechToPcuDemand,
} from './thermodynamicsAndSplits';
import {
  AERO_CD,
  ALL_WHEEL_BRAKE_MU,
  evaluateBrakePedalFraction,
  evaluateThrottlePedalCurve,
  FRONTAL_AREA_M2,
  FRONT_TIRE_MU,
  GRAVITY_MPS2,
  maxIceTorqueAtRpm,
  optimalAtkinsonRpmForPower,
  PSD_CONSTANTS,
  READY_AUX_LOAD_KW,
  RING_CARRIER_SHARE,
  ROLLING_RESISTANCE_COEFF,
  STATIC_FRONT_AXLE_SHARE,
  SUN_CARRIER_SHARE,
  VEHICLE_MASS_KG,
} from './vehicleSpecs';
import { deriveSecondarySpeeds, ringRpmFromKmh, solveMg1Rpm } from './willisKinematics';

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
 * Continuous Vehicle & 5th-Gen Toyota Hybrid System Simulation Step
 * Calibrated for Toyota Kijang Innova Zenix Hybrid (AG10, 2.0L M20A-FXS + 1VM + NiMH) with 4 adult passengers (2,020 kg).
 */
export function stepDrivingSimulation(
  prev: PowertrainState,
  inputs: DrivingInputs,
  dtRaw: number
): PowertrainState {
  const dt = Math.min(Math.max(dtRaw, 0), 0.05);
  const { gear, evModeRequested, throttlePercent, brakePercent, roadGradePercent } = inputs;
  const autoDrive = inputs.autoDrive ?? IDLE_AUTODRIVE_STATUS;

  const throttle = Math.max(0, Math.min(100, throttlePercent)) / 100;
  const brake = Math.max(0, Math.min(100, brakePercent)) / 100;

  const massKg = VEHICLE_MASS_KG;
  const g = GRAVITY_MPS2;
  const vPrevMs = prev.speedKmh / 3.6;
  const absVMs = Math.abs(vPrevMs);

  // MPV aerodynamics (CdA = 0.88 m²) & loaded 215/60R17 tires (Crr = 0.0110)
  const fAero = 0.5 * 1.225 * AERO_CD * FRONTAL_AREA_M2 * vPrevMs * absVMs;
  const gradeRad = Math.atan(roadGradePercent / 100);
  const fRoll =
    absVMs > 0.08
      ? ROLLING_RESISTANCE_COEFF * massKg * g * Math.cos(gradeRad) * Math.sign(vPrevMs)
      : 0;
  const fGrade = massKg * g * Math.sin(gradeRad);

  // Dynamic FWD front-axle weight transfer & tire grip limits
  const launchTransfer = Math.min(0.082, throttle * 0.075);
  const dynamicFrontShare = Math.max(
    0.28,
    STATIC_FRONT_AXLE_SHARE * Math.cos(gradeRad) - 0.24 * Math.sin(gradeRad) - launchTransfer
  );
  const frontAxleGripCapN = FRONT_TIRE_MU * dynamicFrontShare * massKg * g;
  const maxAllWheelBrakeN = ALL_WHEEL_BRAKE_MU * massKg * g * Math.cos(gradeRad);

  // Hysteresis-regulated Forced NiMH Battery Charging (< 40% start -> >= 48% stop)
  const forcedChargeActive = prev.forcedChargeActive
    ? prev.socPercent < 48.0
    : prev.socPercent < 40.0;

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
        'Parking pawl locks Ring Gear & Wheels at 0 RPM while inverters stay active: ICE drives MG1 to power A/C + 12V accessories (~0.9 kW) and recharge the NiMH pack.';
    } else {
      iceFuelActive = false;
      targetIceRpm = 0;
      modeId = OperationModeId.STOP;
      phaseTitle = 'Park (P) · Ready EV Standby';
      phaseSummary =
        'Mechanical parking pawl locks final drive at 0 km/h. Electric A/C & infotainment draw ~0.9 kW from NiMH battery (ICE starts via MG1 if SoC <40%).';
    }

    const iceRpm = damp(prev.iceRpm, targetIceRpm, 4.0, dt);
    const cleanIceRpm = Math.abs(iceRpm) < 12 && targetIceRpm === 0 ? 0 : iceRpm;
    const mg1Rpm = solveMg1Rpm(cleanIceRpm, ringRpm);
    const sec = deriveSecondarySpeeds(cleanIceRpm, mg1Rpm, ringRpm);

    const parkGenKw = iceFuelActive ? 10.5 + throttle * 13 : 0;
    const parkMg1ToPcuKw = parkGenKw * 0.95;
    const flows: PowerFlowsKw = {
      iceToCarrierKw: parkGenKw,
      carrierToRingKw: 0,
      carrierToSunKw: parkGenKw,
      mg1ToPcuKw: parkMg1ToPcuKw,
      pcuToMg2Kw: 0,
      batteryToPcuKw: READY_AUX_LOAD_KW - parkMg1ToPcuKw,
      mg2ToCounterKw: 0,
      counterToWheelKw: 0,
      frictionBrakeKw: 0,
    };

    const socDelta = (-flows.batteryToPcuKw / PSD_CONSTANTS.HV_BATTERY_CAPACITY_KJ) * dt * 100;
    const socPercent = Math.max(24, Math.min(86, prev.socPercent + socDelta));
    const parkFuelLps = computeFuelRateLitersPerSec(
      iceFuelActive,
      cleanIceRpm,
      flows.iceToCarrierKw
    );
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
  // 2. NEUTRAL (N): PCU shuts down MG1/MG2 inverter gates (no regen / no charge),
  //                 while READY-mode A/C & 12V accessories continue drawing 0.9 kW.
  // ==========================================================================
  if (gear === GearPosition.N) {
    targetIceRpm = prev.iceFuelActive && prev.iceRpm > 600 ? PSD_CONSTANTS.ICE_IDLE_RPM : 0;
    iceFuelActive = targetIceRpm > 0;
    const brakeForceN = brake * maxAllWheelBrakeN * (absVMs > 0.05 ? Math.sign(vPrevMs) : 0);
    propulsiveForceN = -brakeForceN;
    frictionBrakeKw = (Math.abs(brakeForceN) * absVMs) / 1000;
    phaseTitle = 'Neutral (N) · Inverter Shutdown (No Charge)';
    phaseSummary =
      'PCU de-energizes MG1 & MG2 inverters (no regen or battery recharge possible), while cabin A/C & 12V electronics continue draining ~0.9 kW from the NiMH battery.';
    modeId = OperationModeId.STOP;
  } else if (gear === GearPosition.R) {
    // ========================================================================
    // 3. REVERSE (R): Gearless MG2 CCW electric reverse (with ICE gen if low SoC)
    // ========================================================================
    const revThrottle = brake > 0.05 ? 0 : throttle;
    const revPedal = evaluateThrottlePedalCurve(revThrottle);
    const revBrakeFrac = evaluateBrakePedalFraction(brake);
    const revCreepN = brake === 0 && vPrevMs > -1.8 ? -430 : 0;
    const targetRevForceN =
      revThrottle > 0
        ? Math.min(revCreepN, -revPedal * Math.min(5400, frontAxleGripCapN))
        : revCreepN;
    const brakeForceN =
      brake > 0
        ? revBrakeFrac * maxAllWheelBrakeN * (absVMs > 0.05 ? Math.sign(vPrevMs) : 0)
        : vPrevMs > 0.2
          ? 3400
          : 0;

    propulsiveForceN = targetRevForceN - brakeForceN;
    if (forcedChargeActive) {
      targetIceRpm = 1320;
      iceFuelActive = true;
    } else {
      targetIceRpm = 0;
      iceFuelActive = false;
    }

    if (brake > 0.04 && vPrevMs < -1.0) {
      const rawRevBrakeKw = (Math.abs(brakeForceN) * absVMs) / 1000;
      const revRegenShare = brake > 0.5 ? Math.max(0.28, 1 - (brake - 0.5) * 1.4) : 1.0;
      regenPowerKw = Math.min(18, rawRevBrakeKw * revRegenShare);
      frictionBrakeKw = Math.max(0, rawRevBrakeKw - regenPowerKw);
    }

    phaseTitle = 'Reverse (R) · MG2 AC Phase Reversal';
    phaseSummary =
      'PCU reverses MG2 AC phase sequence so MG2 & Ring Gear spin CCW backward without a mechanical reverse gear.';
    modeId = OperationModeId.REVERSE_EV;
  } else {
    // ========================================================================
    // 4. FORWARD DRIVE (D / B): Innova Zenix Hybrid (2,020 kg, 186 PS) Control Law
    // ========================================================================
    const isBMode = gear === GearPosition.B;
    const effThrottle = brake > 0.04 ? 0 : throttle;
    const pedalDemand = evaluateThrottlePedalCurve(effThrottle);
    const brakeFrac = evaluateBrakePedalFraction(brake);

    // Continuous idle creep floor (~560 N at standstill -> 0 by 7.8 km/h) eliminates low-throttle deadband dip
    const creepForceN =
      brake === 0 && prev.speedKmh < 7.8 && prev.speedKmh > -1
        ? 560 * (1 - Math.max(0, prev.speedKmh) / 7.8)
        : 0;

    const govFactor = prev.speedKmh > 168 ? Math.max(0, 1 - (prev.speedKmh - 168) / 8) : 1;
    // Reference forward traction envelope independent of dynamic weight transfer so partial-throttle
    // pedal linearity remains consistent; tire grip clamp still bounds actual propulsiveForceN.
    const refForceEnvelopeN = Math.min(
      8200,
      (PSD_CONSTANTS.MAX_NET_WHEEL_POWER_KW * 1000) / Math.max(4.5, absVMs)
    );
    // Subtle low-speed Hill-Start Assist torque bias on climbs (< 14 km/h)
    const hacLowSpeedAssistN =
      roadGradePercent > 3 && effThrottle > 0 && prev.speedKmh < 14
        ? Math.max(0, fGrade) *
          Math.min(1, effThrottle * 3.0) *
          (1 - Math.max(0, prev.speedKmh) / 14) *
          0.32
        : 0;

    const demandedDriveForceN =
      effThrottle > 0
        ? (creepForceN +
            pedalDemand * Math.max(0, refForceEnvelopeN - creepForceN) +
            hacLowSpeedAssistN) *
          govFactor
        : 0;
    const driverWheelDemandKw = (demandedDriveForceN * Math.max(5.5, absVMs)) / 1000;

    const downhillExtraFactor = roadGradePercent < -2 ? Math.abs(roadGradePercent) * 0.022 : 0;
    const liftOffDecelKw =
      effThrottle === 0 && prev.speedKmh > 3.0
        ? ((isBMode ? 0.31 : 0.095) + downhillExtraFactor * (isBMode ? 1.4 : 0.7)) * prev.speedKmh
        : 0;
    const pedalBrakeForceN = brake > 0 ? brakeFrac * maxAllWheelBrakeN : 0;
    const pedalBrakeDecelKw =
      brake > 0 && prev.speedKmh > 0.4 ? (pedalBrakeForceN * absVMs) / 1000 : 0;
    const totalBrakingDemandKw = Math.max(liftOffDecelKw, pedalBrakeDecelKw);

    const mg1OverspeedGuard = prev.speedKmh > 116;

    const maxBatteryRegenAcceptKw =
      prev.socPercent > 82
        ? 4
        : prev.socPercent > 73
          ? PSD_CONSTANTS.HV_BATTERY_MAX_REGEN_KW * (1 - ((prev.socPercent - 73) / 9) * 0.85)
          : PSD_CONSTANTS.HV_BATTERY_MAX_REGEN_KW;

    const socEvBonus = prev.socPercent > 66 ? 2.0 : prev.socPercent < 46 ? -3.5 : 0;
    let autoHvEvCeilingKw = 17.5;
    if (prev.speedKmh > 30 && prev.speedKmh <= 70) {
      autoHvEvCeilingKw = 17.5 - ((prev.speedKmh - 30) / 40) * 5.0;
    } else if (prev.speedKmh > 70) {
      autoHvEvCeilingKw = 12.5 - Math.min(1, (prev.speedKmh - 70) / 38) * 2.5;
    }
    autoHvEvCeilingKw = Math.max(5.5, autoHvEvCeilingKw + socEvBonus);

    const dedicatedEvActive =
      evModeRequested &&
      prev.socPercent >= 40 &&
      prev.speedKmh <= 42 &&
      effThrottle < 0.68 &&
      !forcedChargeActive;

    const evStartIceThresholdKw = dedicatedEvActive ? 29.0 : autoHvEvCeilingKw;
    const evShutoffIceThresholdKw = evStartIceThresholdKw * 0.76;

    if (totalBrakingDemandKw > 0.5 && effThrottle === 0) {
      iceMinRunTimerSec = 0;

      if (
        (isBMode && prev.speedKmh > 12) ||
        (prev.socPercent > 79 && totalBrakingDemandKw > 16 && prev.speedKmh > 25)
      ) {
        iceFuelActive = false;
        const steepDownhillRpm = roadGradePercent < 0 ? Math.abs(roadGradePercent) * 28 : 0;
        targetIceRpm = Math.min(
          4600,
          1350 + prev.speedKmh * 22 + brake * 650 + steepDownhillRpm
        );
        bModeEngineDragKw = Math.min(34, (targetIceRpm / 4200) * 29);
        const remainingForBattery = Math.max(0, totalBrakingDemandKw - bModeEngineDragKw);
        regenPowerKw = Math.min(maxBatteryRegenAcceptKw, remainingForBattery * 0.88);
        frictionBrakeKw = Math.max(0, totalBrakingDemandKw - bModeEngineDragKw - regenPowerKw);
        modeId = OperationModeId.B_MODE_DESCENT;
        phaseTitle = isBMode
          ? 'B-Range · Engine Pumping Brake + Regen'
          : 'High-SoC Engine Pumping Assist + Regen';
        phaseSummary =
          'Fuel is cut to ICE while MG1 uses part of MG2’s regenerated power to spin the engine as an air pump, preventing NiMH overcharge on steep descents.';
      } else {
        iceFuelActive = false;
        targetIceRpm = mg1OverspeedGuard ? 1080 : 0;
        // Toyota ECB cooperative braking: 100% regen within NiMH capacity up to ~50% pedal,
        // fading smoothly to hydraulic pads below 7.5 km/h to eliminate low-speed regen lurch.
        const lowSpeedRegenFade =
          prev.speedKmh < 7.5 ? Math.max(0, (prev.speedKmh - 2.5) / 5.0) : 1.0;
        const regenShareFactor =
          brake > 0.5 ? Math.max(0.28, 1 - (brake - 0.5) * 1.4) : 1.0;
        regenPowerKw =
          prev.speedKmh > 2.5
            ? Math.min(
                maxBatteryRegenAcceptKw,
                totalBrakingDemandKw * regenShareFactor * lowSpeedRegenFade
              )
            : 0;
        frictionBrakeKw = Math.max(0, totalBrakingDemandKw - regenPowerKw);
        modeId = OperationModeId.REGEN_BRAKE;
        phaseTitle = 'Cooperative Regenerative Braking (CHG)';
        phaseSummary = mg1OverspeedGuard
          ? 'MG2 regenerates kinetic energy into the NiMH pack while unfueled ICE idles at 1,080 RPM to protect MG1 from >116 km/h overspeed.'
          : 'ICE fuel is cut (0 RPM). MG2 regenerates up to 32 kW into the NiMH pack while 4-wheel hydraulic brakes blend in for harder stops.';
      }

      const rawDecelForceN =
        absVMs > 0.3
          ? Math.max(pedalBrakeForceN, (totalBrakingDemandKw * 1000) / absVMs)
          : pedalBrakeForceN;
      const clampedDecelForceN = Math.min(maxAllWheelBrakeN, rawDecelForceN);
      propulsiveForceN = -clampedDecelForceN * Math.sign(vPrevMs || 1);
    } else if (driverWheelDemandKw === 0 && !forcedChargeActive && !mg1OverspeedGuard) {
      iceFuelActive = false;
      iceMinRunTimerSec = 0;
      targetIceRpm = 0;
      const holdBrakeN =
        brake > 0 ? Math.min(maxAllWheelBrakeN, pedalBrakeForceN) * Math.sign(vPrevMs || 1) : 0;
      propulsiveForceN = Math.min(frontAxleGripCapN, creepForceN) - holdBrakeN;

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
            ? `Hydraulic hill-hold keeps the 2,020 kg MPV stationary on the ${Math.round(
                roadGradePercent
              )}% grade with 0 RPM fuel-free standby.`
            : 'Vehicle stationary in Ready state with 0 RPM fuel-free standby.';
      } else {
        modeId = OperationModeId.EV_DRIVE;
        phaseTitle = 'EV Low-Speed Creep';
        phaseSummary = 'MG2 provides smooth electric creep torque with ICE stationary at 0 RPM.';
      }
    } else if (driverWheelDemandKw === 0 && forcedChargeActive && Math.abs(prev.speedKmh) < 2.5) {
      iceFuelActive = true;
      targetIceRpm = 1300;
      const holdBrakeN = brake > 0 ? brake * maxAllWheelBrakeN * Math.sign(vPrevMs || 1) : 0;
      propulsiveForceN = creepForceN - holdBrakeN;
      modeId = OperationModeId.IDLE_CHARGE;
      phaseTitle = 'Stationary Low-SoC Battery Charge';
      phaseSummary =
        'NiMH Battery SoC reached <40%: M20A-FXS starts automatically at 1,300 RPM to recharge the pack up to 48% via MG1.';
    } else {
      const steepClimbRequiresIce = roadGradePercent >= 14 && effThrottle > 0.24;
      const evThreshold = prev.iceFuelActive ? evShutoffIceThresholdKw : evStartIceThresholdKw;
      const keepWarmRunning = prev.iceFuelActive && iceMinRunTimerSec > 0 && driverWheelDemandKw > 3.5;

      const canOperatePureEv =
        driverWheelDemandKw <= evThreshold &&
        !keepWarmRunning &&
        !steepClimbRequiresIce &&
        !mg1OverspeedGuard &&
        !forcedChargeActive &&
        prev.speedKmh <= 108;

      if (canOperatePureEv) {
        iceFuelActive = false;
        targetIceRpm = 0;
        const maxEvForceN = Math.min(frontAxleGripCapN, dedicatedEvActive ? 5400 : 4900);
        propulsiveForceN = Math.min(maxEvForceN, demandedDriveForceN);
        modeId = OperationModeId.EV_DRIVE;
        phaseTitle = dedicatedEvActive
          ? 'Dedicated EV Mode Active (<= 42 km/h)'
          : prev.speedKmh > 68
            ? 'High-Speed EV Glide (Fuel-Cut 0 RPM)'
            : 'Innova Zenix EV Propulsion';
        phaseSummary =
          prev.speedKmh > 68
            ? 'Light cruising load (<11 kW) allows THS V to shut off fuel completely while MG2 sustains speed and MG1 spins CCW.'
            : 'NiMH HV battery drives MG2 directly (100% EV propulsion). ICE stays at 0 RPM while Planet Gears spin MG1 freely in CCW reverse.';
      } else {
        if (!prev.iceFuelActive) {
          iceMinRunTimerSec = 3.2;
        }
        iceFuelActive = true;

        const boostRequested =
          effThrottle > 0.65 ||
          driverWheelDemandKw > 66 ||
          (roadGradePercent >= 16 && effThrottle > 0.35);

        const socChargeBiasKw = forcedChargeActive
          ? 10.5
          : prev.socPercent < 55
            ? (56 - prev.socPercent) * 0.32
            : prev.socPercent > 65
              ? -(prev.socPercent - 62) * 0.25
              : 0;

        const boostBatteryAssistKw = boostRequested
          ? Math.min(
              PSD_CONSTANTS.HV_BATTERY_MAX_BOOST_KW,
              prev.socPercent > 34
                ? Math.max(7, (effThrottle - 0.56) * 65 + (driverWheelDemandKw > 88 ? 10 : 0))
                : 0
            )
          : 0;

        const estShaftDemandKw = driverWheelDemandKw / 0.9;
        const targetIcePowerKw = Math.min(
          PSD_CONSTANTS.ICE_MAX_POWER_KW,
          Math.max(11.0, estShaftDemandKw - boostBatteryAssistKw + socChargeBiasKw)
        );

        const estRingRpm = ringRpmFromKmh(prev.speedKmh);
        targetIceRpm = optimalAtkinsonRpmForPower(targetIcePowerKw, estRingRpm);

        // Actual ICE spool torque (0 while <450 RPM cranking) + NiMH-fed MG2 immediate launch torque
        const spooledIceKw =
          prev.iceRpm < 450
            ? 0
            : Math.min(
                PSD_CONSTANTS.ICE_MAX_POWER_KW,
                (maxIceTorqueAtRpm(prev.iceRpm) * prev.iceRpm) / 9549
              );
        const instantEvBurstKw = prev.socPercent > 34 ? Math.max(26.5, boostBatteryAssistKw + 6) : 4;
        const availWheelPowerKw = Math.min(
          PSD_CONSTANTS.MAX_NET_WHEEL_POWER_KW,
          (spooledIceKw + instantEvBurstKw) * 0.905
        );
        const availWheelForceN = Math.min(
          frontAxleGripCapN,
          (availWheelPowerKw * 1000) / Math.max(3.6, absVMs)
        );

        propulsiveForceN = Math.min(availWheelForceN, demandedDriveForceN);

        const evOverrideNote = evModeRequested
          ? prev.speedKmh > 42
            ? ' (EV Mode standby >42 km/h)'
            : forcedChargeActive
              ? ' (EV Mode paused: <40% SoC charge)'
              : effThrottle >= 0.68 || steepClimbRequiresIce
                ? ' (EV Mode overridden by load)'
                : ''
          : '';

        if (!prev.iceFuelActive && prev.iceRpm < 950) {
          modeId = OperationModeId.ICE_START;
          phaseTitle = 'In-Motion ICE Start (MG1 Cranking)';
          phaseSummary = `MG1 draws NiMH battery power to lift Sun Gear RPM and crank M20A-FXS past 1,000 RPM while MG2 holds smooth road torque${evOverrideNote}.`;
        } else if (boostRequested) {
          modeId = OperationModeId.POWER_BOOST;
          phaseTitle = 'Full-Load Dual Boost (186 PS Combined)';
          phaseSummary = `M20A-FXS swells toward ${Math.round(
            targetIceRpm
          )} RPM while the NiMH pack adds up to 26.5 kW boost into MG2 (186 PS combined)${evOverrideNote}.`;
        } else {
          const estMg1 = solveMg1Rpm(targetIceRpm, estRingRpm);
          if (estMg1 < -120 && prev.speedKmh > 78) {
            modeId = OperationModeId.HIGHWAY_OVERDRIVE;
            phaseTitle = 'Highway e-CVT Overdrive (Power Circulation)';
            phaseSummary = `Steady cruise at ${Math.round(
              prev.speedKmh
            )} km/h with relaxed ${Math.round(targetIceRpm)} RPM ICE: MG1 spins CCW (${Math.round(
              estMg1
            )} RPM) as a reverse motor fed by slight MG2 generation.`;
          } else {
            modeId = OperationModeId.NORMAL_SPLIT;
            phaseTitle = 'Optimal Atkinson Power-Split Cruise';
            phaseSummary = `M20A-FXS runs on its 41%-efficiency BSFC line (${Math.round(
              targetIceRpm
            )} RPM), splitting torque 72.2% to Ring Gear and 27.8% to MG1${evOverrideNote}.`;
          }
        }
      }
    }
  }

  let netForceN = propulsiveForceN - fAero - fRoll - fGrade;
  const brakeHoldActive =
    brake > 0.16 &&
    throttle === 0 &&
    evaluateBrakePedalFraction(brake) * maxAllWheelBrakeN >= Math.abs(fGrade);

  if (brakeHoldActive && Math.abs(vPrevMs) < 0.45) {
    netForceN = 0;
  }

  let nextVMs = vPrevMs + (netForceN / massKg) * dt;

  if (brakeHoldActive && Math.abs(nextVMs) < 0.45) {
    nextVMs = 0;
  }
  if (gear !== GearPosition.R && nextVMs < 0 && roadGradePercent >= 0 && roadGradePercent <= 14) {
    nextVMs = 0;
  }
  if (gear === GearPosition.R) {
    nextVMs = Math.max(-35 / 3.6, Math.min(8 / 3.6, nextVMs));
  } else {
    nextVMs = Math.max(-18 / 3.6, Math.min(175 / 3.6, nextVMs));
  }

  const speedKmh = nextVMs * 3.6;
  const ringRpm = ringRpmFromKmh(speedKmh);
  const iceRpm = damp(prev.iceRpm, targetIceRpm, targetIceRpm > prev.iceRpm ? 3.2 : 3.4, dt);
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
      batteryToPcuKw: READY_AUX_LOAD_KW,
      mg2ToCounterKw: 0,
      counterToWheelKw: -frictionBrakeKw,
      frictionBrakeKw,
    };
  } else if (!iceFuelActive && bModeEngineDragKw > 0) {
    // Exact planetary pumping power split via Willis speed ratios
    const ringFraction =
      cleanIceRpm > 50 ? Math.min(0.65, Math.max(0.05, RING_CARRIER_SHARE * (ringRpm / cleanIceRpm))) : 0.28;
    const carrierToRingKw = -bModeEngineDragKw * ringFraction;
    const carrierToSunKw = -bModeEngineDragKw - carrierToRingKw;
    const mg1ToPcuKw = mechToPcuElectrical(carrierToSunKw);
    const mg2GenAtPcuKw = regenPowerKw + Math.abs(mg1ToPcuKw) + READY_AUX_LOAD_KW;
    const mg2CounterDragKw = -(mg2GenAtPcuKw / 0.95);
    flows = {
      iceToCarrierKw: -bModeEngineDragKw,
      carrierToRingKw,
      carrierToSunKw,
      mg1ToPcuKw,
      pcuToMg2Kw: -mg2GenAtPcuKw,
      batteryToPcuKw: -regenPowerKw,
      mg2ToCounterKw: mg2CounterDragKw,
      counterToWheelKw: carrierToRingKw + mg2CounterDragKw - frictionBrakeKw,
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
        batteryToPcuKw: pcuFromMg2Kw + READY_AUX_LOAD_KW,
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
        batteryToPcuKw: pcuDemand + READY_AUX_LOAD_KW,
        mg2ToCounterKw: evKw,
        counterToWheelKw: evKw,
        frictionBrakeKw,
      };
    }
  } else if (modeId === OperationModeId.ICE_START) {
    const crankKw = 4.6;
    const carrierToRingKw = 2.5 + crankKw;
    const wheelKw = Math.max(carrierToRingKw, wheelMechPowerKw);
    const mg2AssistKw = Math.min(PSD_CONSTANTS.MG2_MAX_POWER_KW, Math.max(0, wheelKw - carrierToRingKw));
    const mg1DrawKw = -crankKw / 0.94;
    const mg2DrawKw = mg2MechToPcuDemand(mg2AssistKw);
    flows = {
      iceToCarrierKw: 2.5,
      carrierToRingKw,
      carrierToSunKw: -crankKw,
      mg1ToPcuKw: mg1DrawKw,
      pcuToMg2Kw: mg2DrawKw,
      batteryToPcuKw: mg2DrawKw - mg1DrawKw + READY_AUX_LOAD_KW,
      mg2ToCounterKw: mg2AssistKw,
      counterToWheelKw: carrierToRingKw + mg2AssistKw,
      frictionBrakeKw: 0,
    };
  } else {
    const boostExtraBatteryKw =
      modeId === OperationModeId.POWER_BOOST && prev.socPercent > 34
        ? Math.min(PSD_CONSTANTS.HV_BATTERY_MAX_BOOST_KW, Math.max(6, (throttle - 0.56) * 65))
        : 0;
    const chargeTargetKw = forcedChargeActive
      ? 10.5
      : prev.socPercent < 55
        ? (56 - prev.socPercent) * 0.35
        : prev.socPercent > 64
          ? -Math.min(7.5, (prev.socPercent - 64) * 0.48)
          : 0;

    const maxIceKwAtCurrentRpm = Math.min(
      PSD_CONSTANTS.ICE_MAX_POWER_KW,
      (maxIceTorqueAtRpm(Math.max(1000, cleanIceRpm)) * Math.max(1000, cleanIceRpm)) / 9549
    );

    const requestedIceKw =
      Math.max(0, wheelMechPowerKw) / 0.91 - boostExtraBatteryKw + chargeTargetKw;
    const iceKw = Math.min(maxIceKwAtCurrentRpm, Math.max(9.5, requestedIceKw));

    const omegaC = Math.max(60, (cleanIceRpm * 2 * Math.PI) / 60);
    const omegaS = (mg1Rpm * 2 * Math.PI) / 60;
    const omegaR = (ringRpm * 2 * Math.PI) / 60;
    const torqueCarrierNm = (iceKw * 1000) / omegaC;

    const carrierToRingKw = (RING_CARRIER_SHARE * torqueCarrierNm * omegaR) / 1000;
    const carrierToSunKw = (SUN_CARRIER_SHARE * torqueCarrierNm * omegaS) / 1000;
    const mg1ToPcuKw = mechToPcuElectrical(carrierToSunKw);

    const rawMg2Kw = Math.max(0, wheelMechPowerKw) - carrierToRingKw;
    const maxMg2FromBattAndMg1 = Math.min(
      PSD_CONSTANTS.MG2_MAX_POWER_KW,
      (mg1ToPcuKw + (prev.socPercent > 32 ? 27 : 6)) * 0.95
    );
    const mg2ToCounterKw = Math.max(
      -PSD_CONSTANTS.MG2_MAX_POWER_KW,
      Math.min(maxMg2FromBattAndMg1, rawMg2Kw)
    );

    const pcuToMg2Kw = mg2MechToPcuDemand(mg2ToCounterKw);
    const batteryToPcuKw = pcuToMg2Kw + READY_AUX_LOAD_KW - mg1ToPcuKw;

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
    const chgRatio = Math.min(1, Math.abs(flows.counterToWheelKw) / 32);
    targetHsi = -chgRatio * 100;
    hsiZone = HsiZone.CHG;
  } else if (!iceFuelActive && cleanIceRpm < 100) {
    const evRefKw = Math.max(12, evModeRequested && speedKmh <= 42 ? 29 : 21);
    const evRatio = Math.min(1, Math.max(0, flows.counterToWheelKw) / evRefKw);
    targetHsi = evRatio * 42;
    hsiZone = targetHsi > 1 ? HsiZone.ECO_EV : HsiZone.OFF;
  } else if (modeId === OperationModeId.POWER_BOOST || throttle > 0.65) {
    const pwrRatio = Math.min(1, Math.max(0, (flows.counterToWheelKw - 60) / 63));
    targetHsi = 72 + pwrRatio * 28;
    hsiZone = HsiZone.PWR;
  } else {
    const ecoRatio = Math.min(1, Math.max(0, flows.iceToCarrierKw) / 66);
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
