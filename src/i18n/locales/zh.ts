import { AutoDriveMode, IceCombustionMode, OperationModeId } from '../../types/hybrid';
import { TranslationDictionary } from '../types';

export const zh: TranslationDictionary = {
  hud: {
    title: 'Toyota eCVT PSD',
    iceLegend: 'ICE + 行星架与行星轮',
    mg1Legend: 'MG1 + 太阳轮',
    mg2Legend: 'MG2 + 齿圈与减速齿轮',
    wheelLegend: '车轮 + 轮胎',
    battLegend: 'HV Batt + PCU',
    psdLog: 'PSD Log',
    psdLogTitle: '打开 PSD 状态切换与物理日志',
    notifOn: '通知开',
    notifOff: '通知关',
    notifOnTitle: 'PSD 实时切换通知已开启（点击关闭）',
    notifOffTitle: 'PSD 实时切换通知已关闭（点击开启）',
    howTo: '指南?',
    howToTitle: '打开模拟器使用指南与丰田 THS V 技术解析',
    languageTitle: '选择界面语言',
  },
  badges: {
    iceTitle: 'ICE · 行星架与行星轮',
    battTitle: 'HV Battery · PCU',
    mg1Title: 'MG1 · 太阳轮',
    mg2Title: 'MG2 · 齿圈与齿轮',
    wheelTitle: '车轮 · 主减速半轴',
    socLabel: 'SoC',
    chgPrefix: '▲ CHG',
    disPrefix: '▼ DIS',
    standby: '■ STANDBY',
    stop: 'STOP',
    fwd: '前进',
    rev: '倒车',
    iceStatus: {
      [IceCombustionMode.STOPPED]: '■ 熄火 · STANDBY',
      [IceCombustionMode.PRODUCING_POWER]: '◆ 点火做功',
      [IceCombustionMode.FIRING_IDLE]: '● 怠速 · 0 kW',
      [IceCombustionMode.MOTORING_AIR_PUMP]: '○ 断油 · 气泵制动',
      [IceCombustionMode.SPINNING_FUEL_CUT]: '○ 随动 · 断油状态',
    },
    iceFiringPrefix: '◆ 点火',
  },
  planetary2d: {
    title: '2D 行星齿轮机构',
    sunToMg1: 'Sun→MG1',
    carrierToIce: 'Carrier→ICE',
    planetsPin: '行星轮(Pin)',
    ringToMg2Wheel: 'Ring→MG2/轮',
  },
  toolbar: {
    drive: '驾驶',
    modes: '模式',
    manual: '手动',
    speed: '转速比例',
    normal: '标准',
    realistic: '真实',
    speedTooltip: '机械旋转动画速度：标准（便于观察）vs 真实（实际仿真 RPM；能量流箭头速度不变）',
    slowMo: 'Slow-Mo',
    auto: 'Auto',
    autoSloMoTooltip: 'Auto Slo-Mo：在混动模式、能量流或转向切换前后自动切换至 0.5x 慢放',
    slowMoTooltip: '慢动作速度控制（切换时 Auto 0.5x、1x、0.5x、0.25x）',
    camAll: '全局',
    camPsd: 'PSD',
    camMg: 'MG1/2',
    camWheel: '车轮',
    spread: '分解',
    sound: '音效',
    muted: '静音',
    reset: '重置',
    show: '展开',
    hide: '收起',
  },
  driveTab: {
    evOn: 'EV ON',
    evShort: 'EV',
    evMode: 'EV Mode',
    evTooltip: '纯电 EV Mode（SoC >= 40% 时支持 <= 42 km/h）',
    autoDrive: 'AutoDrive',
    autoModes: {
      [AutoDriveMode.OFF]: { label: 'Off', badge: 'MANUAL', title: '手动驾驶' },
      [AutoDriveMode.CITY]: { label: '城市', badge: '城市 AUTO', title: '城市拥堵与信号灯' },
      [AutoDriveMode.HIGHWAY]: {
        label: '高速',
        badge: '高速 AUTO',
        title: '高速巡航与超车',
      },
      [AutoDriveMode.MOUNTAIN]: {
        label: '山路',
        badge: '山路 AUTO',
        title: '山区坡道（长爬坡与下坡）',
      },
    },
    manualDriveBadge: '手动驾驶',
    throttle: '油门',
    thrShort: '油门',
    brake: '刹车',
    brkShort: '刹车',
    incline: '坡度',
    incShort: '坡度',
    inclineTooltip: '道路坡度（-50% 至 +50%）。点击数值重置为 0%。',
    comb: '综合',
    regen: '回收',
    regShort: '回收',
    mech: '机械',
    mchShort: '机械',
    evLabel: 'EV',
  },
  manualTab: {
    instruction: '调节各动力源转速与旋转方向：',
    autoSolve: '自动求解轴：',
    mg2Wheel: 'MG2/车轮',
    iceCarrier: 'ICE · 行星架',
    mg1Sun: 'MG1 · 太阳轮',
    mg2Ring: 'MG2 · 齿圈',
    iceNoCcwTooltip: 'ICE 仅支持 CW 正转（0–6,000 RPM）— 机械结构禁止 CCW 反转',
  },
  modes: {
    [OperationModeId.STOP]: {
      shortLabel: 'Ready 驻车',
      title: 'Ready / 静止纯电待机',
      summary:
        '车辆在 Ready 状态下静止（0 RPM、零油耗），电动空调与车载设备仍从 NiMH 电池消耗约 0.9 kW。',
    },
    [OperationModeId.IDLE_CHARGE]: {
      shortLabel: 'Park 充电',
      title: 'P 挡静止 HV 电池充电',
      summary:
        '齿圈与车轮锁止在 0 RPM。ICE 以 1,300 RPM CW 带动行星架并驱动太阳轮（MG1）CW 发电，供给空调（~0.9 kW）并为 NiMH 电池组充电。',
    },
    [OperationModeId.EV_DRIVE]: {
      shortLabel: 'EV 驱动',
      title: '纯电驱动（EV Mode）',
      summary:
        'NiMH HV 电池驱动 MG2（1VM）带动齿圈与车轮前进（约 42 km/h）并供应空调负荷。ICE 保持 0 RPM，行星轮带动 MG1 向 CCW 自由空转。',
    },
    [OperationModeId.ICE_START]: {
      shortLabel: 'ICE 启动',
      title: '行驶中发动机启动阶段',
      summary:
        '在 MG2 推动 2,020 kg 车身行驶的同时，MG1 消耗电池电能作为起动电机，将太阳轮从负转速拉升并带动行星架（ICE）达到点火转速。',
    },
    [OperationModeId.NORMAL_SPLIT]: {
      shortLabel: '标准分流',
      title: '阿特金森高效功率分流巡航',
      summary:
        'M20A-FXS 沿 41% 热效率线（1,820 RPM）运转：PSD 将 72.2% 扭矩机械直传齿圈，27.8% 分配至 MG1 发电供给 MG2 与调节 SoC。',
    },
    [OperationModeId.POWER_BOOST]: {
      shortLabel: '全油门助力',
      title: '全负荷双源助力（186 PS / 184 hp）',
      summary:
        'M20A-FXS 跃升至 5,000 RPM 以上经齿圈与 MG1 协同输出，同时 NiMH 电池向 MG2（1VM）额外注入 26.5 kW 助力以应对超车与爬坡。',
    },
    [OperationModeId.HIGHWAY_OVERDRIVE]: {
      shortLabel: '高速超速挡',
      title: '高速 eCVT 超速巡航（功率循环）',
      summary:
        '以 112 km/h 稳定巡航时（齿圈 2,770 RPM），ICE 维持轻松的 1,780 RPM，太阳轮（MG1）呈 CCW 反转（-794 RPM）作为电动端由 MG2 轻微发电供给。',
    },
    [OperationModeId.REGEN_BRAKE]: {
      shortLabel: '动能回收',
      title: '协同再生制动（CHG）',
      summary:
        'ICE 断油停机（0 RPM）。2,020 kg 整车惯性反拖 MG2 发电（最高向 NiMH 回收 32 kW），并与液压盘式制动无缝协同。',
    },
    [OperationModeId.B_MODE_DESCENT]: {
      shortLabel: 'B挡下坡',
      title: 'B 挡长下坡发动机制动（气泵模式）',
      summary:
        '在 B 挡下坡时，MG2 回收制动能量并将部分电能送往 MG1，带动断油状态的 ICE（3,100 RPM）作为空气泵空转消耗动能，防止 NiMH 过充。',
    },
    [OperationModeId.REVERSE_EV]: {
      shortLabel: 'EV 倒车',
      title: '无倒挡齿轮纯电倒车',
      summary:
        'PCU 反转交流电相序使 MG2 呈 CCW 旋转，经中间轴 CW 带动齿圈与车轮倒退（-19 km/h），ICE 保持 0 RPM。',
    },
  },
  logModal: {
    title: 'PSD 事件与物理日志',
    subtitle: '实时记录混动状态切换、能量流反转以及各轴旋转方向变化',
    clear: '清空',
    filterAll: '全部',
    filterHybrid: '混动状态',
    filterFlow: '能量流',
    filterRotation: '旋转方向',
    newestOnTop: '最新置顶',
    empty: '暂无 PSD 切换记录。请尝试驾驶、换挡或拖动手动滑块观察状态变化。',
    whyPrefix: '原理解析：',
    battLabel: '电池',
  },
  howToModal: {
    title: '操作指南与丰田混合动力系统 (THS V)',
    subtitle: 'Toyota Kijang Innova Zenix Hybrid (AG10) eCVT 交互式使用说明与工程原理',
    tabControls: '使用指南',
    tabDrivetrain: 'THS V 原理',
    controlsIntro:
      '通过手动驾驶、逼真的 AutoDrive 路况模拟或直接操控行星齿轮运动学，实时探索第五代丰田混合动力系统。',
    drivetrainIntro:
      '丰田 eCVT 不采用钢带或阶梯式离合器，而是使用一套行星齿轮组（Power Split Device / PSD）将发动机与两台电机永久机械耦合。',
    controlsCards: [
      {
        badge: '3D 视口',
        title: '旋转视角、缩放、预设机位与爆炸分解',
        body: '左键拖拽旋转视角、右键平移、滚轮缩放。点击 全局 / PSD / MG1/2 / 车轮 快速聚焦各总成；拖动 分解（0–100%）可在保持齿轮精确啮合的同时拉开变速驱动桥。',
      },
      {
        badge: '驾驶面板',
        title: 'AutoDrive、EV Mode 与踏板控制',
        body: '支持 P / R / N / D / B 换挡、专有 EV Mode（SoC >= 40% 且 <= 42 km/h）以及 城市 / 高速 / 山路 AutoDrive。手动调节油门、刹车或坡度会立即切回手动驾驶。',
      },
      {
        badge: '模式与手动',
        title: '10 种标定工况与 Willis 实时求解',
        body: '在 模式 标签可一键进入 10 种经过核验的 THS V 典型工况（从 P 挡充电到 186 PS 双源加速及 B 挡下坡）。在 手动 标签可锁定任意一轴并直接调节 ICE（仅 CW）、MG1 或 MG2 转速。',
      },
      {
        badge: '观察工具',
        title: '转速比例、Auto Slow-Mo、PSD 日志与声浪',
        body: '切换 标准 / 真实 机械转速（能量流箭头保持不变），开启 Auto Slow-Mo 在工况切换时自动 0.5x 慢放，查看 100 条 PSD 日志与实时通知，并可开启 M20A-FXS + 胎噪 + EV 逆变器合成音效。',
      },
    ],
    drivetrainCards: [
      {
        badge: 'PSD 运动学',
        title: '行星齿轮功率分流装置与无离合器 eCVT',
        body: '2.0L M20A-FXS 发动机连接行星架（4×24T 行星轮），MG1 连接 30T 太阳轮，MG2 与车轮经中间轴连接 78T 齿圈。通过无级调节 MG1 转速，即可平滑改变发动机与车轮之间的传动比。',
      },
      {
        badge: '扭矩分配',
        title: '72.2% 机械直传 / 27.8% 电传与超速挡',
        body: '行星架受力平衡决定 ICE 扭矩的 72.2%（78/108）直接机械传至车轮，27.8%（30/108）传至 MG1。当巡航车速超过约 78 km/h，MG1 越过零点呈 CCW 反转做功，利用 MG2 少量回馈电能实现高速超速巡航。',
      },
      {
        badge: '做功 vs 反拖气泵',
        title: '气缸点火做功与断油 B 挡机制',
        body: 'ICE 曲轴只能沿 CW（>= 0 RPM）旋转。喷油做功时按 1-3-4-2 点火；在陡坡 B 挡滑行或高电量制动时完全断油（0.00 L/h），由 MG1 反拖 ICE 至最高约 4,600 RPM 作为空气泵耗散多余动能。',
      },
      {
        badge: 'ZENIX AG10 (2,020 KG)',
        title: 'P 挡 vs N 挡区别与 ECB 协同制动',
        body: '参数对标 4 名成人载荷的 Innova Zenix Hybrid（综合 186 PS、1.31 kWh NiMH 电池、0.9 kW 空调附件负载）。P 挡逆变器保持激活并在 SoC < 40% 时补电；N 挡断开 MG1/MG2 逆变器无法充电。ECB 制动优先使用 MG2 回收最高 32 kW 后再无缝叠加液压制动。',
      },
    ],
    willisFormulaNote: 'Willis 行星运动学恒等式（始终满足）： 30 · ω_MG1 + 78 · ω_Ring = 108 · ω_ICE',
    close: '知道了',
  },
};
