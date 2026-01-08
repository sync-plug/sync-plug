import { PlatformHandler } from "./base";
import { DiscordConnection, PostOptions, PostResult } from "../types";
import { DatabaseAdapter } from "../adapters/base";

const DISCORD_CHAR_LIMIT = 2000;

export class DiscordHandler implements PlatformHandler {
  async sendPost(
    userId: string,
    connection: DiscordConnection,
    options: PostOptions,
    database: DatabaseAdapter
  ): Promise<PostResult> {
    if (!connection.webhookUrl) {
      throw new Error("Discord webhook URL is missing");
    }

    const trimmedText = (options.text || "").trim();
    const fallbackText = options.projectName
      ? `Summary update for ${options.projectName}`
      : "Social media update";

    const content = (trimmedText || fallbackText).slice(0, DISCORD_CHAR_LIMIT);

    const payload: Record<string, any> = {
      content,
      allowed_mentions: { parse: [] },
      username: options.projectName
        ? `Social Auth • ${options.projectName}`
        : "Social Auth",
    };

    if (options.mediaUrl) {
      payload.embeds = [
        {
          description: options.mediaAltText || undefined,
          image: { url: options.mediaUrl },
        },
      ];
    }

    try {
      const response = await fetch(connection.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        await database.updateConnection(userId, "discord", {
          isValid: false,
          needsReconnection: true,
        });
        return {
          platform: "discord",
          success: false,
          error: `Discord webhook error: ${response.status} ${response.statusText}`,
        };
      }

      await database.updateConnection(userId, "discord", {
        isValid: true,
        needsReconnection: false,
        lastValidated: new Date(),
      });

      return {
        platform: "discord",
        success: true,
        result: {},
      };
    } catch (error: any) {
      await database.updateConnection(userId, "discord", {
        isValid: false,
        needsReconnection: true,
      });

      return {
        platform: "discord",
        success: false,
        error: error.message || "Unknown Discord error",
      };
    }
  }
}

