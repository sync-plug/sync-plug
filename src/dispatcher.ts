import { PlatformHandler } from "./handlers/base";
import { Platform, PlatformConnection, PostOptions, PostResult } from "./types";
import { DatabaseAdapter } from "./adapters/base";
import { TwitterHandler } from "./handlers/twitter";
import { LinkedInHandler } from "./handlers/linkedin";
import { BlueskyHandler } from "./handlers/bluesky";
import { TikTokHandler } from "./handlers/tiktok";
import { DevtoHandler } from "./handlers/devto";
import { ThreadsHandler } from "./handlers/threads";
import { DiscordHandler } from "./handlers/discord";
import { GitHubHandler } from "./handlers/github";
import { TwitterConnectionProvider } from "./connections/twitter";
import { LinkedInConnectionProvider } from "./connections/linkedin";
import { BlueskyConnectionProvider } from "./connections/bluesky";
import { TikTokConnectionProvider } from "./connections/tiktok";
import { DevtoConnectionProvider } from "./connections/devto";
import { ThreadsConnectionProvider } from "./connections/threads";
import { DiscordConnectionProvider } from "./connections/discord";
import { GitHubConnectionProvider } from "./connections/github";

export interface PlatformConfig {
  twitter?: { clientId: string; clientSecret: string };
  linkedin?: { clientId: string; clientSecret: string };
  bluesky?: {};
  tiktok?: { clientKey: string; clientSecret: string };
  threads?: { clientId: string; clientSecret: string };
  devto?: {};
  discord?: {};
  github?: {};
}

export class PostDispatcher {
  private handlers: Map<Platform, PlatformHandler> = new Map();
  private database: DatabaseAdapter;
  private config: PlatformConfig;

  constructor(database: DatabaseAdapter, config: PlatformConfig) {
    this.database = database;
    this.config = config;
    this.initializeHandlers();
  }

  private initializeHandlers(): void {
    // Initialize connection providers and handlers
    if (this.config.twitter) {
      const twitterProvider = new TwitterConnectionProvider(
        this.database,
        this.config.twitter
      );
      this.handlers.set("twitter", new TwitterHandler(twitterProvider));
    }

    if (this.config.linkedin) {
      const linkedinProvider = new LinkedInConnectionProvider(
        this.database,
        this.config.linkedin
      );
      this.handlers.set("linkedin", new LinkedInHandler(linkedinProvider));
    }

    if (this.config.bluesky) {
      const blueskyProvider = new BlueskyConnectionProvider(
        this.database,
        "bluesky"
      );
      this.handlers.set("bluesky", new BlueskyHandler(blueskyProvider));
    }

    if (this.config.tiktok) {
      const tiktokProvider = new TikTokConnectionProvider(
        this.database,
        this.config.tiktok
      );
      this.handlers.set("tiktok", new TikTokHandler(tiktokProvider));
    }

    if (this.config.devto) {
      const devtoProvider = new DevtoConnectionProvider(
        this.database,
        "devto"
      );
      this.handlers.set("devto", new DevtoHandler());
    }

    if (this.config.threads) {
      const threadsProvider = new ThreadsConnectionProvider(
        this.database,
        this.config.threads
      );
      this.handlers.set("threads", new ThreadsHandler());
    }

    if (this.config.discord) {
      const discordProvider = new DiscordConnectionProvider(
        this.database,
        "discord"
      );
      this.handlers.set("discord", new DiscordHandler());
    }

    if (this.config.github) {
      const githubProvider = new GitHubConnectionProvider(
        this.database,
        "github"
      );
      this.handlers.set("github", new GitHubHandler());
    }
  }

  /**
   * Post to a specific platform
   */
  async postToPlatform(
    platform: Platform,
    userId: string,
    options: PostOptions
  ): Promise<PostResult> {
    const handler = this.handlers.get(platform);
    if (!handler) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    const connection = await this.database.getConnection(userId, platform);
    if (!connection) {
      throw new Error(
        `No connection found for platform ${platform} and user ${userId}`
      );
    }

    try {
      const result = await handler.sendPost(
        userId,
        connection,
        options,
        this.database
      );

      return result;
    } catch (error: any) {
      return {
        platform,
        success: false,
        error: error.message || "Unknown error occurred",
      };
    }
  }

  /**
   * Post to multiple platforms
   */
  async postToAll(
    userId: string,
    options: PostOptions,
    platforms?: Platform[]
  ): Promise<PostResult[]> {
    const targetPlatforms =
      platforms ||
      (Array.from(this.handlers.keys()) as Platform[]);

    const results = await Promise.allSettled(
      targetPlatforms.map((platform) =>
        this.postToPlatform(platform, userId, options)
      )
    );

    return results.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        return {
          platform: targetPlatforms[index],
          success: false,
          error: result.reason?.message || "Unknown error",
        };
      }
    });
  }
}

