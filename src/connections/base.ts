import { DatabaseAdapter } from "../adapters/base";
import { Platform, PlatformConnection, OAuthState } from "../types";

/**
 * Base class for connection providers
 * Handles common OAuth flow logic
 */
export abstract class BaseConnectionProvider {
  protected database: DatabaseAdapter;
  protected platform: Platform;

  constructor(database: DatabaseAdapter, platform: Platform) {
    this.database = database;
    this.platform = platform;
  }

  /**
   * Initiate OAuth flow
   * @param userId - User ID
   * @param redirectUri - OAuth redirect URI
   * @returns Authorization URL and state
   */
  abstract initiateAuth(
    userId: string,
    redirectUri: string
  ): Promise<{ authUrl: string; state: string }>;

  /**
   * Handle OAuth callback
   * @param code - Authorization code
   * @param state - State parameter
   * @param redirectUri - OAuth redirect URI
   * @returns Platform connection
   */
  abstract handleCallback(
    code: string,
    state: string,
    redirectUri: string
  ): Promise<PlatformConnection>;

  /**
   * Refresh access token
   * @param connection - Current connection
   * @returns Updated connection
   */
  abstract refreshToken(
    connection: PlatformConnection
  ): Promise<PlatformConnection>;

  /**
   * Disconnect platform
   * @param userId - User ID
   */
  async disconnect(userId: string): Promise<void> {
    await this.database.deleteConnection(userId, this.platform);
  }

  /**
   * Save OAuth state
   */
  protected async saveOAuthState(state: string, data: OAuthState): Promise<void> {
    await this.database.saveOAuthState(state, data);
  }

  /**
   * Get OAuth state
   */
  protected async getOAuthState(state: string): Promise<OAuthState | null> {
    return await this.database.getOAuthState(state);
  }

  /**
   * Delete OAuth state
   */
  protected async deleteOAuthState(state: string): Promise<void> {
    await this.database.deleteOAuthState(state);
  }

  /**
   * Save connection
   */
  protected async saveConnection(
    userId: string,
    connection: PlatformConnection
  ): Promise<void> {
    await this.database.saveConnection(userId, this.platform, connection);
  }
}

