# 06 — Model 层组织

> **前置阅读**：[01-extract-class](01-extract-class.md)  
> **核心原则**：Model 层分两类 — 独立领域模型 + Scheduler 子系统。Model 不依赖 View，通过回调通知 Controller。

---

## 目录结构

```
src/model/
├── ConfigModel.ts       (91 行)   用户配置: YAML 加载/导出/局部更新
├── PlanModel.ts                   战斗方案: 解析 YAML, 节点操作
├── TemplateModel.ts     (146 行)  模板库: 内置 + 用户模板 CRUD
├── TaskGroupModel.ts    (185 行)  任务组: 定义/持久化/排序
├── ApiClient.ts                   HTTP + WebSocket 后端通信
├── MapDataLoader.ts     (71 行)   地图数据加载 + 缓存
└── scheduler/                     调度器子系统 (7 个文件)
    ├── Scheduler.ts               主调度器
    ├── TaskQueue.ts               优先级队列
    ├── CronScheduler.ts           定时触发
    ├── ExpeditionTimer.ts         远征倒计时
    ├── RepairManager.ts           泡澡修理
    ├── StopConditionChecker.ts    停止条件
    └── index.ts                   barrel re-export
```

---

## 独立领域模型

每个 Model 类只负责一个数据领域，职责清晰：

| 类 | 职责 | 关键方法 |
|----|------|---------|
| `ConfigModel` | 配置数据的加载/导出/更新 | `loadFromYaml()`, `toYaml()`, `update()` |
| `PlanModel` | 方案文件解析 + 节点操作 | `parseYaml()`, `getNodeArgs()` |
| `TemplateModel` | 模板库读写 | `loadBuiltin()`, `add()`, `remove()` |
| `TaskGroupModel` | 任务组定义 + 持久化 | `load()`, `save()`, `reorder()` |
| `ApiClient` | 后端 HTTP/WebSocket 通信 | `taskStart()`, `gameAcquisition()` |
| `MapDataLoader` | 地图 JSON 加载 + 内存缓存 | `loadMapData()`, `getNodeType()` |

### ConfigModel 示例

```typescript
// src/model/ConfigModel.ts

export class ConfigModel {
  private settings: UserSettings;

  get current(): UserSettings { return this.settings; }

  loadFromYaml(yamlStr: string): void {
    const parsed = yaml.load(yamlStr) as Record<string, unknown> | null;
    const base = structuredClone(DEFAULT_SETTINGS);
    if (parsed?.emulator) Object.assign(base.emulator, parsed.emulator);
    if (parsed?.account) Object.assign(base.account, parsed.account);
    if (parsed?.daily_automation) Object.assign(base.daily_automation, parsed.daily_automation);
    this.settings = base;
  }

  toYaml(): string {
    return yaml.dump(this.settings, { lineWidth: -1, noRefs: true });
  }

  update(partial: Partial<UserSettings>): void {
    if (partial.emulator) Object.assign(this.settings.emulator, partial.emulator);
    if (partial.account) Object.assign(this.settings.account, partial.account);
    if (partial.daily_automation) Object.assign(this.settings.daily_automation, partial.daily_automation);
  }
}
```

特点：纯数据操作，不引用任何 View 或 Controller。

---

## Scheduler 子系统

原始的 `Scheduler.ts` 是一个大文件，重构后拆成 7 个文件，每个负责一个调度子域。

### 职责分工

| 类 | 职责 |
|----|------|
| `Scheduler` | 主调度器: 持有队列、消费循环、WebSocket 连接 |
| `TaskQueue` | 优先级队列的增删改查、ID 生成 |
| `CronScheduler` | 基于系统时钟的定时触发（演习/战役/刷闪） |
| `ExpeditionTimer` | 远征检查的倒计时 + 定时触发 |
| `RepairManager` | 泡澡修理: 检查血量、送入修理、预设轮换 |
| `StopConditionChecker` | 判断任务是否满足停止条件（预飞检查 + 实时检查） |

### 组合关系

`Scheduler` 通过**组合**持有子模块，不是继承：

```typescript
// src/model/scheduler/Scheduler.ts

export class Scheduler {
  private _taskQueue: TaskQueue;
  private expeditionTimer: ExpeditionTimer;
  private stopChecker: StopConditionChecker;
  private repairMgr: RepairManager;

  constructor(api: ApiClient) {
    this._taskQueue = new TaskQueue();
    this.expeditionTimer = new ExpeditionTimer(DEFAULT_INTERVAL, {
      onTick: (sec) => this.callbacks.onExpeditionTimerTick?.(sec),
      onTrigger: () => this.insertExpeditionTask(),
    });
    this.stopChecker = new StopConditionChecker(api, (level, msg) => { /* ... */ });
    this.repairMgr = new RepairManager(api);
  }
}
```

### StopConditionChecker 示例

从 Scheduler 中提取的独立职责——只负责判断，不负责执行：

```typescript
// src/model/scheduler/StopConditionChecker.ts

export class StopConditionChecker {
  trackedLootCount: number | null = null;
  trackedShipCount: number | null = null;

  /** 任务执行中实时检查 */
  checkRunning(cond: StopCondition): boolean {
    if (cond.loot_count_ge != null
        && this.trackedLootCount != null
        && this.trackedLootCount >= cond.loot_count_ge) {
      return true;
    }
    return false;
  }

  /** 预飞检查：发起任务前确认条件是否已满足 */
  async preflightCheck(cond: StopCondition, taskName: string): Promise<boolean> {
    const resp = await this.api.gameAcquisition();
    // ...OCR 读取出征面板数量
  }
}
```

### ExpeditionTimer 示例

从 Scheduler 中提取的纯定时逻辑：

```typescript
// src/model/scheduler/ExpeditionTimer.ts

export class ExpeditionTimer {
  start(): void {
    this.timer = setInterval(() => {
      this.callbacks.onTrigger();       // 触发远征检查
    }, this._intervalMs);

    this.tickTimer = setInterval(() => {
      const remaining = this._intervalMs - (Date.now() - this.lastCheck);
      this.callbacks.onTick?.(Math.ceil(remaining / 1000));
    }, 1000);
  }

  stop(): void { /* 清理定时器 */ }

  setInterval(ms: number): void {
    this._intervalMs = ms;
    if (this.timer) this.start();       // 运行中自动重启
  }
}
```

---

## barrel re-export

外部导入不需要知道内部拆分：

```typescript
// src/model/scheduler/index.ts
export { Scheduler } from './Scheduler';
export { CronScheduler } from './CronScheduler';
export { TaskPriority, type SchedulerTask, type SchedulerStatus } from '../../types/scheduler';
```

```typescript
// 外部使用
import { Scheduler, CronScheduler, TaskPriority } from '../../model/scheduler';
```

---

## Model 的通信方式

Model 不 import View，通过**回调**通知 Controller：

```typescript
// Scheduler 通过回调通知，不直接操作 UI
scheduler.setCallbacks({
  onStatusChange: (status) => { /* Controller 处理 */ },
  onProgressUpdate: (taskId, progress) => { /* Controller 处理 */ },
  onTaskCompleted: (taskId, success) => { /* Controller 处理 */ },
});
```
