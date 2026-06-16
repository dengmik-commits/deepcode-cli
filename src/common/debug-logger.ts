import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const DEBUG_LOG_FILE = "debug.log";

export type OpenAIChatCompletionDebugEntry = {
  timestamp: string;
  location: string;
  requestId?: string;
  sessionId?: string;
  model?: string;
  baseURL?: string;
  durationMs?: number;
  params?: Record<string, unknown>;
  request: Record<string, unknown>;
  response?: unknown;
  responseChunks?: unknown[];
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
};

const DEBUG_LOG_MAX_ENTRIES = 500;

export function logOpenAIChatCompletionDebug(entry: OpenAIChatCompletionDebugEntry): void {
  try {
    const logPath = getDebugLogPath();
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify(toSerializable(entry))}\n`, "utf8");
    rotateDebugLogIfNeeded(logPath);
  } catch {
    // Debug logging must never affect CLI behavior.
  }
}

// Keep the debug log bounded so it does not grow without limit across sessions.
// Rotation keeps the most recent DEBUG_LOG_MAX_ENTRIES entries.
function rotateDebugLogIfNeeded(logPath: string): void {
  let raw: string;
  try {
    raw = fs.readFileSync(logPath, "utf8");
  } catch {
    return;
  }
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length <= DEBUG_LOG_MAX_ENTRIES) {
    return;
  }
  try {
    const kept = lines.slice(-DEBUG_LOG_MAX_ENTRIES);
    fs.writeFileSync(logPath, `${kept.join("\n")}\n`, "utf8");
  } catch {
    // rotation is best-effort
  }
}

export function getDebugLogPath(): string {
  return path.join(os.homedir(), ".deepcode", "logs", DEBUG_LOG_FILE);
}

export function normalizeDebugError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    name: "UnknownError",
    message: String(error),
  };
}

function toSerializable(value: unknown): unknown {
  const seen = new WeakSet<object>();

  function walk(current: unknown): unknown {
    if (typeof current === "bigint") {
      return current.toString();
    }
    if (current instanceof Error) {
      return normalizeDebugError(current);
    }
    if (!current || typeof current !== "object") {
      return current;
    }
    if (seen.has(current)) {
      return "[Circular]";
    }
    seen.add(current);
    if (Array.isArray(current)) {
      return current.map(walk);
    }
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(current)) {
      result[key] = walk(val);
    }
    return result;
  }

  return walk(value);
}
