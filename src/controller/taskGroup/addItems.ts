/**
 * addItems —— 向任务组添加条目的独立函数。
 */
import type { TaskGroupModel } from '../../model/TaskGroupModel';
import type { PlanModel } from '../../model/PlanModel';
import type { TaskPreset } from '../../types/model';
import { Logger } from '../../utils/Logger';

function ensureActiveGroup(taskGroupModel: TaskGroupModel) {
  let group = taskGroupModel.getActiveGroup();
  if (!group) {
    taskGroupModel.upsertGroup('默认');
    taskGroupModel.setActiveGroup('默认');
    group = taskGroupModel.getActiveGroup()!;
  }
  return group;
}

/** 将当前已加载的 Plan 添加到任务组 */
export function addCurrentPlanToGroup(
  taskGroupModel: TaskGroupModel,
  getCurrentPlan: () => PlanModel | null,
  render: () => void,
): void {
  const plan = getCurrentPlan();
  if (!plan) { Logger.warn('没有已加载的方案'); return; }
  const group = ensureActiveGroup(taskGroupModel);
  const times = plan.data.times ?? 1;
  const fileName = plan.fileName;
  const label = fileName.split(/[\\/]/).pop()?.replace(/\.ya?ml$/i, '') ?? fileName;

  taskGroupModel.addItem(group.name, { path: fileName, kind: 'plan', times, label });
  taskGroupModel.save();
  render();
  Logger.info(`已将「${label} ×${times}」加入任务组「${group.name}」`);
}

/** 从文件选择器添加方案/预设文件到任务组 */
export async function addFileToGroup(
  taskGroupModel: TaskGroupModel,
  plansDir: string,
  render: () => void,
): Promise<void> {
  const bridge = window.electronBridge;
  if (!bridge) return;
  const group = ensureActiveGroup(taskGroupModel);

  const result = await bridge.openFileDialog([
    { name: 'YAML 方案/预设', extensions: ['yaml', 'yml'] },
  ], plansDir || undefined);
  if (!result) return;

  const parsed = (await import('js-yaml')).load(result.content) as Record<string, unknown>;
  let itemKind: 'plan' | 'preset' = 'plan';
  if (parsed && typeof parsed === 'object' && 'task_type' in parsed && !('chapter' in parsed)) {
    itemKind = 'preset';
  }

  const label = result.path.split(/[\\/]/).pop()?.replace(/\.ya?ml$/i, '') ?? result.path;
  taskGroupModel.addItem(group.name, {
    path: result.path,
    kind: itemKind,
    times: (parsed as any)?.times ?? 1,
    label,
  });
  taskGroupModel.save();
  render();
  Logger.info(`已添加「${label}」到任务组「${group.name}」`);
}

/** 将当前任务预设添加到任务组 */
export function addPresetToGroup(
  taskGroupModel: TaskGroupModel,
  getCurrentPresetInfo: () => { preset: TaskPreset; filePath: string } | null,
  render: () => void,
): void {
  const info = getCurrentPresetInfo();
  if (!info) { Logger.warn('没有已加载的任务预设'); return; }
  const group = ensureActiveGroup(taskGroupModel);
  const times = Math.max(1, parseInt((document.getElementById('tp-times') as HTMLInputElement).value, 10) || 1);
  const label = info.filePath.split(/[\\/]/).pop()?.replace(/\.ya?ml$/i, '') ?? info.preset.task_type;

  taskGroupModel.addItem(group.name, { path: info.filePath, kind: 'preset', times, label });
  taskGroupModel.save();
  render();
  Logger.info(`已将「${label} ×${times}」加入任务组「${group.name}」`);
}
