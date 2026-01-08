import { BaseConnectionProvider } from "./base";
import { DevtoConnection } from "../types";

const DEVTO_API_BASE_URL = "https://dev.to/api";

export class DevtoConnectionProvider extends BaseConnectionProvider {
  /**
   * Connect to Dev.to using API key
   */
  async connect(
    userId: string,
    apiKey: string
  ): Promise<DevtoConnection> {
    // Validate API key by fetching user info
    const response = await fetch(`${DEVTO_API_BASE_URL}/users/me`, {
      method: "GET",
      headers: {
        "api-key": apiKey.trim(),
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error("Invalid API key. Please check your Dev.to API key.");
      }
      throw new Error(
        `Dev.to API error: ${response.status} - ${response.statusText}`
      );
    }

    const userData = await response.json() as {
      username?: string;
      name?: string;
    };

    const connection: DevtoConnection = {
      uid: userId,
      apiKey: apiKey.trim(),
      username: userData.username || userData.name || undefined,
      platform: "devto",
      isValid: true,
      needsReconnection: false,
      lastValidated: new Date(),
    };

    await this.saveConnection(userId, connection);

    return connection;
  }

  async initiateAuth(
    userId: string,
    redirectUri: string
  ): Promise<{ authUrl: string; state: string }> {
    throw new Error("Dev.to uses API key authentication. Use connect() method instead.");
  }

  async handleCallback(
    code: string,
    state: string,
    redirectUri: string
  ): Promise<DevtoConnection> {
    throw new Error("Dev.to does not use OAuth callbacks");
  }

  async refreshToken(
    connection: DevtoConnection
  ): Promise<DevtoConnection> {
    // Dev.to API keys don't expire, just validate
    return connection;
  }
}

