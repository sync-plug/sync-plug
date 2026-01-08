import axios from "axios";
import { BaseConnectionProvider } from "./base";
import { LinkedInConnection, OAuthState } from "../types";
import { generateId } from "../utils/security";
import { DatabaseAdapter } from "../adapters/base";

export interface LinkedInConfig {
  clientId: string;
  clientSecret: string;
}

const LINKEDIN_API_BASE_URL = "https://api.linkedin.com/v2";

export class LinkedInConnectionProvider extends BaseConnectionProvider {
  private config: LinkedInConfig;

  constructor(database: DatabaseAdapter, config: LinkedInConfig) {
    super(database, "linkedin");
    this.config = config;
  }

  async initiateAuth(
    userId: string,
    redirectUri: string
  ): Promise<{ authUrl: string; state: string }> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error("LinkedIn Client ID/Secret not configured");
    }

    const state = generateId();
    const authorizationUrl = new URL(
      "https://www.linkedin.com/oauth/v2/authorization"
    );
    authorizationUrl.searchParams.append("response_type", "code");
    authorizationUrl.searchParams.append("client_id", this.config.clientId);
    authorizationUrl.searchParams.append("redirect_uri", redirectUri);
    authorizationUrl.searchParams.append("state", state);
    authorizationUrl.searchParams.append(
      "scope",
      "openid profile email w_member_social"
    );

    const stateData: OAuthState = {
      uid: userId,
      state: state,
      createdAt: new Date(),
      codeVerifier: "", // LinkedIn doesn't use PKCE
    };

    await this.saveOAuthState(state, stateData);

    return { authUrl: authorizationUrl.toString(), state };
  }

  async handleCallback(
    code: string,
    state: string,
    redirectUri: string
  ): Promise<LinkedInConnection> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error("LinkedIn Client ID/Secret not configured");
    }

    const storedState = await this.getOAuthState(state);
    if (!storedState) {
      throw new Error("Invalid or expired state parameter");
    }

    const { uid } = storedState;
    await this.deleteOAuthState(state);

    const tokenResponse = await axios.post(
      "https://www.linkedin.com/oauth/v2/accessToken",
      new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: redirectUri,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const { access_token, expires_in, id_token, refresh_token } =
      tokenResponse.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Fetch user profile information
    const profileResponse = await axios.get(
      `${LINKEDIN_API_BASE_URL}/userinfo`,
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    const { sub } = profileResponse.data;

    const connection: LinkedInConnection = {
      uid: uid,
      linkedInUserId: sub,
      platform: "linkedin",
      authVersion: "oauth2",
      accessToken: access_token,
      refreshToken: refresh_token ? refresh_token : null,
      idToken: id_token,
      expiresAt: expiresAt,
      lastValidated: new Date(),
      isValid: true,
      needsReconnection: false,
    };

    await this.saveConnection(uid, connection);

    return connection;
  }

  async refreshToken(
    connection: LinkedInConnection
  ): Promise<LinkedInConnection> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error("LinkedIn Client ID/Secret not configured");
    }

    if (!connection.refreshToken) {
      throw new Error("Cannot refresh: Missing LinkedIn refresh token");
    }

    const tokenResponse = await axios.post(
      "https://www.linkedin.com/oauth/v2/accessToken",
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: connection.refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const {
      access_token,
      expires_in,
      refresh_token: newRefreshToken,
    } = tokenResponse.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    const updated: LinkedInConnection = {
      ...connection,
      accessToken: access_token,
      refreshToken: newRefreshToken ?? connection.refreshToken,
      expiresAt: expiresAt,
      lastValidated: new Date(),
      isValid: true,
      needsReconnection: false,
    };

    await this.database.updateConnection(connection.uid, "linkedin", updated);

    return updated;
  }
}

