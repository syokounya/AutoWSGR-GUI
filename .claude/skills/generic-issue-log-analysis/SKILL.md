---
name: generic-issue-log-analysis
description: 分析 AutoWSGR-GUI 仓库的公开 issue。优先读取 issue 正文和评论，结合仓库代码、配置与日志目录定位根因，输出可执行修复方案与验证步骤。
---

# AutoWSGR-GUI Issue Analysis

## 适用范围

- 仓库: AutoWSGR-GUI
- 问题类型: GUI 行为异常、后端启动失败、Python 依赖安装失败、配置不生效、任务调度异常、打包发布问题
- 输入来源: issue 正文、评论、截图、日志片段、复现步骤

## 仓库关键路径

- Electron 主进程与后端管理:
  - electron/main.ts
  - electron/backend.ts
- Python 环境与依赖管理:
  - electron/pythonEnv/
  - setup.bat
  - scripts/prepare-python.js
- 前端页面与样式:
  - src/view/
  - src/view/styles/
- 调度与业务模型:
  - src/controller/
  - src/model/
  - src/types/
- 运行配置与数据:
  - usersettings.yaml
  - task_groups.json
  - plans/
  - gui_settings.json
- 运行日志:
  - log/<timestamp>/

## 分析流程

1. 先确认问题上下文
- 提取 issue 的版本、系统、复现路径、实际现象、期望行为。
- 如果评论中有新条件，按时间线合并到最新问题定义。

2. 建立“现象 -> 模块”映射
- 安装/更新/联网失败: 优先检查 electron/pythonEnv 和 setup.bat。
- 后端端口、启动、日志流转问题: 优先检查 electron/main.ts 与 electron/backend.ts。
- 页面展示或交互问题: 优先检查 src/view 与对应 controller/model。

3. 用代码证据验证假设
- 不要只重复 issue 文本，必须给出对应实现位置和行为链路。
- 优先选择最短调用路径，避免无关模块扩散分析。

4. 给出最小修复方案
- 先给最小可回归的修复，再给可选增强项。
- 必须附带验证步骤（至少包含一次本地构建或最小复现验证）。

5. 证据不足时明确缺口
- 明确需要补充哪些日志、截图、配置内容。
- 不要在证据不足时下确定性结论。

## 输出要求

输出请按以下结构：

- 问题摘要
- 根因判断（已验证事实 / 推测分开）
- 修复方案（最小改动优先）
- 验证步骤
- 仍需补充的信息（如果有）

## 注意事项

- 不建议通过关闭安全校验绕过问题（例如禁用 SSL 校验）。
- 涉及配置文件时，优先确认“用户实际运行时加载的是哪一份配置”。
- 如果问题只在旧版本出现，要明确区分“历史版本问题”与“当前主线状态”。
