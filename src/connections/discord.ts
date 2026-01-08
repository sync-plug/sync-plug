import { BaseConnectionProvider } from "./base";
import { DiscordConnection } from "../types";

export interface DiscordWebhookOptions {
  webhookUrl: string;
  channelName?: string;
  guildName?: string;
}

const DISCORD_WEBHOOK_REGEX =
  /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/(\d+)\/([\w-]+)/i;

export class DiscordConnectionProvider extends BaseConnectionProvider {
  /**
   * Connect to Discord using webhook URL
   */
  async connect(
    userId: string,
    options: DiscordWebhookOptions
  ): Promise<DiscordConnection> {
    const parsedWebhook = this.parseWebhookUrl(options.webhookUrl);
    if (!parsedWebhook) {
      throw new Error(
        "Please enter a Discord webhook URL that matches https://discord.com/api/webhooks/{id}/{token}"
      );
    }

    // Validate webhook by fetching metadata
    const response = await fetch(options.webhookUrl, { method: "GET" });

    if (!response.ok) {
      throw new Error(
        "Discord rejected the webhook URL. Please make sure it is still active."
      );
    }

    const webhookData = await response.json() as {
      channel_id?: string;
      guild_id?: string;
    };

    const connection: DiscordConnection = {
      uid: userId,
      webhookUrl: options.webhookUrl,
      webhookId: parsedWebhook.webhookId,
      webhookToken: parsedWebhook.webhookToken,
      channelName: options.channelName || webhookData.channel_id,
      guildName: options.guildName || webhookData.guild_id,
      platform: "discord",
      isValid: true,
      needsReconnection: false,
      lastValidated: new Date(),
    };

    await this.saveConnection(userId, connection);

    return connection;
  }

  private parseWebhookUrl(webhookUrl: string): {
    webhookId: string;
    webhookToken: string;
  } | null {
    const match = webhookUrl.trim().match(DISCORD_WEBHOOK_REGEX);
    if (!match) {
      return null;
    }

    return {
      webhookId: match[1],
      webhookToken: match[2],
    };
  }

  async initiateAuth(
    userId: string,
    redirectUri: string
  ): Promise<{ authUrl: string; state: string }> {
    throw new Error("Discord uses webhook authentication. Use connect() method instead.");
  }

  async handleCallback(
    code: string,
    state: string,
    redirectUri: string
  ): Promise<DiscordConnection> {
    throw new Error("Discord does not use OAuth callbacks");
  }

  async refreshToken(
    connection: DiscordConnection
  ): Promise<DiscordConnection> {
    // Discord webhooks don't expire
    return connection;
  }
}

