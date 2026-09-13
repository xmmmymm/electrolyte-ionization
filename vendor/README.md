# vendor 目录说明

本目录存放项目离线运行所依赖的本地第三方库：**Three.js**。

## 目录内容

```
vendor/
└── three.min.js    ← Three.js r128（UMD 传统脚本版），已随仓库提供
```

本项目采用**传统 `<script>` 标签**方式加载，因此在 `index.html` 中直接引入：

```html
<script src="vendor/three.min.js"></script>
```

仓库中已包含该文件，**双击 `index.html` 即可运行，无需任何额外下载**。

## 为什么是 r128

- r128 属于经典 UMD 构建，暴露全局变量 `THREE`，可直接配合传统 `<script>` 标签使用；
- r150 及以后官方已移除 `three.min.js`，只提供 `three.module.js`（ES Module），
  与本项目「禁止 ES Module」的技术约束不符，故不采用。

## 如何升级 / 替换

如需替换为其他版本：

1. **方法 1：官方发布包**
   下载 https://github.com/mrdoob/three.js/releases 中对应版本的 zip，
   解压后取 `build/three.min.js` 覆盖本目录文件。

2. **方法 2：unpkg**
   打开 https://unpkg.com/three@0.128.0/build/three.min.js ，另存为 `three.min.js` 覆盖本文件。

> 注意：请勿改用 r150+ 的 `three.module.js`，除非同时改造 `index.html` 的引入方式。

## 验证是否放置成功

双击打开项目根目录的 `index.html`：

- 3D 场景正常显示 → 放置成功；
- 提示「未找到 Three.js」或画面降级为 2D 静态示意 → 请检查文件名是否为 `three.min.js`、路径是否为 `vendor/`。

## 许可与来源

- Three.js 采用 **MIT 协议**，版权归 three.js authors 所有，可自由再分发（需保留其版权声明）。
- 本目录下的 `three.min.js` 为官方构建产物，**请勿修改其内容**。
- 项目自身代码的许可见根目录 `LICENSE`。

## 其他说明

- 不需要 `OrbitControls` 等其他示例文件，本项目已自行实现拖拽旋转与滚轮缩放。
