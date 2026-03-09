import type { TaskTemplate } from './types';

const FILE_PATH = 'templates/templates.json';

let idCounter = 0;
function generateId(): string {
  return `tpl_${Date.now()}_${++idCounter}`;
}

/** 通过 IPC 桥读写文件的接口 */
interface FileIO {
  readFile: (path: string) => Promise<string>;
  saveFile: (path: string, content: string) => Promise<void>;
}

export class TemplateModel {
  private templates: TaskTemplate[] = [];
  private io: FileIO | null = null;

  /** 初始化：传入 IPC bridge 并从本地文件加载 */
  async init(io: FileIO): Promise<void> {
    this.io = io;
    await this.load();
  }

  /** 所有模板 */
  getAll(): readonly TaskTemplate[] {
    return this.templates;
  }

  /** 查找模板 */
  get(id: string): TaskTemplate | undefined {
    return this.templates.find(t => t.id === id);
  }

  /** 添加模板 */
  async add(tpl: Omit<TaskTemplate, 'id' | 'createdAt'>): Promise<TaskTemplate> {
    const full: TaskTemplate = {
      ...tpl,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    this.templates.push(full);
    await this.save();
    return full;
  }

  /** 删除模板 */
  async remove(id: string): Promise<boolean> {
    const idx = this.templates.findIndex(t => t.id === id);
    if (idx < 0) return false;
    this.templates.splice(idx, 1);
    await this.save();
    return true;
  }

  /** 重命名模板 */
  async rename(id: string, newName: string): Promise<void> {
    const tpl = this.get(id);
    if (tpl) {
      (tpl as TaskTemplate).name = newName;
      await this.save();
    }
  }

  /** 从 JSON 数组导入模板，自动分配新 id */
  async importFromJson(raw: unknown[]): Promise<number> {
    let count = 0;
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      if (!rec.name || !rec.type) continue;
      const tpl: TaskTemplate = {
        ...(rec as any),
        id: generateId(),
        createdAt: new Date().toISOString(),
      };
      this.templates.push(tpl);
      count++;
    }
    if (count > 0) await this.save();
    return count;
  }

  /** 持久化到本地文件 templates.json */
  private async save(): Promise<void> {
    if (!this.io) return;
    await this.io.saveFile(FILE_PATH, JSON.stringify(this.templates, null, 2));
  }

  /** 从本地文件加载 */
  private async load(): Promise<void> {
    if (!this.io) return;
    try {
      const raw = await this.io.readFile(FILE_PATH);
      if (raw) {
        this.templates = JSON.parse(raw);
        return;
      }
    } catch { /* 文件不存在 */ }
    // 迁移：尝试从旧路径 templates.json 加载
    try {
      const raw = await this.io.readFile('templates.json');
      if (raw) {
        this.templates = JSON.parse(raw);
        await this.save(); // 保存到新路径
      }
    } catch { /* 旧文件也不存在，使用空列表 */ }
  }
}
