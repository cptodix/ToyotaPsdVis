import { AutoDriveMode, IceCombustionMode, OperationModeId } from '../../types/hybrid';
import { TranslationDictionary } from '../types';

export const id: TranslationDictionary = {
  hud: {
    title: 'Toyota eCVT PSD',
    iceLegend: 'ICE + Carrier & Planet',
    mg1Legend: 'MG1 + Sun Gear',
    mg2Legend: 'MG2 + Ring & Gir',
    wheelLegend: 'Roda + Ban',
    battLegend: 'HV Batt + PCU',
    psdLog: 'PSD Log',
    psdLogTitle: 'Buka Log Transisi & Penjelasan PSD',
    notifOn: 'Notif On',
    notifOff: 'Notif Off',
    notifOnTitle: 'Notifikasi Transisi PSD Aktif (klik untuk matikan)',
    notifOffTitle: 'Notifikasi Transisi PSD Nonaktif (klik untuk aktifkan)',
    languageTitle: 'Pilih Bahasa Antarmuka',
  },
  badges: {
    iceTitle: 'ICE · Carrier & Planet',
    battTitle: 'HV Battery · PCU',
    mg1Title: 'MG1 · Sun Gear',
    mg2Title: 'MG2 · Ring & Gir',
    wheelTitle: 'Roda · Poros Final',
    socLabel: 'SoC',
    chgPrefix: '▲ CHG',
    disPrefix: '▼ DIS',
    standby: '■ STANDBY',
    stop: 'STOP',
    fwd: 'MAJU',
    rev: 'MUNDUR',
    iceStatus: {
      [IceCombustionMode.STOPPED]: '■ MATI · STANDBY',
      [IceCombustionMode.PRODUCING_POWER]: '◆ PEMBAKARAN',
      [IceCombustionMode.FIRING_IDLE]: '● IDLE · 0 kW',
      [IceCombustionMode.MOTORING_AIR_PUMP]: '○ TANPA BBM · POMPA UDARA',
      [IceCombustionMode.SPINNING_FUEL_CUT]: '○ BERPUTAR · FUEL CUT',
    },
    iceFiringPrefix: '◆ TENAGA',
  },
  planetary2d: {
    title: 'Gir Planet 2D',
    sunToMg1: 'Sun→MG1',
    carrierToIce: 'Carrier→ICE',
    planetsPin: 'Planet (Pin)',
    ringToMg2Wheel: 'Ring→MG2/Roda',
  },
  toolbar: {
    drive: 'Kendara',
    modes: 'Mode',
    manual: 'Manual',
    speed: 'Putaran',
    normal: 'Normal',
    realistic: 'Realistis',
    speedTooltip:
      'Kecepatan Animasi Mekanik: Normal (mudah diamati) vs Realistis (RPM simulasi asli; panah aliran daya tetap)',
    slowMo: 'Slow-Mo',
    auto: 'Auto',
    autoSloMoTooltip:
      'Auto Slo-Mo: melambat sementara ke 0.5x saat transisi sistem hybrid, aliran daya, atau arah putaran',
    slowMoTooltip: 'Kontrol Slow-Motion (Auto 0.5x saat transisi, 1x, 0.5x, 0.25x)',
    camAll: 'Semua',
    camPsd: 'PSD',
    camMg: 'MG1/2',
    camWheel: 'Roda',
    spread: 'Sebar',
    sound: 'Suara',
    muted: 'Bisu',
    reset: 'Reset',
    show: 'Buka',
    hide: 'Tutup',
  },
  driveTab: {
    evOn: 'EV ON',
    evShort: 'EV',
    evMode: 'EV Mode',
    evTooltip: 'EV Mode khusus listrik (<= 42 km/h saat SoC >= 40%)',
    autoDrive: 'AutoDrive',
    autoModes: {
      [AutoDriveMode.OFF]: { label: 'Off', badge: 'MANUAL', title: 'Kendali Manual' },
      [AutoDriveMode.CITY]: { label: 'Kota', badge: 'KOTA AUTO', title: 'Lalu Lintas Kota & Lampu Merah' },
      [AutoDriveMode.HIGHWAY]: {
        label: 'Tol',
        badge: 'TOL AUTO',
        title: 'Jelajah Jalan Tol & Menyalip',
      },
      [AutoDriveMode.MOUNTAIN]: {
        label: 'Gunung',
        badge: 'GUNUNG AUTO',
        title: 'Jalan Pegunungan (Tanjakan & Turunan)',
      },
    },
    manualDriveBadge: 'KENDALI MANUAL',
    throttle: 'Gas',
    thrShort: 'Gas',
    brake: 'Rem',
    brkShort: 'Rem',
    incline: 'Tanjakan',
    incShort: 'Tjk',
    inclineTooltip: 'Kemiringan Jalan (-50% s/d +50%). Klik angka untuk reset ke 0%.',
    comb: 'Gab',
    regen: 'Regen',
    regShort: 'Reg',
    mech: 'Mek',
    mchShort: 'Mek',
    evLabel: 'EV',
  },
  manualTab: {
    instruction: 'Atur RPM & arah putar tiap poros penggerak:',
    autoSolve: 'Hitung Otomatis:',
    mg2Wheel: 'MG2/Roda',
    iceCarrier: 'ICE · Carrier',
    mg1Sun: 'MG1 · Sun',
    mg2Ring: 'MG2 · Ring',
    iceNoCcwTooltip: 'ICE hanya berputar CW (0 s/d 6.000 RPM) — putaran balik CCW terkunci mekanis',
  },
  modes: {
    [OperationModeId.STOP]: {
      shortLabel: 'Ready Stop',
      title: 'Ready / Standby EV Stasioner',
      summary:
        'Kendaraan berhenti dalam kondisi Ready (0 RPM, tanpa BBM). A/C listrik & sistem kabin tetap menarik ~0.9 kW dari baterai NiMH.',
    },
    [OperationModeId.IDLE_CHARGE]: {
      shortLabel: 'Park Charge',
      title: 'Park / Pengisian Baterai HV Stasioner',
      summary:
        'Ring Gear & Roda terkunci di 0 RPM. ICE memutar Carrier CW (1.300 RPM), menggerakkan Sun Gear (MG1) CW untuk A/C (~0.9 kW) dan mengisi baterai NiMH.',
    },
    [OperationModeId.EV_DRIVE]: {
      shortLabel: 'EV Drive',
      title: 'Penggerak Listrik Murni (EV Mode)',
      summary:
        'Baterai HV NiMH menyuplai MG2 (1VM) memutar Ring Gear & Roda maju (~42 km/h) sekaligus beban A/C. ICE diam di 0 RPM sementara Planet Gear memutar MG1 bebas CCW.',
    },
    [OperationModeId.ICE_START]: {
      shortLabel: 'ICE Start',
      title: 'Fase Menyalakan ICE Saat Melaju',
      summary:
        'Saat MG2 menggerakkan MPV 2.020 kg ini, MG1 menarik daya baterai sebagai motor starter untuk mengangkat RPM Sun Gear dan memutar Carrier (ICE) hingga menyala.',
    },
    [OperationModeId.NORMAL_SPLIT]: {
      shortLabel: 'Normal Split',
      title: 'Jelajah Power-Split Atkinson Optimal',
      summary:
        'Mesin M20A-FXS bekerja di garis efisiensi BSFC 41% (1.820 RPM): PSD membagi torsi 72,2% mekanis ke Ring Gear dan 27,8% ke MG1 untuk menyuplai MG2 & menjaga SoC.',
    },
    [OperationModeId.POWER_BOOST]: {
      shortLabel: 'Power Boost',
      title: 'Akselerasi Penuh Dual Boost (186 PS / 184 hp)',
      summary:
        'M20A-FXS melesat di atas 5.000 RPM lewat Ring + MG1, sementara baterai NiMH menambah boost 26,5 kW ke MG2 (1VM) untuk menyalip dan menanjak.',
    },
    [OperationModeId.HIGHWAY_OVERDRIVE]: {
      shortLabel: 'Overdrive',
      title: 'Overdrive eCVT Tol (Sirkulasi Daya)',
      summary:
        'Pada 112 km/h stabil (Ring 2.770 RPM) dengan ICE santai di 1.780 RPM, Sun Gear (MG1) berputar CCW (-794 RPM) sebagai motor balik disuplai sedikit generasi MG2.',
    },
    [OperationModeId.REGEN_BRAKE]: {
      shortLabel: 'Regen Brake',
      title: 'Pengereman Regeneratif Kooperatif (CHG)',
      summary:
        'Suplai BBM ICE diputus (0 RPM Carrier). Momentum 2.020 kg memutar MG2 sebagai generator (hingga 32 kW ke baterai NiMH), berpadu mulus dengan rem cakram hidrolik.',
    },
    [OperationModeId.B_MODE_DESCENT]: {
      shortLabel: 'B-Mode Brake',
      title: 'Engine Brake B-Range di Turunan',
      summary:
        'Saat turun di posisi B, MG2 meregenerasi daya rem dan menyalurkan sebagian ke MG1 untuk memutar ICE tanpa BBM (3.100 RPM) sebagai pompa udara agar NiMH tidak overcharge.',
    },
    [OperationModeId.REVERSE_EV]: {
      shortLabel: 'Reverse EV',
      title: 'Gigi Mundur Listrik Tanpa Gigi Balik',
      summary:
        'PCU membalik fase AC agar MG2 berputar CCW, menggerakkan Countershaft CW dan Ring Gear/Roda mundur (-19 km/h) sementara ICE tetap diam di 0 RPM.',
    },
  },
  logModal: {
    title: 'Log Transisi & Fisika PSD',
    subtitle: 'Catatan langsung transisi mode hybrid, pembalikan aliran daya, dan perubahan arah putar poros',
    clear: 'Hapus',
    filterAll: 'Semua',
    filterHybrid: 'Status Hybrid',
    filterFlow: 'Aliran Daya',
    filterRotation: 'Arah Putar',
    newestOnTop: 'Terbaru di atas',
    empty:
      'Belum ada transisi PSD tercatat. Jalankan mobil, pindah gigi, atau geser slider manual untuk melihat transisi.',
    whyPrefix: 'Penjelasan: ',
    battLabel: 'Baterai',
  },
};
