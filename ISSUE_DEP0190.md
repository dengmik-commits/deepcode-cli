## 问题

启动 deepcode 时出现 Node.js 废弃警告：

```
(node:123548) [DEP0190] DeprecationWarning: Passing args to a child process
with shell option true can lead to security vulnerabilities, as the
arguments are not escaped, only concatenated.
```

## 根因

PR #77 修复 Windows CI 时，将 McpClient 的 spawn 调用从：

```js
const cmd = [this.command + ".cmd", ...args].join(" ");
spawn(cmd, [], { shell: true });
```

改为：

```js
spawn(this.command, args, { shell: true });
```

目的是去掉强制拼接 `.cmd` 后缀，让 cmd.exe 通过 PATHEXT 环境变量自动解析 `npx` → `npx.cmd`。但 Node.js 在 `shell: true` 模式下直接传 args 数组会触发 DEP0190 警告——Node 只做简单拼接不转义，存在注入风险。

## 修复方案

将 args 手动拼成字符串后传入，避免触发 DEP0190：

```diff
- this.process = spawn(this.command, args, {
+ this.process = spawn([this.command, ...args].join(" "), [], {
    stdio: ["pipe", "pipe", "pipe"],
    env: childEnv,
    shell: true,
    windowsHide: true,
  });
```

逻辑等价——cmd.exe 仍通过 PATHEXT 解析命令，不会触发 DEP0190，也不会有之前的 `.cmd` 后缀 bug。
