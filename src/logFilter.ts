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

/** Shape of a single log entry returned by Render API */
export interface RenderLogEntry {
  id: string;
  timestamp: string;
  message: string;
  labels?: { name: string; value: string }[];
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
 *   - app errors (type=app, level=error)
 *   - successful deploys (type=build, message matches success patterns)
 *   - failed deploys (type=build, level=error)
 */
export function classifyLogs(entries: RenderLogEntry[]): LogEvent[] {
  const events: LogEvent[] = [];

  for (const entry of entries) {
    const { message, timestamp, labels } = entry;
    const type = labels?.find(l => l.name === 'type')?.value;
    const level = labels?.find(l => l.name === 'level')?.value;

    // Skip ignored patterns
    if (IGNORED_PATTERNS.some((p) => p.test(message))) continue;

    if (type === "app" && level === "error") {
      events.push({ kind: "app_error", message, timestamp, level });
      continue;
    }

    if (type === "build") {
      if (DEPLOY_SUCCESS_PATTERNS.some((p) => p.test(message))) {
        events.push({ kind: "deploy_ok", timestamp });
        continue;
      }
      if (level === "error") {
        events.push({ kind: "deploy_fail", message, timestamp });
        continue;
      }
    }
  }

  return events;
}
