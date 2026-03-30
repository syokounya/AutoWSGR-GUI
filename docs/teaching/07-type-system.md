# 07 — 类型系统分层

> **前置阅读**：[03-viewobject-flow](03-viewobject-flow.md)、[06-model-layer](06-model-layer.md)  
> **核心原则**：类型定义按层分文件 — `model.ts` 给 Model/Controller 用，`view.ts` 给 View/Controller 用，两者不互相引用。

---

## 目录结构

```
src/types/
├── model.ts           业务领域实体 (Plan, Config, FleetPreset...)
├── view.ts            ViewObject 接口 (MainViewObject, TaskQueueItemVO...)
├── api.ts             后端 API 请求/响应类型
├── scheduler.ts       调度器公共类型 (SchedulerTask, TaskPriority...)
└── electronBridge.ts  IPC 桥方法签名
```

---

## 类型流向图

```
  后端 (Python)
      │
      ▼
  types/api.ts          ← 后端通信契约 (TaskRequest, TaskResult, WsLogMessage)
      │
      ▼
  Model 层              ← types/model.ts (PlanData, UserSettings, FleetPreset...)
      │                 ← types/scheduler.ts (SchedulerTask, TaskPriority...)
      │
      ▼
  Controller 层         ← 同时引用 model.ts + view.ts
  (拼装 VO)             ← 把 Model 类型转换为 View 类型
      │
      ▼
  View 层               ← types/view.ts (MainViewObject, TaskQueueItemVO...)
                        ← 不允许引用 model.ts 或 api.ts
```

---

## 各文件职责

### types/model.ts — 业务实体

对应后端 AutoWSGR 的数据结构，Controller 和 Model 层使用：

```typescript
export interface PlanData {
  chapter: number;
  map: number;
  selected_nodes: string[];
  node_args?: Record<string, NodeArgs>;
  fleet_presets?: FleetPreset[];
  times?: number;
  stop_condition?: StopCondition;
  // ...
}

export interface UserSettings {
  emulator: EmulatorConfig;
  account: AccountConfig;
  daily_automation: DailyAutomation;
}
```

### types/view.ts — ViewObject

Controller 拼装后传给 View 的纯数据，View 层唯一认识的类型：

```typescript
export interface MainViewObject {
  status: AppStatus;
  statusText: string;        // 已转换为中文
  taskQueue: TaskQueueItemVO[];
  wsConnected: boolean;
  // ...
}

export interface NodeViewObject {
  id: string;
  formation: string;         // 已转换为中文阵型名
  nodeType: MapNodeType;
  // ...
}
```

**设计要点**：VO 字段是**展示友好**的格式，不暴露内部枚举值。

### types/api.ts — 后端 API 契约

定义请求/响应类型，只在 Model 层和 Controller 层使用：

```typescript
export interface TaskRequest {
  type: string;
  fleet_id?: number;
  // ...
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  error?: string;
}
```

### types/scheduler.ts — 调度器公共类型

从 `Scheduler.ts` 中提取，供 Controller 和 View 层引用：

```typescript
export enum TaskPriority {
  EXPEDITION = 0,
  USER_TASK = 10,
  DAILY = 20,
}

export interface SchedulerTask {
  id: string;
  name: string;
  type: SchedulerTaskType;
  priority: TaskPriority;
  remainingTimes: number;
  totalTimes: number;
  // ...
}

export type SchedulerStatus = 'idle' | 'running' | 'stopping' | 'not_connected';
```

### types/electronBridge.ts — IPC 方法签名

定义 `window.electronBridge` 的完整接口，Renderer 进程通过此接口与主进程通信：

```typescript
export interface ElectronBridge {
  openDirectoryDialog: (title?: string) => Promise<string | null>;
  startBackend: () => Promise<{ success: boolean; message: string }>;
  detectEmulator: () => Promise<EmulatorDetectResult | null>;
  getAppVersion: () => string;
  getBackendPort: () => number;
  // ... 40+ 个方法
}
```

---

## 引用规则

| 层 | 可引用 | 禁止引用 |
|----|--------|----------|
| View | `types/view.ts` | `types/model.ts`, `types/api.ts` |
| Controller | `types/view.ts`, `types/model.ts`, `types/api.ts`, `types/scheduler.ts` | — |
| Model | `types/model.ts`, `types/api.ts`, `types/scheduler.ts` | `types/view.ts` |
| Electron 主进程 | `types/electronBridge.ts` | `types/view.ts` |

---

## 为什么要分开

一个反例：如果 `PlanPreviewView` 直接 import `types/model.ts` 中的 `PlanData`——

```typescript
// ❌ 反例
import type { PlanData } from '../../types/model';

class PlanPreviewView {
  render(plan: PlanData): void {
    // View 要自己处理 plan.node_args 的格式转换
    // View 要知道 formation 数字对应什么阵型名
    // 后端改了 PlanData 结构，View 也要改
  }
}
```

正确做法：Controller 完成所有转换，View 只接收 `PlanPreviewViewObject`：

```typescript
// ✅ 正确
import type { PlanPreviewViewObject } from '../../types/view';

class PlanPreviewView {
  render(vo: PlanPreviewViewObject | null): void {
    // vo.mapName 已经是 "7-4" 格式
    // vo.selectedNodes[0].formation 已经是 "单纵"
    // View 不需要任何转换逻辑
  }
}
```
