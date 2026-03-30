/**
 * importExport —— 任务组导入/导出独立函数。
 */
import type { TaskGroupModel } from '../../model/TaskGroupModel';
import { Logger } from '../../utils/Logger';
import { showAlert } from '../shared/DialogHelper';

/** 导出当前激活的任务组为 JSON */
export async function exportTaskGroupFlow(taskGroupModel: TaskGroupModel): Promise<void> {
  const group = taskGroupModel.getActiveGroup();
  if (!group || group.items.length === 0) {
    Logger.warn('当前任务列表为空，无法导出');
    return;
  }
  const bridge = window.electronBridge;
  if (!bridge) return;

  const data = { name: group.name, items: group.items };
  const json = JSON.stringify(data, null, 2);
  const saved = await bridge.saveFileDialog(
    `${group.name}.taskgroup.json`,
    json,
    [{ name: '任务列表模板', extensions: ['taskgroup.json', 'json'] }],
  );
  if (saved) {
    Logger.info(`已导出任务列表「${group.name}」`);
  }
}

/** 从 JSON 文件导入任务组 */
export async function importTaskGroupFlow(
  taskGroupModel: TaskGroupModel,
  render: () => void,
): Promise<void> {
  const bridge = window.electronBridge;
  if (!bridge) return;

  const result = await bridge.openFileDialog([
    { name: '任务列表模板', extensions: ['taskgroup.json', 'json'] },
  ]);
  if (!result) return;

  let data: { name?: string; items?: unknown[] };
  try {
    data = JSON.parse(result.content);
  } catch {
    await showAlert('导入失败', '文件格式不正确，无法解析 JSON。');
    return;
  }

  if (!Array.isArray(data.items) || data.items.length === 0) {
    await showAlert('导入失败', '模板中没有有效的任务条目。');
    return;
  }

  let groupName = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : '导入的列表';
  if (taskGroupModel.getGroup(groupName)) {
    let suffix = 2;
    while (taskGroupModel.getGroup(`${groupName} (${suffix})`)) suffix++;
    groupName = `${groupName} (${suffix})`;
  }

  taskGroupModel.upsertGroup(groupName);
  taskGroupModel.setActiveGroup(groupName);

  for (const raw of data.items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.path !== 'string' || typeof item.kind !== 'string') continue;
    taskGroupModel.addItem(groupName, {
      path: item.path,
      kind: item.kind === 'preset' ? 'preset' : 'plan',
      times: typeof item.times === 'number' && item.times > 0 ? item.times : 1,
      label: typeof item.label === 'string' ? item.label : item.path.split(/[\\/]/).pop()?.replace(/\.ya?ml$/i, '') ?? String(item.path),
    });
  }

  taskGroupModel.save();
  render();
  Logger.info(`已导入任务列表「${groupName}」（${data.items.length} 项）`);
}
