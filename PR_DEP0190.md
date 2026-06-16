# fix: resolve DEP0190 deprecation warning on Windows

## 问题

启动 deepcode 时出现 Node.js 废弃警告：

```
(node:119316) [DEP0190] DeprecationWarning: Passing args to a child process
with shell option true can lead to security vulnerabilities, as the
arguments are not escaped, only concatenated.
```

## 根因

`child_process.spawn()` 在 `shell: true` 模式下不应该传入 args 数组——Node.js 只做简单拼接不转义，存在注入风险。v0.1.21 中 PR #77 修复 Windows CI 时引入了此回归：McpClient 和 updateCheck 共 3 处调用都传了 args 数组。

## 修复

将所有 `spawn(cmd, args, { shell: true })` 改为 `spawn([cmd, ...args].join(" "), [], { shell: true })`，手动拼成字符串后传入。逻辑等价——cmd.exe 仍通过 PATHEXT 解析命令，不会触发 DEP0190，也不会有之前的 `.cmd` 后缀 bug。

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/mcp/mcp-client.ts` | McpClient.connect() 的 spawn 调用 |
| `src/updateCheck.ts:164` | `runNpmInstallGlobal()` — npm 全局安装更新包 |
| `src/updateCheck.ts:208` | `npmViewVersion()` — npm view 查询最新版本 |

`updateCheck.ts` 的两处在启动时同时触发警告是因为它们先于 MCP 初始化运行：deepcode 启动后立即检查更新和版本信息，这两个 spawn 在 `npm` 子命令前就触发了 DEP0190。用户看到的启动警告正是来自这里。

## 验证

```
npm run typecheck    # ✅ 零错误
npm run bundle       # ✅ dist/cli.js
```

启动 deepcode，不再出现 DEP0190 警告。
