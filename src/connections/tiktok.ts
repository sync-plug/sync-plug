import axios from "axios";
import { BaseConnectionProvider } from "./base";
import { TikTokConnection, OAuthState } from "../types";
import { generateId, generateCodeVerifier, generateCodeChallenge } from "../utils/security";
import { DatabaseAdapter } from "../adapters/base";

export interface TikTokConfig {
  clientKey: string;
  clientSecret: string;
}

const TIKTOK_API_BASE_URL = "https://open.tiktokapis.com/v2";

export class TikTokConnectionProvider extends BaseConnectionProvider {
  private config: TikTokConfig;

  constructor(database: DatabaseAdapter, config: TikTokConfig) {
    super(database, "tiktok");
    this.config = config;
  }

  async initiateAuth(
    userId: string,
    redirectUri: string
  ): Promise<{ authUrl: string; state: string }> {
    if (!this.config.clientKey || !this.config.clientSecret) {
      throw new Error("TikTok Client Key/Secret not configured");
    }

    const state = generateId();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const url = `https://www.tiktok.com/v2/auth/authorize/?client_key=${encodeURIComponent(
      this.config.clientKey
    )}&scope=user.info.basic,video.upload,video.publish&response_type=code&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

    const stateData: OAuthState = {
      uid: userId,
      codeVerifier,
      state,
      createdAt: new Date(),
    };

    await this.saveOAuthState(state, stateData);

    return { authUrl: url, state };
  }

  async handleCallback(
    code: string,
    state: string,
    redirectUri: string
  ): Promise<TikTokConnection> {
    if (!this.config.clientKey || !this.config.clientSecret) {
      throw new Error("TikTok Client Key/Secret not configured");
    }

    const storedState = await this.getOAuthState(state);
    if (!storedState) {
      throw new Error("Invalid or expired state parameter");
    }

    const { uid, codeVerifier } = storedState;
    await this.deleteOAuthState(state);

    const payload = new URLSearchParams({
      client_key: this.config.clientKey,
      client_secret: this.config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });

    const tokenRes = await axios.post(
      `${TIKTOK_API_BASE_URL}/oauth/token/`,
      payload.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const { access_token, refresh_token, expires_in, scope } = tokenRes.data;

    // Fetch user info
    const userRes = await axios.get(
      `${TIKTOK_API_BASE_URL}/user/info/?fields=open_id,display_name,username,avatar_url,follower_count`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    const user = userRes.data.data.user;

    const expiresAt = new Date(Date.now() + expires_in * 1000);

    const connection: TikTokConnection = {
      uid,
      tiktokUserId: user.open_id,
      displayName: user.display_name,
      platform: "tiktok",
      authVersion: "oauth2",
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt,
      scopes: scope.split(","),
      lastValidated: new Date(),
      isValid: true,
      needsReconnection: false,
    };

    await this.saveConnection(uid, connection);

    return connection;
  }

  async refreshToken(
    connection: TikTokConnection
  ): Promise<TikTokConnection> {
    if (!this.config.clientKey || !this.config.clientSecret) {
      throw new Error("TikTok Client Key/Secret not configured");
    }

    if (!connection.refreshToken) {
      throw new Error("Cannot refresh: Missing TikTok refresh token");
    }

    const payload = new URLSearchParams({
      client_key: this.config.clientKey,
      client_secret: this.config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: connection.refreshToken,
    });

    const tokenRes = await axios.post(
      `${TIKTOK_API_BASE_URL}/oauth/token/`,
      payload.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const {
      access_token,
      refresh_token: newRefreshToken,
      expires_in,
      scope,
    } = tokenRes.data;

    const expiresAt = new Date(Date.now() + expires_in * 1000);

    const updated: TikTokConnection = {
      ...connection,
      accessToken: access_token,
      refreshToken: newRefreshToken ?? connection.refreshToken,
      expiresAt,
      scopes: scope.split(","),
      lastValidated: new Date(),
      isValid: true,
      needsReconnection: false,
    };

    await this.database.updateConnection(connection.uid, "tiktok", updated);

    return updated;
  }
}

