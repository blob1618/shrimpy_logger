/**
 * renderClient.ts
 * Fetches logs from the Render API for a given service.
 * Handles pagination and returns all new entries since the given cursor timestamp.
 */

import type { RenderLogEntry } from "./logFilter";

const RENDER_API_BASE = "https://api.render.com/v1";

export interface Env {
  RENDER_API_KEY: string;
  RENDER_OWNER_ID: string;
  RENDER_SERVICE_ID: string;
  DISCORD_BOT_TOKEN: string;
  DISCORD_CHANNEL_ID: string;
  LOG_STATE: KVNamespace;
}

interface RenderLogsResponse {
  logs: RenderLogEntry[];
  hasMore: boolean;
  nextStartTime?: string;
}

/**
 * Fetches log entries from Render API for a given log type.
 *
 * @param env - Worker environment (secrets + KV binding)
 * @param logType - "app" or "build"
 * @param level - optional level filter ("error" | "info" | "warning")
 * @param since - ISO 8601 timestamp; only fetch logs after this time
 */
async function fetchLogs(
  env: Env,
  logType: "app" | "build",
  level: string | null,
  since: string
): Promise<RenderLogEntry[]> {
  const allLogs: RenderLogEntry[] = [];

  const params = new URLSearchParams({
    ownerId: env.RENDER_OWNER_ID,
    startTime: since,
    direction: "forward",
  });
  params.append("resource", env.RENDER_SERVICE_ID);
  params.append("type", logType);
  if (level) params.append("level", level);

  let url: string | null = `${RENDER_API_BASE}/logs?${params.toString()}`;

  while (url) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${env.RENDER_API_KEY}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Render API error ${response.status} [${logType}]: ${body}`
      );
    }

    const data = (await response.json()) as RenderLogsResponse;

    if (data.logs && data.logs.length > 0) {
      allLogs.push(...data.logs);
    }

    // Paginate if there are more results
    if (data.hasMore && data.nextStartTime) {
      const nextParams = new URLSearchParams(params);
      nextParams.set("startTime", data.nextStartTime);
      url = `${RENDER_API_BASE}/logs?${nextParams.toString()}`;
    } else {
      url = null;
    }
  }

  return allLogs;
}

/**
 * Returns all new log entries (app errors + build logs) since the cursor timestamps.
 * Merges and deduplicates by entry ID.
 */
export async function getNewLogs(
  env: Env,
  appCursor: string,
  buildCursor: string
): Promise<RenderLogEntry[]> {
  // Fetch app errors and all build logs in parallel
  const [appLogs, buildLogs] = await Promise.all([
    fetchLogs(env, "app", "error", appCursor),
    fetchLogs(env, "build", null, buildCursor),
  ]);

  // Merge, deduplicate by id, sort by timestamp ascending
  const seen = new Set<string>();
  const all: RenderLogEntry[] = [];

  for (const entry of [...appLogs, ...buildLogs]) {
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      all.push(entry);
    }
  }

  all.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return all;
}

/**
 * Returns the latest timestamp from a list of log entries,
 * or the fallback if the list is empty.
 * Adds 1ms to avoid re-fetching the last entry.
 */
export function getNewCursor(
  entries: RenderLogEntry[],
  fallback: string
): string {
  if (entries.length === 0) return fallback;
  const latest = entries[entries.length - 1].timestamp;
  const ts = new Date(latest).getTime() + 1;
  return new Date(ts).toISOString();
}
