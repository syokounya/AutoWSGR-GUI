---
name: commit-and-release
description: "Organize workspace changes into well-structured git commits, push to remote, and optionally release. USE WHEN: user says 'commit', 'push', 'release', 'publish', 'tag', 'organize commits', '整理提交', '推送', '发布', '发布新版本', '发布 patch'. DO NOT USE FOR: code reviews, CI configuration, merge conflicts."
argument-hint: "Describe what changed, or say '发布 patch/minor/major' to trigger a release"
---

# Commit & Release

将工作区变更整理为结构化的 git commits，推送到远程，并按需发布版本。

## 前置检查

1. 运行 `git status --short` 获取所有变更文件
2. 运行 `git diff --stat` 确认变更范围
3. 如有未暂存的新文件，检查是否应被 `.gitignore` 忽略

## Commit 流程

### 分组策略

按以下维度将变更文件分组为独立 commit：

| 维度 | 示例 |
|------|------|
| 功能模块 | `electron/` vs `src/controller/` vs `src/view/` |
| 变更性质 | 功能(feat) / 修复(fix) / 重构(refactor) / 配置(chore) |
| 逻辑耦合 | 同一功能涉及的 model + controller + view 归为一组 |

**原则**：
- 每个 commit 应是**原子的**（单一目的、可独立 revert）
- 如果所有变更属于同一功能/修复，合为一个 commit 即可，不要过度拆分
- chore 类变更（配置文件、依赖、CI）单独一个 commit

### Commit Message 格式

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <简述>

<可选正文：列出关键改动点>
```

**type 选择**：
- `feat` — 新功能
- `fix` — 修复 bug
- `refactor` — 重构（不改变行为）
- `chore` — 配置、依赖、CI、文档工具
- `docs` — 文档变更
- `perf` — 性能优化
- `style` — 格式调整（不影响逻辑）

**scope**：受影响的模块名，如 `pythonEnv`, `finder`, `fleet-dialog`, `taskgroup`

**正文**：当 commit 包含多处改动时，用 `- ` 列表说明关键点

### 执行

```
git add <files-in-group>
git commit -m "<message>"
```

对每组重复以上步骤。**不要使用** `git add .` 全量暂存（除非只有一个 commit）。

## Push 流程

1. 检查当前分支是否有上游：`git rev-parse --abbrev-ref @{upstream}`
2. 如无上游：`git push --set-upstream origin <branch>`
3. 如有上游：`git push`

## Release 流程（仅当用户明确要求发布时）

当用户说"发布新版本"、"发布 patch"、"release" 等时执行：

### 1. 确定版本号

- 读取 `package.json` 中的当前版本
- 根据用户指令确定 bump 类型：
  - `patch` — 修复、小改动（如 1.2.3 → 1.2.4）
  - `minor` — 新功能（如 1.2.3 → 1.3.0）
  - `major` — 破坏性变更（如 1.2.3 → 2.0.0）
- 如果用户未指定类型，根据 commit 内容推断并**询问确认**

### 2. 更新版本

- 修改 `package.json` 的 `version` 字段
- 提交：`git commit -am "release: v<new-version>"`

### 3. 打 Tag 并推送

```
git tag v<new-version>
git push
git push origin v<new-version>
```

Tag 推送后，CI（`.github/workflows/release.yml`）会自动打包并创建 GitHub Release。

### 4. 确认

告知用户：
- 新版本号
- tag 名称
- CI 触发状态（提供 Actions 链接：`https://github.com/<owner>/<repo>/actions`）

## 安全规则

- **推送前**：始终先展示 commit 列表（`git log --oneline <range>`）
- **打 tag 前**：必须先确认所有变更已 commit 且 push
- **不允许**：`--force`、`--no-verify`、`git reset --hard`
- **release commit 内不包含功能代码变更**，仅修改版本号
