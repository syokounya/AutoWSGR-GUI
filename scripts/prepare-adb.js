/**
 * 下载并准备 Android Platform-Tools (ADB)，用于打包进 Electron 应用。
 * 运行: node scripts/prepare-adb.js
 *
 * 最终产物: adb/ 目录，包含 adb.exe 及依赖 DLL，
 * 由 electron-builder 作为 extraFiles 打包到安装包中。
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ADB_DIR = path.join(ROOT, 'adb');
const ADB_EXE = path.join(ADB_DIR, 'adb.exe');
const TEMP_DIR = path.join(ROOT, '.tmp');

const PLATFORM_TOOLS_URL =
  'https://dl.google.com/android/repository/platform-tools-latest-windows.zip';

function run(cmd, opts = {}) {
  console.log(`  > ${cmd}`);
  execSync(cmd, { stdio: 'inherit', windowsHide: true, timeout: 300000, ...opts });
}

async function main() {
  // 如果 adb.exe 已存在，跳过
  if (fs.existsSync(ADB_EXE)) {
    try {
      const ver = execSync(`"${ADB_EXE}" version`, { windowsHide: true }).toString();
      const m = ver.match(/Android Debug Bridge version ([\d.]+)/);
      console.log(`✓ ADB ${m ? m[1] : ''} 已就绪，跳过下载`);
      return;
    } catch { /* broken, re-download */ }
  }

  console.log('[1/3] 下载 Android Platform-Tools…');
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

  const zipPath = path.join(TEMP_DIR, 'platform-tools-windows.zip');
  if (fs.existsSync(zipPath)) {
    console.log('  zip 已存在，跳过下载');
  } else {
    run(`curl.exe -L -o "${zipPath}" "${PLATFORM_TOOLS_URL}"`);
  }

  console.log('[2/3] 解压 ADB 文件…');
  // 解压到临时目录，然后只取需要的文件
  const extractDir = path.join(TEMP_DIR, 'platform-tools-extract');
  if (fs.existsSync(extractDir)) {
    fs.rmSync(extractDir, { recursive: true, force: true });
  }
  run(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`);

  // platform-tools/ 是解压后的子目录
  const ptDir = path.join(extractDir, 'platform-tools');
  if (!fs.existsSync(ptDir)) {
    console.error('✗ 解压后未找到 platform-tools 目录');
    process.exit(1);
  }

  // 只复制 ADB 所需文件（adb.exe + 两个 DLL），不需要 fastboot 等
  if (!fs.existsSync(ADB_DIR)) fs.mkdirSync(ADB_DIR, { recursive: true });

  const needed = ['adb.exe', 'AdbWinApi.dll', 'AdbWinUsbApi.dll'];
  for (const file of needed) {
    const src = path.join(ptDir, file);
    const dst = path.join(ADB_DIR, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
      console.log(`  ✓ ${file}`);
    } else {
      console.warn(`  ⚠ ${file} 不存在，跳过`);
    }
  }

  console.log('[3/3] 清理临时文件…');
  fs.rmSync(extractDir, { recursive: true, force: true });
  try { fs.unlinkSync(zipPath); } catch { /* ignore */ }

  // 验证
  try {
    const ver = execSync(`"${ADB_EXE}" version`, { windowsHide: true }).toString();
    const m = ver.match(/Android Debug Bridge version ([\d.]+)/);
    console.log(`✓ ADB ${m ? m[1] : ''} 准备完成`);
  } catch (e) {
    console.error('✗ ADB 验证失败');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
