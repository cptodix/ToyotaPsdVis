import { RotationDir } from '../types/hybrid';
import {
  COUNTER_TO_RING_RATIO,
  MG2_TO_RING_RATIO,
  PSD_CONSTANTS,
  RING_TO_WHEEL_RATIO,
  TOTAL_PSD_TEETH,
} from './vehicleSpecs';

/**
 * Pure Planetary Gearset (Willis Equation) & Driveline Kinematics:
 *   Z_S * ω_S + Z_R * ω_R = (Z_S + Z_R) * ω_C
 * where Sun = MG1 (30T), Ring = Final Output (78T), Carrier = ICE (4 × 24T planets).
 */

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
