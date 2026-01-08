import { TwitterApi } from "twitter-api-v2";
import { BaseConnectionProvider } from "./base";
import { TwitterConnection, OAuthState } from "../types";
import { generateId } from "../utils/security";
import { DatabaseAdapter } from "../adapters/base";

export interface TwitterConfig {
  clientId: string;
  clientSecret: string;
}

export class TwitterConnectionProvider extends BaseConnectionProvider {
  private config: TwitterConfig;

  constructor(database: DatabaseAdapter, config: TwitterConfig) {
    super(database, "twitter");
    this.config = config;
  }

  async initiateAuth(
    userId: string,
    redirectUri: string
  ): Promise<{ authUrl: string; state: string }> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error("Twitter Client ID/Secret not configured");
    }

    const client = new TwitterApi({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
    });

    const state = generateId();
    const { url, codeVerifier } = client.generateOAuth2AuthLink(redirectUri, {
      scope: [
        "tweet.read",
        "tweet.write",
        "users.read",
        "offline.access",
      ],
      state: state,
    });

    const stateData: OAuthState = {
      uid: userId,
      codeVerifier: codeVerifier,
      state: state,
      createdAt: new Date(),
    };

    await this.saveOAuthState(state, stateData);

    return { authUrl: url, state };
  }

  async handleCallback(
    code: string,
    state: string,
    redirectUri: string
  ): Promise<TwitterConnection> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error("Twitter Client ID/Secret not configured");
    }

    const storedState = await this.getOAuthState(state);
    if (!storedState) {
      throw new Error("Invalid or expired state parameter");
    }

    const { uid, codeVerifier } = storedState;
    await this.deleteOAuthState(state);

    const client = new TwitterApi({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
    });

    const {
      client: userClient,
      accessToken,
      refreshToken,
      expiresIn,
      scope: grantedScopes,
    } = await client.loginWithOAuth2({
      code,
      codeVerifier,
      redirectUri,
    });

    const { data: userObject } = await userClient.v2.me({
      "user.fields": ["id", "username"],
    });

    if (!userObject) {
      throw new Error("Failed to fetch user details from Twitter");
    }

    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    const connection: TwitterConnection = {
      uid: uid,
      twitterUserId: userObject.id,
      screenName: userObject.username,
      platform: "twitter",
      authVersion: "oauth2",
      accessToken: accessToken,
      refreshToken: refreshToken!,
      expiresAt: expiresAt,
      scopes: grantedScopes,
      lastValidated: new Date(),
      isValid: true,
      needsReconnection: false,
    };

    await this.saveConnection(uid, connection);

    return connection;
  }

  async refreshToken(
    connection: TwitterConnection
  ): Promise<TwitterConnection> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error("Twitter Client ID/Secret not configured");
    }

    const twitterConn = connection as TwitterConnection;
    if (!twitterConn.refreshToken) {
      throw new Error("Cannot refresh: Missing Twitter refresh token");
    }

    const client = new TwitterApi({
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
    });

    const {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn,
    } = await client.refreshOAuth2Token(twitterConn.refreshToken);

    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    const updated: TwitterConnection = {
      ...twitterConn,
      accessToken: accessToken,
      refreshToken: newRefreshToken ?? twitterConn.refreshToken,
      expiresAt: expiresAt,
      lastValidated: new Date(),
      isValid: true,
      needsReconnection: false,
    };

    await this.database.updateConnection(twitterConn.uid, "twitter", updated);

    return updated;
  }
}

