# 02 — Host 接口与依赖注入

> **前置阅读**：[01-extract-class](01-extract-class.md)  
> **核心原则**：子控制器不直接引用 `AppController`，通过最小化的 Host 接口与宿主通信。

---

## 问题场景

`PlanController` 需要：调度器实例、方案目录路径、触发主视图重渲染、切换页面。

在重构前可能的做法：
- 直接 `this.scheduler`（因为在同一个类里）→ 拆分后无法用
- 传入整个 `AppController` 引用 → 双向依赖，子控制器知道太多

---

## 解决方案：Host 接口

### 基接口

```typescript
// src/controller/shared/ControllerHost.ts

export interface ControllerHost {
  readonly scheduler: Scheduler;
  plansDir: string;
  renderMain(): void;
  switchPage(page: string): void;
}
```

### 子控制器声明自己的 Host

```typescript
// src/controller/plan/PlanController.ts

export interface PlanHost {
  readonly scheduler: Scheduler;
  plansDir: string;
  renderMain(): void;
  switchPage(page: string): void;
}

export class PlanController {
  constructor(
    private readonly planView: PlanPreviewView,
    readonly host: PlanHost,     // 只依赖接口，不依赖具体类
  ) {}
}
```

### AppController 在创建时注入实现

```typescript
// src/controller/app/AppController.ts — init()

this.planCtrl = new PlanController(this.planView, {
  scheduler: this.scheduler,
  plansDir: '',
  renderMain: () => this.renderMain(),
  switchPage: (p) => this.switchPage(p),
});
```

---

## 依赖方向

```
┌─────────────────────────────────┐
│         AppController           │
│  - 创建子控制器                 │
│  - 实现 Host 接口               │
└──────┬──────┬──────┬────────────┘
       │      │      │   传入 Host 对象
       ▼      ▼      ▼
  PlanCtrl  TaskGroupCtrl  TemplateCtrl
  host:{..}  host:{..}     (各自的 Host)
       │          │
       ▼          ▼          纯函数委托
  importExport  queueLoader
  presetFlow    contextMenu
```

**依赖规则**：
- 子控制器 → Host 接口（✅ 依赖抽象）
- 子控制器 → AppController（❌ 禁止直接依赖具体类）
- 子控制器 → 子控制器（❌ 禁止直接对话，由 AppController 桥接）

---

## 实际案例：桥接子控制器

`TaskGroupController` 需要调用 `PlanController` 的功能（如导入预设、获取当前方案）。但它**不直接引用 PlanController**，而是通过 Host 桥接：

```typescript
// TaskGroupController 的 Host — 比 PlanHost 更丰富
export interface TaskGroupHost extends ControllerHost {
  importTaskPreset(preset: TaskPreset, filePath: string): void;
  getCurrentPlan(): PlanModel | null;
  setCurrentPlan(plan: PlanModel, mapData: MapData | null): void;
  renderPlanPreview(): void;
  closePresetDetail(): void;
  executePreset(): void;
  getCurrentPresetInfo(): { preset: TaskPreset; filePath: string } | null;
}
```

```typescript
// AppController 做中介桥接
this.taskGroupCtrl = new TaskGroupController(
  this.taskGroupModel, this.taskGroupView, this.templateModel,
  this.mainView, {
    scheduler: this.scheduler,
    plansDir: '',
    renderMain: () => this.renderMain(),
    switchPage: (p) => this.switchPage(p),
    // 桥接到 PlanController
    importTaskPreset: (preset, fp) => this.planCtrl.importTaskPreset(preset, fp),
    getCurrentPlan: () => this.planCtrl.getCurrentPlan(),
    setCurrentPlan: (plan, mapData) => this.planCtrl.setCurrentPlan(plan, mapData),
    renderPlanPreview: () => this.planCtrl.renderPlanPreview(),
    closePresetDetail: () => this.planCtrl.closePresetDetail(),
    executePreset: () => this.planCtrl.executePreset(),
    getCurrentPresetInfo: () => this.planCtrl.getCurrentPresetInfo(),
  },
);
```

---

## 为什么不用继承

| 方案 | 问题 |
|------|------|
| `PlanController extends AppController` | 紧耦合 — 子类继承全部实现细节 |
| 深继承链 | 脆弱基类 — 父类改动破坏子类 |
| Host 接口 | ✅ 扁平组合，最小知识，易测试 |

测试时只需 Mock 一个 Host 对象，不需要实例化整个 AppController：

```typescript
const mockHost: PlanHost = {
  scheduler: fakeScheduler,
  plansDir: '/tmp/plans',
  renderMain: vi.fn(),
  switchPage: vi.fn(),
};
const ctrl = new PlanController(fakeView, mockHost);
```
