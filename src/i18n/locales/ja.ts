import { AutoDriveMode, IceCombustionMode, OperationModeId } from '../../types/hybrid';
import { TranslationDictionary } from '../types';

export const ja: TranslationDictionary = {
  hud: {
    title: 'Toyota eCVT PSD',
    iceLegend: 'ICE + キャリア＆プラネタリ',
    mg1Legend: 'MG1 + サンギア',
    mg2Legend: 'MG2 + リング＆ギア',
    wheelLegend: 'ホイール + タイヤ',
    battLegend: 'HV Batt + PCU',
    psdLog: 'PSD Log',
    psdLogTitle: 'PSDイベント・解説ログを開く',
    notifOn: '通知 On',
    notifOff: '通知 Off',
    notifOnTitle: 'PSD切替ライブ通知 ON（クリックでOFF）',
    notifOffTitle: 'PSD切替ライブ通知 OFF（クリックでON）',
    languageTitle: '表示言語を選択',
  },
  badges: {
    iceTitle: 'ICE · キャリア＆プラネタリ',
    battTitle: 'HV Battery · PCU',
    mg1Title: 'MG1 · サンギア',
    mg2Title: 'MG2 · リング＆ギア',
    wheelTitle: 'ホイール · 最終減速軸',
    socLabel: 'SoC',
    chgPrefix: '▲ CHG',
    disPrefix: '▼ DIS',
    standby: '■ STANDBY',
    stop: 'STOP',
    fwd: '前進',
    rev: '後退',
    iceStatus: {
      [IceCombustionMode.STOPPED]: '■ 停止 · STANDBY',
      [IceCombustionMode.PRODUCING_POWER]: '◆ 燃焼運転',
      [IceCombustionMode.FIRING_IDLE]: '● アイドル · 0 kW',
      [IceCombustionMode.MOTORING_AIR_PUMP]: '○ 燃料カット · ポンプ',
      [IceCombustionMode.SPINNING_FUEL_CUT]: '○ 回転中 · 燃料カット',
    },
    iceFiringPrefix: '◆ 燃焼',
  },
  planetary2d: {
    title: '2D 遊星歯車機構',
    sunToMg1: 'Sun→MG1',
    carrierToIce: 'Carrier→ICE',
    planetsPin: 'プラネタリ',
    ringToMg2Wheel: 'Ring→MG2/輪',
  },
  toolbar: {
    drive: '走行',
    modes: 'モード',
    manual: '手動',
    speed: '回転速度',
    normal: '標準',
    realistic: 'リアル',
    speedTooltip:
      '機械回転アニメーション速度：標準（視認用）vs リアル（実シミュレーションRPM、電力フロー速度は不変）',
    slowMo: 'Slow-Mo',
    auto: 'Auto',
    autoSloMoTooltip:
      'Auto Slo-Mo：ハイブリッド状態・電力フロー・回転方向切替の前後で一時的に0.5xへ減速',
    slowMoTooltip: 'スローモーション速度切替（Auto 0.5x切替, 1x, 0.5x, 0.25x）',
    camAll: '全体',
    camPsd: 'PSD',
    camMg: 'MG1/2',
    camWheel: '車輪',
    spread: '分解',
    sound: '音声',
    muted: '消音',
    reset: 'リセット',
    show: '展開',
    hide: '収納',
  },
  driveTab: {
    evOn: 'EV ON',
    evShort: 'EV',
    evMode: 'EV Mode',
    evTooltip: 'EV Mode（SoC 40%以上で42 km/h以下）',
    autoDrive: 'AutoDrive',
    autoModes: {
      [AutoDriveMode.OFF]: { label: 'Off', badge: 'MANUAL', title: '手動運転' },
      [AutoDriveMode.CITY]: { label: '市街地', badge: '市街 AUTO', title: '市街地走行・信号' },
      [AutoDriveMode.HIGHWAY]: {
        label: '高速',
        badge: '高速 AUTO',
        title: '高速巡航・追い越し',
      },
      [AutoDriveMode.MOUNTAIN]: {
        label: '山岳',
        badge: '山岳 AUTO',
        title: '山間ワインディング（登坂・降坂）',
      },
    },
    manualDriveBadge: '手動運転',
    throttle: 'アクセル',
    thrShort: 'Acc',
    brake: 'ブレーキ',
    brkShort: 'Brk',
    incline: '勾配',
    incShort: '勾配',
    inclineTooltip: '路面勾配（-50% 〜 +50%）。数値クリックで0%へリセット。',
    comb: '合計',
    regen: '回生',
    regShort: '回生',
    mech: '油圧',
    mchShort: '油圧',
    evLabel: 'EV',
  },
  manualTab: {
    instruction: '各動力源の回転速度と回転方向を調整：',
    autoSolve: '自動計算軸：',
    mg2Wheel: 'MG2/車輪',
    iceCarrier: 'ICE · キャリア',
    mg1Sun: 'MG1 · サンギア',
    mg2Ring: 'MG2 · リングギア',
    iceNoCcwTooltip: 'ICEはCW正転（0〜6,000 RPM）のみ可能 — CCW逆転は構造上ロック',
  },
  modes: {
    [OperationModeId.STOP]: {
      shortLabel: 'Ready 停止',
      title: 'Ready / 停車EV待機状態',
      summary:
        'Ready状態で停車中（0 RPM・燃料消費ゼロ）。電動エアコンと補機がNiMHバッテリーから約0.9 kWを消費します。',
    },
    [OperationModeId.IDLE_CHARGE]: {
      shortLabel: 'Park 充電',
      title: 'Pレンジ停車・HVバッテリー充電',
      summary:
        'リングギアと車輪は0 RPM固定。ICEがキャリアをCW（1,300 RPM）で回し、サンギア（MG1）を発電駆動してエアコン（約0.9 kW）供給とNiMH充電を行います。',
    },
    [OperationModeId.EV_DRIVE]: {
      shortLabel: 'EV 走行',
      title: '純電気走行（EV Mode）',
      summary:
        'NiMH HVバッテリーでMG2（1VM）を駆動しリングギアと車輪を前進（約42 km/h）。ICEは0 RPM停止のままプラネタリギアがMG1をCCWへ空転させます。',
    },
    [OperationModeId.ICE_START]: {
      shortLabel: 'ICE 始動',
      title: '走行中エンジン始動フェーズ',
      summary:
        'MG2が2,020 kgの車体を駆動する間、MG1がバッテリー電力でスターターとして働き、サンギアを負回転から持ち上げICEを始動回転数まで回します。',
    },
    [OperationModeId.NORMAL_SPLIT]: {
      shortLabel: '通常スプリット',
      title: 'Atkinson 最適動力分割巡航',
      summary:
        'M20A-FXSが熱効率41%ライン（1,820 RPM）で運転：PSDがICEトルクの72.2%を機械的にリングギアへ、27.8%をMG1発電へ分割しMG2駆動とSoC調整を行います。',
    },
    [OperationModeId.POWER_BOOST]: {
      shortLabel: 'パワーブースト',
      title: '全負荷デュアルブースト（186 PS / 184 hp）',
      summary:
        'M20A-FXSが5,000 RPM超でリング＋MG1へ出力し、NiMHパックが26.5 kWをMG2（1VM）へ加算して高速追い越し・急登坂に対応します。',
    },
    [OperationModeId.HIGHWAY_OVERDRIVE]: {
      shortLabel: 'オーバードライブ',
      title: '高速 eCVT オーバードライブ（動力循環）',
      summary:
        '112 km/h巡航（リング2,770 RPM）時にICEを1,780 RPMへ抑制。サンギア（MG1）はCCW（-794 RPM）で逆転モーター動作し、MG2からの微少回生電力で駆動します。',
    },
    [OperationModeId.REGEN_BRAKE]: {
      shortLabel: '回生ブレーキ',
      title: '協調回生ブレーキ（CHG）',
      summary:
        'ICE燃料カット（0 RPM）。2,020 kgの運動エネルギーでMG2を発電機として駆動（最大32 kWをNiMHへ回収）し、油圧摩擦ブレーキと滑らかに協調制御します。',
    },
    [OperationModeId.B_MODE_DESCENT]: {
      shortLabel: 'Bレンジ減速',
      title: 'Bレンジ下り坂エンジンブレーキ（空気ポンプ）',
      summary:
        'Bレンジ降坂時はMG2回生電力の一部をMG1へ送り、燃料カット状態のICE（3,100 RPM）を空気ポンプとして回転させてNiMH過充電を防ぎます。',
    },
    [OperationModeId.REVERSE_EV]: {
      shortLabel: 'EV 後退',
      title: '逆転ギアレス電気後退',
      summary:
        'PCUが交流位相を反転しMG2をCCW回転させ、カウンターシャフトCW経由でリングギア／車輪を後退駆動（-19 km/h）。ICEは0 RPMのままです。',
    },
  },
  logModal: {
    title: 'PSD イベント＆物理挙動ログ',
    subtitle: 'ハイブリッドモード切替・電力フロー反転・各軸回転方向変化のリアルタイム記録',
    clear: 'クリア',
    filterAll: 'すべて',
    filterHybrid: 'Hybrid状態',
    filterFlow: '電力フロー',
    filterRotation: '回転方向',
    newestOnTop: '最新順',
    empty:
      'PSDイベントはまだ記録されていません。走行やシフト操作、手動スライダー操作で記録されます。',
    whyPrefix: '理由: ',
    battLabel: 'Batt',
  },
};
