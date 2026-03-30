import type { MainViewObject } from '../../types/view';

export class StatusBar {
  private statusDot: HTMLElement;
  private statusText: HTMLElement;
  private expeditionTimer: HTMLElement;

  private static readonly OPS_BTN_IDS = [
    'btn-ops-expedition', 'btn-ops-reward', 'btn-ops-build-collect', 'btn-ops-cook', 'btn-ops-repair',
  ];

  constructor() {
    this.statusDot = document.getElementById('status-dot')!;
    this.statusText = document.getElementById('status-text')!;
    this.expeditionTimer = document.getElementById('expedition-timer')!;
  }

  render(vo: MainViewObject): void {
    this.statusDot.className = `status-indicator ${vo.status}`;
    this.statusText.textContent = vo.statusText;
    this.expeditionTimer.textContent = vo.expeditionTimer;
  }

  setOpsAvailability(connected: boolean): void {
    for (const id of StatusBar.OPS_BTN_IDS) {
      const btn = document.getElementById(id) as HTMLButtonElement | null;
      if (btn) btn.disabled = !connected;
    }
    this.setOpsStatus(connected ? '' : '未连接');
  }

  setOpsStatus(text: string): void {
    const el = document.getElementById('ops-status');
    if (el) el.textContent = text;
  }

  setVersion(v: string): void {
    const el = document.getElementById('app-version');
    if (el) el.textContent = v;
  }
}
