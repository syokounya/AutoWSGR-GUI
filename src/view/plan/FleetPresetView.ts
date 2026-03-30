import type { FleetPresetVO } from '../../types/view';
import type { BathRepairConfig, RepairThreshold } from '../../types/model';
import { isShipFilter, shipSlotLabel } from '../../data/shipData';
import { showFleetEditDialog } from './FleetEditDialog';

export class FleetPresetView {
  private fleetPresetSection: HTMLElement;
  private fleetPresetListEl: HTMLElement;
  private fleetPresetAddBtn: HTMLElement;

  selectedFleetPresetIndices: Set<number> = new Set();
  private currentPresets: FleetPresetVO[] = [];

  onFleetPresetChange?: (action: 'add' | 'edit' | 'delete', index: number, preset?: FleetPresetVO) => void;

  constructor() {
    this.fleetPresetSection = document.getElementById('fleet-preset-section')!;
    this.fleetPresetListEl = document.getElementById('fleet-preset-list')!;
    this.fleetPresetAddBtn = document.getElementById('fleet-preset-add')!;

    this.fleetPresetAddBtn.addEventListener('click', () => {
      this.showFleetEditDialog(-1);
    });

    const bathToggle = document.getElementById('plan-bath-repair-enable') as HTMLInputElement;
    const bathConfigDiv = document.getElementById('bath-repair-config');
    if (bathToggle && bathConfigDiv) {
      bathToggle.addEventListener('change', () => {
        bathConfigDiv.style.display = bathToggle.checked ? '' : 'none';
      });
    }
  }

  showSection(): void { this.fleetPresetSection.style.display = ''; }
  hideSection(): void { this.fleetPresetSection.style.display = 'none'; }

  render(presets?: FleetPresetVO[]): void {
    this.fleetPresetSection.style.display = '';
    this.fleetPresetListEl.innerHTML = '';
    this.currentPresets = presets ?? [];

    if (!presets || presets.length === 0) {
      this.selectedFleetPresetIndices.clear();
      this.renderBathShipThresholds();
      return;
    }

    presets.forEach((preset, index) => {
      const item = document.createElement('div');
      item.className = 'fleet-preset-item' + (this.selectedFleetPresetIndices.has(index) ? ' selected' : '');

      const row = document.createElement('div');
      row.className = 'fleet-preset-row';

      const nameEl = document.createElement('span');
      nameEl.className = 'fleet-preset-name';
      nameEl.textContent = preset.name;
      row.appendChild(nameEl);

      const actionsEl = document.createElement('span');
      actionsEl.className = 'fleet-preset-item-actions';

      const editBtn = document.createElement('button');
      editBtn.textContent = '编辑';
      editBtn.title = '编辑编队';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showFleetEditDialog(index, preset);
      });
      actionsEl.appendChild(editBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-delete';
      deleteBtn.textContent = '删除';
      deleteBtn.title = '删除编队';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const newSet = new Set<number>();
        for (const idx of this.selectedFleetPresetIndices) {
          if (idx < index) newSet.add(idx);
          else if (idx > index) newSet.add(idx - 1);
        }
        this.selectedFleetPresetIndices = newSet;
        this.onFleetPresetChange?.('delete', index);
      });
      actionsEl.appendChild(deleteBtn);

      row.appendChild(actionsEl);
      item.appendChild(row);

      const shipsEl = document.createElement('div');
      shipsEl.className = 'fleet-preset-ships';
      for (const ship of preset.ships) {
        const tag = document.createElement('span');
        if (isShipFilter(ship)) {
          tag.className = 'ship-tag ship-tag-filter';
          tag.textContent = shipSlotLabel(ship);
          tag.title = '模糊匹配: ' + shipSlotLabel(ship);
        } else {
          tag.className = 'ship-tag';
          tag.textContent = ship;
        }
        shipsEl.appendChild(tag);
      }
      item.appendChild(shipsEl);

      item.addEventListener('click', () => {
        if (this.selectedFleetPresetIndices.has(index)) {
          this.selectedFleetPresetIndices.delete(index);
        } else {
          this.selectedFleetPresetIndices.add(index);
        }
        this.fleetPresetListEl.querySelectorAll('.fleet-preset-item').forEach((el, i) => {
          el.classList.toggle('selected', this.selectedFleetPresetIndices.has(i));
        });
        this.renderBathShipThresholds();
      });

      this.fleetPresetListEl.appendChild(item);
    });
  }

  getSelectedPresets(): FleetPresetVO[] {
    const result: FleetPresetVO[] = [];
    const sorted = Array.from(this.selectedFleetPresetIndices).sort((a, b) => a - b);
    for (const idx of sorted) {
      if (idx < this.currentPresets.length) result.push(this.currentPresets[idx]);
    }
    return result;
  }

  getBathRepairConfig(): BathRepairConfig | undefined {
    const toggle = document.getElementById('plan-bath-repair-enable') as HTMLInputElement;
    if (!toggle || !toggle.checked) return undefined;

    const typeEl = document.getElementById('bath-default-th-type') as HTMLSelectElement;
    const valueEl = document.getElementById('bath-default-th-value') as HTMLInputElement;
    const type = typeEl?.value === 'absolute' ? 'absolute' as const : 'percent' as const;
    const value = valueEl ? parseInt(valueEl.value, 10) : 50;

    const shipThresholds: Record<string, RepairThreshold> = {};
    document.querySelectorAll<HTMLElement>('.bath-ship-th-row').forEach(row => {
      const shipName = row.dataset.ship;
      if (!shipName) return;
      const sType = (row.querySelector('.bath-ship-th-type') as HTMLSelectElement)?.value;
      const sValue = parseInt((row.querySelector('.bath-ship-th-value') as HTMLInputElement)?.value ?? '', 10);
      if (!isNaN(sValue)) {
        shipThresholds[shipName] = {
          type: sType === 'absolute' ? 'absolute' : 'percent',
          value: sValue,
        };
      }
    });

    return {
      enabled: true,
      defaultThreshold: { type, value: isNaN(value) ? 50 : value },
      shipThresholds: Object.keys(shipThresholds).length > 0 ? shipThresholds : undefined,
    };
  }

  private renderBathShipThresholds(): void {
    const container = document.getElementById('bath-ship-thresholds');
    if (!container) return;

    const shipNames: string[] = [];
    const seen = new Set<string>();
    const sorted = Array.from(this.selectedFleetPresetIndices).sort((a, b) => a - b);
    for (const idx of sorted) {
      const preset = this.currentPresets[idx];
      if (!preset) continue;
      for (const slot of preset.ships) {
        if (typeof slot !== 'string') continue;
        if (!seen.has(slot)) {
          seen.add(slot);
          shipNames.push(slot);
        }
      }
    }

    container.innerHTML = '';
    if (shipNames.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = '';

    const header = document.createElement('div');
    header.className = 'bath-ship-th-header-row';
    header.innerHTML = '<span class="bath-ship-th-label-h">舰船</span><span class="bath-ship-th-h">类型</span><span class="bath-ship-th-h">阈值</span>';
    container.appendChild(header);

    for (const name of shipNames) {
      const row = document.createElement('div');
      row.className = 'bath-ship-th-row';
      row.dataset.ship = name;

      const label = document.createElement('span');
      label.className = 'bath-ship-th-label';
      label.textContent = name;
      label.title = name;
      row.appendChild(label);

      const sel = document.createElement('select');
      sel.className = 'input input-inline bath-ship-th-type';
      sel.innerHTML = '<option value="percent">百分比</option><option value="absolute">绝对值</option>';
      row.appendChild(sel);

      const inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'input input-inline input-small bath-ship-th-value';
      inp.value = '50';
      inp.min = '0';
      inp.max = '999';
      row.appendChild(inp);

      container.appendChild(row);
    }
  }

  private showFleetEditDialog(index: number, preset?: FleetPresetVO): void {
    showFleetEditDialog(index, preset, (action, idx, newPreset) => {
      this.onFleetPresetChange?.(action, idx, newPreset);
    });
  }
}
