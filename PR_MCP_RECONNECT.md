# feat: MCP 服务器手动重连功能

## 概述

当前 MCP 服务器初始化失败后直接标记 `failed`，无法恢复。本 PR 增加了手动重连机制：用户可在 `/mcp` 界面进入失败的服务器详情，选择 Reconnect 触发单次重连。

## 设计

```
/mcp → 服务器列表
  fetch: ✗ Failed
  ↓ 按 Enter 进入详情
  > ↻ [Reconnect]        ← 二级菜单项
    Error: exited with code 7
  ↓ 按 Enter 触发重连
  fetch: ↻ Reconnecting...
  ↓ 成功 → ✓ Ready / 失败 → ✗ Failed
```

**关键约束**：
- 失败后不自动重试，由用户主动触发
- 每次重连仅尝试一次，无 backoff/retry
- 重连时实时读取磁盘上的最新 settings.json，无需重启

## 变更

### `src/mcp/mcp-client.ts`
- 新增 `onDisconnect` 回调参数，区分主动断开与进程崩溃
- 新增 `isConnected()` 方法
- `safeReject` 修复进程退出竞态条件：close 事件可能在 sendRequest 注册前触发，导致 connect() 永远等待超时
- 适配上游的 Windows spawn 修复（直接传递 command+args，不强制拼 `.cmd`）

### `src/mcp/mcp-manager.ts`
- `McpServerStatus.status` 类型新增 `"reconnecting"`
- `initialize()` 拆分出 `connectServer()`：单次尝试，失败直接 `setStatus("failed")`
- 新增公开方法 `reconnect(name, config?)`：接受可选的最新配置，更新缓存并重连
- `onServerCrash()`：运行时崩溃清理旧条目并标记 `failed`，不自动重连
- 可配环境变量：`DEEPCODE_MCP_TIMEOUT`（单次连接超时，默认 30s）

### `src/session.ts`
- 新增 `reconnectMcpServer(name, config?)` 委托给 McpManager

### `src/ui/App.tsx`
- `McpStatusList` 传入 `onReconnect` 回调
- 回调内调用 `resolveCurrentSettings()` 保证每次重连都读取最新配置

### `src/ui/McpStatusList.tsx`
- `enterDetail` 允许 `failed` / `reconnecting` 服务器进入详情
- `ServerDetailView` 新增 `onReconnect` prop
- 对 `failed` 服务器渲染 `[Reconnect]` 菜单项，默认 `>` 光标选中
- `ItemRow` 支持 `action` 类型，选中时显示 `>` 前缀
- 底部提示：`Enter to reconnect · Esc back · Ctrl+C close`

### `src/tests/session.test.ts`
- `SessionManager marks MCP server as failed on single failed attempt (no auto-retry)` — 确认失败后无自动重连
- `SessionManager reconnect succeeds on previously failed server` — 确认手动重连成功

## 验证

### 自动化测试

```
npm run typecheck    # ✅ 零错误
npm run bundle       # ✅ dist/cli.js 335KB
DEEPCODE_MCP_TIMEOUT=3000 npm test  # ✅ 208/213 pass
```

### 手动验证流程

**1. 制造失败：** 将 `~/.deepcode/settings.json` 中 fetch 服务器包名改为不存在的包：

```diff
  "fetch": {
    "command": "npx",
-   "args": ["-y", "mcp-fetch-server"]
+   "args": ["-y", "mcp-fetch-server-BROKEN"]
  }
```

**2. 启动 deepcode，执行 `/mcp`：**

```
Manage MCP servers (1 ready, 1 starting, 1 failed)
  ...
  > ✗ fetch               Failed
    Error: ... exited with code 1 ...
```

**3. Enter 进入详情：**

```
✗ fetch — Status
  Error: ... exited with code 1 ...
  ─────────────────
  > ↻ [Reconnect]
```

**4. Enter 触发重连**（包名仍然错误）—— 返回列表，看到 `↻ Reconnecting...` 后再次 `✗ Failed`。

**5. 改回正确包名：**

```diff
- "args": ["-y", "mcp-fetch-server-BROKEN"]
+ "args": ["-y", "mcp-fetch-server"]
```

**6. 再次 Enter → `[Reconnect]` → Enter** —— fetch 恢复 `✓ Ready`。

**关键：** 步骤 5-6 无需重启 deepcode，`reconnect()` 每次从磁盘实时读取最新配置。
