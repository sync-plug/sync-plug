import axios from "axios";
import { PlatformHandler } from "./base";
import { LinkedInConnection, PostOptions, PostResult } from "../types";
import { DatabaseAdapter } from "../adapters/base";
import { isTokenExpired } from "../utils/security";
import { LinkedInConnectionProvider } from "../connections/linkedin";

const LINKEDIN_API_BASE_URL = "https://api.linkedin.com/v2";
const UPLOAD_MECHANISM = ["SYNCHRONOUS_UPLOAD"];

export class LinkedInHandler implements PlatformHandler {
  private connectionProvider: LinkedInConnectionProvider;

  constructor(connectionProvider: LinkedInConnectionProvider) {
    this.connectionProvider = connectionProvider;
  }

  async sendPost(
    userId: string,
    connection: LinkedInConnection,
    options: PostOptions,
    database: DatabaseAdapter
  ): Promise<PostResult> {
    if (!connection.accessToken) {
      throw new Error("Missing LinkedIn accessToken");
    }
    if (!connection.linkedInUserId) {
      throw new Error(
        "Missing LinkedIn memberId. Ensure this is stored upon user connection."
      );
    }

    let linkedinConn = connection;
    const accessToken = linkedinConn.accessToken;
    const memberUrn = `urn:li:person:${linkedinConn.linkedInUserId}`;

    // Check if token is expired and refresh if needed
    if (isTokenExpired(accessToken)) {
      try {
        linkedinConn = await this.connectionProvider.refreshToken(linkedinConn);
      } catch (refreshError: any) {
        await database.updateConnection(userId, "linkedin", {
          isValid: false,
          needsReconnection: true,
        });
        throw new Error(
          `LinkedIn token refresh failed: ${refreshError.message}`
        );
      }
    }

    // Prepare media if provided
    let mediaPayload: any[] = [];
    let shareCategory: "VIDEO" | "IMAGE" = "IMAGE";

    if (options.mediaUrl) {
      shareCategory = this.isVideo(options.mediaUrl) ? "VIDEO" : "IMAGE";

      try {
        // Step 1: Register upload
        const { uploadUrl, asset } = await this.registerUpload(
          memberUrn,
          shareCategory,
          linkedinConn.accessToken
        );

        // Step 2: Fetch binary and upload
        await this.uploadBinary(
          options.mediaUrl,
          uploadUrl,
          linkedinConn.accessToken
        );

        // Step 3: Prepare media object for UGC post
        mediaPayload = [
          {
            status: "READY",
            description: { text: options.mediaAltText || "" },
            media: asset,
            title: { text: options.mediaAltText || "" },
          },
        ];
      } catch (mediaError: any) {
        // Continue without media if upload fails
        console.warn("LinkedIn media upload failed:", mediaError);
      }
    }

    // Build UGC post body
    const postData = {
      author: memberUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: options.text },
          shareMediaCategory: shareCategory,
          media: mediaPayload,
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    };

    try {
      const response = await fetch(`${LINKEDIN_API_BASE_URL}/ugcPosts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
          Authorization: `Bearer ${linkedinConn.accessToken}`,
        },
        body: JSON.stringify(postData),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        await database.updateConnection(userId, "linkedin", {
          isValid: false,
          needsReconnection: true,
        });
        return {
          platform: "linkedin",
          success: false,
          error: `LinkedIn API Error: ${response.status} - ${response.statusText} - ${errorBody}`,
        };
      }

      const restLiId = response.headers.get("x-restli-id");

      await database.updateConnection(userId, "linkedin", {
        isValid: true,
        needsReconnection: false,
        lastValidated: new Date(),
      });

      return {
        platform: "linkedin",
        success: true,
        result: { id: restLiId || undefined },
      };
    } catch (error: any) {
      await database.updateConnection(userId, "linkedin", {
        isValid: false,
        needsReconnection: true,
      });
      return {
        platform: "linkedin",
        success: false,
        error: error.message || "Unknown LinkedIn error",
      };
    }
  }

  private isVideo(url: string): boolean {
    return /(\.mp4|\.mov|\.avi|\.webm)(\?|$)/i.test(url);
  }

  private async registerUpload(
    owner: string,
    category: "IMAGE" | "VIDEO",
    accessToken: string
  ): Promise<{ uploadUrl: string; asset: string }> {
    const recipe =
      category === "VIDEO"
        ? "urn:li:digitalmediaRecipe:feedshare-video"
        : "urn:li:digitalmediaRecipe:feedshare-image";
    const registerRequest = {
      registerUploadRequest: {
        owner,
        recipes: [recipe],
        serviceRelationships: [
          {
            relationshipType: "OWNER",
            identifier: "urn:li:userGeneratedContent",
          },
        ],
        supportedUploadMechanism: UPLOAD_MECHANISM,
      },
    };

    const res = await fetch(
      `${LINKEDIN_API_BASE_URL}/assets?action=registerUpload`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(registerRequest),
      }
    );
    const data = await res.json() as {
      value: {
        uploadMechanism: {
          "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
            uploadUrl: string;
          };
        };
        asset: string;
      };
    };
    const mech =
      data.value.uploadMechanism[
        "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
      ];
    return {
      uploadUrl: mech.uploadUrl,
      asset: data.value.asset,
    };
  }

  private async uploadBinary(
    fileUrl: string,
    uploadUrl: string,
    accessToken: string
  ): Promise<void> {
    const imageData = await axios.get<ArrayBuffer>(fileUrl, {
      responseType: "arraybuffer",
    });
    const contentType = imageData.headers["content-type"];

    await axios.put(uploadUrl, imageData.data, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": contentType,
      },
    });
  }
}

