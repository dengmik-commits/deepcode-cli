import { spawnSync } from "child_process";

type TaskkillSpawnSync = (
  command: string,
  args: string[],
  options: { stdio: "ignore"; windowsHide: true }
) => { status: number | null; error?: Error };

export type KillProcessTreeDeps = {
  platform?: NodeJS.Platform;
  killPid?: (pid: number, signal: NodeJS.Signals) => void;
  runTaskkill?: (pid: number) => boolean;
  killGroupOnNonWindows?: boolean;
};

export function killProcessTree(
  pid: number,
  signal: NodeJS.Signals = "SIGKILL",
  deps: KillProcessTreeDeps = {}
): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  const platform = deps.platform ?? process.platform;
  const killPid = deps.killPid ?? ((targetPid, targetSignal) => process.kill(targetPid, targetSignal));

  if (platform === "win32") {
    const runTaskkill = deps.runTaskkill ?? runWindowsTaskkill;
    if (runTaskkill(pid)) {
      return true;
    }
    // taskkill is the only mechanism that walks the child tree (/T). If it
    // fails, fall back to killing the single root PID for best-effort cleanup,
    // but return false so callers know the tree was NOT fully killed and do
    // not drop the process from their tracking (which would leak children).
    killDirectProcess(pid, signal, killPid);
    return false;
  }

  if (deps.killGroupOnNonWindows !== false && killDirectProcess(-pid, signal, killPid)) {
    return true;
  }
  return killDirectProcess(pid, signal, killPid);
}

export function runWindowsTaskkill(pid: number, spawnSyncImpl: TaskkillSpawnSync = spawnSync): boolean {
  const result = spawnSyncImpl("taskkill", ["/PID", String(pid), "/T", "/F"], {
    stdio: "ignore",
    windowsHide: true,
  });
  return !result.error && result.status === 0;
}

function killDirectProcess(
  pid: number,
  signal: NodeJS.Signals,
  killPid: (pid: number, signal: NodeJS.Signals) => void
): boolean {
  try {
    killPid(pid, signal);
    return true;
  } catch {
    return false;
  }
}
