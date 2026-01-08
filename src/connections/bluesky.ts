import { AtpAgent, AtpSessionData } from "@atproto/api";
import { BaseConnectionProvider } from "./base";
import { BlueskyConnection } from "../types";

const BLUESKY_SERVICE = "https://bsky.social";

export interface BlueskyAuthOptions {
  handle: string;
  password: string;
  authFactorToken?: string; // For 2FA
}

export class BlueskyConnectionProvider extends BaseConnectionProvider {
  async initiateAuth(
    userId: string,
    redirectUri: string
  ): Promise<{ authUrl: string; state: string }> {
    // Bluesky uses handle/password auth, not OAuth
    // This method is not used for Bluesky
    throw new Error(
      "Bluesky uses handle/password authentication. Use connect() method instead."
    );
  }

  /**
   * Connect to Bluesky using handle and password
   */
  async connect(
    userId: string,
    options: BlueskyAuthOptions
  ): Promise<BlueskyConnection> {
    const agent = new AtpAgent({ service: BLUESKY_SERVICE });

    let response: any;
    try {
      if (options.authFactorToken) {
        response = await agent.login({
          identifier: options.handle,
          password: options.password,
          authFactorToken: options.authFactorToken,
        });
      } else {
        response = await agent.login({
          identifier: options.handle,
          password: options.password,
        });
      }
    } catch (loginError: any) {
      if (
        loginError.message &&
        loginError.message.includes(
          "A sign in code has been sent to your email address"
        )
      ) {
        throw new Error("authFactorToken required");
      }
      throw new Error(
        `Bluesky authentication failed: ${loginError.message || "Unknown error"}`
      );
    }

    if (!response.success) {
      throw new Error("Invalid Bluesky credentials");
    }

    // Fetch profile information
    let profileData = null;
    try {
      const profileResponse = await fetch(
        `https://bsky.social/xrpc/app.bsky.actor.getProfile?actor=${response.data.handle}`,
        {
          headers: {
            Authorization: `Bearer ${response.data.accessJwt}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (profileResponse.ok) {
        profileData = await profileResponse.json();
      }
    } catch (error) {
      // Continue without profile data
    }

    const connection: BlueskyConnection = {
      uid: userId,
      handle: response.data.handle,
      accessJwt: response.data.accessJwt,
      refreshJwt: response.data.refreshJwt,
      did: response.data.did,
      platform: "bluesky",
      lastValidated: new Date(),
      isValid: true,
      needsReconnection: false,
    };

    await this.saveConnection(userId, connection);

    return connection;
  }

  async handleCallback(
    code: string,
    state: string,
    redirectUri: string
  ): Promise<BlueskyConnection> {
    throw new Error("Bluesky does not use OAuth callbacks");
  }

  async refreshToken(
    connection: BlueskyConnection
  ): Promise<BlueskyConnection> {
    if (!connection.refreshJwt) {
      throw new Error("Cannot refresh: Missing Bluesky refresh token");
    }

    const refreshUrl = `${BLUESKY_SERVICE}/xrpc/com.atproto.server.refreshSession`;

    const response = await fetch(refreshUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.refreshJwt}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData: any = {};
      try {
        errorData = JSON.parse(errorText);
      } catch {
        // If not JSON, use the text as-is
      }

      if (
        errorData.error === "ExpiredToken" ||
        errorData.error === "InvalidToken"
      ) {
        await this.database.updateConnection(connection.uid, "bluesky", {
          isValid: false,
          needsReconnection: true,
        });
      }

      throw new Error(
        `Failed to refresh Bluesky session: ${response.status} - ${errorText}`
      );
    }

    const refreshData = await response.json() as {
      accessJwt: string;
      refreshJwt: string;
      handle: string;
      did: string;
    };

    const updated: BlueskyConnection = {
      ...connection,
      accessJwt: refreshData.accessJwt,
      refreshJwt: refreshData.refreshJwt,
      handle: refreshData.handle,
      did: refreshData.did,
      lastValidated: new Date(),
      isValid: true,
      needsReconnection: false,
    };

    await this.database.updateConnection(connection.uid, "bluesky", updated);

    return updated;
  }
}

