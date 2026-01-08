import { PlatformHandler } from "./base";
import { ThreadsConnection, PostOptions, PostResult } from "../types";
import { DatabaseAdapter } from "../adapters/base";
import { isVideoFile, isImageFile } from "../utils/media";

const THREADS_API_BASE_URL = "https://graph.threads.net/v1.0";

export class ThreadsHandler implements PlatformHandler {
  async sendPost(
    userId: string,
    connection: ThreadsConnection,
    options: PostOptions,
    database: DatabaseAdapter
  ): Promise<PostResult> {
    if (!connection.accessToken) {
      throw new Error("Missing Threads accessToken");
    }
    if (!connection.threadsUserId) {
      throw new Error(
        "Missing Threads userId. Ensure this is stored upon user connection."
      );
    }

    const accessToken = connection.accessToken;
    const threadsUserId = connection.threadsUserId;

    try {
      let mediaType: "TEXT" | "IMAGE" | "VIDEO";
      let createContainerPayload: any = {
        access_token: accessToken,
      };

      if (options.mediaUrl) {
        if (isImageFile(options.mediaUrl)) {
          mediaType = "IMAGE";
          createContainerPayload.image_url = options.mediaUrl;
        } else if (isVideoFile(options.mediaUrl)) {
          mediaType = "VIDEO";
          createContainerPayload.video_url = options.mediaUrl;
        } else {
          mediaType = "TEXT";
        }
      } else {
        mediaType = "TEXT";
      }

      createContainerPayload.media_type = mediaType;
      if (options.text) {
        createContainerPayload.text = options.text;
      }

      const createContainerResponse = await fetch(
        `${THREADS_API_BASE_URL}/${threadsUserId}/threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams(createContainerPayload).toString(),
        }
      );

      if (!createContainerResponse.ok) {
        const errorBody = await createContainerResponse.text();
        await database.updateConnection(userId, "threads", {
          isValid: false,
          needsReconnection: true,
        });
        return {
          platform: "threads",
          success: false,
          error: `Threads API Error (create container): ${createContainerResponse.status} - ${createContainerResponse.statusText} - ${errorBody}`,
        };
      }

      const containerResult = await createContainerResponse.json() as { id: string };
      const mediaContainerId = containerResult.id;

      // Wait 30 seconds before publishing (Threads recommendation)
      await new Promise((resolve) => setTimeout(resolve, 30000));

      // Publish the post
      const publishResponse = await fetch(
        `${THREADS_API_BASE_URL}/${threadsUserId}/threads_publish`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            access_token: accessToken,
            creation_id: mediaContainerId,
          }).toString(),
        }
      );

      if (!publishResponse.ok) {
        const errorBody = await publishResponse.text();
        await database.updateConnection(userId, "threads", {
          isValid: false,
          needsReconnection: true,
        });
        return {
          platform: "threads",
          success: false,
          error: `Threads API Error (publish): ${publishResponse.status} - ${publishResponse.statusText} - ${errorBody}`,
        };
      }

      const publishResult = await publishResponse.json() as { id: string };
      const threadId = publishResult.id;

      await database.updateConnection(userId, "threads", {
        isValid: true,
        needsReconnection: false,
        lastValidated: new Date(),
      });

      return {
        platform: "threads",
        success: true,
        result: { id: threadId },
      };
    } catch (error: any) {
      await database.updateConnection(userId, "threads", {
        isValid: false,
        needsReconnection: true,
      });

      return {
        platform: "threads",
        success: false,
        error: error.message || "Unknown Threads error",
      };
    }
  }
}

