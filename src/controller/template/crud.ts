/**
 * crud —— 模板 CRUD 操作。
 */
import type { TemplateModel } from '../../model/TemplateModel';
import type { TemplateWizardView } from '../../view/template/TemplateWizardView';
import { Logger } from '../../utils/Logger';
import { showPrompt, showConfirm, showAlert } from '../shared/DialogHelper';
import { showWizardWithTemplate } from './wizard';

/** 编辑模板 */
export function editTemplate(
  id: string,
  templateModel: TemplateModel,
  wizardView: TemplateWizardView,
  wizardPlanPaths: { value: string[] },
  editingTemplateId: { value: string | null },
): void {
  if (templateModel.isBuiltin(id)) return;
  const tpl = templateModel.get(id);
  if (!tpl) return;
  editingTemplateId.value = id;
  showWizardWithTemplate(tpl as any, wizardView, wizardPlanPaths);
  wizardView.setTitle('编辑模板');
}

/** 删除模板 */
export async function deleteTemplate(
  id: string,
  templateModel: TemplateModel,
  renderLibrary: () => void,
): Promise<void> {
  if (templateModel.isBuiltin(id)) return;
  const tpl = templateModel.get(id);
  if (!tpl) return;
  const ok = await showConfirm('确认删除', `确定删除模板「${tpl.name}」？`);
  if (!ok) return;
  await templateModel.remove(id);
  renderLibrary();
  Logger.info(`模板「${tpl.name}」已删除`);
}

/** 重命名模板 */
export async function renameTemplate(
  id: string,
  templateModel: TemplateModel,
  renderLibrary: () => void,
): Promise<void> {
  if (templateModel.isBuiltin(id)) return;
  const tpl = templateModel.get(id);
  if (!tpl) return;
  const newName = await showPrompt('重命名模板', '请输入新名称：', tpl.name);
  if (!newName?.trim()) return;
  await templateModel.rename(id, newName.trim());
  renderLibrary();
}

/** 从 JSON 文件导入模板 */
export async function importTemplatesFlow(
  templateModel: TemplateModel,
  wizardView: TemplateWizardView,
  wizardPlanPaths: { value: string[] },
  appRoot: string,
  renderLibrary: () => void,
): Promise<void> {
  const bridge = window.electronBridge;
  if (!bridge) return;
  const defaultDir = appRoot ? `${appRoot}\\templates` : undefined;
  const result = await bridge.openFileDialog(
    [{ name: '模板文件', extensions: ['json'] }],
    defaultDir,
  );
  if (!result) return;

  let arr: unknown[];
  try {
    const parsed = JSON.parse(result.content);
    arr = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    showAlert('导入失败', '文件格式错误，请选择有效的 JSON 模板文件。');
    return;
  }

  const valid = arr.filter(item => item && typeof item === 'object' && (item as any).name && (item as any).type);
  if (valid.length === 0) {
    showAlert('导入失败', '未找到有效的模板数据（需包含 name 和 type 字段）。');
    return;
  }

  showWizardWithTemplate(valid[0] as Record<string, any>, wizardView, wizardPlanPaths);
  if (valid.length > 1) {
    const rest = valid.slice(1);
    const count = await templateModel.importFromJson(rest);
    renderLibrary();
    Logger.info(`其余 ${count} 个模板已直接导入`);
  }
}
