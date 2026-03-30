/**
 * 后端服务管理（启动 / 停止 / setup.bat）。
 * 从 main.ts 提取。
 */
import * as path from 'path';
import * as fs from 'fs';
import { execSync, spawn, ChildProcess } from 'child_process';
import type { BrowserWindow } from 'electron';
import { ensurePthFile, findPython, localSitePackages } from './pythonEnv';

// ════════════════════════════════════════
// Context — 由 main.ts 在启动时注入
// ════════════════════════════════════════

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

// ════════════════════════════════════════
// 内部状态
// ════════════════════════════════════════

let backendProcess: ChildProcess | null = null;

export function getBackendProcess(): ChildProcess | null {
  return backendProcess;
}

// ════════════════════════════════════════
// 后端服务
// ════════════════════════════════════════

/** 运行 setup.bat 安装环境 */
export function runSetupScript(): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    // 打包模式下 setup.bat 在 extraResources 里
    let setupPath = path.join(ctx.resourceRoot(), 'setup.bat');
    if (!fs.existsSync(setupPath)) {
      setupPath = path.join(ctx.appRoot(), 'setup.bat');
    }
    if (!fs.existsSync(setupPath)) {
      resolve({ success: false, output: '找不到 setup.bat' });
      return;
    }

    const proc = spawn('cmd.exe', ['/c', setupPath], {
      cwd: ctx.appRoot(),
      windowsHide: false,
      stdio: 'pipe',
    });

    let output = '';
    proc.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      output += text;
      ctx.getMainWindow()?.webContents.send('setup-log', text);
    });
    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      output += text;
      ctx.getMainWindow()?.webContents.send('setup-log', text);
    });
    proc.on('close', (code) => {
      resolve({ success: code === 0, output: output.slice(-1000) });
    });
    proc.on('error', (err) => {
      resolve({ success: false, output: err.message });
    });
  });
}

export async function startBackend(): Promise<void> {
  ensurePthFile();
  const pythonCmd = await findPython();
  if (!pythonCmd) {
    console.error('[Backend] 找不到 Python');
    return;
  }

  const cwd = ctx.appRoot();
  const localSite = localSitePackages();

  // 使用 -c 启动而非 -m uvicorn，以便：
  // 1. 显式注入 site-packages 到 sys.path
  // 2. 激活 setuptools 的 distutils 兼容层 (Python 3.12+ 需要)
  // 3. 绕过嵌入式 Python 的 ._pth/PYTHONPATH 限制
  const bootstrap = [
    `import sys, os, site`,
    `sp = r'${localSite.replace(/'/g, "\\'")}'`,
    `sys.path.insert(0, sp)`,
    `site.addsitedir(sp)`,  // 处理 .pth 文件，激活 _distutils_hack
    `import uvicorn`,
    `uvicorn.run('autowsgr.server.main:app', host='127.0.0.1', port=${ctx.BACKEND_PORT})`,

  ].join('; ');

  // 将内置 ADB 目录加入 PATH，使后端 shutil.which('adb') 能找到
  const adbDir = path.join(ctx.appRoot(), 'adb');
  const envPath = process.env.PATH || '';
  const pathWithAdb = fs.existsSync(adbDir) ? `${adbDir};${envPath}` : envPath;

  // 预连接 ADB 设备（MuMu 多开实例不会自动被 ADB 发现，需要主动 connect）
  try {
    const cfgPath = path.join(ctx.appRoot(), 'usersettings.yaml');
    if (fs.existsSync(cfgPath)) {
      const cfgText = fs.readFileSync(cfgPath, 'utf-8');
      const serialMatch = cfgText.match(/serial:\s*(\S+)/);
      if (serialMatch) {
        const serial = serialMatch[1];
        const adbExe = path.join(adbDir, 'adb.exe');
        const adbCmd = fs.existsSync(adbExe) ? adbExe : 'adb';
        execSync(`"${adbCmd}" connect ${serial}`, { windowsHide: true, timeout: 5000, stdio: 'pipe' });
        console.log(`[Backend] ADB connect ${serial} 完成`);
      }
    }
  } catch (e: any) {
    console.warn(`[Backend] ADB connect 失败 (非致命): ${e.message}`);
  }

  backendProcess = spawn(pythonCmd, [
    '-X', 'utf8',
    '-c', bootstrap,
  ], {
    cwd,
    windowsHide: true,
    stdio: 'pipe',
    env: {
      ...process.env,
      PYTHONUTF8: '1',
      PYTHONIOENCODING: 'utf-8',
      PATH: pathWithAdb,
    },
  });

  // ANSI 颜色码
  const CYAN = '\x1b[36m';
  const RED = '\x1b[31m';
  const YELLOW = '\x1b[33m';
  const GREEN = '\x1b[32m';
  const DIM = '\x1b[2m';
  const RESET = '\x1b[0m';

  const colorLine = (line: string): string => {
    if (/\bERROR\b/i.test(line)) return `${RED}${line}${RESET}`;
    if (/\bWARNING\b/i.test(line)) return `${YELLOW}${line}${RESET}`;
    if (/\bINFO\b/i.test(line)) return `${GREEN}${line}${RESET}`;
    if (/\bDEBUG\b/i.test(line)) return `${DIM}${line}${RESET}`;
    return `${CYAN}${line}${RESET}`;
  };

  // loguru 新日志行以 "HH:mm:ss.SSS |" 开头
  const LOGURU_LINE_RE = /^\d{2}:\d{2}:\d{2}\.\d{3}\s*\|/;
  let skipMultiline = false;

  const mainWindow = ctx.getMainWindow();
  const handleOutput = (data: Buffer) => {
    for (const line of data.toString('utf-8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      console.log(`${CYAN}[Backend]${RESET} ${colorLine(trimmed)}`);

      const isNewEntry = LOGURU_LINE_RE.test(trimmed);
      if (isNewEntry) {
        // 新日志条目：判断级别，决定是否跳过后续续行
        skipMultiline = /\bDEBUG\b/i.test(trimmed);
      }
      // 跳过 DEBUG 级别的日志（包括其多行续行）
      if (skipMultiline) continue;
      // 跳过 uvicorn access log
      if (/"(?:GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\s+\//.test(trimmed)) continue;
      mainWindow?.webContents.send('backend-log', trimmed);
    }
  };
  backendProcess.stdout?.on('data', handleOutput);
  backendProcess.stderr?.on('data', handleOutput);
  backendProcess.on('error', (err) => {
    console.error('[Backend] 启动失败:', err.message);
    backendProcess = null;
  });
  backendProcess.on('close', (code) => {
    console.log(`[Backend] 进程退出, code=${code}`);
    backendProcess = null;
  });
}

export function stopBackend(): void {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}
