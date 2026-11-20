import assert from 'node:assert/strict';
import { AutoDriveController, isTransitionalPhase } from '../src/autodrive';
import { PSD_CONSTANTS, TOTAL_PSD_TEETH } from '../src/drivetrain';
import { HybridSimulationSession, MAX_LOG_ENTRIES } from '../src/engine';
import {
  AnimationSpeedMode,
  AutoDriveMode,
  GearPosition,
  OperationModeId,
  WorkspaceTab,
} from '../src/types/hybrid';

export interface AutoDriveAuditSummary {
  cityMixedKmPerL: number;
  highwayMixedKmPerL: number;
  mountainAvgSpeedKmh: number;
  uniqueCityEventsSeen: number;
  uniqueHighwayEventsSeen: number;
  uniqueMountainEventsSeen: number;
}

function runAutoDriveStretch(
  session: HybridSimulationSession,
  mode: AutoDriveMode,
  durationSec: number
): {
  uniqueEvents: Set<string>;
  odoDeltaKm: number;
  fuelDeltaL: number;
  avgSpeedKmh: number;
} {
  session.selectAutoDriveMode(mode);
  const odoStart = session.state.odometerKm;
  const fuelStart = session.state.totalFuelLiters;
  const uniqueEvents = new Set<string>();
  const dt = 0.05;
  const steps = Math.round(durationSec / dt);
  let speedSum = 0;

  for (let i = 0; i < steps; i++) {
    const res = session.tick(dt, WorkspaceTab.SIMULATOR);
    const s = res.state;
    uniqueEvents.add(s.autoDrive.eventKind);
    speedSum += s.speedKmh;

    assert.ok(Number.isFinite(s.speedKmh) && s.speedKmh >= -5 && s.speedKmh <= 176, 'Speed bounded');
    assert.ok(Number.isFinite(s.socPercent) && s.socPercent >= 23.9 && s.socPercent <= 86.1, 'SoC bounded');
    assert.ok(s.iceRpm >= 0 && s.iceRpm <= PSD_CONSTANTS.ICE_MAX_RPM + 50, 'ICE >= 0 & bounded');
    const wErr = Math.abs(
      PSD_CONSTANTS.Z_SUN * s.mg1Rpm + PSD_CONSTANTS.Z_RING * s.ringRpm - TOTAL_PSD_TEETH * s.iceRpm
    );
    assert.ok(wErr < 1e-4, 'AutoDrive Willis invariant holds at every tick');
  }

  return {
    uniqueEvents,
    odoDeltaKm: session.state.odometerKm - odoStart,
    fuelDeltaL: session.state.totalFuelLiters - fuelStart,
    avgSpeedKmh: speedSum / steps,
  };
}

export function runAutoDriveAndSessionTests(): { checks: number; summary: AutoDriveAuditSummary } {
  let checks = 0;

  // 1. All 6 Cross-Mode AutoDrive Transitions pass through real-life transitional statuses
  const ctrl = new AutoDriveController();
  const pairs: Array<[AutoDriveMode, number, number, AutoDriveMode]> = [
    [AutoDriveMode.CITY, 45, 0, AutoDriveMode.HIGHWAY],
    [AutoDriveMode.HIGHWAY, 110, 0, AutoDriveMode.CITY],
    [AutoDriveMode.CITY, 42, 0, AutoDriveMode.MOUNTAIN],
    [AutoDriveMode.MOUNTAIN, 50, -10, AutoDriveMode.CITY],
    [AutoDriveMode.HIGHWAY, 108, 0, AutoDriveMode.MOUNTAIN],
    [AutoDriveMode.MOUNTAIN, 55, 12, AutoDriveMode.HIGHWAY],
  ];

  for (const [fromMode, speed, grade, toMode] of pairs) {
    ctrl.setMode(fromMode, speed, 20, 0, grade);
    const status = ctrl.setMode(toMode, speed, 20, 0, grade);
    assert.ok(
      isTransitionalPhase(status.eventKind),
      `Transition ${fromMode} -> ${toMode} should enter transitional phase, got ${status.eventKind}`
    );
    checks += 1;
  }

  // 2. HybridSimulationSession orchestration checks
  const session = new HybridSimulationSession();
  assert.equal(session.autoDriveMode, AutoDriveMode.CITY, 'Defaults to City AutoDrive');
  assert.equal(session.logNotifEnabled, false, 'Notifications default to OFF');
  assert.equal(session.animationSpeedMode, AnimationSpeedMode.NORMAL, 'Animation speed defaults to NORMAL');

  session.setAnimationSpeedMode(AnimationSpeedMode.REALISTIC);
  assert.equal(session.animationSpeedMode, AnimationSpeedMode.REALISTIC, 'Can switch to REALISTIC speed mode');

  // Auto Slo-Mo toggles notif ON/OFF cleanly
  const sloOn = session.toggleAutoSloMo();
  assert.equal(sloOn.autoSloMo, true);
  assert.equal(sloOn.logNotifEnabled, true, 'Enabling Auto Slo-Mo turns notifications ON');

  const sloOff = session.toggleAutoSloMo();
  assert.equal(sloOff.autoSloMo, false);
  assert.equal(sloOff.logNotifEnabled, false, 'Disabling Auto Slo-Mo turns notifications OFF');

  // Manual throttle cancels AutoDrive
  session.setThrottle(35);
  assert.equal(session.autoDriveMode, AutoDriveMode.OFF, 'Manual throttle cancels AutoDrive');

  // Log cap strictly <= 100 entries even after 150 discrete mode toggles
  for (let i = 0; i < 150; i++) {
    session.selectOperationMode(i % 2 === 0 ? OperationModeId.EV_DRIVE : OperationModeId.POWER_BOOST);
  }
  assert.equal(session.logEntries.length, MAX_LOG_ENTRIES, 'Log list must cap strictly at 100 entries');

  // Reset restores fresh clean City Drive & Normal animation speed
  const resetState = session.reset();
  assert.equal(session.logEntries.length, 0);
  assert.equal(session.autoDriveMode, AutoDriveMode.CITY);
  assert.equal(session.animationSpeedMode, AnimationSpeedMode.NORMAL);
  assert.equal(resetState.gear, GearPosition.D);
  assert.equal(resetState.speedKmh, 0);
  checks += 10;

  // 3. Long randomized stress & fuel-economy audit across City (240s), Highway (240s), Mountain (240s)
  const sim = new HybridSimulationSession();
  const city = runAutoDriveStretch(sim, AutoDriveMode.CITY, 240);
  const hwy = runAutoDriveStretch(sim, AutoDriveMode.HIGHWAY, 240);
  const mtn = runAutoDriveStretch(sim, AutoDriveMode.MOUNTAIN, 240);

  const cityMixedKmPerL = city.odoDeltaKm / Math.max(1e-6, city.fuelDeltaL);
  const highwayMixedKmPerL = hwy.odoDeltaKm / Math.max(1e-6, hwy.fuelDeltaL);

  assert.ok(city.uniqueEvents.size >= 5, `City stress should exercise >=5 events (saw ${city.uniqueEvents.size})`);
  assert.ok(hwy.uniqueEvents.size >= 5, `Highway stress should exercise >=5 events (saw ${hwy.uniqueEvents.size})`);
  assert.ok(mtn.uniqueEvents.size >= 5, `Mountain stress should exercise >=5 events (saw ${mtn.uniqueEvents.size})`);
  assert.ok(
    cityMixedKmPerL >= 11 && cityMixedKmPerL <= 35,
    `Realistic Innova Zenix Hybrid City cycle fuel economy expected 11–35 km/L, got ${cityMixedKmPerL.toFixed(1)}`
  );
  assert.ok(
    highwayMixedKmPerL >= 10.0 && highwayMixedKmPerL <= 25,
    `Realistic Innova Zenix Hybrid Dynamic Highway cycle (with overtakes/tolls/viaducts) expected 10–25 km/L, got ${highwayMixedKmPerL.toFixed(1)}`
  );
  checks += 5;

  return {
    checks,
    summary: {
      cityMixedKmPerL,
      highwayMixedKmPerL,
      mountainAvgSpeedKmh: mtn.avgSpeedKmh,
      uniqueCityEventsSeen: city.uniqueEvents.size,
      uniqueHighwayEventsSeen: hwy.uniqueEvents.size,
      uniqueMountainEventsSeen: mtn.uniqueEvents.size,
    },
  };
}
