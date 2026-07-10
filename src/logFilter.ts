/**
 * logFilter.ts
 * Classifies raw Render API log entries into typed events.
 */

export type AppErrorEvent = {
  kind: "app_error";
  message: string;
  timestamp: string;
  level: string;
};

export type DeployOkEvent = {
  kind: "deploy_ok";
  timestamp: string;
};

export type DeployFailEvent = {
  kind: "deploy_fail";
  message: string;
  timestamp: string;
};

export type LogEvent = AppErrorEvent | DeployOkEvent | DeployFailEvent;

/** Shape of a single log entry returned by Render Datadog Log Stream */
export interface RenderLogEntry {
  message?: string;
  timestamp?: string | number;
  date?: string | number;
  status?: string;
  level?: string;
  type?: string;
  ddsource?: string;
  [key: string]: any;
}

// Patterns indicating a successful deploy in Render build logs
const DEPLOY_SUCCESS_PATTERNS = [
  /deploy\s+live/i,
  /build\s+successful/i,
  /your\s+service\s+is\s+live/i,
  /==> Your service is live/i,
  /deployment\s+succeeded/i,
];

// Patterns to ignore — noisy but not actionable errors
const IGNORED_PATTERNS: RegExp[] = [];

/**
 * Classifies a list of Render log entries into typed LogEvents.
 * Only returns events we care about:
 *   - app errors (status or level = error)
 *   - successful deploys (message matches success patterns)
 *   - failed deploys
 */
export function classifyLogs(entries: RenderLogEntry[]): LogEvent[] {
  const events: LogEvent[] = [];

  for (const entry of entries) {
    if (!entry) continue;

    const message = entry.message || "";
    if (!message) continue;

    const tsValue = entry.timestamp || entry.date || Date.now();
    const timestamp =
      typeof tsValue === "number"
        ? new Date(tsValue).toISOString()
        : String(tsValue);

    // Extract level/status, checking nested render object if it exists
    const levelStr = String(
      entry.status ||
      entry.level ||
      entry.render?.log?.level ||
      "info"
    ).toLowerCase();

    const typeStr = String(
      entry.type ||
      entry.ddsource ||
      entry.render?.log?.type ||
      "app"
    ).toLowerCase();

    // Skip ignored patterns
    if (IGNORED_PATTERNS.some((p) => p.test(message))) continue;

    const isError = levelStr === "error" || levelStr === "err" || levelStr === "critical";
    const isBuild = typeStr.includes("build");

    if (isBuild) {
      if (DEPLOY_SUCCESS_PATTERNS.some((p) => p.test(message))) {
        events.push({ kind: "deploy_ok", timestamp });
        continue;
      }
      if (isError) {
        events.push({ kind: "deploy_fail", message, timestamp });
        continue;
      }
    } else if (isError) {
      events.push({ kind: "app_error", message, timestamp, level: levelStr });
    }
  }

  return events;
}
