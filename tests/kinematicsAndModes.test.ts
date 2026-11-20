import assert from 'node:assert/strict';
import {
  buildStateFromMode,
  classifyIceOperatingStatus,
  OPERATION_MODES,
  PSD_CONSTANTS,
  READY_AUX_LOAD_KW,
  solveIceRpm,
  solveManualKinematics,
  solveMg1Rpm,
  solveRingRpm,
  TOTAL_PSD_TEETH,
} from '../src/drivetrain';
import { IceCombustionMode, OperationModeId, SolveTarget } from '../src/types/hybrid';

function approx(actual: number, expected: number, tol: number, label: string) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label}: expected ${expected.toFixed(3)} ± ${tol}, got ${actual.toFixed(3)}`
  );
}

export function runKinematicsAndModesTests(): number {
  let checks = 0;

  // 1. Exact Willis identity across diverse operating regimes
  const samplePairs: Array<[number, number]> = [
    [0, 0],
    [0, 1040],
    [0, -510],
    [1300, 0],
    [1820, 1520],
    [1780, 2770],
    [5050, 3150],
    [3100, 1560],
  ];
  for (const [ice, ring] of samplePairs) {
    const mg1 = solveMg1Rpm(ice, ring);
    const lhs = PSD_CONSTANTS.Z_SUN * mg1 + PSD_CONSTANTS.Z_RING * ring;
    const rhs = TOTAL_PSD_TEETH * ice;
    approx(lhs, rhs, 1e-6, `Willis identity (ICE=${ice}, Ring=${ring})`);
    approx(solveRingRpm(ice, mg1), ring, 1e-6, `solveRingRpm roundtrip`);
    approx(solveIceRpm(mg1, ring), ice, 1e-6, `solveIceRpm roundtrip`);
    checks += 3;
  }

  // 2. Audit all 10 representative THS-5 Operation Modes
  assert.equal(OPERATION_MODES.length, 10, 'Should expose all 10 THS-5 operation modes');
  for (const spec of OPERATION_MODES) {
    const state = buildStateFromMode(spec);
    const lhs = PSD_CONSTANTS.Z_SUN * state.mg1Rpm + PSD_CONSTANTS.Z_RING * state.ringRpm;
    const rhs = TOTAL_PSD_TEETH * state.iceRpm;
    approx(lhs, rhs, 1e-5, `Mode ${spec.id} Willis equation`);

    // Carrier mechanical power conservation: P_C = P_R + P_S
    approx(
      state.flows.carrierToRingKw + state.flows.carrierToSunKw,
      state.flows.iceToCarrierKw,
      0.25,
      `Mode ${spec.id} planetary mechanical power balance`
    );

    // PCU electrical Kirchhoff balance: P_batt = P_pcuToMg2 + P_aux - P_mg1ToPcu
    const expectedBattKw =
      state.flows.pcuToMg2Kw + READY_AUX_LOAD_KW - state.flows.mg1ToPcuKw;
    approx(
      state.flows.batteryToPcuKw,
      expectedBattKw,
      0.35,
      `Mode ${spec.id} PCU electrical power balance`
    );

    // Total wheel path: P_wheel = carrierToRing + mg2ToCounter
    approx(
      state.flows.counterToWheelKw,
      state.flows.carrierToRingKw + state.flows.mg2ToCounterKw,
      0.25,
      `Mode ${spec.id} final countershaft power sum`
    );

    // Hardware RPM ceilings
    assert.ok(state.iceRpm >= 0 && state.iceRpm <= PSD_CONSTANTS.ICE_MAX_RPM, `Mode ${spec.id} ICE RPM bounds`);
    assert.ok(
      Math.abs(state.mg1Rpm) <= PSD_CONSTANTS.MG1_MAX_RPM + 100,
      `Mode ${spec.id} MG1 RPM bounds (${state.mg1Rpm})`
    );
    assert.ok(
      Math.abs(state.mg2Rpm) <= PSD_CONSTANTS.MG2_MAX_RPM,
      `Mode ${spec.id} MG2 RPM bounds (${state.mg2Rpm})`
    );
    checks += 5;
  }

  // Verify specific hallmark behaviors of key modes
  const overdrive = buildStateFromMode(
    OPERATION_MODES.find((m) => m.id === OperationModeId.HIGHWAY_OVERDRIVE)!
  );
  assert.ok(overdrive.mg1Rpm < -500, 'Overdrive must spin MG1 CCW (<0 RPM)');
  assert.equal(overdrive.brakingSplit.regenPercent, 0, 'Overdrive circulation must NOT trigger Regen Braking %');
  assert.equal(overdrive.brakingSplit.mechPercent, 0, 'Overdrive circulation must NOT trigger Mech Braking %');

  const bMode = buildStateFromMode(
    OPERATION_MODES.find((m) => m.id === OperationModeId.B_MODE_DESCENT)!
  );
  assert.equal(bMode.iceFuelActive, false, 'B-mode descent must have fuel cut');
  assert.equal(bMode.instantFuelLph, 0, 'B-mode fuel cut means 0 L/h');
  assert.ok(bMode.iceRpm > 2000, 'B-mode spins ICE as air pump');

  // 3. Manual Kinematics Solver invariants
  const baseStop = buildStateFromMode(OPERATION_MODES[0]);
  // Attempt illegal CCW ICE spin -> must clamp strictly >= 0 (one-way 4-stroke crankshaft)
  const blockedIceCcw = solveManualKinematics(baseStop, 'ICE', -2500, SolveTarget.MG1);
  assert.equal(blockedIceCcw.iceRpm, 0, 'ICE must never spin CCW in manual mode');

  // Spin Ring forward in EV (ICE = 0) -> MG1 must spin CCW (-2.6 * Ring)
  const evSpin = solveManualKinematics(blockedIceCcw, 'WHEEL_MG2', 1000, SolveTarget.MG1);
  approx(evSpin.mg1Rpm, -2600, 0.1, 'Manual EV MG1 = -2.6 * Ring');
  assert.ok(evSpin.speedKmh > 35 && evSpin.speedKmh < 45, '1000 Ring RPM ≈ 40 km/h');

  // Spin ICE while holding Ring fixed -> solves MG1 within bounds
  const holdWheel = solveManualKinematics(evSpin, 'ICE', 2200, SolveTarget.MG1);
  approx(
    PSD_CONSTANTS.Z_SUN * holdWheel.mg1Rpm + PSD_CONSTANTS.Z_RING * holdWheel.ringRpm,
    TOTAL_PSD_TEETH * holdWheel.iceRpm,
    1e-4,
    'Manual solve preserves Willis constraint'
  );
  checks += 8;

  // 4. ICE Combustion Power vs Unfueled Spinning Classification
  const stopIceStatus = classifyIceOperatingStatus(0, false, 0);
  assert.equal(stopIceStatus.mode, IceCombustionMode.STOPPED);
  assert.equal(stopIceStatus.isCombusting, false);

  const normalSplit = buildStateFromMode(
    OPERATION_MODES.find((m) => m.id === OperationModeId.NORMAL_SPLIT)!
  );
  const splitIceStatus = classifyIceOperatingStatus(
    normalSplit.iceRpm,
    normalSplit.iceFuelActive,
    normalSplit.flows.iceToCarrierKw
  );
  assert.equal(splitIceStatus.mode, IceCombustionMode.PRODUCING_POWER);
  assert.equal(splitIceStatus.isCombusting, true);
  assert.ok(splitIceStatus.badgeText.includes('FIRING'));

  const bModeIceStatus = classifyIceOperatingStatus(
    bMode.iceRpm,
    bMode.iceFuelActive,
    bMode.flows.iceToCarrierKw
  );
  assert.equal(bModeIceStatus.mode, IceCombustionMode.MOTORING_AIR_PUMP);
  assert.equal(bModeIceStatus.isCombusting, false);
  assert.ok(bModeIceStatus.badgeText.includes('NO FUEL'));

  const overspeedFuelCutStatus = classifyIceOperatingStatus(1080, false, 0);
  assert.equal(overspeedFuelCutStatus.mode, IceCombustionMode.SPINNING_FUEL_CUT);
  assert.equal(overspeedFuelCutStatus.isCombusting, false);

  const neutralIdleStatus = classifyIceOperatingStatus(950, true, 0);
  assert.equal(neutralIdleStatus.mode, IceCombustionMode.FIRING_IDLE);
  assert.equal(neutralIdleStatus.isCombusting, true);
  checks += 5;

  return checks;
}
