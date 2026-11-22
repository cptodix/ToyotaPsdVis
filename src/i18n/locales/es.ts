import { AutoDriveMode, IceCombustionMode, OperationModeId } from '../../types/hybrid';
import { TranslationDictionary } from '../types';

export const es: TranslationDictionary = {
  hud: {
    title: 'Toyota eCVT PSD',
    iceLegend: 'ICE + Portasatélites',
    mg1Legend: 'MG1 + Solar',
    mg2Legend: 'MG2 + Corona',
    wheelLegend: 'Rueda + Neumático',
    battLegend: 'HV Batt + PCU',
    psdLog: 'PSD Log',
    psdLogTitle: 'Abrir Registro de Eventos y Física del PSD',
    notifOn: 'Notif On',
    notifOff: 'Notif Off',
    notifOnTitle: 'Notificaciones en vivo del PSD activadas (clic para desactivar)',
    notifOffTitle: 'Notificaciones en vivo del PSD desactivadas (clic para activar)',
    languageTitle: 'Seleccionar idioma de la interfaz',
  },
  badges: {
    iceTitle: 'ICE · Portasatélites',
    battTitle: 'HV Battery · PCU',
    mg1Title: 'MG1 · Engranaje Solar',
    mg2Title: 'MG2 · Corona y Ejes',
    wheelTitle: 'Rueda · Eje Final',
    socLabel: 'SoC',
    chgPrefix: '▲ CHG',
    disPrefix: '▼ DIS',
    standby: '■ STANDBY',
    stop: 'STOP',
    fwd: 'AVAN',
    rev: 'REV',
    iceStatus: {
      [IceCombustionMode.STOPPED]: '■ APAGADO · STANDBY',
      [IceCombustionMode.PRODUCING_POWER]: '◆ COMBUSTIÓN',
      [IceCombustionMode.FIRING_IDLE]: '● RALENTÍ · 0 kW',
      [IceCombustionMode.MOTORING_AIR_PUMP]: '○ SIN COMB. · BOMBA AIRE',
      [IceCombustionMode.SPINNING_FUEL_CUT]: '○ GIRANDO · CORTE COMB.',
    },
    iceFiringPrefix: '◆ ACTIVO',
  },
  planetary2d: {
    title: 'Planetario 2D',
    sunToMg1: 'Sun→MG1',
    carrierToIce: 'Carrier→ICE',
    planetsPin: 'Satélites',
    ringToMg2Wheel: 'Ring→MG2/Rda',
  },
  toolbar: {
    drive: 'Conducir',
    modes: 'Modos',
    manual: 'Manual',
    speed: 'Vel.',
    normal: 'Normal',
    realistic: 'Realista',
    speedTooltip:
      'Velocidad de animación mecánica: Normal (observable) vs Realista (RPM reales de simulación; flechas de flujo sin cambios)',
    slowMo: 'Slow-Mo',
    auto: 'Auto',
    autoSloMoTooltip:
      'Auto Slo-Mo: reduce temporalmente a 0.5x justo antes y después de cualquier transición híbrida, flujo o giro',
    slowMoTooltip: 'Control de cámara lenta (Auto 0.5x en transiciones, 1x, 0.5x, 0.25x)',
    camAll: 'Todo',
    camPsd: 'PSD',
    camMg: 'MG1/2',
    camWheel: 'Rueda',
    spread: 'Separar',
    sound: 'Sonido',
    muted: 'Silencio',
    reset: 'Reiniciar',
    show: 'Mostrar',
    hide: 'Ocultar',
  },
  driveTab: {
    evOn: 'EV ON',
    evShort: 'EV',
    evMode: 'EV Mode',
    evTooltip: 'EV Mode dedicado (<= 42 km/h con SoC >= 40%)',
    autoDrive: 'AutoDrive',
    autoModes: {
      [AutoDriveMode.OFF]: { label: 'Off', badge: 'MANUAL', title: 'Conducción Manual' },
      [AutoDriveMode.CITY]: { label: 'Ciudad', badge: 'CIUDAD AUTO', title: 'Tráfico Urbano y Semáforos' },
      [AutoDriveMode.HIGHWAY]: {
        label: 'Autop.',
        badge: 'AUTOP. AUTO',
        title: 'Crucero en Autopista y Adelantamientos',
      },
      [AutoDriveMode.MOUNTAIN]: {
        label: 'Mont.',
        badge: 'MONT. AUTO',
        title: 'Carretera de Montaña (Subidas y Bajadas)',
      },
    },
    manualDriveBadge: 'CONDUCCIÓN MANUAL',
    throttle: 'Acel.',
    thrShort: 'Acl',
    brake: 'Freno',
    brkShort: 'Frn',
    incline: 'Pendiente',
    incShort: 'Pnd',
    inclineTooltip: 'Pendiente de la vía (-50% a +50%). Clic en el valor para volver a 0%.',
    comb: 'Comb',
    regen: 'Regen',
    regShort: 'Reg',
    mech: 'Mec',
    mchShort: 'Mec',
    evLabel: 'EV',
  },
  manualTab: {
    instruction: 'Ajusta velocidad RPM y sentido de giro de cada eje:',
    autoSolve: 'Auto-Resolver:',
    mg2Wheel: 'MG2/Rueda',
    iceCarrier: 'ICE · Portasat.',
    mg1Sun: 'MG1 · Solar',
    mg2Ring: 'MG2 · Corona',
    iceNoCcwTooltip: 'El ICE solo gira CW (0 a 6,000 RPM) — el giro inverso CCW está bloqueado mecánicamente',
  },
  modes: {
    [OperationModeId.STOP]: {
      shortLabel: 'Ready Stop',
      title: 'Ready / Espera EV Estacionaria',
      summary:
        'Vehículo detenido en estado Ready (0 RPM, cero combustible). El A/C eléctrico y sistemas consumen ~0.9 kW de la batería NiMH.',
    },
    [OperationModeId.IDLE_CHARGE]: {
      shortLabel: 'Carga Park',
      title: 'Park / Carga Estacionaria de Batería HV',
      summary:
        'Corona y ruedas bloqueadas a 0 RPM. El ICE gira el Portasatélites CW (1,300 RPM), impulsando el Solar (MG1) CW para alimentar el A/C (~0.9 kW) y recargar el paquete NiMH.',
    },
    [OperationModeId.EV_DRIVE]: {
      shortLabel: 'EV Drive',
      title: 'Propulsión Eléctrica Pura (EV Mode)',
      summary:
        'La batería NiMH alimenta al MG2 (1VM) impulsando Corona y ruedas (~42 km/h) más el A/C. El ICE permanece a 0 RPM mientras los satélites giran el MG1 libremente CCW.',
    },
    [OperationModeId.ICE_START]: {
      shortLabel: 'Arranque ICE',
      title: 'Fase de Arranque del ICE en Movimiento',
      summary:
        'Mientras el MG2 impulsa el MPV de 2,020 kg, el MG1 actúa como motor de arranque elevando las RPM del Solar para llevar al ICE a velocidad de ignición.',
    },
    [OperationModeId.NORMAL_SPLIT]: {
      shortLabel: 'Reparto Normal',
      title: 'Crucero Óptimo Atkinson Power-Split',
      summary:
        'El M20A-FXS opera en su curva BSFC de 41% de eficiencia (1,820 RPM): el PSD reparte 72.2% de par mecánico a la Corona y 27.8% al MG1 para alimentar MG2 y regular SoC.',
    },
    [OperationModeId.POWER_BOOST]: {
      shortLabel: 'Power Boost',
      title: 'Aceleración Dual Máxima (186 PS / 184 hp)',
      summary:
        'El M20A-FXS supera las 5,000 RPM repartiendo vía Corona + MG1, mientras el paquete NiMH aporta 26.5 kW adicionales al MG2 (1VM) para adelantamientos y subidas.',
    },
    [OperationModeId.HIGHWAY_OVERDRIVE]: {
      shortLabel: 'Overdrive',
      title: 'Overdrive eCVT en Autopista (Recirculación)',
      summary:
        'A 112 km/h estables (Corona a 2,770 RPM) con ICE relajado a 1,780 RPM, el Solar (MG1) gira CCW (-794 RPM) como motor inverso alimentado por ligera generación del MG2.',
    },
    [OperationModeId.REGEN_BRAKE]: {
      shortLabel: 'Freno Regen',
      title: 'Frenado Regenerativo Cooperativo (CHG)',
      summary:
        'Corte total de combustible al ICE (0 RPM). La inercia de 2,020 kg impulsa al MG2 como generador (hasta 32 kW al paquete NiMH), combinado con los frenos hidráulicos.',
    },
    [OperationModeId.B_MODE_DESCENT]: {
      shortLabel: 'Freno B-Mode',
      title: 'Freno Motor en Descenso (Rango B)',
      summary:
        'Al descender en rango B, MG2 regenera y envía parte de la potencia al MG1 para girar el ICE sin combustible (3,100 RPM) como bomba de aire y evitar sobrecarga NiMH.',
    },
    [OperationModeId.REVERSE_EV]: {
      shortLabel: 'Reversa EV',
      title: 'Marcha Atrás Eléctrica sin Engranaje Inverso',
      summary:
        'La PCU invierte la secuencia de fase AC para que MG2 gire CCW, impulsando el contraeje CW y las ruedas en reversa (-19 km/h) con el ICE a 0 RPM.',
    },
  },
  logModal: {
    title: 'Registro de Eventos y Física PSD',
    subtitle: 'Registro en vivo de cambios de modo híbrido, inversión de flujo y dirección de ejes',
    clear: 'Limpiar',
    filterAll: 'Todos',
    filterHybrid: 'Estado Híbrido',
    filterFlow: 'Flujo Energía',
    filterRotation: 'Giro',
    newestOnTop: 'Más recientes arriba',
    empty:
      'Sin eventos PSD aún. Conduce, cambia de marcha o mueve los controles manuales para registrar transiciones.',
    whyPrefix: 'Motivo: ',
    battLabel: 'Bat',
  },
};
