import assert from 'node:assert/strict';
import {
  buildStateFromMode,
  OPERATION_MODES,
  PSD_CONSTANTS,
  READY_AUX_LOAD_KW,
  stepDrivingSimulation,
  TOTAL_PSD_TEETH,
  VEHICLE_MASS_KG,
} from '../src/drivetrain';
import { GearPosition, OperationModeId, PowertrainState } from '../src/types/hybrid';

function freshDriveState(socPercent = 60): PowertrainState {
  const stopSpec = OPERATION_MODES.find((m) => m.id === OperationModeId.STOP)!;
  return {
    ...buildStateFromMode(stopSpec),
    gear: GearPosition.D,
    socPercent,
    odometerKm: 0,
    totalFuelLiters: 0,
  };
}

export interface ZenixAuditReport {
  zeroTo100Sec: number;
  peakWotCombinedHp: number;
  peakWotWheelKw: number;
  governedTopSpeedKmh: number;
  steady100CruiseFuelKmPerL: number;
  steady100Mg1Rpm: number;
  steady100IceRpm: number;
  regenRecovery100To0DeltaSoc: number;
}

export function runDrivingAndZenixAuditTests(): { checks: number; report: ZenixAuditReport } {
  let checks = 0;

  assert.equal(VEHICLE_MASS_KG, 2020, 'Laden mass should be 1,730 kg kerb + 4x72.5 kg = 2,020 kg');

  // 1. Park (P) READY A/C + 12V Aux Draw (0.9 kW) & Low-SoC Hysteresis (<40% start, >=48% stop)
  let pState = { ...freshDriveState(39.5), gear: GearPosition.P };
  pState = stepDrivingSimulation(
    pState,
    { gear: GearPosition.P, evModeRequested: false, throttlePercent: 0, brakePercent: 0, roadGradePercent: 0 },
    0.05
  );
  assert.equal(pState.forcedChargeActive, true, 'SoC < 40% in Park should start ICE recharge');
  assert.equal(pState.iceFuelActive, true, 'Park forced charge fuels ICE');
  assert.ok(pState.flows.batteryToPcuKw < -5, 'Net current should charge NiMH battery');

  let pStandby = { ...freshDriveState(62), gear: GearPosition.P };
  pStandby = stepDrivingSimulation(
    pStandby,
    { gear: GearPosition.P, evModeRequested: false, throttlePercent: 0, brakePercent: 0, roadGradePercent: 0 },
    0.05
  );
  assert.equal(pStandby.iceFuelActive, false, 'Healthy SoC in Park keeps ICE off');
  assert.equal(pStandby.flows.batteryToPcuKw, READY_AUX_LOAD_KW, 'READY standby draws 0.9 kW A/C+12V');
  checks += 5;

  // 2. Neutral (N): Inverters off (no recharge even <40% SoC, still drains 0.9 kW)
  let nState = { ...freshDriveState(35), gear: GearPosition.N };
  nState = stepDrivingSimulation(
    nState,
    { gear: GearPosition.N, evModeRequested: false, throttlePercent: 50, brakePercent: 0, roadGradePercent: 0 },
    0.05
  );
  assert.equal(nState.flows.mg1ToPcuKw, 0, 'Neutral cannot generate electrical power via MG1');
  assert.equal(nState.flows.pcuToMg2Kw, 0, 'Neutral cannot power MG2');
  assert.equal(nState.flows.batteryToPcuKw, READY_AUX_LOAD_KW, 'Neutral continues draining 0.9 kW aux');
  assert.ok(nState.socPercent < 35, 'Neutral SoC drops rather than charges');
  checks += 4;

  // 3. Reverse (R): Gearless MG2 CCW electric reverse
  let rState = { ...freshDriveState(65), gear: GearPosition.R };
  for (let i = 0; i < 80; i++) {
    rState = stepDrivingSimulation(
      rState,
      { gear: GearPosition.R, evModeRequested: false, throttlePercent: 50, brakePercent: 0, roadGradePercent: 0 },
      0.05
    );
  }
  assert.ok(rState.speedKmh < -10 && rState.speedKmh >= -35, 'Reverse accelerates backward cleanly');
  assert.ok(rState.mg2Rpm < 0 && rState.ringRpm < 0, 'Reverse spins MG2 & Ring CCW');
  assert.equal(rState.iceRpm, 0, 'Reverse with healthy SoC keeps ICE at 0 RPM');
  assert.ok(rState.mg1Rpm > 0, 'With ICE=0 & Ring<0, Willis forces MG1 CW');
  checks += 4;

  // 4. Quantitative Benchmark: 0–100 km/h WOT Acceleration (2,020 kg Innova Zenix Hybrid + 4 adults)
  let wotState = freshDriveState(68);
  let zeroTo100Sec = -1;
  let peakCombinedHp = 0;
  let peakWheelKw = 0;
  const dt = 0.04;

  for (let t = dt; t <= 45; t += dt) {
    wotState = stepDrivingSimulation(
      wotState,
      { gear: GearPosition.D, evModeRequested: false, throttlePercent: 100, brakePercent: 0, roadGradePercent: 0 },
      dt
    );
    peakCombinedHp = Math.max(peakCombinedHp, wotState.propulsionSplit.combinedHp);
    peakWheelKw = Math.max(peakWheelKw, wotState.flows.counterToWheelKw);
    if (zeroTo100Sec < 0 && wotState.speedKmh >= 100) {
      zeroTo100Sec = t;
    }
    // Check Willis & no NaNs every step
    const wDiff = Math.abs(
      PSD_CONSTANTS.Z_SUN * wotState.mg1Rpm +
        PSD_CONSTANTS.Z_RING * wotState.ringRpm -
        TOTAL_PSD_TEETH * wotState.iceRpm
    );
    assert.ok(wDiff < 1e-4 && Number.isFinite(wotState.speedKmh), 'WOT step must maintain Willis invariant');
  }

  // Governed Top Speed check after 45s WOT
  const governedTopSpeedKmh = wotState.speedKmh;
  assert.ok(
    zeroTo100Sec >= 9.0 && zeroTo100Sec <= 12.2,
    `Innova Zenix Hybrid (2,020 kg laden) 0–100 km/h should be ~9.8–11.8s, got ${zeroTo100Sec.toFixed(2)}s`
  );
  assert.ok(
    peakCombinedHp >= 165 && peakCombinedHp <= 188,
    `Peak combined system hp should approach 184 hp (186 PS) rating, got ${peakCombinedHp.toFixed(1)} hp`
  );
  assert.ok(
    governedTopSpeedKmh >= 168 && governedTopSpeedKmh <= 176,
    `Governed top speed should settle near 172–175 km/h, got ${governedTopSpeedKmh.toFixed(1)} km/h`
  );
  checks += 3;

  // 5. Dedicated EV Mode Switch behavior (<= 42 km/h light load)
  let evState = freshDriveState(65);
  for (let i = 0; i < 160; i++) {
    // ~8 seconds light urban pull (< 40% throttle)
    evState = stepDrivingSimulation(
      evState,
      { gear: GearPosition.D, evModeRequested: true, throttlePercent: 32, brakePercent: 0, roadGradePercent: 0 },
      0.05
    );
    if (evState.speedKmh <= 41) {
      assert.equal(evState.iceFuelActive, false, `EV mode <=41 km/h light load keeps ICE off (v=${evState.speedKmh.toFixed(1)})`);
    }
  }
  assert.ok(evState.speedKmh > 18, 'EV Mode accelerates vehicle under 32% throttle');
  checks += 2;

  // 6. Steady ~100 km/h Highway Overdrive Cruise Fuel Economy & MG1 CCW check
  let cruiseState: PowertrainState = {
    ...freshDriveState(60),
    speedKmh: 100,
    ringRpm: 2475,
    iceRpm: 1650,
    iceFuelActive: true,
    iceMinRunTimerSec: 3,
  };
  const dtCruise = 0.05;
  let odoStart = 0;
  let fuelStart = 0;
  for (let i = 0; i < 1200; i++) {
    // Simple speed controller around 100 km/h for 60s (skip first 10s settle)
    const err = 100 - cruiseState.speedKmh;
    const thr = Math.max(0, Math.min(45, 22 + err * 3.0));
    cruiseState = stepDrivingSimulation(
      cruiseState,
      { gear: GearPosition.D, evModeRequested: false, throttlePercent: thr, brakePercent: 0, roadGradePercent: 0 },
      dtCruise
    );
    if (i === 200) {
      odoStart = cruiseState.odometerKm;
      fuelStart = cruiseState.totalFuelLiters;
    }
  }
  const cruiseDistKm = cruiseState.odometerKm - odoStart;
  const cruiseFuelL = cruiseState.totalFuelLiters - fuelStart;
  const steady100CruiseFuelKmPerL = cruiseDistKm / Math.max(1e-6, cruiseFuelL);
  assert.ok(
    steady100CruiseFuelKmPerL >= 14.5 && steady100CruiseFuelKmPerL <= 24.5,
    `Innova Zenix Hybrid 100 km/h steady fuel economy should be 14.5–24.5 km/L, got ${steady100CruiseFuelKmPerL.toFixed(1)} km/L`
  );
  assert.ok(cruiseState.mg1Rpm < 0, `Steady 100 km/h cruise should be in MG1 CCW overdrive, got ${cruiseState.mg1Rpm.toFixed(0)} RPM`);
  checks += 2;

  // 7. Regenerative Braking (100 -> 0 km/h) & B-Range Steep Descent (-15% grade)
  let brakeState = { ...cruiseState, socPercent: 52 };
  const socBeforeBrake = brakeState.socPercent;
  for (let i = 0; i < 200; i++) {
    brakeState = stepDrivingSimulation(
      brakeState,
      { gear: GearPosition.D, evModeRequested: false, throttlePercent: 0, brakePercent: 35, roadGradePercent: 0 },
      0.05
    );
  }
  const regenRecovery100To0DeltaSoc = brakeState.socPercent - socBeforeBrake;
  assert.ok(brakeState.speedKmh < 1, 'Moderate brake brings car from 100 to 0 km/h within 10s');
  assert.ok(regenRecovery100To0DeltaSoc > 1.0, `Regen stop should recover SoC (>1%), got +${regenRecovery100To0DeltaSoc.toFixed(2)}%`);

  // B-mode descent on -15% grade at 60 km/h
  let bDesc = {
    ...freshDriveState(76),
    gear: GearPosition.B,
    speedKmh: 62,
    roadGradePercent: -15,
  };
  for (let i = 0; i < 60; i++) {
    bDesc = stepDrivingSimulation(
      bDesc,
      { gear: GearPosition.B, evModeRequested: false, throttlePercent: 0, brakePercent: 0, roadGradePercent: -15 },
      0.05
    );
  }
  assert.equal(bDesc.iceFuelActive, false, 'B-mode descent cuts ICE fuel');
  assert.equal(bDesc.instantFuelLph, 0, 'B-mode descent uses 0.00 L/h fuel');
  assert.ok(bDesc.iceRpm > 1400, `B-mode compression braking spins ICE (>1400 RPM), got ${bDesc.iceRpm.toFixed(0)}`);
  assert.ok(
    Math.abs(bDesc.flows.carrierToRingKw + bDesc.flows.carrierToSunKw - bDesc.flows.iceToCarrierKw) < 0.25,
    'B-mode planetary pumping split sums accurately to ICE drag kW'
  );
  checks += 6;

  // 8. Throttle Pedal Curve Monotonicity & Creep-to-Throttle Continuity (0% -> 100%)
  const thrSamples = [0, 10, 25, 40, 50, 75, 100];
  let prevLaunchKmh = -1;
  for (const thr of thrSamples) {
    let s = freshDriveState(60);
    for (let i = 0; i < 40; i++) {
      s = stepDrivingSimulation(
        s,
        { gear: GearPosition.D, evModeRequested: false, throttlePercent: thr, brakePercent: 0, roadGradePercent: 0 },
        0.05
      );
    }
    assert.ok(
      s.speedKmh > prevLaunchKmh,
      `Launch speed at ${thr}% throttle (${s.speedKmh.toFixed(2)} km/h) must strictly exceed previous (${prevLaunchKmh.toFixed(2)} km/h)`
    );
    prevLaunchKmh = s.speedKmh;
  }
  checks += 1;

  // 9. Toyota ECB Brake Curve Audit: 100% ABS Stopping Distance (~38–48m),
  //    25% City Light Braking (100% Regen), and Low-Speed (<5 km/h) Hydraulic Fade
  let absState = { ...freshDriveState(55), speedKmh: 100, iceRpm: 1500 };
  let absTimeSec = 0;
  let absDistM = 0;
  while (absState.speedKmh > 0.5 && absTimeSec < 10) {
    const v0 = absState.speedKmh / 3.6;
    absState = stepDrivingSimulation(
      absState,
      { gear: GearPosition.D, evModeRequested: false, throttlePercent: 0, brakePercent: 100, roadGradePercent: 0 },
      0.02
    );
    const v1 = absState.speedKmh / 3.6;
    absDistM += 0.5 * (v0 + v1) * 0.02;
    absTimeSec += 0.02;
  }
  assert.ok(
    absDistM >= 37 && absDistM <= 48 && absTimeSec <= 3.6,
    `100% ABS panic stop 100->0 km/h expected 37–48m & <=3.6s, got ${absDistM.toFixed(1)}m / ${absTimeSec.toFixed(2)}s`
  );

  // Light 15% city brake at 45 km/h (~24.6 kW < 32 kW NiMH limit) recovers 100% via MG2 regen (0 friction pad waste)
  const lightBrakeStep = stepDrivingSimulation(
    { ...freshDriveState(55), speedKmh: 45 },
    { gear: GearPosition.D, evModeRequested: false, throttlePercent: 0, brakePercent: 15, roadGradePercent: 0 },
    0.05
  );
  assert.equal(
    lightBrakeStep.flows.frictionBrakeKw,
    0,
    '15% urban brake at 45 km/h should be 100% regenerative without hydraulic pad waste'
  );
  assert.ok(lightBrakeStep.flows.batteryToPcuKw < -20, '15% urban brake recovers power into NiMH pack');

  // Stronger 25% brake at 45 km/h (~44.3 kW > 32 kW limit) saturates NiMH regen and blends excess to hydraulic pads
  const moderateBrakeStep = stepDrivingSimulation(
    { ...freshDriveState(55), speedKmh: 45 },
    { gear: GearPosition.D, evModeRequested: false, throttlePercent: 0, brakePercent: 25, roadGradePercent: 0 },
    0.05
  );
  assert.ok(
    moderateBrakeStep.flows.batteryToPcuKw < -28 && moderateBrakeStep.flows.frictionBrakeKw > 8,
    '25% brake at 45 km/h saturates NiMH regen (~32 kW) and blends excess to hydraulic discs'
  );

  // Below 5 km/h regen fades smoothly into hydraulic disc hold to avoid low-speed lurch
  const crawlBrakeStep = stepDrivingSimulation(
    { ...freshDriveState(55), speedKmh: 4.0 },
    { gear: GearPosition.D, evModeRequested: false, throttlePercent: 0, brakePercent: 30, roadGradePercent: 0 },
    0.05
  );
  assert.ok(
    crawlBrakeStep.flows.frictionBrakeKw > Math.abs(crawlBrakeStep.flows.mg2ToCounterKw),
    'Below 5 km/h hydraulic friction pads take over from fading MG2 regen'
  );
  checks += 4;

  return {
    checks,
    report: {
      zeroTo100Sec,
      peakWotCombinedHp: peakCombinedHp,
      peakWotWheelKw: peakWheelKw,
      governedTopSpeedKmh,
      steady100CruiseFuelKmPerL,
      steady100Mg1Rpm: cruiseState.mg1Rpm,
      steady100IceRpm: cruiseState.iceRpm,
      regenRecovery100To0DeltaSoc,
    },
  };
}
