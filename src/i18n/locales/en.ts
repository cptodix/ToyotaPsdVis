import { AutoDriveMode, IceCombustionMode, OperationModeId } from '../../types/hybrid';
import { TranslationDictionary } from '../types';

export const en: TranslationDictionary = {
  hud: {
    title: 'Toyota eCVT PSD',
    iceLegend: 'ICE + Carrier & Planets',
    mg1Legend: 'MG1 + Sun',
    mg2Legend: 'MG2 + Ring & Gears',
    wheelLegend: 'Wheel + Tire',
    battLegend: 'HV Batt + PCU',
    psdLog: 'PSD Log',
    psdLogTitle: 'Open PSD Event & Explanation Log',
    notifOn: 'Notif On',
    notifOff: 'Notif Off',
    notifOnTitle: 'Live PSD Transition Notifications ON (click to turn OFF)',
    notifOffTitle: 'Live PSD Transition Notifications OFF (click to turn ON)',
    languageTitle: 'Select Interface Language',
  },
  badges: {
    iceTitle: 'ICE · Carrier & Planets',
    battTitle: 'HV Battery · PCU',
    mg1Title: 'MG1 · Sun Gear',
    mg2Title: 'MG2 · Ring & Gears',
    wheelTitle: 'Wheel · Final Axle',
    socLabel: 'SoC',
    chgPrefix: '▲ CHG',
    disPrefix: '▼ DIS',
    standby: '■ STANDBY',
    stop: 'STOP',
    fwd: 'FWD',
    rev: 'REV',
    iceStatus: {
      [IceCombustionMode.STOPPED]: '■ OFF · STANDBY',
      [IceCombustionMode.PRODUCING_POWER]: '◆ FIRING',
      [IceCombustionMode.FIRING_IDLE]: '● FIRING · IDLE 0 kW',
      [IceCombustionMode.MOTORING_AIR_PUMP]: '○ NO FUEL · AIR PUMP',
      [IceCombustionMode.SPINNING_FUEL_CUT]: '○ SPINNING · NO FUEL',
    },
    iceFiringPrefix: '◆ FIRING',
  },
  planetary2d: {
    title: '2D Planetary Gear',
    sunToMg1: 'Sun→MG1',
    carrierToIce: 'Carrier→ICE',
    planetsPin: 'Planets (Pin)',
    ringToMg2Wheel: 'Ring→MG2/Whl',
  },
  toolbar: {
    drive: 'Drive',
    modes: 'Modes',
    manual: 'Manual',
    speed: 'Speed',
    normal: 'Normal',
    realistic: 'Realistic',
    speedTooltip:
      'Mechanical Animation Speed: Normal (observable speed) vs Realistic (true simulation RPM; power flow speed unchanged)',
    slowMo: 'Slow-Mo',
    auto: 'Auto',
    autoSloMoTooltip:
      'Auto Slo-Mo: temporarily switches to 0.5x just before and after any hybrid, power flow, or rotation transition',
    slowMoTooltip: 'Slow-Motion Speed Control (Auto 0.5x around transitions, 1x, 0.5x, 0.25x)',
    camAll: 'All',
    camPsd: 'PSD',
    camMg: 'MG1/2',
    camWheel: 'Wheel',
    spread: 'Spread',
    sound: 'Sound',
    muted: 'Muted',
    reset: 'Reset',
    show: 'Show',
    hide: 'Hide',
  },
  driveTab: {
    evOn: 'EV ON',
    evShort: 'EV',
    evMode: 'EV Mode',
    evTooltip: 'Dedicated EV Mode (<= 42 km/h when SoC >= 40%)',
    autoDrive: 'AutoDrive',
    autoModes: {
      [AutoDriveMode.OFF]: { label: 'Off', badge: 'MANUAL', title: 'Manual Driving' },
      [AutoDriveMode.CITY]: { label: 'City', badge: 'CITY AUTO', title: 'City Traffic & Lights' },
      [AutoDriveMode.HIGHWAY]: {
        label: 'Hwy',
        badge: 'HWY AUTO',
        title: 'Highway Cruise & Overtake',
      },
      [AutoDriveMode.MOUNTAIN]: {
        label: 'Mtn',
        badge: 'MTN AUTO',
        title: 'Countryside Mountainous Road (Climbs & Descents)',
      },
    },
    manualDriveBadge: 'MANUAL DRIVE',
    throttle: 'Throttle',
    thrShort: 'Thr',
    brake: 'Brake',
    brkShort: 'Brk',
    incline: 'Incline',
    incShort: 'Inc',
    inclineTooltip: 'Road Incline (-50% to +50%). Click value to reset to 0%.',
    comb: 'Comb',
    regen: 'Regen',
    regShort: 'Reg',
    mech: 'Mech',
    mchShort: 'Mch',
    evLabel: 'EV',
  },
  manualTab: {
    instruction: 'Adjust speed & rotation direction of each power source:',
    autoSolve: 'Auto-Solve:',
    mg2Wheel: 'MG2/Wheel',
    iceCarrier: 'ICE · Carrier',
    mg1Sun: 'MG1 · Sun',
    mg2Ring: 'MG2 · Ring',
    iceNoCcwTooltip: 'ICE only spins CW (0 to 6,000 RPM) — CCW reverse rotation is mechanically blocked',
  },
  modes: {
    [OperationModeId.STOP]: {
      shortLabel: 'Ready Stop',
      title: 'Ready / Stationary EV Standby',
      summary:
        'Vehicle is stationary in Ready state (0 RPM, zero fuel). Electric A/C & infotainment still draw ~0.9 kW from the NiMH battery.',
    },
    [OperationModeId.IDLE_CHARGE]: {
      shortLabel: 'Park Charge',
      title: 'Park / Stationary HV Battery Charging',
      summary:
        'Ring Gear and Wheels are locked at 0 RPM. ICE spins Carrier CW (1,300 RPM), driving Sun Gear (MG1) CW to power cabin A/C (~0.9 kW) and recharge the NiMH pack.',
    },
    [OperationModeId.EV_DRIVE]: {
      shortLabel: 'EV Drive',
      title: 'Pure Electric Propulsion (EV Mode)',
      summary:
        'NiMH HV Battery powers MG2 (1VM) to drive Ring Gear & Wheels forward (~42 km/h EV cruise) plus cabin A/C & infotainment. ICE stays at 0 RPM while Planet Gears spin MG1 freely CCW.',
    },
    [OperationModeId.ICE_START]: {
      shortLabel: 'ICE Start',
      title: 'In-Motion Engine Cranking Phase',
      summary:
        'While MG2 propels the 2,020 kg MPV, MG1 uses battery power as a starter motor to lift the Sun Gear from negative RPM and spin the Carrier (ICE) to ignition speed.',
    },
    [OperationModeId.NORMAL_SPLIT]: {
      shortLabel: 'Normal Split',
      title: 'Optimal Atkinson Power-Split Cruise',
      summary:
        'M20A-FXS runs on its 41%-efficiency BSFC line (1,820 RPM): PSD splits torque 72.2% mechanically to Ring Gear and 27.8% to MG1 to feed MG2, cabin aux, and regulate SoC.',
    },
    [OperationModeId.POWER_BOOST]: {
      shortLabel: 'Power Boost',
      title: 'Full-Load Dual Boost (186 PS / 184 hp)',
      summary:
        'M20A-FXS surges above 5,000 RPM split via Ring + MG1, while the NiMH pack adds 26.5 kW boost into MG2 (1VM) for high-load overtaking & highway climbs.',
    },
    [OperationModeId.HIGHWAY_OVERDRIVE]: {
      shortLabel: 'Overdrive',
      title: 'Highway e-CVT Overdrive (Power Circulation)',
      summary:
        'At steady 112 km/h (2,770 RPM Ring) with relaxed 1,780 RPM ICE, Sun Gear (MG1) spins CCW (-794 RPM) as a reverse motor fed by slight MG2 generation.',
    },
    [OperationModeId.REGEN_BRAKE]: {
      shortLabel: 'Regen Brake',
      title: 'Cooperative Regenerative Braking (CHG)',
      summary:
        'Fuel is cut to ICE (0 RPM Carrier). 2,020 kg vehicle momentum drives MG2 as a generator (up to 32 kW into NiMH pack), blended seamlessly with hydraulic friction brakes.',
    },
    [OperationModeId.B_MODE_DESCENT]: {
      shortLabel: 'B-Mode Brake',
      title: 'B-Range Downhill Engine Pumping Brake',
      summary:
        'On descents in B range, MG2 regenerates braking power and routes part to MG1, spinning the fuel-cut ICE (3,100 RPM) as an air pump to prevent NiMH overcharge.',
    },
    [OperationModeId.REVERSE_EV]: {
      shortLabel: 'Reverse EV',
      title: 'Gearless Electric Reverse Propulsion',
      summary:
        'PCU reverses AC phase sequence so MG2 spins CCW, driving Countershaft CW and Ring Gear/Wheels backward (-19 km/h) while ICE stays at 0 RPM.',
    },
  },
  logModal: {
    title: 'PSD Event & Physics Log',
    subtitle: 'Live log of hybrid mode transitions, power flow reversals, and shaft rotation changes',
    clear: 'Clear',
    filterAll: 'All',
    filterHybrid: 'Hybrid Status',
    filterFlow: 'Power Flow',
    filterRotation: 'Rotation Dir',
    newestOnTop: 'Newest on top',
    empty:
      'No PSD transition events recorded yet. Drive, shift gears, or scrub manual sliders to inspect transitions.',
    whyPrefix: 'Why: ',
    battLabel: 'Batt',
  },
};
