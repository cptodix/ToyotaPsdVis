import { runAutoDriveAndSessionTests } from './autoDriveAndSession.test';
import { runDrivingAndZenixAuditTests } from './drivingAndZenixAudit.test';
import { runKinematicsAndModesTests } from './kinematicsAndModes.test';

console.log('=== Toyota Innova Zenix Hybrid (THS V) Regression & Reference Audit ===\n');

const kChecks = runKinematicsAndModesTests();
console.log(`[PASS] Willis Kinematics, 10 Operation Modes & Manual Solver (${kChecks} assertions)`);

const { checks: dChecks, report } = runDrivingAndZenixAuditTests();
console.log(`[PASS] Driving Physics & Innova Zenix Hybrid Reference Audit (${dChecks} assertions)`);
console.log('       Zenix Hybrid (2,020 kg / 4 Adults) Audit Metrics:');
console.log(`         - 0–100 km/h WOT Acceleration : ${report.zeroTo100Sec.toFixed(2)} s (Target: 9.8–11.8 s)`);
console.log(`         - Peak Combined System Power  : ${report.peakWotCombinedHp.toFixed(1)} hp (Spec: 184 hp / 186 PS)`);
console.log(`         - Peak Net Wheel Power        : ${report.peakWotWheelKw.toFixed(1)} kW`);
console.log(`         - Governed Top Speed          : ${report.governedTopSpeedKmh.toFixed(1)} km/h (Spec: ~175 km/h)`);
console.log(
  `         - 100 km/h Cruise Economy     : ${report.steady100CruiseFuelKmPerL.toFixed(
    1
  )} km/L (ICE ${Math.round(report.steady100IceRpm)} RPM, MG1 ${Math.round(report.steady100Mg1Rpm)} RPM)`
);
console.log(`         - 100->0 km/h Regen Recovery  : +${report.regenRecovery100To0DeltaSoc.toFixed(2)}% NiMH SoC`);

const { checks: aChecks, summary } = runAutoDriveAndSessionTests();
console.log(`\n[PASS] AutoDrive Cross-Transitions, Session & 12-Min Stress (${aChecks} assertions)`);
console.log(`         - City Cycle Fuel Economy     : ${summary.cityMixedKmPerL.toFixed(1)} km/L (${summary.uniqueCityEventsSeen} events visited)`);
console.log(`         - Highway Cycle Fuel Economy  : ${summary.highwayMixedKmPerL.toFixed(1)} km/L (${summary.uniqueHighwayEventsSeen} events visited)`);
console.log(`         - Mountain Avg Speed          : ${summary.mountainAvgSpeedKmh.toFixed(1)} km/h (${summary.uniqueMountainEventsSeen} events visited)`);

console.log(`\nALL TESTS PASSED (${kChecks + dChecks + aChecks} total assertions).`);
