import { TwitterApi, ApiResponseError } from "twitter-api-v2";
import { PlatformHandler } from "./base";
import { TwitterConnection, PostOptions, PostResult } from "../types";
import { DatabaseAdapter } from "../adapters/base";
import { downloadMedia, getTwitterMediaTypeCategory } from "../utils/media";
import { isTokenExpired, isAuthError } from "../utils/security";
import { TwitterConnectionProvider } from "../connections/twitter";

const REFRESH_BUFFER_SECONDS = 300;

export class TwitterHandler implements PlatformHandler {
  private connectionProvider: TwitterConnectionProvider;

  constructor(connectionProvider: TwitterConnectionProvider) {
    this.connectionProvider = connectionProvider;
  }

  async sendPost(
    userId: string,
    connection: TwitterConnection,
    options: PostOptions,
    database: DatabaseAdapter
  ): Promise<PostResult> {
    if (!connection.accessToken) {
      throw new Error("Missing Twitter accessToken");
    }

    let twitterConn = connection;
    const now = Date.now();

    // Proactive Token Refresh Check
    let needsRefresh = false;
    if (!twitterConn.expiresAt) {
      needsRefresh = true;
    } else {
      const expiryTime =
        twitterConn.expiresAt instanceof Date
          ? twitterConn.expiresAt.getTime()
          : (twitterConn.expiresAt as any).toMillis?.() ||
            (twitterConn.expiresAt as any);
      const refreshThreshold = now + REFRESH_BUFFER_SECONDS * 1000;
      if (expiryTime <= refreshThreshold) {
        needsRefresh = true;
      }
    }

    if (needsRefresh) {
      try {
        twitterConn = await this.connectionProvider.refreshToken(twitterConn);
      } catch (refreshError: any) {
        await database.updateConnection(userId, "twitter", {
          isValid: false,
          needsReconnection: true,
        });
        throw new Error(`Twitter token refresh failed: ${refreshError.message}`);
      }
    }

    if (!twitterConn.accessToken) {
      throw new Error("Missing Twitter accessToken");
    }

    let twitterClient = new TwitterApi(twitterConn.accessToken);
    let mediaUploadId: string | null = null;

    // Media Upload (Twitter V2)
    if (options.mediaUrl) {
      try {
        const { buffer: mediaBuffer, mimeType } = await downloadMedia(
          "twitter",
          options.mediaUrl
        );

        if (!mimeType) {
          throw new Error("Could not determine media MIME type");
        }

        const { media_type, media_category } =
          getTwitterMediaTypeCategory(mimeType);

        const uploadResult = await twitterClient.v2.uploadMedia(mediaBuffer, {
          media_type: media_type,
          media_category: media_category,
          additional_owners: [twitterConn.twitterUserId],
        });
        mediaUploadId = uploadResult;
      } catch (mediaError: any) {
        // Continue without media if upload fails
        console.warn("Twitter media upload failed:", mediaError);
      }
    }

    // Send Tweet
    const tweetOptions: any = mediaUploadId
      ? { media: { media_ids: [mediaUploadId] } }
      : {};

    try {
      const result = await twitterClient.v2.tweet(options.text, tweetOptions);

      // Mark connection as valid after successful use
      await database.updateConnection(userId, "twitter", {
        isValid: true,
        needsReconnection: false,
        lastValidated: new Date(),
      });

      return {
        platform: "twitter",
        success: true,
        result: { id: result.data.id, tweetId: result.data.id },
      };
    } catch (tweetError: any) {
      // Reactive Refresh Logic (Fallback)
      const isAuthErrorTwitter =
        tweetError instanceof ApiResponseError &&
        (tweetError.code === 401 || tweetError.code === 403);

      if (isAuthErrorTwitter && !needsRefresh) {
        try {
          twitterConn = await this.connectionProvider.refreshToken(twitterConn);
          twitterClient = new TwitterApi(twitterConn.accessToken);
          const result = await twitterClient.v2.tweet(
            options.text,
            tweetOptions
          );

          await database.updateConnection(userId, "twitter", {
            isValid: true,
            needsReconnection: false,
            lastValidated: new Date(),
          });

          return {
            platform: "twitter",
            success: true,
            result: { id: result.data.id, tweetId: result.data.id },
          };
        } catch (refreshOrRetryError: any) {
          await database.updateConnection(userId, "twitter", {
            isValid: false,
            needsReconnection: true,
          });
          return {
            platform: "twitter",
            success: false,
            error: `Twitter reactive refresh/retry failed: ${refreshOrRetryError.message}`,
          };
        }
      } else {
        // Mark connection invalid if auth error
        if (isAuthErrorTwitter) {
          await database.updateConnection(userId, "twitter", {
            isValid: false,
            needsReconnection: true,
          });
        }
        return {
          platform: "twitter",
          success: false,
          error: tweetError.message || "Unknown Twitter Error",
        };
      }
    }
  }
}

