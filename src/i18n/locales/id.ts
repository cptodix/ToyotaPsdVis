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
    howTo: 'Panduan?',
    howToTitle: 'Buka Panduan Simulator & Referensi Toyota Hybrid (THS V)',
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
  howToModal: {
    title: 'Panduan Simulator & Sistem Toyota Hybrid (THS V)',
    subtitle:
      'Panduan interaktif dan penjelasan teknik drivetrain eCVT Toyota Kijang Innova Zenix Hybrid (AG10)',
    tabControls: 'Cara Menggunakan',
    tabDrivetrain: 'Cara Kerja THS V',
    controlsIntro:
      'Jelajahi cara kerja sistem Toyota Hybrid generasi ke-5 secara real-time dengan menyetir manual, mengaktifkan skenario AutoDrive, atau membedah kinematika gir planet.',
    drivetrainIntro:
      'Alih-alih sabuk baja (belt) atau kopling bertingkat, eCVT Toyota memakai satu set gir planet (Power Split Device / PSD) yang menghubungkan mesin ICE dan dua motor-generator secara permanen.',
    controlsCards: [
      {
        badge: 'VIEWPORT 3D',
        title: 'Putar Kamera, Zoom, Preset & Mode Sebar',
        body: 'Seret area 3D untuk memutar sudut pandang, klik-kanan untuk geser, dan scroll untuk zoom. Gunakan tombol Semua / PSD / MG1/2 / Roda untuk fokus ke tiap komponen, lalu geser Sebar (0–100%) untuk memisahkan komponen transaxle saat berputar.',
      },
      {
        badge: 'TAB KENDARA',
        title: 'AutoDrive, EV Mode & Pedal Manual',
        body: 'Pilih transmisi P / R / N / D / B, aktifkan EV Mode (<= 42 km/h bila SoC >= 40%), atau pilih AutoDrive (Kota / Tol / Gunung) untuk simulasi lalu lintas realistis. Menggeser Gas, Rem, atau Tanjakan otomatis mengembalikan kendali ke pengemudi.',
      },
      {
        badge: 'MODE & MANUAL',
        title: '10 Mode Referensi & Solver Willis Manual',
        body: 'Buka tab Mode untuk langsung melompat ke 10 skenario resmi THS V (dari Park Charge hingga Power Boost 186 PS atau B-Mode Turunan). Di tab Manual, kunci satu poros dan atur RPM ICE (hanya CW), MG1 (CW/CCW), atau MG2/Roda secara bebas.',
      },
      {
        badge: 'INSPEKSI',
        title: 'Mode Putaran, Auto Slow-Mo, PSD Log & Suara',
        body: 'Pilih putaran Normal vs Realistis (kecepatan animasi panah aliran daya tetap sama), aktifkan Auto Slow-Mo untuk perlambatan 0.5x di tiap transisi, pantau PSD Log / Notif langsung, dan nyalakan sintesis audio mesin M20A-FXS + ban + inverter EV.',
      },
    ],
    drivetrainCards: [
      {
        badge: 'KINEMATIKA PSD',
        title: 'Power Split Device & eCVT Tanpa Kopling',
        body: 'Mesin 2.0L M20A-FXS terhubung ke Carrier (4×24T planet), MG1 ke Sun Gear (30T), sedangkan MG2 & poros roda lewat countershaft ke Ring Gear (78T). Dengan mengatur RPM MG1, rasio antara mesin dan roda berubah mulus tanpa perpindahan gigi.',
      },
      {
        badge: 'PEMBAGIAN TORSI',
        title: '72,2% Mekanis / 27,8% Listrik & Overdrive',
        body: 'Geometri gir planet secara permanen menyalurkan 72,2% (78/108) torsi ICE langsung ke roda dan 27,8% (30/108) ke MG1. Saat melaju konstan di atas ~78 km/h, MG1 melewati nol dan berputar CCW sebagai motor balik untuk overdrive tol yang efisien.',
      },
      {
        badge: 'PEMBAKARAN vs POMPA',
        title: 'Piston Menyala vs Engine Brake B-Range',
        body: 'Crankshaft ICE hanya boleh berputar CW (>= 0 RPM). Saat membakar BBM, urutan 1-3-4-2 menyalakan piston. Di turunan curam gigi B atau saat baterai penuh, pasokan BBM diputus total (0,00 L/h) sementara MG1 memutar ICE hingga ~4.600 RPM sebagai pompa udara.',
      },
      {
        badge: 'ZENIX AG10 (2.020 KG)',
        title: 'Park vs Neutral & Pengereman ECB Kooperatif',
        body: 'Dikalibrasi seperti Innova Zenix Hybrid bermuatan 4 dewasa (186 PS gabungan, baterai NiMH 1,31 kWh, beban A/C + 12V 0,9 kW). Di P, inverter tetap aktif mengisi SoC < 40%; di N, inverter MG1/MG2 mati sehingga tidak bisa mengisi daya. Rem ECB memulihkan energi hingga 32 kW sebelum memadukan rem cakram.',
      },
    ],
    willisFormulaNote: 'Identitas Willis (Selalu Terpenuhi):  30 · ω_MG1 + 78 · ω_Ring = 108 · ω_ICE',
    close: 'Mengerti',
  },
};
