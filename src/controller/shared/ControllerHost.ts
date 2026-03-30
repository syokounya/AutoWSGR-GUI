import type { Scheduler } from '../../model/scheduler';

/**
 * ControllerHost —— 子控制器通用 Host 基接口。
 * 各子控制器（PlanController / TaskGroupController 等）
 * 通过此接口与 AppController 通信。
 */
export interface ControllerHost {
  readonly scheduler: Scheduler;
  plansDir: string;
  renderMain(): void;
  switchPage(page: string): void;
}
