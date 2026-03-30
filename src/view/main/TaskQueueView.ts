import type { MainViewObject } from '../../types/view';

export class TaskQueueView {
  private taskAreaIdle: HTMLElement;
  private taskAreaQueue: HTMLElement;
  private taskQueueList: HTMLElement;

  onRemoveQueueItem?: (taskId: string) => void;
  onMoveQueueItem?: (fromIndex: number, toIndex: number) => void;
  onDropFromTaskGroup?: (itemIndex: number) => void;
  onEditQueueItem?: (taskId: string, x: number, y: number) => void;

  constructor() {
    this.taskAreaIdle = document.getElementById('task-area-idle')!;
    this.taskAreaQueue = document.getElementById('task-area-queue')!;
    this.taskQueueList = document.getElementById('task-queue-list')!;
    this.initDropZone();
  }

  private initDropZone(): void {
    const card = document.getElementById('task-area-card')!;
    card.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types.includes('application/x-tg-item')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        card.classList.add('drop-highlight');
      }
    });
    card.addEventListener('dragleave', (e) => {
      if (!card.contains(e.relatedTarget as Node)) {
        card.classList.remove('drop-highlight');
      }
    });
    card.addEventListener('drop', (e) => {
      card.classList.remove('drop-highlight');
      const idxStr = e.dataTransfer?.getData('application/x-tg-item');
      if (idxStr != null && idxStr !== '') {
        e.preventDefault();
        this.onDropFromTaskGroup?.(parseInt(idxStr, 10));
      }
    });
  }

  render(vo: MainViewObject): void {
    const hasQueue = vo.taskQueue.length > 0;

    if (hasQueue) {
      this.taskAreaIdle.style.display = 'none';
      this.taskAreaQueue.style.display = '';

      this.taskQueueList.innerHTML = '';
      const hasRunning = vo.runningTaskId != null;
      for (let i = 0; i < vo.taskQueue.length; i++) {
        const item = vo.taskQueue[i];
        const isRunning = item.id === vo.runningTaskId;
        const queueIndex = hasRunning ? i - 1 : i;
        const div = document.createElement('div');
        div.className = 'task-queue-item' + (isRunning ? ' tq-running' : '');
        div.dataset['queueIndex'] = String(queueIndex);

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

        if (!isRunning) {
          const handle = document.createElement('span');
          handle.className = 'tq-drag-handle';
          handle.textContent = '⠿';
          div.appendChild(handle);
        }

        if (isRunning && item.progressPercent != null && item.progressPercent > 0) {
          const pct = Math.min(1, Math.max(0, item.progressPercent)) * 100;
          div.style.background = `linear-gradient(90deg, var(--accent-subtle) ${pct}%, transparent ${pct}%)`;
        }

        const nameSpan = document.createElement('span');
        nameSpan.className = 'tq-name';
        nameSpan.textContent = item.totalTimes > 1
          ? `${item.name} ×${item.totalTimes}`
          : item.name;
        div.appendChild(nameSpan);

        if (isRunning) {
          const progSpan = document.createElement('span');
          progSpan.className = 'tq-progress';
          if (item.totalTimes > 1) {
            let useBackendProgress = false;
            if (item.progress) {
              const parts = item.progress.split('/');
              if (parts.length === 2) {
                const backendTotal = parseInt(parts[1], 10);
                useBackendProgress = Number.isFinite(backendTotal) && backendTotal > 1;
              }
            }

            if (useBackendProgress && item.progress) {
              progSpan.textContent = item.progress;
            } else {
              const currentRound = item.totalTimes - item.remaining + 1;
              progSpan.textContent = `${currentRound}/${item.totalTimes}`;
            }
          } else if (item.progress) {
            progSpan.textContent = item.progress;
          }
          if (progSpan.textContent) div.appendChild(progSpan);

          if (item.acquisitionText) {
            const acqSpan = document.createElement('span');
            acqSpan.className = 'tq-acquisition';
            acqSpan.textContent = item.acquisitionText;
            div.appendChild(acqSpan);
          }
        }

        const prioSpan = document.createElement('span');
        prioSpan.className = 'tq-priority';
        prioSpan.textContent = item.priorityLabel;
        div.appendChild(prioSpan);

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

        div.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.onEditQueueItem?.(item.id, e.clientX, e.clientY);
        });

        this.taskQueueList.appendChild(div);
      }

      const startBtn = document.getElementById('btn-start-queue');
      const stopBtn = document.getElementById('btn-stop-task');
      const clearBtn = document.getElementById('btn-clear-queue');
      const isRunningOrStopping = vo.status === 'running' || vo.status === 'stopping';
      if (startBtn) startBtn.style.display = isRunningOrStopping ? 'none' : '';
      if (stopBtn) stopBtn.style.display = isRunningOrStopping ? '' : 'none';
      if (clearBtn) clearBtn.style.display = isRunningOrStopping ? 'none' : '';
    } else {
      this.taskAreaIdle.style.display = '';
      this.taskAreaQueue.style.display = 'none';
    }
  }
}
