import fs from "fs";
import os from "os";
import path from "path";
import axios from "axios";
import { PlatformHandler } from "./base";
import { TikTokConnection, PostOptions, PostResult } from "../types";
import { DatabaseAdapter } from "../adapters/base";
import { isVideoFile } from "../utils/media";
import { isTokenExpired } from "../utils/security";
import { TikTokConnectionProvider } from "../connections/tiktok";

const TIKTOK_API_BASE_URL = "https://open.tiktokapis.com/v2";
const MIN_CHUNK_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_CHUNK_SIZE_BYTES = 64 * 1024 * 1024; // 64MB
const DEFAULT_CHUNK_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export class TikTokHandler implements PlatformHandler {
  private connectionProvider: TikTokConnectionProvider;

  constructor(connectionProvider: TikTokConnectionProvider) {
    this.connectionProvider = connectionProvider;
  }

  async sendPost(
    userId: string,
    connection: TikTokConnection,
    options: PostOptions,
    database: DatabaseAdapter
  ): Promise<PostResult> {
    if (!connection.accessToken) {
      throw new Error("Missing TikTok accessToken");
    }

    if (!options.mediaUrl) {
      throw new Error("Missing mediaUrl for TikTok post");
    }

    let tiktokConn = connection;

    // Check if token is expired and refresh if needed
    if (isTokenExpired(tiktokConn.accessToken)) {
      try {
        tiktokConn = await this.connectionProvider.refreshToken(tiktokConn);
      } catch (refreshError: any) {
        await database.updateConnection(userId, "tiktok", {
          isValid: false,
          needsReconnection: true,
        });
        throw new Error(
          `TikTok token refresh failed: ${refreshError.message}`
        );
      }
    }

    let filePath: string | null = null;
    let publishId: string | null = null;

    try {
      const isVideoCandidate = isVideoFile(options.mediaUrl);

      if (isVideoCandidate) {
        filePath = await this.downloadFileFromUrl(options.mediaUrl);
        const fileStats = fs.statSync(filePath);
        const fileSize = fileStats.size;

        if (!isVideoFile(filePath)) {
          this.cleanupTempFile(filePath);
          filePath = null;
        } else {
          publishId = await this.handleVideoUpload(
            filePath,
            fileSize,
            options.text,
            tiktokConn
          );
        }
      }

      if (!publishId) {
        // Photo upload
        publishId = await this.handlePhotoUpload(
          options.mediaUrl,
          options.text,
          tiktokConn
        );
      }

      if (!publishId) {
        throw new Error(
          "TikTok publish_id was not received after media handling."
        );
      }

      await database.updateConnection(userId, "tiktok", {
        isValid: true,
        needsReconnection: false,
        lastValidated: new Date(),
      });

      return {
        platform: "tiktok",
        success: true,
        result: { publish_id: publishId },
      };
    } catch (error: any) {
      await database.updateConnection(userId, "tiktok", {
        isValid: false,
        needsReconnection: true,
      });

      return {
        platform: "tiktok",
        success: false,
        error:
          error.response?.data?.error?.message ||
          error.message ||
          "Unknown TikTok Error",
      };
    } finally {
      if (filePath) {
        this.cleanupTempFile(filePath);
      }
    }
  }

  private async handleVideoUpload(
    filePath: string,
    fileSize: number,
    text: string,
    credentials: TikTokConnection
  ): Promise<string> {
    let effectiveChunkSize: number;
    let totalChunks: number;

    if (fileSize < MIN_CHUNK_SIZE_BYTES) {
      effectiveChunkSize = fileSize;
      totalChunks = 1;
    } else if (fileSize <= MAX_CHUNK_SIZE_BYTES) {
      effectiveChunkSize = fileSize;
      totalChunks = 1;
    } else {
      effectiveChunkSize = DEFAULT_CHUNK_SIZE_BYTES;
      totalChunks = Math.ceil(fileSize / effectiveChunkSize);
      if (totalChunks > 1000) {
        effectiveChunkSize = Math.ceil(fileSize / 1000);
        effectiveChunkSize = Math.max(
          effectiveChunkSize,
          MIN_CHUNK_SIZE_BYTES
        );
        effectiveChunkSize = Math.min(
          effectiveChunkSize,
          MAX_CHUNK_SIZE_BYTES
        );
        totalChunks = Math.ceil(fileSize / effectiveChunkSize);
      }
    }

    const { publish_id, upload_url } = await this.initVideoUpload(
      credentials.accessToken,
      fileSize,
      effectiveChunkSize,
      totalChunks
    );

    const fileStream = fs.createReadStream(filePath, {
      highWaterMark: effectiveChunkSize,
    });

    let chunkIndex = 0;
    let bytesUploaded = 0;
    for await (const chunk of fileStream) {
      const start = bytesUploaded;
      const end = bytesUploaded + chunk.length - 1;

      await this.putVideoChunk(
        upload_url,
        chunk,
        start,
        end,
        fileSize
      );

      chunkIndex++;
      bytesUploaded += chunk.length;
    }

    const postInfo = {
      title: text.substring(0, Math.min(text.length, 90)) || "New Video Post",
      description:
        text.substring(0, Math.min(text.length, 4000)) || "",
      privacy_level: "PUBLIC_TO_EVERYONE",
    };

    await this.publishVideoPost(
      credentials.accessToken,
      publish_id,
      postInfo
    );

    return publish_id;
  }

  private async handlePhotoUpload(
    mediaUrl: string,
    text: string,
    credentials: TikTokConnection
  ): Promise<string> {
    const { publish_id } = await this.initPhotoUpload(
      credentials.accessToken,
      mediaUrl,
      text
    );

    await this.publishPhotoPost(credentials.accessToken, publish_id);

    return publish_id;
  }

  private async initVideoUpload(
    accessToken: string,
    videoSize: number,
    chunkSize: number,
    totalChunkCount: number
  ): Promise<{ publish_id: string; upload_url: string }> {
    const response = await axios.post(
      `${TIKTOK_API_BASE_URL}/post/publish/inbox/video/init/`,
      {
        source_info: {
          source: "FILE_UPLOAD",
          video_size: videoSize,
          chunk_size: chunkSize,
          total_chunk_count: totalChunkCount,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.data?.data) {
      throw new Error("TikTok init video upload response missing data.");
    }

    const { publish_id, upload_url } = response.data.data;
    if (!publish_id || !upload_url) {
      throw new Error(
        "TikTok init video upload response missing publish_id or upload_url."
      );
    }

    return { publish_id, upload_url };
  }

  private async putVideoChunk(
    uploadUrl: string,
    chunk: Buffer,
    startByte: number,
    endByte: number,
    totalFileSize: number
  ): Promise<void> {
    await axios.put(uploadUrl, chunk, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": chunk.length.toString(),
        "Content-Range": `bytes ${startByte}-${endByte}/${totalFileSize}`,
      },
    });
  }

  private async publishVideoPost(
    accessToken: string,
    publishId: string,
    postInfo: { title: string; description: string; privacy_level: string }
  ): Promise<void> {
    await axios.post(
      `${TIKTOK_API_BASE_URL}/post/publish/video/publish/`,
      {
        publish_id: publishId,
        post_info: postInfo,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
  }

  private async initPhotoUpload(
    accessToken: string,
    mediaUrl: string,
    text: string
  ): Promise<{ publish_id: string }> {
    const title = text.substring(0, Math.min(text.length, 90)) || "";
    const description = text.substring(0, Math.min(text.length, 4000)) || "";

    const response = await axios.post(
      `${TIKTOK_API_BASE_URL}/post/publish/content/init/`,
      {
        media_type: "PHOTO",
        post_mode: "MEDIA_UPLOAD",
        post_info: {
          title: title,
          description: description,
          privacy_level: "SELF_ONLY",
        },
        source_info: {
          source: "PULL_FROM_URL",
          photo_images: [mediaUrl],
          photo_cover_index: 0,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.data?.data) {
      throw new Error("TikTok init photo upload response missing data.");
    }

    const { publish_id } = response.data.data;
    if (!publish_id) {
      throw new Error(
        "TikTok init photo upload response missing publish_id."
      );
    }

    return { publish_id };
  }

  private async publishPhotoPost(
    accessToken: string,
    publishId: string
  ): Promise<void> {
    await axios.post(
      `${TIKTOK_API_BASE_URL}/post/publish/content/publish/`,
      { publish_id: publishId },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );
  }

  private async downloadFileFromUrl(fileUrl: string): Promise<string> {
    const parsedUrl = new URL(fileUrl);
    const fileName = path.basename(parsedUrl.pathname);
    const tempFilePath = path.join(os.tmpdir(), fileName);

    const response = await axios({
      method: "GET",
      url: fileUrl,
      responseType: "stream",
    });

    const writer = fs.createWriteStream(tempFilePath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on("finish", () => resolve(tempFilePath));
      writer.on("error", reject);
    });
  }

  private cleanupTempFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

