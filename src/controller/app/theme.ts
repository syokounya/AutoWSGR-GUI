/** 获取当前主题模式 */
export function getThemeMode(): 'dark' | 'light' | 'system' {
  return (localStorage.getItem('themeMode') as 'dark' | 'light' | 'system') || 'dark';
}

/** 获取当前主色调 */
export function getAccentColor(): string {
  return localStorage.getItem('accentColor') || '#0f7dff';
}

/** 将 hex 颜色加亮指定百分比 */
export function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (num >> 16) + Math.round(2.55 * percent));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(2.55 * percent));
  const b = Math.min(255, (num & 0xff) + Math.round(2.55 * percent));
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** 根据主题模式 + 主色调更新 DOM */
export function applyTheme(): void {
  const mode = getThemeMode();
  let resolved: 'dark' | 'light';
  if (mode === 'system') {
    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } else {
    resolved = mode;
  }
  document.documentElement.setAttribute('data-theme', resolved);

  const accent = getAccentColor();
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--accent-hover', lightenColor(accent, 20));
}
