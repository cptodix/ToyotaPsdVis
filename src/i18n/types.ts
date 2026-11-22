import { AutoDriveMode, IceCombustionMode, OperationModeId } from '../types/hybrid';

export enum LocaleId {
  EN = 'en',
  ID = 'id',
  JA = 'ja',
  ZH = 'zh',
  ES = 'es',
}

export interface LocaleOption {
  id: LocaleId;
  shortLabel: string;
  nativeName: string;
}

export const LOCALE_OPTIONS: readonly LocaleOption[] = [
  { id: LocaleId.EN, shortLabel: 'EN', nativeName: 'English' },
  { id: LocaleId.ID, shortLabel: 'ID', nativeName: 'Bahasa Indonesia' },
  { id: LocaleId.JA, shortLabel: 'JA', nativeName: '日本語' },
  { id: LocaleId.ZH, shortLabel: 'ZH', nativeName: '中文' },
  { id: LocaleId.ES, shortLabel: 'ES', nativeName: 'Español' },
] as const;

export interface TranslationDictionary {
  hud: {
    title: string;
    iceLegend: string;
    mg1Legend: string;
    mg2Legend: string;
    wheelLegend: string;
    battLegend: string;
    psdLog: string;
    psdLogTitle: string;
    notifOn: string;
    notifOff: string;
    notifOnTitle: string;
    notifOffTitle: string;
    languageTitle: string;
  };
  badges: {
    iceTitle: string;
    battTitle: string;
    mg1Title: string;
    mg2Title: string;
    wheelTitle: string;
    socLabel: string;
    chgPrefix: string;
    disPrefix: string;
    standby: string;
    stop: string;
    fwd: string;
    rev: string;
    iceStatus: Record<IceCombustionMode, string>;
    iceFiringPrefix: string;
  };
  planetary2d: {
    title: string;
    sunToMg1: string;
    carrierToIce: string;
    planetsPin: string;
    ringToMg2Wheel: string;
  };
  toolbar: {
    drive: string;
    modes: string;
    manual: string;
    speed: string;
    normal: string;
    realistic: string;
    speedTooltip: string;
    slowMo: string;
    auto: string;
    autoSloMoTooltip: string;
    slowMoTooltip: string;
    camAll: string;
    camPsd: string;
    camMg: string;
    camWheel: string;
    spread: string;
    sound: string;
    muted: string;
    reset: string;
    show: string;
    hide: string;
  };
  driveTab: {
    evOn: string;
    evShort: string;
    evMode: string;
    evTooltip: string;
    autoDrive: string;
    autoModes: Record<AutoDriveMode, { label: string; badge: string; title: string }>;
    manualDriveBadge: string;
    throttle: string;
    thrShort: string;
    brake: string;
    brkShort: string;
    incline: string;
    incShort: string;
    inclineTooltip: string;
    comb: string;
    regen: string;
    regShort: string;
    mech: string;
    mchShort: string;
    evLabel: string;
  };
  manualTab: {
    instruction: string;
    autoSolve: string;
    mg2Wheel: string;
    iceCarrier: string;
    mg1Sun: string;
    mg2Ring: string;
    iceNoCcwTooltip: string;
  };
  modes: Record<
    OperationModeId,
    {
      shortLabel: string;
      title: string;
      summary: string;
    }
  >;
  logModal: {
    title: string;
    subtitle: string;
    clear: string;
    filterAll: string;
    filterHybrid: string;
    filterFlow: string;
    filterRotation: string;
    newestOnTop: string;
    empty: string;
    whyPrefix: string;
    battLabel: string;
  };
}
