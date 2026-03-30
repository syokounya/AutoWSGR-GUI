import type { MainViewObject, TaskQueueItemVO } from '../../types/view';
import type { Scheduler } from '../../model/scheduler';
import { PRIORITY_LABELS, STATUS_TEXT } from './constants';

export interface RenderingState {
  readonly scheduler: Scheduler;
  currentProgress: string;
  trackedLoot: string;
  trackedShip: string;
  wsConnected: boolean;
  expeditionTimerText: string;
}

/** 根据日志中解析到的后端 OCR 数据构建资源文本 */
export function buildAcquisitionText(trackedLoot: string, trackedShip: string): string | undefined {
  const parts: string[] = [];
  if (trackedLoot) parts.push(`装备 ${trackedLoot}`);
  if (trackedShip) parts.push(`舰船 ${trackedShip}`);
  return parts.length > 0 ? parts.join(' | ') : undefined;
}

/** 从调度器状态 + 追踪数据拼装 MainViewObject */
export function buildMainViewObject(state: RenderingState): MainViewObject {
  const { scheduler, currentProgress, trackedLoot, trackedShip, wsConnected, expeditionTimerText } = state;
  const running = scheduler.currentRunningTask;
  const queue = scheduler.taskQueue;

  const taskQueueVo: TaskQueueItemVO[] = [];

  if (running) {
    let progressPercent = 0;
    if (currentProgress) {
      const parts = currentProgress.split('/');
      if (parts.length === 2) {
        const cur = parseInt(parts[0], 10);
        const total = parseInt(parts[1], 10);
        if (total > 0) progressPercent = cur / total;
      }
    }
    taskQueueVo.push({
      id: running.id,
      name: running.name,
      priorityLabel: PRIORITY_LABELS[running.priority] ?? '用户',
      remaining: running.remainingTimes,
      totalTimes: running.totalTimes,
      progress: currentProgress || undefined,
      progressPercent,
      acquisitionText: buildAcquisitionText(trackedLoot, trackedShip),
    });
  }

  for (const t of queue) {
    taskQueueVo.push({
      id: t.id,
      name: t.name,
      priorityLabel: PRIORITY_LABELS[t.priority] ?? '用户',
      remaining: t.remainingTimes,
      totalTimes: t.totalTimes,
    });
  }

  return {
    status: scheduler.status === 'not_connected' ? 'not_connected' : scheduler.status,
    statusText: STATUS_TEXT[scheduler.status] ?? '未知',
    currentTask: running
      ? {
          name: running.name,
          type: running.type as MainViewObject['currentTask'] extends null ? never : NonNullable<MainViewObject['currentTask']>['type'],
          progress: currentProgress || '0/0',
          startedAt: '',
        }
      : null,
    expeditionTimer: expeditionTimerText,
    taskQueue: taskQueueVo,
    wsConnected,
    runningTaskId: running?.id ?? null,
  };
}
