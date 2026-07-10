/**
 * index.ts
 * Cloudflare Worker entrypoint.
 *
 * Runs as an HTTP endpoint to receive Datadog-formatted JSON logs
 * pushed by Render Log Streams.
 */

import type { Env } from "./env";
import { classifyLogs, RenderLogEntry } from "./logFilter";
import { notifyEvents } from "./discordNotifier";

export default {
  /**
   * HTTP fetch handler — receives POST requests from Render Log Streams.
   */
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    let payload: any;
    try {
      payload = await request.json();
    } catch (err) {
      return new Response("Invalid JSON payload", { status: 400 });
    }

    // Datadog payloads can be an array of objects or a single object.
    const entries: RenderLogEntry[] = Array.isArray(payload) ? payload : [payload];

    console.log(`[render-log-monitor] Received ${entries.length} log entries`);

    // Classify into typed events
    const events = classifyLogs(entries);
    console.log(`[render-log-monitor] Classified ${events.length} actionable events`);

    if (events.length > 0) {
      // Use waitUntil so the response returns quickly while we notify Discord
      ctx.waitUntil(
        notifyEvents(env, events).catch((err) => {
          console.error("[render-log-monitor] Failed to notify Discord:", err);
        })
      );
    }

    return new Response("OK", { status: 200 });
  },
};
