import {
  GearPosition,
  OperationModeId,
  PowertrainState,
  PsdLogCategory,
  PsdLogEntry,
  RotationDir,
} from '../types/hybrid';
import { getRotationDirection } from './willisKinematics';

type FlowSign = 'POS' | 'NEG' | 'IDLE';

function flowDir(kw: number, deadband = 0.75): FlowSign {
  if (kw > deadband) return 'POS';
  if (kw < -deadband) return 'NEG';
  return 'IDLE';
}

function dirLabel(dir: RotationDir, isWheel = false): string {
  if (dir === RotationDir.STOP) return 'STOP';
  if (isWheel) return dir === RotationDir.CW ? 'CW (FWD)' : 'CCW (REV)';
  return dir === RotationDir.CW ? 'CW' : 'CCW';
}

function formatNowTime(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

interface TrackerSnapshot {
  gear: GearPosition;
  modeId: OperationModeId;
  phaseTitle: string;
  iceFuelActive: boolean;
  evIndicatorOn: boolean;
  forcedChargeActive: boolean;
  iceDir: RotationDir;
  mg1Dir: RotationDir;
  mg2Dir: RotationDir;
  wheelDir: RotationDir;
  battFlow: FlowSign;
  mg1Flow: FlowSign;
  mg2Flow: FlowSign;
  iceFlow: FlowSign;
  wheelFlow: FlowSign;
}

function snapshotOf(s: PowertrainState): TrackerSnapshot {
  return {
    gear: s.gear,
    modeId: s.activeModeId,
    phaseTitle: s.activePhaseTitle,
    iceFuelActive: s.iceFuelActive,
    evIndicatorOn: s.evIndicatorOn,
    forcedChargeActive: s.forcedChargeActive,
    iceDir: getRotationDirection(s.iceRpm, 18),
    mg1Dir: getRotationDirection(s.mg1Rpm, 22),
    mg2Dir: getRotationDirection(s.mg2Rpm, 22),
    wheelDir: getRotationDirection(s.wheelRpm, 6),
    battFlow: flowDir(s.flows.batteryToPcuKw, 0.75),
    mg1Flow: flowDir(s.flows.mg1ToPcuKw, 0.75),
    mg2Flow: flowDir(s.flows.mg2ToCounterKw, 0.75),
    iceFlow: flowDir(s.flows.iceToCarrierKw, 0.75),
    wheelFlow: flowDir(s.flows.counterToWheelKw, 0.75),
  };
}

export interface PsdInspectionResult {
  entries: PsdLogEntry[];
  triggerPreSloMo: boolean;
  triggerPostSloMo: boolean;
}

/**
 * Monitors simulation frames and discrete controls for:
 *  1) Hybrid operating status / gear / fuel state changes
 *  2) Electrical & mechanical power flow pathway reversals
 *  3) Rotational direction changes on ICE, MG1, MG2/Ring, and Drive Wheel
 * Also predicts imminent zero-crossings / starts so Auto Slo-Mo activates just before & after transitions.
 */
export class PsdTransitionTracker {
  private prev: TrackerSnapshot | null = null;
  private nextId = 1;
  private simClockSec = 0;
  private lastFlowLogSimSec = -10;
  private lastRotLogSimSec = -10;
  private lastPreTriggerSimSec = -10;

  public reset(initialState: PowertrainState): void {
    this.prev = snapshotOf(initialState);
    this.simClockSec = 0;
    this.lastFlowLogSimSec = -10;
    this.lastRotLogSimSec = -10;
    this.lastPreTriggerSimSec = -10;
  }

  public inspect(
    prevState: PowertrainState,
    nextState: PowertrainState,
    dtSimSec: number,
    isDiscreteJump = false
  ): PsdInspectionResult {
    this.simClockSec += Math.max(0, dtSimSec);

    if (!this.prev) {
      this.prev = snapshotOf(prevState);
    }

    const p = this.prev;
    const n = snapshotOf(nextState);

    const categories = new Set<PsdLogCategory>();
    const headlineParts: string[] = [];
    const reasonParts: string[] = [];

    // 1. Hybrid status / gear / engine state changes
    const gearChanged = p.gear !== n.gear;
    const modeChanged = p.modeId !== n.modeId;
    const phaseChanged = p.phaseTitle !== n.phaseTitle;
    const fuelChanged = p.iceFuelActive !== n.iceFuelActive;
    const forcedChanged = p.forcedChargeActive !== n.forcedChargeActive;

    if (gearChanged || modeChanged || phaseChanged || fuelChanged || forcedChanged) {
      categories.add('HYBRID');

      if (gearChanged) {
        headlineParts.push(`Shift ${p.gear} → ${n.gear}`);
        if (n.gear === GearPosition.B) {
          reasonParts.push(
            'B-range engages engine compression pumping via MG1 + MG2 regen to control downhill speed without overheating brakes or overcharging NiMH.'
          );
        } else if (n.gear === GearPosition.R) {
          reasonParts.push(
            'PCU reverses MG2 AC phase order for gearless CCW electric reverse propulsion.'
          );
        } else if (n.gear === GearPosition.P) {
          reasonParts.push(
            'Mechanical parking pawl locks final drive at 0 RPM while keeping PCU inverters ready.'
          );
        } else if (n.gear === GearPosition.N) {
          reasonParts.push(
            'Neutral de-energizes MG1/MG2 inverter gates, disabling propulsion, regen, and battery charging while A/C & 12V loads still draw ~0.9 kW from the NiMH pack.'
          );
        } else {
          reasonParts.push(nextState.activePhaseSummary);
        }
      } else if (fuelChanged && n.iceFuelActive) {
        headlineParts.push('M20A-FXS ICE Ignition');
        reasonParts.push(
          nextState.forcedChargeActive
            ? `NiMH SoC dropped to ${Math.round(nextState.socPercent)}% (<40%), starting the ICE to recharge via MG1.`
            : `Propulsion demand (${Math.round(Math.abs(nextState.flows.counterToWheelKw))} kW) or speed (${Math.round(nextState.speedKmh)} km/h) crossed the EV limit, so MG1 cranked the ICE to assist.`
        );
      } else if (fuelChanged && !n.iceFuelActive) {
        headlineParts.push(
          Math.abs(nextState.iceRpm) > 300 ? 'Fuel Cut · Engine Air-Pump' : 'ICE Fuel-Cut Shutdown'
        );
        reasonParts.push(
          nextState.flows.counterToWheelKw < -0.5 || nextState.brakePercent > 2
            ? 'Throttle released / braking initiated — ECU cut fuel immediately while MG2 captures kinetic regen energy.'
            : 'Road load fell below the Atkinson run threshold, allowing fuel-free EV operation.'
        );
      } else if (forcedChanged) {
        headlineParts.push(
          n.forcedChargeActive ? 'Low-SoC Charge Triggered' : 'Low-SoC Charge Completed'
        );
        reasonParts.push(
          n.forcedChargeActive
            ? `NiMH SoC fell below 40% (${Math.round(nextState.socPercent)}%), triggering automatic ICE + MG1 charging.`
            : `NiMH SoC recovered to ${Math.round(nextState.socPercent)}% (>=48%), returning to normal hybrid EV/split scheduling.`
        );
      } else {
        headlineParts.push(nextState.activePhaseTitle);
        reasonParts.push(nextState.activePhaseSummary);
      }
    }

    // 2. Rotational direction changes
    const rotChanges: string[] = [];
    const rotReasons: string[] = [];

    if (p.iceDir !== n.iceDir) {
      rotChanges.push(`ICE ${dirLabel(p.iceDir)}→${dirLabel(n.iceDir)}`);
      rotReasons.push(
        n.iceDir === RotationDir.CW
          ? 'Planetary Carrier accelerated CW as ICE started or entered fuel-cut air pumping.'
          : 'ICE crankshaft & Planetary Carrier came to rest at 0 RPM.'
      );
    }
    if (p.mg1Dir !== n.mg1Dir) {
      rotChanges.push(`MG1 ${dirLabel(p.mg1Dir)}→${dirLabel(n.mg1Dir)}`);
      if (n.mg1Dir === RotationDir.CCW) {
        rotReasons.push(
          nextState.iceFuelActive
            ? 'Highway Overdrive: Ring gear outruns the slow Carrier, reversing Sun gear (MG1) spin to CCW.'
            : 'With ICE Carrier stationary at 0 RPM, forward Ring gear motion forces Planet gears to spin Sun/MG1 CCW.'
        );
      } else if (n.mg1Dir === RotationDir.CW) {
        rotReasons.push(
          'ICE Carrier torque drives Sun gear (MG1) into CW forward rotation (charging or starting).'
        );
      } else {
        rotReasons.push(
          'MG1 Sun gear briefly crossed 0 RPM optical/magnetic null between CW and CCW rotation.'
        );
      }
    }
    if (p.mg2Dir !== n.mg2Dir) {
      rotChanges.push(`MG2/Ring ${dirLabel(p.mg2Dir)}→${dirLabel(n.mg2Dir)}`);
      rotReasons.push(
        n.mg2Dir === RotationDir.CW
          ? 'MG2 AC inverter spins Rotor & Ring gear CW forward.'
          : n.mg2Dir === RotationDir.CCW
            ? 'PCU phase reversal drives MG2 & Ring gear CCW for reverse travel.'
            : 'MG2 rotor and Ring gear slowed to 0 RPM.'
      );
    }
    if (p.wheelDir !== n.wheelDir) {
      rotChanges.push(`Wheel ${dirLabel(p.wheelDir, true)}→${dirLabel(n.wheelDir, true)}`);
      rotReasons.push(
        n.wheelDir === RotationDir.CW
          ? 'Final axle torque overcame rolling & grade resistance, rolling wheels CW forward.'
          : n.wheelDir === RotationDir.CCW
            ? 'Wheel direction reversed CCW.'
            : 'Drive wheel came to a complete stop (0 km/h).'
      );
    }

    const allowRotLog =
      rotChanges.length > 0 &&
      (categories.has('HYBRID') || isDiscreteJump || this.simClockSec - this.lastRotLogSimSec >= 0.35);

    if (allowRotLog) {
      categories.add('ROTATION');
      this.lastRotLogSimSec = this.simClockSec;
      if (headlineParts.length === 0) {
        headlineParts.push(rotChanges.slice(0, 2).join(' · '));
      } else if (rotChanges.length > 0 && !gearChanged) {
        headlineParts.push(`(${rotChanges[0]})`);
      }
      if (reasonParts.length === 0) {
        reasonParts.push(rotReasons[0]);
      }
    }

    // 3. Power flow direction / pathway changes
    const flowChanges: string[] = [];
    const flowReasons: string[] = [];

    if (p.battFlow !== n.battFlow) {
      const label =
        n.battFlow === 'POS' ? 'Discharging' : n.battFlow === 'NEG' ? 'Charging' : 'Standby';
      flowChanges.push(`NiMH Batt → ${label}`);
      flowReasons.push(
        n.battFlow === 'POS'
          ? Math.abs(nextState.flows.pcuToMg2Kw) < 0.25 && nextState.flows.mg1ToPcuKw >= -0.25
            ? `HV battery supplies ${nextState.flows.batteryToPcuKw.toFixed(1)} kW to run READY-mode electric A/C compressor, infotainment, and 12V DC-DC loads.`
            : `HV battery supplies ${nextState.flows.batteryToPcuKw.toFixed(1)} kW to boost MG2, crank ICE, and power cabin A/C/infotainment.`
          : n.battFlow === 'NEG'
            ? `Excess MG1 generation or MG2 regen charges the NiMH pack (+${Math.abs(nextState.flows.batteryToPcuKw).toFixed(1)} kW) above cabin aux loads.`
            : 'Battery current tapered near zero as MG1 generation matched MG2 + cabin A/C demand.'
      );
    }
    if (p.mg1Flow !== n.mg1Flow) {
      const label =
        n.mg1Flow === 'POS' ? 'Generating' : n.mg1Flow === 'NEG' ? 'Motoring' : 'Idle';
      flowChanges.push(`MG1 → ${label}`);
      flowReasons.push(
        n.mg1Flow === 'POS'
          ? 'ICE Carrier torque pushes against CW-spinning MG1 to generate electricity for PCU/MG2.'
          : n.mg1Flow === 'NEG'
            ? nextState.iceFuelActive && Math.abs(nextState.mg1Rpm) > 40 && nextState.mg1Rpm < 0
              ? 'Overdrive power circulation: MG2 supplies electrical power so CCW-spinning MG1 acts as a reaction motor.'
              : 'MG1 draws electrical power from PCU to spin ICE Carrier (starter crank or B-mode air pump).'
            : 'MG1 electrical load fell to zero.'
      );
    }
    if (p.mg2Flow !== n.mg2Flow) {
      const label =
        n.mg2Flow === 'POS' ? 'Driving' : n.mg2Flow === 'NEG' ? 'Regen' : 'Idle';
      flowChanges.push(`MG2 → ${label}`);
      flowReasons.push(
        n.mg2Flow === 'POS'
          ? 'PCU energizes MG2 motor to add electric propulsion torque to the Countershaft & Wheels.'
          : n.mg2Flow === 'NEG'
            ? 'Wheel inertia back-drives MG2 as a generator, recovering kinetic energy or feeding Overdrive.'
            : 'MG2 motor/generator power dropped to idle.'
      );
    }
    if (p.wheelFlow !== n.wheelFlow) {
      const label =
        n.wheelFlow === 'POS' ? 'Traction' : n.wheelFlow === 'NEG' ? 'Braking' : 'Coasting';
      flowChanges.push(`Wheel → ${label}`);
      flowReasons.push(
        n.wheelFlow === 'POS'
          ? 'Net positive torque accelerates or sustains forward/reverse wheel speed.'
          : n.wheelFlow === 'NEG'
            ? 'Net retarding torque (regen, engine pumping, or hydraulic friction) slows the vehicle.'
            : 'Net torque at the drive axle balanced near zero.'
      );
    }

    const allowFlowLog =
      flowChanges.length > 0 &&
      (categories.has('HYBRID') ||
        categories.has('ROTATION') ||
        isDiscreteJump ||
        this.simClockSec - this.lastFlowLogSimSec >= 0.4);

    if (allowFlowLog) {
      categories.add('FLOW');
      this.lastFlowLogSimSec = this.simClockSec;
      if (headlineParts.length === 0) {
        headlineParts.push(flowChanges.slice(0, 2).join(' · '));
      }
      if (reasonParts.length === 0) {
        reasonParts.push(flowReasons[0]);
      }
    }

    // 4. Predictive "Just Before" Slo-Mo detector
    let triggerPreSloMo = false;
    if (dtSimSec > 0.002 && this.simClockSec - this.lastPreTriggerSimSec > 1.8) {
      const dMg1 = (nextState.mg1Rpm - prevState.mg1Rpm) / dtSimSec;
      const mg1ApproachingZero =
        Math.abs(nextState.mg1Rpm) > 40 &&
        Math.abs(nextState.mg1Rpm) < 340 &&
        nextState.mg1Rpm * dMg1 < 0 &&
        Math.abs(dMg1) > 150;

      const dIce = (nextState.iceRpm - prevState.iceRpm) / dtSimSec;
      const iceApproachingStop =
        nextState.iceRpm > 60 && nextState.iceRpm < 360 && dIce < -180;

      const dBatt = (nextState.flows.batteryToPcuKw - prevState.flows.batteryToPcuKw) / dtSimSec;
      const battApproachingFlip =
        Math.abs(nextState.flows.batteryToPcuKw) > 0.9 &&
        Math.abs(nextState.flows.batteryToPcuKw) < 2.6 &&
        nextState.flows.batteryToPcuKw * dBatt < 0 &&
        Math.abs(dBatt) > 4.5;

      const wheelNearStop =
        Math.abs(nextState.speedKmh) > 0.5 &&
        Math.abs(nextState.speedKmh) < 2.8 &&
        nextState.speedKmh * ((nextState.speedKmh - prevState.speedKmh) / dtSimSec) < 0;

      if (mg1ApproachingZero || iceApproachingStop || battApproachingFlip || wheelNearStop) {
        triggerPreSloMo = true;
        this.lastPreTriggerSimSec = this.simClockSec;
      }
    }

    const entries: PsdLogEntry[] = [];
    if (categories.size > 0 && headlineParts.length > 0) {
      entries.push({
        id: this.nextId++,
        timestampLabel: formatNowTime(),
        categories: Array.from(categories),
        title: headlineParts.join(' '),
        explanation: reasonParts.join(' '),
        speedKmh: Math.round(nextState.speedKmh),
        iceRpm: Math.round(nextState.iceRpm),
        mg1Rpm: Math.round(nextState.mg1Rpm),
        mg2Rpm: Math.round(nextState.mg2Rpm),
        wheelRpm: Math.round(nextState.wheelRpm),
        batteryKw: Number(nextState.flows.batteryToPcuKw.toFixed(1)),
      });
    }

    this.prev = {
      ...n,
      iceDir: allowRotLog || categories.has('HYBRID') ? n.iceDir : p.iceDir,
      mg1Dir: allowRotLog || categories.has('HYBRID') ? n.mg1Dir : p.mg1Dir,
      mg2Dir: allowRotLog || categories.has('HYBRID') ? n.mg2Dir : p.mg2Dir,
      wheelDir: allowRotLog || categories.has('HYBRID') ? n.wheelDir : p.wheelDir,
      battFlow: allowFlowLog || categories.has('HYBRID') ? n.battFlow : p.battFlow,
      mg1Flow: allowFlowLog || categories.has('HYBRID') ? n.mg1Flow : p.mg1Flow,
      mg2Flow: allowFlowLog || categories.has('HYBRID') ? n.mg2Flow : p.mg2Flow,
      iceFlow: allowFlowLog || categories.has('HYBRID') ? n.iceFlow : p.iceFlow,
      wheelFlow: allowFlowLog || categories.has('HYBRID') ? n.wheelFlow : p.wheelFlow,
    };

    return {
      entries,
      triggerPreSloMo,
      triggerPostSloMo: entries.length > 0,
    };
  }
}
