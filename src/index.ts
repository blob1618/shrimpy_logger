/**
 * index.ts
 * Cloudflare Worker entrypoint.
 *
 * Runs on a cron trigger (every minute) to:
 *   1. Read the last-seen log cursors from KV
 *   2. Fetch new logs from Render API (app errors + build events)
 *   3. Classify logs into typed events
 *   4. Send Discord notifications for relevant events
 *   5. Save the new cursors back to KV
 */

import type { Env } from "./renderClient";
import { getNewLogs, getNewCursor } from "./renderClient";
import { classifyLogs } from "./logFilter";
import { notifyEvents } from "./discordNotifier";

// KV keys for persisting cursor state
const KV_APP_CURSOR = "cursor:app";
const KV_BUILD_CURSOR = "cursor:build";

/**
 * Returns a default cursor: 1 minute ago (safe starting point for first run).
 */
function defaultCursor(): string {
  return new Date(Date.now() - 60_000).toISOString();
}

export default {
  /**
   * Scheduled handler — triggered by the cron defined in wrangler.jsonc.
   */
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(run(env));
  },

  /**
   * HTTP fetch handler — useful for manual triggering during local dev:
   *   curl http://localhost:8787/__scheduled?cron=*+*+*+*+*
   * (wrangler dev --test-scheduled handles this automatically)
   */
  async fetch(
    _request: Request,
    _env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    return new Response(
      "Render Log Monitor is running. Trigger via scheduled cron.",
      { status: 200 }
    );
  },
};

/**
 * Core orchestration logic.
 */
async function run(env: Env): Promise<void> {
  console.log("[render-log-monitor] Starting run at", new Date().toISOString());

  // 1. Read cursors from KV (fallback: 1 minute ago for first run)
  const [appCursor, buildCursor] = await Promise.all([
    env.LOG_STATE.get(KV_APP_CURSOR),
    env.LOG_STATE.get(KV_BUILD_CURSOR),
  ]);

  const resolvedAppCursor = appCursor ?? defaultCursor();
  const resolvedBuildCursor = buildCursor ?? defaultCursor();

  console.log("[render-log-monitor] Cursors:", {
    app: resolvedAppCursor,
    build: resolvedBuildCursor,
  });

  // 2. Fetch new logs from Render API
  let entries;
  try {
    entries = await getNewLogs(env, resolvedAppCursor, resolvedBuildCursor);
  } catch (err) {
    console.error("[render-log-monitor] Failed to fetch logs:", err);
    // Don't advance cursors on fetch failure — retry next run
    return;
  }

  console.log(`[render-log-monitor] Fetched ${entries.length} new log entries`);

  // Split entries back by type to compute separate cursors
  const appEntries = entries.filter((e) => e.labels?.find(l => l.name === "type")?.value === "app");
  const buildEntries = entries.filter((e) => e.labels?.find(l => l.name === "type")?.value === "build");

  // 3. Classify into typed events
  const events = classifyLogs(entries);
  console.log(`[render-log-monitor] Classified ${events.length} actionable events`);

  // 4. Send Discord notifications (only if there's something to report)
  if (events.length > 0) {
    try {
      await notifyEvents(env, events);
      console.log("[render-log-monitor] Discord notifications sent");
    } catch (err) {
      console.error("[render-log-monitor] Failed to notify Discord:", err);
      // Still advance cursors to avoid re-processing the same logs
    }
  }

  // 5. Advance cursors — write both in parallel
  const newAppCursor = getNewCursor(appEntries, resolvedAppCursor);
  const newBuildCursor = getNewCursor(buildEntries, resolvedBuildCursor);

  await Promise.all([
    env.LOG_STATE.put(KV_APP_CURSOR, newAppCursor),
    env.LOG_STATE.put(KV_BUILD_CURSOR, newBuildCursor),
  ]);

  console.log("[render-log-monitor] Cursors updated:", {
    app: newAppCursor,
    build: newBuildCursor,
  });

  console.log("[render-log-monitor] Run complete");
}
