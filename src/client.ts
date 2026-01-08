import { DatabaseAdapter } from "./adapters/base";
import { Platform, PlatformConnection, PostOptions, PostResult } from "./types";
import { PostDispatcher, PlatformConfig } from "./dispatcher";
import { TwitterConnectionProvider, TwitterConfig } from "./connections/twitter";
import { LinkedInConnectionProvider, LinkedInConfig } from "./connections/linkedin";
import { BlueskyConnectionProvider, BlueskyAuthOptions } from "./connections/bluesky";
import { TikTokConnectionProvider, TikTokConfig } from "./connections/tiktok";
import { ThreadsConnectionProvider, ThreadsConfig } from "./connections/threads";
import { DevtoConnectionProvider } from "./connections/devto";
import { DiscordConnectionProvider, DiscordWebhookOptions } from "./connections/discord";
import { GitHubConnectionProvider } from "./connections/github";

export interface SocialAuthConfig {
  database: DatabaseAdapter;
  platforms: PlatformConfig;
}

export class SocialAuth {
  private database: DatabaseAdapter;
  private dispatcher: PostDispatcher;
  private config: PlatformConfig;

  constructor(config: SocialAuthConfig) {
    this.database = config.database;
    this.config = config.platforms;
    this.dispatcher = new PostDispatcher(this.database, this.config);
  }

  /**
   * Connect a platform for a user
   */
  async connect(
    platform: Platform,
    userId: string,
    options?: any
  ): Promise<{ authUrl?: string; connection?: PlatformConnection }> {
    switch (platform) {
      case "twitter":
        if (!this.config.twitter) {
          throw new Error("Twitter not configured");
        }
        const twitterProvider = new TwitterConnectionProvider(
          this.database,
          this.config.twitter
        );
        const twitterAuth = await twitterProvider.initiateAuth(
          userId,
          options?.redirectUri || ""
        );
        return { authUrl: twitterAuth.authUrl };

      case "linkedin":
        if (!this.config.linkedin) {
          throw new Error("LinkedIn not configured");
        }
        const linkedinProvider = new LinkedInConnectionProvider(
          this.database,
          this.config.linkedin
        );
        const linkedinAuth = await linkedinProvider.initiateAuth(
          userId,
          options?.redirectUri || ""
        );
        return { authUrl: linkedinAuth.authUrl };

      case "bluesky":
        if (!options?.handle || !options?.password) {
          throw new Error("Bluesky handle and password are required");
        }
        const blueskyProvider = new BlueskyConnectionProvider(this.database, "bluesky");
        const blueskyConn = await blueskyProvider.connect(userId, {
          handle: options.handle,
          password: options.password,
          authFactorToken: options.authFactorToken,
        });
        return { connection: blueskyConn };

      case "tiktok":
        if (!this.config.tiktok) {
          throw new Error("TikTok not configured");
        }
        const tiktokProvider = new TikTokConnectionProvider(
          this.database,
          this.config.tiktok
        );
        const tiktokAuth = await tiktokProvider.initiateAuth(
          userId,
          options?.redirectUri || ""
        );
        return { authUrl: tiktokAuth.authUrl };

      case "threads":
        if (!this.config.threads) {
          throw new Error("Threads not configured");
        }
        const threadsProvider = new ThreadsConnectionProvider(
          this.database,
          this.config.threads
        );
        const threadsAuth = await threadsProvider.initiateAuth(
          userId,
          options?.redirectUri || ""
        );
        return { authUrl: threadsAuth.authUrl };

      case "devto":
        if (!options?.apiKey) {
          throw new Error("Dev.to API key is required");
        }
        const devtoProvider = new DevtoConnectionProvider(this.database, "devto");
        const devtoConn = await devtoProvider.connect(userId, options.apiKey);
        return { connection: devtoConn };

      case "discord":
        if (!options?.webhookUrl) {
          throw new Error("Discord webhook URL is required");
        }
        const discordProvider = new DiscordConnectionProvider(this.database, "discord");
        const discordConn = await discordProvider.connect(userId, {
          webhookUrl: options.webhookUrl,
          channelName: options.channelName,
          guildName: options.guildName,
        });
        return { connection: discordConn };

      case "github":
        if (!options?.token) {
          throw new Error("GitHub token is required");
        }
        const githubProvider = new GitHubConnectionProvider(this.database, "github");
        const githubConn = await githubProvider.connect(userId, options.token);
        return { connection: githubConn };

      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Handle OAuth callback
   */
  async handleCallback(
    platform: Platform,
    code: string,
    state: string,
    redirectUri: string
  ): Promise<PlatformConnection> {
    switch (platform) {
      case "twitter": {
        if (!this.config.twitter) {
          throw new Error("Twitter not configured");
        }
        const twitterProvider = new TwitterConnectionProvider(
          this.database,
          this.config.twitter
        );
        return await twitterProvider.handleCallback(code, state, redirectUri);
      }

      case "linkedin": {
        if (!this.config.linkedin) {
          throw new Error("LinkedIn not configured");
        }
        const linkedinProvider = new LinkedInConnectionProvider(
          this.database,
          this.config.linkedin
        );
        return await linkedinProvider.handleCallback(code, state, redirectUri);
      }

      case "tiktok": {
        if (!this.config.tiktok) {
          throw new Error("TikTok not configured");
        }
        const tiktokProvider = new TikTokConnectionProvider(
          this.database,
          this.config.tiktok
        );
        return await tiktokProvider.handleCallback(code, state, redirectUri);
      }

      case "threads": {
        if (!this.config.threads) {
          throw new Error("Threads not configured");
        }
        const threadsProvider = new ThreadsConnectionProvider(
          this.database,
          this.config.threads
        );
        return await threadsProvider.handleCallback(code, state, redirectUri);
      }

      default:
        throw new Error(`Platform ${platform} does not use OAuth callbacks`);
    }
  }

  /**
   * Disconnect a platform
   */
  async disconnect(platform: Platform, userId: string): Promise<void> {
    switch (platform) {
      case "twitter": {
        if (!this.config.twitter) {
          throw new Error("Twitter not configured");
        }
        const twitterProvider = new TwitterConnectionProvider(
          this.database,
          this.config.twitter
        );
        await twitterProvider.disconnect(userId);
        break;
      }

      case "linkedin": {
        if (!this.config.linkedin) {
          throw new Error("LinkedIn not configured");
        }
        const linkedinProvider = new LinkedInConnectionProvider(
          this.database,
          this.config.linkedin
        );
        await linkedinProvider.disconnect(userId);
        break;
      }

      case "bluesky": {
        const blueskyProvider = new BlueskyConnectionProvider(this.database, "bluesky");
        await blueskyProvider.disconnect(userId);
        break;
      }

      case "tiktok": {
        if (!this.config.tiktok) {
          throw new Error("TikTok not configured");
        }
        const tiktokProvider = new TikTokConnectionProvider(
          this.database,
          this.config.tiktok
        );
        await tiktokProvider.disconnect(userId);
        break;
      }

      case "threads": {
        if (!this.config.threads) {
          throw new Error("Threads not configured");
        }
        const threadsProvider = new ThreadsConnectionProvider(
          this.database,
          this.config.threads
        );
        await threadsProvider.disconnect(userId);
        break;
      }

      case "devto": {
        const devtoProvider = new DevtoConnectionProvider(this.database, "devto");
        await devtoProvider.disconnect(userId);
        break;
      }

      case "discord": {
        const discordProvider = new DiscordConnectionProvider(this.database, "discord");
        await discordProvider.disconnect(userId);
        break;
      }

      case "github": {
        const githubProvider = new GitHubConnectionProvider(this.database, "github");
        await githubProvider.disconnect(userId);
        break;
      }

      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Get all connections for a user
   */
  async getConnections(userId: string): Promise<PlatformConnection[]> {
    return await this.database.getConnections(userId);
  }

  /**
   * Get connection for a specific platform
   */
  async getConnection(
    userId: string,
    platform: Platform
  ): Promise<PlatformConnection | null> {
    return await this.database.getConnection(userId, platform);
  }

  /**
   * Refresh token for a platform
   */
  async refreshToken(
    platform: Platform,
    userId: string
  ): Promise<void> {
    const connection = await this.database.getConnection(userId, platform);
    if (!connection) {
      throw new Error(`No connection found for platform ${platform}`);
    }

    let provider: any;
    switch (platform) {
      case "twitter":
        if (!this.config.twitter) {
          throw new Error("Twitter not configured");
        }
        provider = new TwitterConnectionProvider(
          this.database,
          this.config.twitter
        );
        break;
      case "linkedin":
        if (!this.config.linkedin) {
          throw new Error("LinkedIn not configured");
        }
        provider = new LinkedInConnectionProvider(
          this.database,
          this.config.linkedin
        );
        break;
      case "bluesky":
        provider = new BlueskyConnectionProvider(this.database, "bluesky");
        break;
      case "tiktok":
        if (!this.config.tiktok) {
          throw new Error("TikTok not configured");
        }
        provider = new TikTokConnectionProvider(
          this.database,
          this.config.tiktok
        );
        break;
      default:
        throw new Error(`Token refresh not supported for platform: ${platform}`);
    }

    const updated = await provider.refreshToken(connection);
    await this.database.updateConnection(userId, platform, updated);
  }

  /**
   * Post to a specific platform
   */
  async post(
    platform: Platform,
    userId: string,
    options: PostOptions
  ): Promise<PostResult> {
    return await this.dispatcher.postToPlatform(platform, userId, options);
  }

  /**
   * Post to all connected platforms
   */
  async postToAll(
    userId: string,
    options: PostOptions,
    platforms?: Platform[]
  ): Promise<PostResult[]> {
    return await this.dispatcher.postToAll(userId, options, platforms);
  }
}

