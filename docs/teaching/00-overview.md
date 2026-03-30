# 00 — 全局概览

> 建议先读此文，再按顺序阅读后续章节。

---

## 问题出在哪里

重构前 `main` 分支的项目能正常运行，但存在三个核心维护痛点：

### 巨型文件

| 文件 | 重构前 | 重构后 |
|------|--------|--------|
| `src/controller/AppController.ts` | **3052 行** | 430 行 + 33 个子模块 |
| `electron/main.ts` | **1192 行** | 401 行 + 6 个子模块 |
| `src/model/Scheduler.ts` | **单文件** | 7 个文件的 `scheduler/` 子系统 |

一个 3000+ 行的文件意味着：
- **定位困难** — 修 bug 要全文搜索，改动可能波及几百行外的逻辑
- **合并冲突频繁** — 多人协作时所有改动集中在同一文件
- **心智负担** — 需要在脑中维护几十个状态变量

### 隐式依赖

原始 `AppController` 中所有方法直接访问 `this` 的几十个字段，任何方法都可能读写任意状态，职责边界模糊。

### 数据流不清晰

View 可能直接读 Model 状态、调用 API，Controller 同时承担渲染和业务逻辑，数据流向是"哪里方便写在哪里"。

---

## 重构后架构

```
╔══════════════════════════════════════════════════════╗
║               Electron 主进程                        ║
║  main.ts ─── 窗口 + IPC 注册                        ║
║  ├── backend.ts ────── 后端子进程生命周期            ║
║  ├── pythonEnv/ ────── Python 发现/安装/更新         ║
║  └── emulatorDetect.ts 模拟器检测                    ║
╠══════════════════════════════════════════════════════╣
║               Renderer Process (MVC)                 ║
║                                                      ║
║  ┌─ View 层 ──────────────────────────────────────┐  ║
║  │ main/    plan/    template/  config/  setup/   │  ║
║  │ MainView PlanPreviewView ... (纯渲染,无逻辑)  │  ║
║  └────────────────────────────────────────────────┘  ║
║        ▲ render(ViewObject)                          ║
║  ┌─ Controller 层 ────────────────────────────────┐  ║
║  │ AppController (协调者)                         │  ║
║  │ ├── PlanController                             │  ║
║  │ ├── TaskGroupController                        │  ║
║  │ ├── TemplateController                         │  ║
║  │ ├── StartupController                          │  ║
║  │ ├── ConfigController                           │  ║
║  │ └── SchedulerBinder                            │  ║
║  └────────────────────────────────────────────────┘  ║
║        │ 读取 Model, 拼装 VO                         ║
║  ┌─ Model 层 ─────────────────────────────────────┐  ║
║  │ ConfigModel  PlanModel  TemplateModel          │  ║
║  │ TaskGroupModel  ApiClient  MapDataLoader       │  ║
║  │ scheduler/ (Scheduler + 5 个子模块)            │  ║
║  └────────────────────────────────────────────────┘  ║
║                                                      ║
║  ┌─ Types 层 ─────────────────────────────────────┐  ║
║  │ model.ts  view.ts  api.ts  scheduler.ts        │  ║
║  │ electronBridge.ts                              │  ║
║  └────────────────────────────────────────────────┘  ║
╠══════════════════════════════════════════════════════╣
║          Python 后端 (uvicorn + FastAPI)              ║
╚══════════════════════════════════════════════════════╝
```

## 重构后文件分布

### Controller 层 — 33 个文件分 6 个子目录

```
src/controller/
├── app/          AppController(430) + SchedulerBinder(179) + ConfigController(226)
│                 + rendering(71) + constants(26) + theme(30)
├── plan/         PlanController(215) + importExport(122) + presetFlow(121)
│                 + nodeEditor(47) + rendering(109)
├── taskGroup/    TaskGroupController(149) + queueLoader(154) + contextMenu(101)
│                 + addItems(78) + importExport(71) + metaLoader(59)
├── template/     TemplateController(191) + selectors(152) + wizard(113)
│                 + crud(89) + useTemplate(80)
├── startup/      StartupController(89) + envAndUpdates(100) + connection(64)
└── shared/       ControllerHost(12) + DialogHelper(90)
```

### Electron 主进程 — 从 1 个文件变成 4 + 6 个

```
electron/
├── main.ts(401)  backend.ts(176)  emulatorDetect.ts(114)  preload.ts(104)
└── pythonEnv/
    ├── context.ts(33) finder.ts(90) envCheck.ts(208)
    ├── installer.ts(225) updater.ts(178) utils.ts(101) index.ts(15)
```

---

## 核心理念速查

| 序号 | 模式 | 一句话 | 详细文档 |
|------|------|--------|----------|
| 1 | Extract Class | 按职责边界拆，不是按行数平均分 | [01](01-extract-class.md) |
| 2 | Host 接口 | 子控制器通过最小接口与宿主通信，禁止反向依赖 | [02](02-host-interface.md) |
| 3 | ViewObject | Controller 拼装 VO → 单向传递 → View 纯渲染 | [03](03-viewobject-flow.md) |
| 4 | Context 注入 | Electron 各模块通过 init() 注入运行上下文 | [04](04-electron-split.md) |
| 5 | Facade | View 内部可拆子视图，对外保持统一 API | [05](05-view-layer.md) |
| 6 | 领域子系统 | 相关类组成 `scheduler/` 目录，通过 index barrel 导出 | [06](06-model-layer.md) |
| 7 | 类型隔离 | `types/view.ts` 和 `types/model.ts` 严格分离 | [07](07-type-system.md) |
