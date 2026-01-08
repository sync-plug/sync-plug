import { PlatformConnection, OAuthState, Platform } from "../types";

/**
 * Database adapter interface for storing connections and OAuth state
 * This allows the library to work with any database implementation
 */
export interface DatabaseAdapter {
  /**
   * Save a platform connection for a user
   */
  saveConnection(
    userId: string,
    platform: Platform,
    connection: PlatformConnection
  ): Promise<void>;

  /**
   * Get a platform connection for a user
   */
  getConnection(
    userId: string,
    platform: Platform
  ): Promise<PlatformConnection | null>;

  /**
   * Update a platform connection
   */
  updateConnection(
    userId: string,
    platform: Platform,
    updates: Partial<PlatformConnection>
  ): Promise<void>;

  /**
   * Delete a platform connection
   */
  deleteConnection(userId: string, platform: Platform): Promise<void>;

  /**
   * Get all connections for a user
   */
  getConnections(userId: string): Promise<PlatformConnection[]>;

  /**
   * Save OAuth state for PKCE flow
   */
  saveOAuthState(state: string, data: OAuthState): Promise<void>;

  /**
   * Get OAuth state
   */
  getOAuthState(state: string): Promise<OAuthState | null>;

  /**
   * Delete OAuth state
   */
  deleteOAuthState(state: string): Promise<void>;
}

