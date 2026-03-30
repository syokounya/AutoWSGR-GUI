/**
 * SchedulerBinder —— 调度器回调绑定子控制器。
 * 封装 Scheduler / CronScheduler 的回调绑定逻辑 + 关联的可变状态。
 */
import { TaskPriority, type Scheduler, type SchedulerStatus, type CronScheduler } from '../../model/scheduler';
import type { ApiClient } from '../../model/ApiClient';
import type { TemplateModel } from '../../model/TemplateModel';
import { PlanModel } from '../../model/PlanModel';
import type { NormalFightReq } from '../../types/api';
import { Logger } from '../../utils/Logger';

export interface SchedulerBinderHost {
  readonly scheduler: Scheduler;
  readonly cronScheduler: CronScheduler;
  readonly api: ApiClient;
  readonly templateModel: TemplateModel;
  renderMain(): void;
  updateOpsAvailability(connected: boolean): void;
}

export class SchedulerBinder {
  // ── 状态（从 AppController 迁移而来） ──
  private pendingExerciseTaskId: string | null = null;
  private pendingBattleTaskId: string | null = null;
  private pendingLootTaskId: string | null = null;
  currentProgress = '';
  trackedLoot = '';
  trackedShip = '';
  wsConnected = false;
  expeditionTimerText = '--:--';

  constructor(private readonly host: SchedulerBinderHost) {}

  /** 绑定 Scheduler 回调 */
  bindSchedulerCallbacks(): void {
    this.host.scheduler.setCallbacks({
      onStatusChange: (_status: SchedulerStatus) => {
        this.host.renderMain();
      },

      onProgressUpdate: (_taskId, progress) => {
        this.currentProgress = `${progress.current}/${progress.total}`;
        this.host.renderMain();
      },

      onTaskCompleted: (taskId, success, _result, _error) => {
        this.currentProgress = '';
        this.trackedLoot = '';
        this.trackedShip = '';
        if (taskId === this.pendingExerciseTaskId) {
          if (success) {
            this.host.cronScheduler.markExerciseCompleted();
          } else {
            this.host.cronScheduler.clearExercisePending();
          }
          this.pendingExerciseTaskId = null;
        }
        if (taskId === this.pendingBattleTaskId) {
          this.host.cronScheduler.markBattleHandled();
          this.pendingBattleTaskId = null;
        }
        if (taskId === this.pendingLootTaskId) {
          this.host.cronScheduler.markLootHandled();
          this.pendingLootTaskId = null;
        }
        this.host.renderMain();
      },

      onLog: (msg) => {
        const lootMatch = msg.message.match(/\[UI\] 战利品数量: (\d+\/\d+)/);
        const shipMatch = msg.message.match(/\[UI\] 舰船数量: (\d+\/\d+)/);
        if (lootMatch) { this.trackedLoot = lootMatch[1]; this.host.renderMain(); }
        if (shipMatch) { this.trackedShip = shipMatch[1]; this.host.renderMain(); }
        Logger.logLevel(msg.level.toLowerCase(), msg.message, msg.channel);
      },

      onQueueChange: () => {
        this.host.renderMain();
      },

      onConnectionChange: (connected) => {
        this.wsConnected = connected;
        this.host.updateOpsAvailability(connected);
        if (connected) {
          this.host.api.health().then(res => {
            if (res.success && res.data) {
              const uptime = Math.floor(res.data.uptime_seconds);
              Logger.debug(`后端健康检查: 运行 ${uptime}s, 模拟器${res.data.emulator_connected ? '已连接' : '未连接'}`);
            }
          }).catch(() => {});
        }
        this.host.renderMain();
      },

      onExpeditionTimerTick: (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        this.expeditionTimerText = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        const el = document.getElementById('expedition-timer');
        if (el) el.textContent = this.expeditionTimerText;
      },
    });
  }

  /** 绑定定时调度器回调 */
  bindCronCallbacks(): void {
    this.host.cronScheduler.setCallbacks({
      onExerciseDue: (fleetId) => {
        const id = this.host.scheduler.addTask(
          '自动演习',
          'exercise',
          { type: 'exercise', fleet_id: fleetId },
          TaskPriority.DAILY,
          1,
        );
        this.pendingExerciseTaskId = id;
        Logger.info(`自动演习已加入队列 (舰队 ${fleetId})`);
        this.host.scheduler.startConsuming();
      },

      onCampaignDue: (campaignName, times) => {
        const id = this.host.scheduler.addTask(
          `自动战役·${campaignName}`,
          'campaign',
          { type: 'campaign', campaign_name: campaignName, times: 1 },
          TaskPriority.DAILY,
          times,
        );
        this.pendingBattleTaskId = id;
        Logger.info(`自动战役已加入队列 (${campaignName} ×${times})`);
        this.host.scheduler.startConsuming();
      },

      onScheduledTaskDue: (taskKey) => {
        Logger.info(`定时任务「${taskKey}」已触发`);
      },

      onLootDue: (planIndex, stopCount) => {
        this.autoLoadLootTask(planIndex, stopCount);
      },

      onLog: (level, message) => {
        Logger.logLevel(level, message);
      },
    });
  }

  /** 自动战利品：加载内置捞胖次方案并加入队列 */
  private async autoLoadLootTask(planIndex: number, stopCount: number): Promise<void> {
    const tpl = this.host.templateModel.get('builtin_farm_loot');
    if (!tpl) {
      Logger.error('自动战利品：未找到内置 builtin_farm_loot 模板');
      this.host.cronScheduler.clearLootPending();
      return;
    }
    const paths = tpl.planPaths ?? [];
    const planPath = paths[planIndex] ?? paths[0];
    if (!planPath) {
      Logger.error('自动战利品：模板缺少方案文件');
      this.host.cronScheduler.clearLootPending();
      return;
    }
    const bridge = window.electronBridge;
    if (!bridge) {
      this.host.cronScheduler.clearLootPending();
      return;
    }
    try {
      const content = await bridge.readFile(planPath);
      const plan = PlanModel.fromYaml(content, planPath);
      const req: NormalFightReq = {
        type: 'normal_fight',
        plan_id: plan.fileName,
        times: 1,
        gap: plan.data.gap ?? 0,
      };
      const stopCondition = { loot_count_ge: stopCount };
      const id = this.host.scheduler.addTask(
        `自动刷胖次·${plan.mapName}`,
        'normal_fight',
        req,
        TaskPriority.DAILY,
        99,
        stopCondition,
      );
      this.pendingLootTaskId = id;
      Logger.info(`自动战利品已加入队列 (${plan.mapName}, 战利品≥${stopCount}时停止)`);
      this.host.scheduler.startConsuming();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Logger.error(`自动战利品加载失败: ${msg}`);
      this.host.cronScheduler.clearLootPending();
    }
  }
}
