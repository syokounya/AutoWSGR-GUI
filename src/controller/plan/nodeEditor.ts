/**
 * nodeEditor —— 节点编辑面板值保存逻辑。
 */
import type { PlanPreviewView } from '../../view/plan/PlanPreviewView';
import type { PlanModel } from '../../model/PlanModel';
import type { EnemyRule } from '../../types/model';

/**
 * 从节点编辑面板收集值并写回 PlanModel，然后即时保存到文件。
 * 返回 true 表示成功执行。
 */
export function saveNodeEditorValues(
  planView: PlanPreviewView,
  currentPlan: PlanModel | null,
  editingNodeId: string | null,
): boolean {
  if (!currentPlan || !editingNodeId) return false;

  const vals = planView.collectNodeEditorValues();

  // 解析索敌规则文本
  const rules: EnemyRule[] = [];
  for (const line of vals.rulesText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const commaIdx = trimmed.lastIndexOf(',');
    if (commaIdx < 0) continue;
    const expr = trimmed.slice(0, commaIdx).trim();
    const actionStr = trimmed.slice(commaIdx + 1).trim();
    const actionNum = Number(actionStr);
    rules.push([expr, isNaN(actionNum) ? actionStr : actionNum]);
  }

  if (!currentPlan.data.node_args) {
    currentPlan.data.node_args = {};
  }

  currentPlan.data.node_args[editingNodeId] = {
    ...currentPlan.data.node_args[editingNodeId],
    formation: vals.formation,
    night: vals.night,
    long_missile_support: vals.longMissileSupport,
    proceed: vals.proceed,
    enemy_rules: rules.length > 0 ? rules : undefined,
  };

  // 即时保存到文件
  if (currentPlan.fileName) {
    const bridge = window.electronBridge;
    bridge?.saveFile(currentPlan.fileName, currentPlan.toYaml());
  }

  planView.hideNodeEditor();
  return true;
}
