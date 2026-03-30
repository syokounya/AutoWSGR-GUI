/**
 * 编队预设编辑弹窗。
 * 从 PlanPreviewView.showFleetEditDialog 提取。
 */
import type { FleetPresetVO } from '../../types/view';
import type { ShipSlot, ShipFilter } from '../../types/model';
import { ALL_NATIONS, TYPE_LABELS } from '../../data/shipData';
import { ShipAutocomplete } from '../shared/ShipAutocomplete';

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * 显示编队预设编辑弹窗。
 * @param index 编辑的预设索引（<0 表示新增）
 * @param preset 现有预设数据（新增时为 undefined）
 * @param onSave 保存回调
 */
export function showFleetEditDialog(
  index: number,
  preset: FleetPresetVO | undefined,
  onSave: (action: 'add' | 'edit', index: number, preset: FleetPresetVO) => void,
): void {
  const isNew = index < 0;
  const name = preset?.name ?? '';
  const ships = preset?.ships ?? [];

  const typeEntries = Object.entries(TYPE_LABELS);

  const overlay = document.createElement('div');
  overlay.className = 'fleet-edit-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'fleet-edit-dialog';

  // 构建每个槽位的 HTML
  const slotsHtml = [0, 1, 2, 3, 4, 5].map(i => {
    const slot = ships[i];
    const isFilter = slot != null && typeof slot === 'object';
    const shipName = typeof slot === 'string' ? slot : '';
    const nation = isFilter ? ((slot as any).nation ?? '') : '';
    const shipType = isFilter ? ((slot as any).ship_type ?? '') : '';

    const nationOpts = `<option value="">不限</option>` + ALL_NATIONS.map(
      (n: string) => `<option value="${escapeHtml(n)}"${n === nation ? ' selected' : ''}>${escapeHtml(n)}</option>`
    ).join('');
    const typeOpts = `<option value="">不限</option>` + typeEntries.map(
      ([code, label]) => `<option value="${escapeHtml(code)}"${code === shipType ? ' selected' : ''}>${escapeHtml(label as string)}</option>`
    ).join('');

    return `
      <div class="ship-slot-wrapper" data-slot="${i}">
        <div class="ship-slot-header">
          <span class="ship-slot-label">${i + 1}号位</span>
          <button type="button" class="ship-slot-toggle btn-xs${isFilter ? ' active' : ''}" title="切换模糊匹配">🔍</button>
        </div>
        <div class="ship-name-mode"${isFilter ? ' style="display:none"' : ''}>
          <input type="text" class="input fleet-edit-ship" placeholder="舰船名称" value="${escapeHtml(shipName)}" autocomplete="off" />
        </div>
        <div class="ship-filter-mode"${isFilter ? '' : ' style="display:none"'}>
          <select class="input fleet-edit-nation">${nationOpts}</select>
          <select class="input fleet-edit-type">${typeOpts}</select>
        </div>
      </div>`;
  }).join('');

  dialog.innerHTML = `
    <h3>${isNew ? '新增编队' : '编辑编队'}</h3>
    <div class="form-group">
      <label>编队名称</label>
      <input type="text" id="fleet-edit-name" class="input" value="${escapeHtml(name)}" placeholder="例如：传统AIII双装母" />
    </div>
    <div class="form-group">
      <label>舰船（1~6号位，留空表示该位置无舰船）</label>
      <div class="fleet-edit-ships-grid">${slotsHtml}</div>
    </div>
    <div class="fleet-edit-actions">
      <button class="btn btn-outline" id="fleet-edit-cancel">取消</button>
      <button class="btn btn-primary" id="fleet-edit-save">保存</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // 模式切换：指定 ↔ 模糊
  dialog.querySelectorAll('.ship-slot-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const wrapper = btn.closest('.ship-slot-wrapper')!;
      const nameMode = wrapper.querySelector('.ship-name-mode') as HTMLElement;
      const filterMode = wrapper.querySelector('.ship-filter-mode') as HTMLElement;
      const isActive = btn.classList.toggle('active');
      nameMode.style.display = isActive ? 'none' : '';
      filterMode.style.display = isActive ? '' : 'none';
    });
  });

  // 为每个舰船输入框绑定自动补全（使用共享组件，委托到 dialog）
  const shipAC = new ShipAutocomplete(dialog, '.fleet-edit-ship', { maxResults: 12 });

  const nameInput = dialog.querySelector('#fleet-edit-name') as HTMLInputElement;
  nameInput.focus();

  const close = () => { shipAC.destroy(); overlay.remove(); };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  dialog.querySelector('#fleet-edit-cancel')!.addEventListener('click', close);

  dialog.querySelector('#fleet-edit-save')!.addEventListener('click', () => {
    const newName = nameInput.value.trim();
    if (!newName) {
      nameInput.focus();
      return;
    }
    const newShips: ShipSlot[] = [];
    dialog.querySelectorAll('.ship-slot-wrapper').forEach(wrapper => {
      const toggle = wrapper.querySelector('.ship-slot-toggle')!;
      const isFilterMode = toggle.classList.contains('active');
      if (isFilterMode) {
        const nation = (wrapper.querySelector('.fleet-edit-nation') as HTMLSelectElement).value;
        const shipType = (wrapper.querySelector('.fleet-edit-type') as HTMLSelectElement).value;
        if (nation || shipType) {
          const filter: ShipFilter = {};
          if (nation) filter.nation = nation;
          if (shipType) filter.ship_type = shipType;
          newShips.push(filter);
        }
      } else {
        const v = (wrapper.querySelector('.fleet-edit-ship') as HTMLInputElement).value.trim();
        if (v) newShips.push(v);
      }
    });

    const newPreset: FleetPresetVO = { name: newName, ships: newShips };
    if (isNew) {
      onSave('add', -1, newPreset);
    } else {
      onSave('edit', index, newPreset);
    }
    close();
  });
}
