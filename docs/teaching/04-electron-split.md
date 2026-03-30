# 04 — Electron 主进程拆分

> **前置阅读**：[00-overview](00-overview.md)  
> **核心原则**：`main.ts` 只做窗口管理 + IPC 注册，业务逻辑提取到独立模块并通过 Context 注入依赖。

---

## 重构前后

**重构前**：

```
electron/
├── main.ts      (1192 行 — 窗口 + IPC + Python + 后端 + 模拟器全在一起)
└── preload.ts
```

**重构后**：

```
electron/
├── main.ts            (401 行，只保留窗口 + IPC)
├── backend.ts         (176 行，后端子进程生命周期)
├── emulatorDetect.ts  (114 行，模拟器检测)
├── preload.ts         (104 行)
└── pythonEnv/         (Python 环境管理)
    ├── index.ts       (15 行，barrel re-export)
    ├── context.ts     (33 行，共享上下文)
    ├── finder.ts      (90 行，Python 查找)
    ├── envCheck.ts    (208 行，环境检查)
    ├── installer.ts   (225 行，安装)
    ├── updater.ts     (178 行，更新)
    └── utils.ts       (101 行，工具函数)
```

---

## 模式：Context 注入

子模块不通过 `import` 读取 `main.ts` 的全局变量。而是由 `main.ts` 在启动时调用 `init()` 注入运行上下文。

### backend.ts

```typescript
// electron/backend.ts

export interface BackendContext {
  appRoot: () => string;
  resourceRoot: () => string;
  BACKEND_PORT: number;
  getMainWindow: () => BrowserWindow | null;
}

let ctx: BackendContext;

export function initBackend(context: BackendContext): void {
  ctx = context;
}

// 之后所有函数通过 ctx 访问，不依赖 main.ts 全局变量
export async function startBackend(): Promise<{ success: boolean; message: string }> {
  const pythonCmd = findPython();
  // 使用 ctx.appRoot(), ctx.BACKEND_PORT ...
}
```

### pythonEnv/context.ts

```typescript
// electron/pythonEnv/context.ts

export interface PythonEnvContext {
  appRoot: () => string;
  sendProgress: (msg: string) => void;
  getConfiguredPythonPath: () => string | null;
  getTempDir: () => string;
}

let ctx: PythonEnvContext;

export function initPythonEnv(context: PythonEnvContext): void {
  ctx = context;
}

export function getCtx(): PythonEnvContext {
  return ctx;   // 内部各模块通过此函数获取上下文
}
```

### main.ts 的启动流程

```typescript
// electron/main.ts — 启动时注入上下文

import { initBackend, startBackend, stopBackend } from './backend';
import { initPythonEnv, findPython, checkEnvironment } from './pythonEnv';
import { detectEmulator } from './emulatorDetect';

app.whenReady().then(() => {
  initBackend({
    appRoot: () => appRoot(),
    resourceRoot: () => resourceRoot(),
    BACKEND_PORT,
    getMainWindow: () => mainWindow,
  });

  initPythonEnv({
    appRoot: () => appRoot(),
    sendProgress: (msg) => mainWindow?.webContents.send('setup-log', msg),
    getConfiguredPythonPath: () => getConfiguredPythonPath(),
    getTempDir: () => app.getPath('temp'),
  });

  createWindow();
});

// IPC handler — 每个只做转发
ipcMain.handle('start-backend', () => startBackend());
ipcMain.handle('detect-emulator', () => detectEmulator());
```

---

## emulatorDetect.ts — 零依赖纯函数

最简单的提取案例：模拟器检测逻辑完全独立，不需要任何 Context：

```typescript
// electron/emulatorDetect.ts

export interface EmulatorDetectResult {
  type: string;
  path: string;
  serial: string;
  adbPath: string;
}

export function detectEmulator(): EmulatorDetectResult[] { /* ... */ }
```

---

## pythonEnv/ — barrel re-export

提取多个文件后，外部导入路径保持不变：

```typescript
// electron/pythonEnv/index.ts

export { initPythonEnv, clearPythonCache } from './context';
export { findPython } from './finder';
export { checkEnvironment } from './envCheck';
export { installPortablePython, installDependencies } from './installer';
export { autoUpdateAutowsgr } from './updater';
```

`main.ts` 中的 `import { findPython } from './pythonEnv'` 无需改动。

---

## 要点

| 规则 | 说明 |
|------|------|
| `main.ts` 只做三件事 | 创建窗口、注册 IPC、管理生命周期 |
| 子模块通过 `init()` 接收上下文 | 不直接 import main.ts 的全局变量 |
| 纯函数优先 | 如 `emulatorDetect.ts`，不需要上下文就不用 |
| barrel re-export | 外部导入路径不变，内部自由拆分 |
