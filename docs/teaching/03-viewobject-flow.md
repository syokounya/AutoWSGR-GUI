# 03 — ViewObject 单向数据流

> **前置阅读**：[02-host-interface](02-host-interface.md)  
> **核心原则**：View 层不允许直接读取 Model，所有数据通过 Controller 拼装成 ViewObject 后单向传递。

---

## 数据流示意

```
Model (业务数据)          Controller (拼装)           View (渲染)
     │                        │                        │
 scheduler.status ───────►    │                        │
 scheduler.taskQueue ────►    │                        │
 trackedLoot ────────────►  buildMainViewObject()      │
 wsConnected ────────────►    │                        │
                              ▼                        │
                         MainViewObject ──────────► render(vo)
                         (纯数据,无方法)            (纯DOM操作)
```

---

## ViewObject 接口

```typescript
// src/types/view.ts — View 层唯一认识的数据结构

export interface MainViewObject {
  status: AppStatus;               // 'idle' | 'running' | ...
  statusText: string;              // "空闲" | "运行中" | ...
  currentTask: TaskViewObject | null;
  expeditionTimer: string;         // "12:34"
  taskQueue: TaskQueueItemVO[];
  wsConnected: boolean;
  runningTaskId: string | null;
}

export interface TaskQueueItemVO {
  id: string;
  name: string;
  priorityLabel: string;           // "远征" | "用户" | "日常"
  remaining: number;
  totalTimes: number;
  progress?: string;               // "2/5"
  progressPercent?: number;        // 0~1
  acquisitionText?: string;        // "装备 3/200 | 舰船 253/500"
}
```

**设计要点**：
- VO 是**纯数据接口**，没有方法
- 字段使用 View 能直接展示的格式（`priorityLabel: "远征"` 而非 `priority: 0`）
- View 层**完全不知道** `Scheduler`、`ApiClient` 的存在

---

## 拼装函数

```typescript
// src/controller/app/rendering.ts

export interface RenderingState {
  readonly scheduler: Scheduler;
  currentProgress: string;
  trackedLoot: string;
  trackedShip: string;
  wsConnected: boolean;
  expeditionTimerText: string;
}

export function buildMainViewObject(state: RenderingState): MainViewObject {
  const { scheduler, currentProgress, wsConnected, expeditionTimerText } = state;
  const running = scheduler.currentRunningTask;

  const taskQueueVo: TaskQueueItemVO[] = [];
  if (running) {
    taskQueueVo.push({
      id: running.id,
      name: running.name,
      priorityLabel: PRIORITY_LABELS[running.priority] ?? '用户',
      remaining: running.remainingTimes,
      totalTimes: running.totalTimes,
      progress: currentProgress || undefined,
      // ...
    });
  }
  for (const t of scheduler.taskQueue) {
    taskQueueVo.push({ /* 同上结构 */ });
  }

  return {
    status: scheduler.status,
    statusText: STATUS_TEXT[scheduler.status] ?? '未知',
    currentTask: running ? { name: running.name, /* ... */ } : null,
    expeditionTimer: expeditionTimerText,
    taskQueue: taskQueueVo,
    wsConnected,
    runningTaskId: running?.id ?? null,
  };
}
```

**关键**：拼装函数是**纯函数**——输入 `RenderingState`，输出 `MainViewObject`。不修改任何状态，不操作 DOM。

---

## View 层：只接收 VO，只做渲染

```typescript
// src/view/main/MainView.ts

export class MainView {
  render(vo: MainViewObject): void {
    this.statusBar.render(vo);        // 委托子视图
    this.taskQueueView.render(vo);
  }

  appendLog(entry: LogEntryVO): void {
    this.logView.appendLog(entry);
  }
}
```

View 的职责**只有两件事**：
1. 接收 VO → 渲染 DOM
2. 用户操作 → 触发回调（如 `onRemoveQueueItem`）

---

## 为什么禁止 View 直接读 Model

| 做法 | 后果 |
|------|------|
| View 直接 `import Scheduler` | View 和 Model 紧耦合，改字段名要同时改 View |
| View 调用 `api.getStatus()` | View 包含业务逻辑，不再是纯渲染层 |
| View 通过 VO 接收数据 | ✅ Model 变了只需改拼装函数，View 无感 |

---

## 调用链全貌

```
状态变化 (onTaskCompleted 等)
    ↓
SchedulerBinder.callback → host.renderMain()
    ↓
AppController.renderMain()
    ↓
buildMainViewObject(state)  ← 纯函数拼装
    ↓
mainView.render(vo)         ← 纯 DOM 渲染
```
