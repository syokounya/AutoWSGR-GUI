# 01 — Extract Class：按职责拆分大文件

> **前置阅读**：[00-overview](00-overview.md)  
> **核心原则**：一个类/模块只负责一件事；当文件超过 300-400 行时，大概率需要拆分。

---

## 拆分的思路

不是"按行数平均分"，而是**按业务职责边界切割**。判断标准：

| 信号 | 行动 |
|------|------|
| 一组方法总是一起被调用 | 提取为独立模块 |
| 一组状态变量只被少数方法读写 | 连同方法一起提取成类 |
| 不同业务域的代码混在一起 | 拆成子控制器 |
| `import` 列表超长 | 职责大概率太多了 |

---

## 案例 1：SchedulerBinder 的提取

原始 `AppController` 中有一大段调度器回调绑定代码和相关状态变量。它们逻辑上是一个整体——**跟踪调度器事件、管理临时渲染状态**——和 AppController 的其他逻辑（导航、配置、任务组…）无关。

### 提取了什么

```typescript
// src/controller/app/SchedulerBinder.ts

export class SchedulerBinder {
  // ── 这些状态原来散落在 AppController 的字段里 ──
  private pendingExerciseTaskId: string | null = null;
  private pendingBattleTaskId: string | null = null;
  private pendingLootTaskId: string | null = null;
  currentProgress = '';
  trackedLoot = '';
  trackedShip = '';
  wsConnected = false;
  expeditionTimerText = '--:--';

  constructor(private readonly host: SchedulerBinderHost) {}

  bindSchedulerCallbacks(): void {
    this.host.scheduler.setCallbacks({
      onProgressUpdate: (_taskId, progress) => {
        this.currentProgress = `${progress.current}/${progress.total}`;
        this.host.renderMain();   // 通过 Host 接口回调主控制器
      },
      onTaskCompleted: (taskId, success) => {
        this.currentProgress = '';
        this.trackedLoot = '';
        // ...处理定时任务完成态
      },
    });
  }
}
```

### 为什么有效

- 这些状态（`currentProgress`、`trackedLoot`…）**只被调度器回调读写**，和 AppController 其他逻辑无关
- 提取后，`AppController` 不再需要了解"调度器回调具体做了什么"
- 调度器逻辑有 bug？直接看 `SchedulerBinder.ts` 一个文件

---

## 案例 2：子控制器 + 模块委托

`PlanController` 自身只有 215 行，但它不是把逻辑写在自己体内——而是把**具体流程委托给独立的纯函数模块**：

```
src/controller/plan/
├── PlanController.ts   (215 行，事件绑定 + 状态持有)
├── importExport.ts     (122 行，方案导入/导出流程)
├── presetFlow.ts       (121 行，任务预设流程)
├── nodeEditor.ts       (47 行，节点编辑器保存)
└── rendering.ts        (109 行，ViewObject 拼装)
```

```typescript
// PlanController.ts — 只做委托

import { importPlanFlow, exportPlanFlow } from './importExport';
import { executePresetFlow } from './presetFlow';

export class PlanController {
  async importPlan(): Promise<void> {
    return importPlanFlow(this.planView, this.host, this.planSetters);
  }

  closePresetDetail(): void {
    closePresetDetailFlow(this.planView, this.presetState);
  }
}
```

**模式**：控制器是"调度员"，具体"干活"的是独立函数。

好处：
- 控制器只关注"谁来做"，不关注"怎么做"
- 流程函数可以独立测试，不需要实例化整个控制器
- 同一模式在 `taskGroup/`、`template/` 中复用

---

## 案例 3：Scheduler 子系统拆分

原始 `Scheduler.ts` 是单一大文件。重构后按职责拆成 7 个文件：

```
src/model/scheduler/
├── Scheduler.ts             主调度器，持有队列 + 消费循环
├── TaskQueue.ts             优先级队列的增删改查
├── CronScheduler.ts         基于系统时钟的定时触发
├── ExpeditionTimer.ts       远征检查倒计时
├── RepairManager.ts         泡澡修理管理
├── StopConditionChecker.ts  停止条件判断
└── index.ts                 barrel re-export
```

`Scheduler` 本体通过组合持有子模块：

```typescript
// Scheduler.ts
export class Scheduler {
  private _taskQueue: TaskQueue;
  private expeditionTimer: ExpeditionTimer;
  private stopChecker: StopConditionChecker;
  // ...
}
```

外部导入不需要关心内部拆分细节：

```typescript
// 外部使用 — 导入路径没变
import { Scheduler, CronScheduler } from '../../model/scheduler';
```

---

## 速查：拆分前后对比

| 区域 | 重构前 | 重构后 | 拆分依据 |
|------|--------|--------|---------|
| Controller | 1 个 3052 行文件 | 6 个子目录 33 个文件 | 按业务域（Plan/TaskGroup/Template/Startup） |
| Scheduler | 1 个大文件 | 7 个文件 | 按调度子职责（队列/定时/修理/停止条件） |
| Electron | 1 个 1192 行文件 | 4 + 6 个文件 | 按关注点（窗口/后端/Python/模拟器） |
| View | 混在一起 | 6 个子目录 16 个文件 | 按功能页面（main/plan/template/config…） |
