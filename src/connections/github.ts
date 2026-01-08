import { BaseConnectionProvider } from "./base";
import { GitHubConnection } from "../types";

export class GitHubConnectionProvider extends BaseConnectionProvider {
  /**
   * Connect to GitHub using Personal Access Token
   */
  async connect(userId: string, token: string): Promise<GitHubConnection> {
    // Validate token by fetching user info
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token.trim()}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          "Invalid token. Please check your GitHub Personal Access Token."
        );
      }
      throw new Error(
        `GitHub API error: ${response.status} - ${response.statusText}`
      );
    }

    const userData = await response.json() as {
      login?: string;
      id?: number;
      avatar_url?: string;
    };

    const connection: GitHubConnection = {
      uid: userId,
      token: token.trim(),
      username: userData.login || undefined,
      userId: userData.id?.toString() || undefined,
      avatar: userData.avatar_url || undefined,
      platform: "github",
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
    throw new Error("GitHub uses token authentication. Use connect() method instead.");
  }

  async handleCallback(
    code: string,
    state: string,
    redirectUri: string
  ): Promise<GitHubConnection> {
    throw new Error("GitHub does not use OAuth callbacks in this implementation");
  }

  async refreshToken(
    connection: GitHubConnection
  ): Promise<GitHubConnection> {
    // GitHub tokens don't expire automatically, just validate
    return connection;
  }
}

