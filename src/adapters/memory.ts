import { DatabaseAdapter } from "./base";
import { PlatformConnection, OAuthState, Platform } from "../types";

/**
 * In-memory implementation of DatabaseAdapter for testing
 */
export class MemoryAdapter implements DatabaseAdapter {
  private connections: Map<string, PlatformConnection> = new Map();
  private oauthStates: Map<string, OAuthState> = new Map();

  private getKey(userId: string, platform: Platform): string {
    return `${userId}:${platform}`;
  }

  async saveConnection(
    userId: string,
    platform: Platform,
    connection: PlatformConnection
  ): Promise<void> {
    const key = this.getKey(userId, platform);
    this.connections.set(key, connection);
  }

  async getConnection(
    userId: string,
    platform: Platform
  ): Promise<PlatformConnection | null> {
    const key = this.getKey(userId, platform);
    return this.connections.get(key) || null;
  }

  async updateConnection(
    userId: string,
    platform: Platform,
    updates: Partial<PlatformConnection>
  ): Promise<void> {
    const key = this.getKey(userId, platform);
    const existing = this.connections.get(key);
    if (existing) {
      this.connections.set(key, { ...existing, ...updates } as PlatformConnection);
    }
  }

  async deleteConnection(userId: string, platform: Platform): Promise<void> {
    const key = this.getKey(userId, platform);
    this.connections.delete(key);
  }

  async getConnections(userId: string): Promise<PlatformConnection[]> {
    const connections: PlatformConnection[] = [];
    for (const [key, connection] of this.connections.entries()) {
      if (key.startsWith(`${userId}:`)) {
        connections.push(connection);
      }
    }
    return connections;
  }

  async saveOAuthState(state: string, data: OAuthState): Promise<void> {
    this.oauthStates.set(state, data);
  }

  async getOAuthState(state: string): Promise<OAuthState | null> {
    return this.oauthStates.get(state) || null;
  }

  async deleteOAuthState(state: string): Promise<void> {
    this.oauthStates.delete(state);
  }

  /**
   * Clear all data (useful for testing)
   */
  clear(): void {
    this.connections.clear();
    this.oauthStates.clear();
  }
}

