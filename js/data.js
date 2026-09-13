/* ============================================================
 * data.js —— 物质数据、各阶段文案、导电性结论、帮助页文案
 * 科学规则约束（S1~S10 / R1~R12）：
 *  - NaCl 文案一律使用"离子脱离晶格"，绝不出现"NaCl 分子分裂成离子"
 *  - 电离方程式：等号、电荷右上角、不标 aq、配平且电荷守恒
 *  - 不出现固定水合配位数（如 [Na(H₂O)₆]⁺）
 *  - 不出现电子转移表述
 * ============================================================ */
(function (global) {
  'use strict';

  /* ---------- 电离方程式（人教版写法） ---------- */
  var EQUATIONS = {
    nacl: 'NaCl === Na⁺ + Cl⁻',
    hcl: 'HCl === H⁺ + Cl⁻',
    sugar: '蔗糖溶于水，以分子形式均匀分散，不发生电离'
  };

  /* ---------- 物质列表 ---------- */
  var SUBSTANCES = {

    /* NaCl：离子化合物 / 电解质 */
    nacl: {
      name: '氯化钠',
      formula: 'NaCl',
      type: '离子化合物（电解质）',
      equation: EQUATIONS.nacl,
      isElectrolyte: true,
      mechanism: 'NaCl 由 Na⁺ 和 Cl⁻ 构成，离子本身已存在于晶体中；溶于水或熔融时，离子脱离晶格束缚，形成自由移动的离子。',
      sizeRatio: { na: 102, cl: 181 }  // pm【真实】
    },

    /* 蔗糖：非电解质 */
    sugar: {
      name: '蔗糖',
      formula: 'C₁₂H₂₂O₁₁',
      type: '共价化合物（非电解质）',
      equation: EQUATIONS.sugar,
      isElectrolyte: false,
      mechanism: '蔗糖由分子构成，溶于水时以分子形式均匀分散，不产生离子，故水溶液和熔融状态都不导电。'
    },

    /* HCl：共价化合物 / 电解质 */
    hcl: {
      name: '氯化氢',
      formula: 'HCl',
      type: '共价化合物（电解质）',
      equation: EQUATIONS.hcl,
      isElectrolyte: true,
      mechanism: 'HCl 由分子构成，分子内 H—Cl 为共价键；溶于水时，水分子使共价键断裂，产生自由移动的 H⁺ 和 Cl⁻。'
    }
  };

  /* ---------- NaCl 溶解三阶段（原①②合并；科学表述核心区） ---------- */
  var NACL_DISSOLVE_STAGES = [
    {
      id: 0,
      title: '阶段 ① 晶体入水 · 水分子包围',
      text: '固态 NaCl 晶体放入水中，晶体中 Na⁺ 与 Cl⁻ 有规律地交替排列。水分子是极性分子：氧端带部分负电荷、氢端带部分正电荷，纷纷靠近晶体表面，氧端朝向 Na⁺、氢端朝向 Cl⁻。此时离子仍被束缚在晶格中，不能自由移动，不导电。',
      conduct: false,
      conductReason: '离子仍被束缚在晶格中，不能自由移动 → 不导电'
    },
    {
      id: 1,
      title: '阶段 ② 离子脱离晶格',
      text: '在水分子作用下，晶体表面的 Na⁺、Cl⁻ 逐渐脱离晶格束缚进入水中。此时固体尚未完全溶解（仍有部分 NaCl 固体剩余）。注意：不是"NaCl 分子分裂"，离子本来就在晶体中。',
      conduct: false,
      conductReason: '部分离子刚开始脱离，尚未形成大量自由移动的离子 → 暂不导电'
    },
    {
      id: 2,
      title: '阶段 ③ 完全溶解 · 水合自由移动',
      text: 'NaCl 已完全溶解，不再有固体剩余：脱离晶格的 Na⁺、Cl⁻ 全部被水分子包围（水合），水分子不断交换位置。离子在溶液中自由移动，形成自由移动的离子，溶液导电，灯泡亮。',
      conduct: true,
      conductReason: '存在自由移动的 Na⁺、Cl⁻ → 导电'
    }
  ];

  /* ---------- NaCl 熔融阶段 ---------- */
  var NACL_MELT_STAGES = [
    {
      id: 0,
      title: '加热前（室温）',
      text: '室温下 NaCl 为固态晶体，Na⁺ 与 Cl⁻ 在晶格中有规律排列，离子被束缚在固定位置、不能自由移动，不导电。',
      conduct: false,
      conductReason: '有离子，但被束缚在晶格中 → 不导电'
    },
    {
      id: 1,
      title: '升温中（未达熔点）',
      text: '温度升高，离子在晶格位置附近振动加剧，但仍未脱离晶格束缚，依旧不导电。熔融电离不需要水，只需要达到熔点。',
      conduct: false,
      conductReason: '离子仅振动加剧，仍被束缚 → 不导电'
    },
    {
      id: 2,
      title: '达到熔点 801 ℃',
      text: '温度达到 801 ℃（NaCl 熔点），晶体熔化成液态，Na⁺、Cl⁻ 脱离晶格束缚，形成自由移动的离子，熔融态导电，灯泡亮。',
      conduct: true,
      conductReason: '熔融态存在自由移动的 Na⁺、Cl⁻ → 导电'
    }
  ];

  /* ---------- 蔗糖溶解阶段 ---------- */
  var SUGAR_STAGES = [
    {
      id: 0,
      title: '蔗糖加入水中',
      text: '蔗糖由蔗糖分子构成。放入水中后，以分子形式均匀分散到水里，分子本身不变化、不产生任何离子。',
      conduct: false,
      conductReason: '只有分子，没有自由移动的离子 → 不导电'
    },
    {
      id: 1,
      title: '分子均匀分散',
      text: '蔗糖分子在水中均匀分散（溶解），溶液中没有离子生成，灯泡始终不亮。蔗糖是非电解质。',
      conduct: false,
      conductReason: '无自由移动的离子 → 不导电'
    }
  ];

  /* ---------- HCl 溶解阶段 ---------- */
  var HCL_STAGES = [
    {
      id: 0,
      title: 'HCl 溶于水（分子态）',
      text: 'HCl 由分子构成，分子中只有 H—Cl 共价键（画面以细棒表示），此时并不存在 H⁺ 和 Cl⁻。HCl 气体通入水中，分子被水分子包围。',
      conduct: false,
      conductReason: '尚未电离出自由移动的离子 → 暂不导电'
    },
    {
      id: 1,
      title: '共价键断裂',
      text: '水分子作用下，H—Cl 共价键断裂，产生 H⁺ 和 Cl⁻。注意与 NaCl 的区别：NaCl 本身就有离子（脱离晶格即可），HCl 原本没有离子（需断开共价键）。',
      conduct: false,
      conductReason: '共价键正在断裂，自由移动的离子尚少 → 暂不导电'
    },
    {
      id: 2,
      title: '电离完成',
      text: 'HCl 在水中完全电离成自由移动的 H⁺ 和 Cl⁻（水合离子），溶液导电，灯泡亮。HCl 是电解质。',
      conduct: true,
      conductReason: '存在自由移动的 H⁺、Cl⁻ → 导电'
    }
  ];

  /* ---------- 预设实验 ---------- */
  var PRESETS = {
    'nacl-solid': {
      id: 'nacl-solid',
      label: '固态 NaCl',
      scene: 'solid',
      desc: '晶体 + 电路，灯泡灭，不导电'
    },
    'nacl-dissolve': {
      id: 'nacl-dissolve',
      label: 'NaCl 溶解',
      scene: 'dissolve',
      desc: '加水 → 电离 → 灯泡亮'
    },
    'nacl-melt': {
      id: 'nacl-melt',
      label: 'NaCl 熔融',
      scene: 'melt',
      desc: '加热至 801 ℃ → 灯泡亮'
    },
    'sugar': {
      id: 'sugar',
      label: '蔗糖溶解',
      scene: 'sugar',
      desc: '蔗糖分散 → 灯泡恒灭，不导电'
    },
    'hcl': {
      id: 'hcl',
      label: 'HCl 溶解（可选）',
      scene: 'hcl',
      desc: '共价键断裂，电离出离子',
      hiddenByDefault: true   // 默认隐藏，教师点击"显示可选案例：HCl"后出现
    }
  };

  /* ---------- 对比模式卡片 ---------- */
  var COMPARE_CARDS = [
    {
      id: 'nacl-solid',
      preset: 'nacl-solid',
      title: '固态 NaCl',
      conduct: '不导电',
      reason: '有 Na⁺、Cl⁻，但被束缚在晶格中，不能自由移动',
      bulb: false
    },
    {
      id: 'nacl-dissolve',
      preset: 'nacl-dissolve',
      title: 'NaCl 水溶液',
      conduct: '导电',
      reason: '离子脱离晶格，形成自由移动的水合离子',
      bulb: true
    },
    {
      id: 'nacl-melt',
      preset: 'nacl-melt',
      title: '熔融 NaCl',
      conduct: '导电',
      reason: '熔融时离子脱离晶格束缚，自由移动（无需水）',
      bulb: true
    },
    {
      id: 'sugar',
      preset: 'sugar',
      title: '蔗糖水溶液',
      conduct: '不导电',
      reason: '蔗糖以分子形式分散，不产生离子',
      bulb: false
    },
    {
      id: 'hcl',
      preset: 'hcl',
      title: 'HCl 水溶液',
      conduct: '导电',
      reason: '水分子使 H—Cl 共价键断裂，电离出 H⁺、Cl⁻',
      bulb: true,
      hiddenByDefault: true
    }
  ];

  /* ---------- 数值面板（示意与真实数量级分开表达） ---------- */
  var NUM_PANEL = {
    latticeNote: '画面晶格离子数：27~64 个（示意）',
    realNote: '真实数量级：每摩尔 NaCl 含 6.02×10²³ 个 Na⁺ 和 6.02×10²³ 个 Cl⁻',
    waterNote: '画面水分子数：120~200 个（示意）',
    realWaterNote: '真实水中水分子数约 10²³ 个/cm³ 数量级',
    disclaimer: '以上画面数值均为教学示意，非真实比例'
  };

  /* ---------- 帮助页文案（三个 Tab） ---------- */
  var HELP = {
    tab1: {
      title: '操作说明',
      items: [
        '拖拽 3D 画面可旋转视角，滚轮可缩放远近。',
        '右侧面板：宏观电路与导电性结论、实验操作与辅助开关；电离方程式显示在 3D 展示区顶部，各原子颜色图示在展示区右下角。',
        '顶部可切换预设实验：固态 NaCl / NaCl 溶解 / NaCl 熔融 / 蔗糖溶解。',
        '溶解实验：点击"加水"开始；"单步"逐阶段推进（最后阶段变为"重放"）；"播放 / 暂停"仅控制粒子动画的进行与暂停，速度可选 0.5×/1×/2×。',
        '熔融实验：拖动温度滑块至 801 ℃（NaCl 熔点）观察熔化与导电。',
        '辅助开关：查看晶格内部结构、真实/示意比例切换、减少动画模式。',
        '"对比模式"可查看五种状态的导电性对比卡片，点击卡片进入对应场景。',
        '"导出图片"生成对比卡片 + 电离方程式 PNG，可插入课件。',
        '"重置"恢复到默认启动状态（固态 NaCl + 未加水）。'
      ]
    },
    tab2: {
      title: '概念定义',
      items: [
        '【电解质】在水溶液里或熔融状态下能导电的化合物，如 NaCl、HCl。',
        '【非电解质】在水溶液里和熔融状态下都不导电的化合物，如蔗糖、酒精。',
        '【电离】电解质溶于水或受热熔化时，离解成自由移动的离子的过程。',
        '【离子化合物】由阴、阳离子构成的化合物（如 NaCl），固态时离子被束缚在晶格中。',
        '【共价化合物】以共用电子对形成分子的化合物（如 HCl、蔗糖）。',
        '【水合离子】离子进入水中被水分子包围：氧端（部分负电）朝向 Na⁺，氢端（部分正电）朝向 Cl⁻；水分子不断交换，不固定。',
        '【导电性判据】关键看是否存在自由移动的离子——固态 NaCl 有离子但不导电。'
      ]
    },
    tab3: {
      title: '教师备注',
      items: [
        '易错点①：学生易说"NaCl 分子电离成离子"。应强调 NaCl 由离子构成，溶解是"离子脱离晶格"，不是分子分裂。',
        '易错点②：学生易认为"有离子就导电"。应抓住"自由移动"四字，对比固态与溶液/熔融态。',
        '易错点③：Na⁺ 半径（102 pm）小于 Cl⁻（181 pm），画面中 Na⁺ 明显更小，可让学生观察指出。',
        '易错点④：熔融电离不需要水，仅需加热到 801 ℃；场景中无水体，可引导学生对比发现。',
        '易错点⑤：HCl 未电离时不存在 H⁺ 和 Cl⁻——HCl 由分子构成，分子中只有 H—Cl 共价键（画面以细棒表示键）；溶于水后共价键断裂，才产生自由移动的 H⁺ 和 Cl⁻。不可与 NaCl"本来就含离子"混为一谈。',
        '板书建议：左侧画宏观电路（灯泡亮/灭），中间画微观示意（晶格→自由离子），右侧写电离方程式 NaCl === Na⁺ + Cl⁻，落实三重表征。',
        '模型说明：画面粒子数、大小、间距均为教学示意；微观溶液区域放大为整个画面（无烧杯边界）；真实微粒极小且稀疏（数量级 10²³），可切换"真实比例"体验。',
        'HCl 简化说明：中学阶段写 H⁺，实际水溶液中为水合氢离子（H₃O⁺），此处遵照教材简化处理。',
        '蔗糖简化说明：未表现蔗糖与水分子间的氢键作用，仅表现分子均匀分散、不电离。'
      ]
    }
  };

  /* ---------- 导出 ---------- */
  global.DATA = {
    SUBSTANCES: SUBSTANCES,
    NACL_DISSOLVE_STAGES: NACL_DISSOLVE_STAGES,
    NACL_MELT_STAGES: NACL_MELT_STAGES,
    SUGAR_STAGES: SUGAR_STAGES,
    HCL_STAGES: HCL_STAGES,
    PRESETS: PRESETS,
    COMPARE_CARDS: COMPARE_CARDS,
    NUM_PANEL: NUM_PANEL,
    HELP: HELP,
    EQUATIONS: EQUATIONS
  };
})(window);
