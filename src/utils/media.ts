import { Readable } from "stream";
import ffmpegStatic from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import { Agent as UndiciAgent, setGlobalDispatcher } from "undici";

import { MediaTypeCategory } from "../types";

ffmpeg.setFfmpegPath(ffmpegStatic!);

// Install global dispatcher once at startup
setGlobalDispatcher(
  new UndiciAgent({
    keepAliveTimeout: 60_000,
    connections: 100,
  })
);

/**
 * Fetch with retry logic for transient errors
 */
export async function fetchWithRetry(
  input: string | URL,
  init: RequestInit = {},
  retries = 3,
  backoffMs = 500
): Promise<Response> {
  let lastErr: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(input, init);
    } catch (err: any) {
      lastErr = err;
      const isTransient =
        err?.code === "UND_ERR_SOCKET" || err instanceof TypeError;
      if (!isTransient || i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, backoffMs * (i + 1)));
    }
  }
  throw lastErr;
}

/**
 * Downloads media from a URL to a Buffer and detects MIME type.
 */
export const downloadMedia = async (
  platform: string,
  url: string
): Promise<{ buffer: Buffer; mimeType: string | null }> => {
  try {
    const response = await fetchWithRetry(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch media (${response.status}): ${response.statusText}`
      );
    }
    const mimeType = response.headers.get("content-type");
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Basic Size Check
    const maxSize = PLATFORM_MEDIA_LIMITS[platform]?.video || 512 * 1024 * 1024; // Default to 512MB
    if (buffer.length > maxSize) {
      throw new Error(
        `Media file size exceeds the general limit (${
          maxSize / 1024 / 1024
        }MB).`
      );
    }

    return { buffer, mimeType };
  } catch (error: any) {
    throw new Error(`Failed to download media: ${error.message}`);
  }
};

/**
 * Get Twitter media type and category from MIME type
 */
export const getTwitterMediaTypeCategory = (
  mimeType: string
): MediaTypeCategory => {
  if (!mimeType) {
    throw new Error("Invalid or missing mimeType");
  }

  const mediaType = mimeType as MediaTypeCategory["media_type"];

  if (mimeType.startsWith("video/")) {
    return {
      media_type: mediaType,
      media_category: "tweet_video",
    };
  }

  if (mimeType === "image/gif") {
    return {
      media_type: "image/gif",
      media_category: "tweet_gif",
    };
  }

  if (mimeType.startsWith("image/")) {
    return {
      media_type: mediaType,
      media_category: "tweet_image",
    };
  }

  if (mimeType === "text/plain") {
    return {
      media_type: "text/plain",
      media_category: "subtitles",
    };
  }

  throw new Error(`Unsupported mimeType: ${mimeType}`);
};

/**
 * Platform-specific media size limits (in bytes)
 */
export const PLATFORM_MEDIA_LIMITS: Record<
  string,
  { image: number; gif: number; video: number }
> = {
  twitter: {
    image: 5 * 1024 * 1024, // 5 MB
    gif: 15 * 1024 * 1024, // 15 MB
    video: 512 * 1024 * 1024, // 512 MB
  },
  bluesky: {
    image: 1 * 1024 * 1024, // 1 MB
    gif: 1 * 1024 * 1024, // 1 MB
    video: 50 * 1024 * 1024, // 50 MB
  },
  linkedin: {
    image: 5 * 1024 * 1024, // 5 MB
    gif: 5 * 1024 * 1024, // 5 MB
    video: 5 * 1024 * 1024 * 1024, // 5 GB
  },
  tiktok: {
    image: 10 * 1024 * 1024, // 10 MB
    gif: 10 * 1024 * 1024, // 10 MB
    video: 500 * 1024 * 1024, // 500 MB
  },
};

/**
 * Get video dimensions using ffmpeg
 */
export const getVideoDimensions = (buffer: Buffer): Promise<{
  width: number;
  height: number;
}> => {
  return new Promise((resolve, reject) => {
    // Convert the buffer into a readable stream
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null); // Signal the end of the stream

    // Use ffprobe to extract video metadata
    ffmpeg(stream).ffprobe((err, metadata) => {
      if (err) {
        return reject(err);
      }

      // Find the first video stream
      const videoStream = metadata.streams.find(
        (stream) => stream.codec_type === "video"
      );

      if (videoStream && videoStream.width && videoStream.height) {
        resolve({
          width: videoStream.width,
          height: videoStream.height,
        });
      } else {
        reject(new Error("No video stream found or missing dimensions."));
      }
    });
  });
};

/**
 * Check if a URL or file path is a video file
 */
export const isVideoFile = (urlOrPath: string): boolean => {
  const videoExtensions = /\.(mp4|mov|avi|wmv|flv|webm|mkv|m4v)$/i;
  return videoExtensions.test(urlOrPath);
};

/**
 * Check if a URL or file path is an image file
 */
export const isImageFile = (urlOrPath: string): boolean => {
  const imageExtensions = /\.(jpeg|jpg|png|gif|webp|bmp|svg)$/i;
  return imageExtensions.test(urlOrPath);
};

