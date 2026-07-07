/**
 * discordNotifier.ts
 * Sends formatted Discord embeds via the Discord REST API using a bot token.
 * Does NOT use discord.py or any WebSocket connection — pure HTTP.
 */

import type { Env } from "./renderClient";
import type { LogEvent } from "./logFilter";

const DISCORD_API = "https://discord.com/api/v10";

// Discord embed colors (decimal)
const COLOR_RED = 0xe74c3c;
const COLOR_GREEN = 0x2ecc71;
const COLOR_ORANGE = 0xe67e22;

interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  footer: { text: string };
  timestamp: string;
}

/**
 * Posts a single embed to the configured Discord channel.
 */
async function sendEmbed(env: Env, embed: DiscordEmbed): Promise<void> {
  const url = `${DISCORD_API}/channels/${env.DISCORD_CHANNEL_ID}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ embeds: [embed] }),
  });

  if (!response.ok) {
    const body = await response.text();
    // Log but don't throw — one failed message shouldn't break the whole run
    console.error(`Discord API error ${response.status}: ${body}`);
  }
}

/**
 * Truncates a string to Discord's embed description limit (4096 chars).
 */
function truncate(text: string, maxLen = 4000): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "\n…*(truncated)*";
}

/**
 * Formats and sends Discord embeds for a list of classified LogEvents.
 * Sends messages sequentially with a small delay to respect Discord rate limits.
 */
export async function notifyEvents(env: Env, events: LogEvent[]): Promise<void> {
  for (const event of events) {
    let embed: DiscordEmbed;

    switch (event.kind) {
      case "app_error":
        embed = {
          title: "🔴 Error en producción — luka",
          description: `\`\`\`\n${truncate(event.message)}\n\`\`\``,
          color: COLOR_RED,
          footer: { text: "Render · luka · app log" },
          timestamp: event.timestamp,
        };
        break;

      case "deploy_ok":
        embed = {
          title: "✅ Deploy exitoso — luka",
          description: "El servicio **luka** fue desplegado correctamente y está en línea.",
          color: COLOR_GREEN,
          footer: { text: "Render · luka · build log" },
          timestamp: event.timestamp,
        };
        break;

      case "deploy_fail":
        embed = {
          title: "❌ Deploy fallido — luka",
          description: `El build de **luka** falló con el siguiente error:\n\`\`\`\n${truncate(event.message)}\n\`\`\``,
          color: COLOR_ORANGE,
          footer: { text: "Render · luka · build log" },
          timestamp: event.timestamp,
        };
        break;

      default:
        continue;
    }

    await sendEmbed(env, embed);

    // Respect Discord rate limits: ~5 messages/second global limit
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
