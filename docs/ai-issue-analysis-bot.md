# AI Issue Analysis Bot

本仓库已接入 issue 自动分析 bot，用于在 issue 新建或评论触发时自动给出分析结论。

## 已部署内容

- Workflow: .github/workflows/ai-issue-analysis.yml
- Skill: .claude/skills/generic-issue-log-analysis/SKILL.md

## 触发方式

- 新建 issue（opened / reopened）自动触发
- 在 issue 评论中包含 @github-actions 触发
- 手动触发 workflow_dispatch（输入 issue_number）

## 必要配置

1. 在 GitHub 创建 Fine-grained PAT（Owner 选 token 实际所属账号）
2. 确认账户具备 Copilot 可用权限
3. 在仓库 Secrets 中新增:

- Name: COPILOT_GITHUB_TOKEN
- Value: 上一步创建的 token

## 可选变量

在仓库 Variables 中可配置：

- COPILOT_MODEL（默认 gpt-5.3-codex）
- COPILOT_REASONING_EFFORT（默认 high）

## 权限说明

workflow 使用：

- GITHUB_TOKEN: 用于创建/更新 issue 评论
- COPILOT_GITHUB_TOKEN: 用于 Copilot CLI 分析

## 排障

1. 报错 Model "..." is not available

- 把 COPILOT_MODEL 改为当前账号可用模型，或删除变量使用默认值。

1. 报错 Authentication failed 或 Copilot requests 权限问题

- 重新创建 Fine-grained PAT
- 检查账号级 Copilot 权限是否已开启
- 重新保存仓库 secret 并重试

1. 没有触发

- 确认评论写的是 issue 而不是 PR
- 评论内容包含 @github-actions
- 到 Actions 页面检查 workflow 是否被禁用
