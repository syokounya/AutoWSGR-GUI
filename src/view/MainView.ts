/**
 * MainView —— 主页面纯渲染组件。
 * 绝不包含任何业务逻辑，仅接收 MainViewObject 并更新 DOM。
 */
import type { MainViewObject, LogEntryVO } from './viewObjects';

export class MainView {
  private statusDot: HTMLElement;
  private statusText: HTMLElement;
  private expeditionTimer: HTMLElement;
  private taskAreaIdle: HTMLElement;
  private taskAreaQueue: HTMLElement;
  private taskQueueList: HTMLElement;
  private logContainer: HTMLElement;

  /** Controller 设置的回调 */
  onRemoveQueueItem?: (taskId: string) => void;
  onMoveQueueItem?: (fromIndex: number, toIndex: number) => void;

  constructor() {
    this.statusDot = document.getElementById('status-dot')!;
    this.statusText = document.getElementById('status-text')!;
    this.expeditionTimer = document.getElementById('expedition-timer')!;
    this.taskAreaIdle = document.getElementById('task-area-idle')!;
    this.taskAreaQueue = document.getElementById('task-area-queue')!;
    this.taskQueueList = document.getElementById('task-queue-list')!;
    this.logContainer = document.getElementById('log-container')!;
  }

  /** 接收 ViewObject 并渲染 */
  render(vo: MainViewObject): void {
    // 状态指示器
    this.statusDot.className = `status-indicator ${vo.status}`;
    this.statusText.textContent = vo.statusText;

    // 远征倒计时
    this.expeditionTimer.textContent = vo.expeditionTimer;

    const hasQueue = vo.taskQueue.length > 0;

    if (hasQueue) {
      // 有任务：显示队列视图
      this.taskAreaIdle.style.display = 'none';
      this.taskAreaQueue.style.display = '';

      this.taskQueueList.innerHTML = '';
      const hasRunning = vo.runningTaskId != null;
      for (let i = 0; i < vo.taskQueue.length; i++) {
        const item = vo.taskQueue[i];
        const isRunning = item.id === vo.runningTaskId;
        // queueIndex: index within scheduler queue (excludes running task)
        const queueIndex = hasRunning ? i - 1 : i;
        const div = document.createElement('div');
        div.className = 'task-queue-item' + (isRunning ? ' tq-running' : '');
        div.dataset['queueIndex'] = String(queueIndex);

        // 拖拽排序（非运行中的任务）
        if (!isRunning) {
          div.draggable = true;
          div.addEventListener('dragstart', (e) => {
            div.classList.add('tq-dragging');
            e.dataTransfer!.effectAllowed = 'move';
            e.dataTransfer!.setData('text/plain', String(queueIndex));
          });
          div.addEventListener('dragend', () => {
            div.classList.remove('tq-dragging');
            this.taskQueueList.querySelectorAll('.tq-drag-over').forEach(el => el.classList.remove('tq-drag-over'));
          });
          div.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer!.dropEffect = 'move';
            this.taskQueueList.querySelectorAll('.tq-drag-over').forEach(el => el.classList.remove('tq-drag-over'));
            div.classList.add('tq-drag-over');
          });
          div.addEventListener('dragleave', () => div.classList.remove('tq-drag-over'));
          div.addEventListener('drop', (e) => {
            e.preventDefault();
            div.classList.remove('tq-drag-over');
            const from = parseInt(e.dataTransfer!.getData('text/plain'), 10);
            const to = parseInt(div.dataset['queueIndex']!, 10);
            if (!isNaN(from) && !isNaN(to) && from !== to) {
              this.onMoveQueueItem?.(from, to);
            }
          });
        }

        // 拖拽手柄
        if (!isRunning) {
          const handle = document.createElement('span');
          handle.className = 'tq-drag-handle';
          handle.textContent = '⠿';
          div.appendChild(handle);
        }

        // 进度条背景（仅正在运行的任务）
        if (isRunning && item.progressPercent != null && item.progressPercent > 0) {
          const pct = Math.min(1, Math.max(0, item.progressPercent)) * 100;
          div.style.background = `linear-gradient(90deg, var(--accent-subtle) ${pct}%, transparent ${pct}%)`;
        }

        const nameSpan = document.createElement('span');
        nameSpan.className = 'tq-name';
        nameSpan.textContent = `${item.name} ×${item.remaining}`;
        div.appendChild(nameSpan);

        // 进度文本（仅正在运行的任务）
        if (isRunning && item.progress) {
          const progSpan = document.createElement('span');
          progSpan.className = 'tq-progress';
          progSpan.textContent = item.progress;
          div.appendChild(progSpan);
        }

        const prioSpan = document.createElement('span');
        prioSpan.className = 'tq-priority';
        prioSpan.textContent = item.priorityLabel;
        div.appendChild(prioSpan);

        // 非运行中的任务可以移除
        if (!isRunning) {
          const removeBtn = document.createElement('button');
          removeBtn.className = 'tq-remove';
          removeBtn.title = '移除';
          removeBtn.textContent = '✕';
          removeBtn.addEventListener('click', () => {
            this.onRemoveQueueItem?.(item.id);
          });
          div.appendChild(removeBtn);
        }

        this.taskQueueList.appendChild(div);
      }

      // 按钮状态
      const startBtn = document.getElementById('btn-start-queue');
      const stopBtn = document.getElementById('btn-stop-task');
      const clearBtn = document.getElementById('btn-clear-queue');
      const isRunningOrStopping = vo.status === 'running' || vo.status === 'stopping';
      if (startBtn) startBtn.style.display = isRunningOrStopping ? 'none' : '';
      if (stopBtn) stopBtn.style.display = isRunningOrStopping ? '' : 'none';
      if (clearBtn) clearBtn.style.display = isRunningOrStopping ? 'none' : '';
    } else {
      // 无任务：显示空闲
      this.taskAreaIdle.style.display = '';
      this.taskAreaQueue.style.display = 'none';
    }
  }

  /** 追加一条日志 (增量，不走 render 全量刷新) */
  appendLog(entry: LogEntryVO): void {
    const div = document.createElement('div');
    div.className = `log-entry level-${entry.level}`;
    div.innerHTML =
      `<span class="log-time">${this.esc(entry.time)}</span>` +
      `<span class="log-channel">[${this.esc(entry.channel)}]</span>` +
      `${this.esc(entry.message)}`;
    this.logContainer.appendChild(div);

    // 自动滚到底部
    this.logContainer.scrollTop = this.logContainer.scrollHeight;

    // 限制最多保留 500 条
    while (this.logContainer.childElementCount > 500) {
      this.logContainer.removeChild(this.logContainer.firstChild!);
    }
  }

  /** 简易 HTML 转义 */
  private esc(s: string): string {
    const d = document.createElement('span');
    d.textContent = s;
    return d.innerHTML;
  }
}
