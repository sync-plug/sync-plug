import { BaseConnectionProvider } from "./base";
import { ThreadsConnection, OAuthState } from "../types";
import { generateState } from "../utils/security";
import { DatabaseAdapter } from "../adapters/base";

export interface ThreadsConfig {
  clientId: string;
  clientSecret: string;
}

const THREADS_API_BASE_URL = "https://threads.net";
const THREADS_GRAPH_API_BASE_URL = "https://graph.threads.net";

export class ThreadsConnectionProvider extends BaseConnectionProvider {
  private config: ThreadsConfig;

  constructor(database: DatabaseAdapter, config: ThreadsConfig) {
    super(database, "threads");
    this.config = config;
  }

  async initiateAuth(
    userId: string,
    redirectUri: string
  ): Promise<{ authUrl: string; state: string }> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error("Threads Client ID/Secret not configured");
    }

    const state = generateState();

    const stateData: OAuthState = {
      uid: userId,
      state: state,
      createdAt: new Date(),
      codeVerifier: "", // Threads doesn't use PKCE
    };

    await this.saveOAuthState(state, stateData);

    const authUrl = new URL(`${THREADS_API_BASE_URL}/oauth/authorize`);
    authUrl.searchParams.append("client_id", this.config.clientId);
    authUrl.searchParams.append("redirect_uri", redirectUri);
    authUrl.searchParams.append(
      "scope",
      "threads_content_publish,threads_basic"
    );
    authUrl.searchParams.append("response_type", "code");
    authUrl.searchParams.append("state", state);

    return { authUrl: authUrl.toString(), state };
  }

  async handleCallback(
    code: string,
    state: string,
    redirectUri: string
  ): Promise<ThreadsConnection> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error("Threads Client ID/Secret not configured");
    }

    const storedState = await this.getOAuthState(state);
    if (!storedState) {
      throw new Error("Invalid or expired state parameter");
    }

    const { uid } = storedState;
    await this.deleteOAuthState(state);

    // Exchange code for token
    const tokenResponse = await fetch(
      `${THREADS_GRAPH_API_BASE_URL}/oauth/access_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code: code,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(
        `Failed to exchange code for token: ${tokenResponse.status} - ${errorText}`
      );
    }

    const tokenData = await tokenResponse.json() as {
      access_token: string;
      expires_in?: number;
    };
    const { access_token, expires_in } = tokenData;

    // Get user ID
    const userResponse = await fetch(
      `${THREADS_GRAPH_API_BASE_URL}/me?access_token=${access_token}`
    );

    if (!userResponse.ok) {
      throw new Error("Failed to fetch Threads user info");
    }

    const userData = await userResponse.json() as { id: string };
    const threadsUserId = userData.id;

    const expiresAt = expires_in
      ? new Date(Date.now() + expires_in * 1000)
      : undefined;

    const connection: ThreadsConnection = {
      uid: uid,
      threadsUserId: threadsUserId,
      platform: "threads",
      accessToken: access_token,
      expiresAt: expiresAt,
      isValid: true,
      needsReconnection: false,
      lastValidated: new Date(),
    };

    await this.saveConnection(uid, connection);

    return connection;
  }

  async refreshToken(
    connection: ThreadsConnection
  ): Promise<ThreadsConnection> {
    // Threads tokens are long-lived, but if refresh is needed, it would go here
    // For now, just return the connection as-is
    return connection;
  }
}

