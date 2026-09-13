/* ============================================================
 * config.js —— 全部可调参数集中于此
 * 说明：
 *  - 标注【真实】的为不可随意更改的科学数据；
 *  - 标注【示意】的为教学示意参数，可按需调整；
 *  - 所有颜色、数量、动画速度均可在此修改，无需改动 app.js。
 * ============================================================ */
(function (global) {
  'use strict';

  var CONFIG = {

    /* ---------- 晶格与粒子规模（示意） ---------- */
    lattice: {
      sizeX: 4,          // 晶格 X 方向离子数（建议 3~4）
      sizeY: 3,          // 晶格 Y 方向离子数（建议 3~4）
      sizeZ: 4,          // 晶格 Z 方向离子数（建议 3~4）
      spacing: 1.15      // 晶格中相邻离子球心间距（示意单位）
    },
    water: {
      count: 160,        // 示意水分子数量（120~200）
      swimRadius: 7.2    // 水分子游动范围半径
    },
    freeIon: {
      maxPairs: 26       // 自由离子最大对数（阶段③全部溶解：4×3×4=48 离子 = 24 对，在 20~30 对示意范围内）
    },
    sugar: {
      count: 70,         // 示意蔗糖分子数量
      swimRadius: 7.2
    },
    hcl: {
      moleculeCount: 26, // 示意 HCl 分子数
      ionPairs: 14       // 示意电离出的 H+/Cl- 对数
    },

    /* ---------- 真实科学数据（勿改） ---------- */
    realData: {
      meltingPointNaCl: 801,   // NaCl 熔点 ℃【真实】
      radiusNa: 102,            // r(Na+) ≈102 pm【真实】
      radiusCl: 181,            // r(Cl-) ≈181 pm【真实】
      avogadro: '6.02×10²³',   // 真实数量级表达【真实】
      molMassNaCl: '58.5'
    },

    /* ---------- 比例模式 ---------- */
    scaleMode: {
      default: 'schematic',     // 默认 'schematic'（教学示意）| 'real'
      schematic: {
        // 示意比例：适度放大离子、拉近间距（教学可读性优先）
        naRadius: 0.34,
        clRadius: 0.55,
        waterO: 0.16,
        waterH: 0.105,   // 略放大白色氢原子，保证浅色背景下可辨识
        sugarRadius: 0.38,
        hclH: 0.10,
        hclCl: 0.55,
        bondRadius: 0.055,   // H—Cl 共价键细棒（极坐标示意）
        caption: '当前为教学示意比例'
      },
      real: {
        // 真实比例：严格按 102/181 半径比、更稀疏排布
        naRadius: 0.22,
        clRadius: 0.39,        // 保持 102:181 比例（约 0.564）
        waterO: 0.10,
        waterH: 0.062,
        sugarRadius: 0.26,
        hclH: 0.055,
        hclCl: 0.39,
        bondRadius: 0.034,
        caption: '真实半径比例 r(Na⁺):r(Cl⁻) = 102:181'
      }
    },

    /* ---------- 温度 ---------- */
    temperature: {
      min: 0,        // 滑块下限 ℃
      max: 1000,     // 滑块上限 ℃
      default: 25    // 默认温度 ℃（室温）
    },

    /* ---------- 动画 ---------- */
    animation: {
      speedSteps: [0.5, 1, 2],  // 速度档位
      defaultSpeedIndex: 1,     // 默认 1×
      fps: 60,                  // 目标帧率
      stageDuration: 4.2,       // 自动播放时每阶段时长（秒，基准）
      reducedMotion: false      // 减少动画模式（关闭热运动与平滑过渡）
    },

    /* ---------- 相机 ---------- */
    camera: {
      fov: 46,
      near: 0.1,
      far: 200,
      position: { x: 10.5, y: 8.0, z: 13.5 },  // 初始位置
      target: { x: 0, y: 3.0, z: 0 },
      minDistance: 5,             // 滚轮缩放下限
      maxDistance: 32,            // 滚轮缩放上限
      rotateSpeed: 0.0085,        // 拖拽旋转灵敏度
      zoomStep: 1.1               // 滚轮缩放系数
    },

    /* ---------- 场景外观 ---------- */
    scene: {
      background: 0xdbe8f2,       // 3D 画布底色（淡蓝灰，保证白色氢原子清晰可见）
      region: {                   // 画布整体作为微观"容器"区域（去掉烧杯空间限制）
        x: 9, z: 9, yMin: 0.5, yMax: 8.5
      },
      beaker: {
        radius: 6.4,              // 烧杯内半径
        height: 7.5,              // 烧杯高度
        wallOpacity: 0.16,        // 烧杯壁透明度
        waterOpacity: 0.20,       // 水体透明度
        waterColor: 0xaad4f5,     // 水体颜色（淡蓝）
        waterFillRatio: 0.62      // 加水后水面高度 / 烧杯高
      },
      light: {
        ambient: 0xffffff,
        ambientIntensity: 0.86,
        directional: 0xffffff,
        directionalIntensity: 0.55,
        dirPos: { x: 6, y: 12, z: 8 }
      }
    },

    /* ---------- 粒子配色（可改） ---------- */
    colors: {
      naIon: 0xb84ad3,       // Na⁺ 紫红
      clIon: 0x8fce4a,       // Cl⁻ 黄绿
      waterO: 0xe03a3a,      // 水分子氧端 红
      waterH: 0xffffff,      // 水分子氢端 白（在淡蓝灰底色上清晰可见）
      sugar: 0xe8985a,       // 蔗糖分子 橙棕
      hclH: 0xf5f5f5,        // HCl 中 H 白
      latticeFrame: 0x9bb7cc, // 晶格辅助线
      electrode: 0x5a6b7a,   // 电极
      crucible: 0xd9dee3     // 熔融坩埚
    },

    /* ---------- 界面文案长度与标签 ---------- */
    ui: {
      showLatticeFrameDefault: false,  // 默认是否显示晶格辅助线
      maxParticles: 600                 // 粒子总数上限（硬约束）
    },

    /* ---------- 导出图片 ---------- */
    exportImage: {
      width: 1400,
      height: 900,
      padding: 40
    }
  };

  global.CONFIG = CONFIG;
})(window);
