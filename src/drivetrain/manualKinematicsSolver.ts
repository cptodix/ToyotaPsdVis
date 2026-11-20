import { IDLE_AUTODRIVE_STATUS } from '../autodrive/idleStatus';
import { HsiZone, PowerFlowsKw, PowertrainState, SolveTarget } from '../types/hybrid';
import {
  computeFuelRateLitersPerSec,
  computeSplits,
  mechToPcuElectrical,
  mg2MechToPcuDemand,
} from './thermodynamicsAndSplits';
import { PSD_CONSTANTS, READY_AUX_LOAD_KW, RING_CARRIER_SHARE, SUN_CARRIER_SHARE } from './vehicleSpecs';
import { deriveSecondarySpeeds, solveIceRpm, solveMg1Rpm, solveRingRpm } from './willisKinematics';

export function solveManualKinematics(
  current: PowertrainState,
  changed: 'ICE' | 'MG1' | 'WHEEL_MG2',
  newValueRpm: number,
  solveTarget: SolveTarget
): PowertrainState {
  const MIN_ICE = 0; // Real 4-stroke Atkinson ICE cannot spin CCW/reverse
  const MAX_ICE = PSD_CONSTANTS.ICE_MAX_RPM; // 6000 RPM
  const MIN_MG1 = -PSD_CONSTANTS.MG1_MAX_RPM; // -10500 RPM
  const MAX_MG1 = PSD_CONSTANTS.MG1_MAX_RPM; // +10500 RPM
  const MIN_RING = -1800; // Realistic electric reverse limit (~ -67 km/h)
  const MAX_RING = 4800; // Forward ceiling (~ 180 km/h)

  const clampIce = (v: number) => Math.max(MIN_ICE, Math.min(MAX_ICE, v));
  const clampMg1 = (v: number) => Math.max(MIN_MG1, Math.min(MAX_MG1, v));
  const clampRing = (v: number) => Math.max(MIN_RING, Math.min(MAX_RING, v));

  let iceRpm = clampIce(current.iceRpm);
  let mg1Rpm = clampMg1(current.mg1Rpm);
  let ringRpm = clampRing(current.ringRpm);

  if (changed === 'ICE') {
    iceRpm = clampIce(newValueRpm);
    if (solveTarget === SolveTarget.WHEEL) {
      ringRpm = solveRingRpm(iceRpm, mg1Rpm);
      if (ringRpm < MIN_RING || ringRpm > MAX_RING) {
        ringRpm = clampRing(ringRpm);
        mg1Rpm = solveMg1Rpm(iceRpm, ringRpm);
        if (mg1Rpm < MIN_MG1 || mg1Rpm > MAX_MG1) {
          mg1Rpm = clampMg1(mg1Rpm);
          iceRpm = clampIce(solveIceRpm(mg1Rpm, ringRpm));
        }
      }
    } else {
      mg1Rpm = solveMg1Rpm(iceRpm, ringRpm);
      if (mg1Rpm < MIN_MG1 || mg1Rpm > MAX_MG1) {
        mg1Rpm = clampMg1(mg1Rpm);
        ringRpm = solveRingRpm(iceRpm, mg1Rpm);
        if (ringRpm < MIN_RING || ringRpm > MAX_RING) {
          ringRpm = clampRing(ringRpm);
          iceRpm = clampIce(solveIceRpm(mg1Rpm, ringRpm));
        }
      }
    }
  } else if (changed === 'MG1') {
    mg1Rpm = clampMg1(newValueRpm);
    if (solveTarget === SolveTarget.ICE) {
      iceRpm = solveIceRpm(mg1Rpm, ringRpm);
      if (iceRpm < MIN_ICE || iceRpm > MAX_ICE) {
        iceRpm = clampIce(iceRpm);
        ringRpm = solveRingRpm(iceRpm, mg1Rpm);
        if (ringRpm < MIN_RING || ringRpm > MAX_RING) {
          ringRpm = clampRing(ringRpm);
          mg1Rpm = clampMg1(solveMg1Rpm(iceRpm, ringRpm));
        }
      }
    } else {
      ringRpm = solveRingRpm(iceRpm, mg1Rpm);
      if (ringRpm < MIN_RING || ringRpm > MAX_RING) {
        ringRpm = clampRing(ringRpm);
        iceRpm = solveIceRpm(mg1Rpm, ringRpm);
        if (iceRpm < MIN_ICE || iceRpm > MAX_ICE) {
          iceRpm = clampIce(iceRpm);
          mg1Rpm = clampMg1(solveMg1Rpm(iceRpm, ringRpm));
        }
      }
    }
  } else {
    ringRpm = clampRing(newValueRpm);
    if (solveTarget === SolveTarget.ICE) {
      iceRpm = solveIceRpm(mg1Rpm, ringRpm);
      if (iceRpm < MIN_ICE || iceRpm > MAX_ICE) {
        iceRpm = clampIce(iceRpm);
        mg1Rpm = solveMg1Rpm(iceRpm, ringRpm);
        if (mg1Rpm < MIN_MG1 || mg1Rpm > MAX_MG1) {
          mg1Rpm = clampMg1(mg1Rpm);
          ringRpm = clampRing(solveRingRpm(iceRpm, mg1Rpm));
        }
      }
    } else {
      mg1Rpm = solveMg1Rpm(iceRpm, ringRpm);
      if (mg1Rpm < MIN_MG1 || mg1Rpm > MAX_MG1) {
        mg1Rpm = clampMg1(mg1Rpm);
        iceRpm = solveIceRpm(mg1Rpm, ringRpm);
        if (iceRpm < MIN_ICE || iceRpm > MAX_ICE) {
          iceRpm = clampIce(iceRpm);
          ringRpm = clampRing(solveRingRpm(iceRpm, mg1Rpm));
        }
      }
    }
  }

  if (Math.abs(iceRpm) < 1) iceRpm = 0;
  if (Math.abs(mg1Rpm) < 1) mg1Rpm = 0;
  if (Math.abs(ringRpm) < 1) ringRpm = 0;

  const sec = deriveSecondarySpeeds(iceRpm, mg1Rpm, ringRpm);
  const iceActive = iceRpm > 400;

  const estRoadLoadKw =
    Math.abs(sec.speedKmh) < 1
      ? 0
      : Math.max(3.5, 0.095 * Math.abs(sec.speedKmh) + 0.00054 * sec.speedKmh * sec.speedKmh);

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
      batteryToPcuKw: READY_AUX_LOAD_KW,
      mg2ToCounterKw: 0,
      counterToWheelKw: 0,
      frictionBrakeKw: 0,
    };
    phaseTitle = 'Stationary Standby (Manual)';
    phaseSummary =
      'All planetary members are near 0 RPM while READY-mode A/C & infotainment draw ~0.9 kW from the NiMH battery.';
  } else if (!iceActive) {
    const evKw = Math.min(PSD_CONSTANTS.MG2_MAX_POWER_KW, estRoadLoadKw);
    const evPcuDemand = mg2MechToPcuDemand(evKw);
    flows = {
      iceToCarrierKw: 0,
      carrierToRingKw: 0,
      carrierToSunKw: 0,
      mg1ToPcuKw: 0,
      pcuToMg2Kw: evPcuDemand,
      batteryToPcuKw: evPcuDemand + READY_AUX_LOAD_KW,
      mg2ToCounterKw: evKw,
      counterToWheelKw: evKw,
      frictionBrakeKw: 0,
    };
    if (ringRpm < -15) {
      phaseTitle = 'Electric Reverse Kinematics (Manual)';
      phaseSummary =
        'MG2 & Ring Gear spin CCW backward while stationary ICE Carrier (0 RPM) forces Sun Gear (MG1) to spin CW.';
    } else {
      phaseTitle = 'EV Propulsion Kinematics (Manual)';
      phaseSummary =
        'With ICE Carrier stationary at 0 RPM, forward Ring Gear rotation forces Planet Gears to spin Sun Gear (MG1) in CCW reverse.';
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
