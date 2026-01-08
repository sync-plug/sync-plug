import {
  AppBskyEmbedVideo,
  AppBskyVideoDefs,
  AtpAgent,
  AtpSessionData,
  RichText,
} from "@atproto/api";
import { PlatformHandler } from "./base";
import { BlueskyConnection, PostOptions, PostResult } from "../types";
import { DatabaseAdapter } from "../adapters/base";
import { downloadMedia, getVideoDimensions, isVideoFile } from "../utils/media";
import { isTokenExpired, isAuthError } from "../utils/security";
import { BlueskyConnectionProvider } from "../connections/bluesky";

const BLUESKY_SERVICE = "https://bsky.social";
const BLUESKY_LIMIT_MB = 1;

// Upload video to Bluesky
async function uploadVideo(
  agent: AtpAgent,
  videoUrl: string
): Promise<AppBskyEmbedVideo.Main> {
  const { data: serviceAuth } = await agent.com.atproto.server.getServiceAuth({
    aud: `did:web:${agent.dispatchUrl.host}`,
    lxm: "com.atproto.repo.uploadBlob",
    exp: Date.now() / 1000 + 60 * 30, // 30 minutes
  });

  async function downloadVideo(
    url: string
  ): Promise<{ video: Buffer; size: number, arrayBuffer: ArrayBuffer }> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch video: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const video = Buffer.from(arrayBuffer);
    const size = video.length;
    return { video, size, arrayBuffer };
  }

  const videoInfo = await downloadVideo(videoUrl);
  const video = videoInfo.video;

  const uploadUrl = new URL(
    "https://video.bsky.app/xrpc/app.bsky.video.uploadVideo"
  );
  uploadUrl.searchParams.append("did", agent.session!.did);
  uploadUrl.searchParams.append("name", videoUrl.split("/").pop()!);

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceAuth.token}`,
      "Content-Type": "video/mp4",
      "Content-Length": videoInfo.size.toString(),
    },
    body: videoInfo.arrayBuffer,
  });

  const jobStatus = (await uploadResponse.json()) as AppBskyVideoDefs.JobStatus;
  let blob = jobStatus.blob;
  const videoAgent = new AtpAgent({ service: "https://video.bsky.app" });

  while (!blob) {
    const { data: status } = await videoAgent.app.bsky.video.getJobStatus({
      jobId: jobStatus.jobId,
    });
    if (status.jobStatus.blob) {
      blob = status.jobStatus.blob;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const { width, height } = (await getVideoDimensions(videoInfo.video)) as {
    width: number;
    height: number;
  };

  return {
    $type: "app.bsky.embed.video",
    video: blob,
    aspectRatio: { width, height },
  } satisfies AppBskyEmbedVideo.Main;
}

export class BlueskyHandler implements PlatformHandler {
  private connectionProvider: BlueskyConnectionProvider;

  constructor(connectionProvider: BlueskyConnectionProvider) {
    this.connectionProvider = connectionProvider;
  }

  async sendPost(
    userId: string,
    connection: BlueskyConnection,
    options: PostOptions,
    database: DatabaseAdapter
  ): Promise<PostResult> {
    if (
      !connection.handle ||
      !connection.did ||
      !connection.accessJwt ||
      !connection.refreshJwt
    ) {
      return {
        platform: "bluesky",
        success: false,
        error:
          "Missing required Bluesky credentials (handle, did, accessJwt, refreshJwt).",
      };
    }

    let bskyConn = connection;
    let agent = new AtpAgent({ service: BLUESKY_SERVICE });
    let sessionRefreshedProactively = false;

    // Resume session
    const sessionToResume: AtpSessionData = {
      handle: bskyConn.handle,
      did: bskyConn.did,
      accessJwt: bskyConn.accessJwt,
      refreshJwt: bskyConn.refreshJwt,
      active: true,
    };

    try {
      await agent.resumeSession(sessionToResume);
    } catch (resumeError: any) {
      // Session might be expired, try refresh
      if (isTokenExpired(bskyConn.accessJwt) || isAuthError("bluesky", resumeError)) {
        try {
          bskyConn = await this.connectionProvider.refreshToken(bskyConn);
          await agent.resumeSession({
            handle: bskyConn.handle,
            did: bskyConn.did,
            accessJwt: bskyConn.accessJwt,
            refreshJwt: bskyConn.refreshJwt,
            active: true,
          });
          sessionRefreshedProactively = true;
        } catch (refreshError: any) {
          await database.updateConnection(userId, "bluesky", {
            isValid: false,
            needsReconnection: true,
          });
          return {
            platform: "bluesky",
            success: false,
            error: `Bluesky session refresh failed: ${refreshError.message}`,
          };
        }
      } else {
        throw resumeError;
      }
    }

    // Handle media
    let bskyEmbed: any = null;

    if (options.mediaUrl) {
      const isVideo = isVideoFile(options.mediaUrl);
      try {
        if (isVideo) {
          if (!agent.session) {
            return {
              platform: "bluesky",
              success: false,
              error: "Bluesky agent session lost before video upload.",
            };
          }
          bskyEmbed = await uploadVideo(agent, options.mediaUrl);
        } else {
          const { buffer: mediaBuffer, mimeType } = await downloadMedia(
            "bluesky",
            options.mediaUrl
          );

          if (mediaBuffer.length > BLUESKY_LIMIT_MB * 1024 * 1024) {
            return {
              platform: "bluesky",
              success: false,
              error: `Bluesky media size (${(
                mediaBuffer.length /
                1024 /
                1024
              ).toFixed(2)} MB) exceeds ${BLUESKY_LIMIT_MB}MB limit.`,
            };
          }

          if (!agent.session) {
            return {
              platform: "bluesky",
              success: false,
              error: "Bluesky agent session lost before image upload.",
            };
          }

          const { data: blobData } = await agent.uploadBlob(mediaBuffer, {
            encoding: mimeType ?? "application/octet-stream",
          });

          bskyEmbed = {
            $type: "app.bsky.embed.images",
            images: [{ image: blobData.blob, alt: options.mediaAltText || "" }],
          };
        }
      } catch (mediaError: any) {
        return {
          platform: "bluesky",
          success: false,
          error: `Bluesky media upload failed: ${mediaError.message}`,
        };
      }
    }

    // Send post
    if (!agent.session) {
      return {
        platform: "bluesky",
        success: false,
        error: "Bluesky agent session lost before posting.",
      };
    }

    const rt = new RichText({ text: options.text });
    await rt.detectFacets(agent);

    const postRecord: any = {
      $type: "app.bsky.feed.post",
      text: rt.text,
      facets: rt.facets,
      createdAt: new Date().toISOString(),
      ...(bskyEmbed && { embed: bskyEmbed }),
    };

    try {
      const result = await agent.post(postRecord);

      if (!sessionRefreshedProactively) {
        await database.updateConnection(userId, "bluesky", {
          isValid: true,
          needsReconnection: false,
          lastValidated: new Date(),
        });
      }

      return {
        platform: "bluesky",
        success: true,
        result: { uri: result.uri, cid: result.cid },
      };
    } catch (apiError: any) {
      // Try reactive refresh if not already refreshed
      if (!sessionRefreshedProactively && isAuthError("bluesky", apiError)) {
        try {
          await agent.com.atproto.server.refreshSession();
          const newSession = agent.session;
          if (newSession?.accessJwt && newSession?.refreshJwt) {
            await database.updateConnection(userId, "bluesky", {
              accessJwt: newSession.accessJwt,
              refreshJwt: newSession.refreshJwt,
              isValid: true,
              needsReconnection: false,
              lastValidated: new Date(),
            });
            const result = await agent.post(postRecord);
            return {
              platform: "bluesky",
              success: true,
              result: { uri: result.uri, cid: result.cid },
            };
          }
        } catch (refreshError: any) {
          // Fall through to error handling
        }
      }

      await database.updateConnection(userId, "bluesky", {
        isValid: false,
        needsReconnection: isAuthError("bluesky", apiError),
      });

      return {
        platform: "bluesky",
        success: false,
        error: `Bluesky API Error: ${apiError.message || "Unknown"}`,
      };
    }
  }
}

