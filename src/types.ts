import { EUploadMimeType } from "twitter-api-v2";

/**
 * Supported platform identifiers
 */
export type Platform =
  | "twitter"
  | "linkedin"
  | "bluesky"
  | "tiktok"
  | "devto"
  | "threads"
  | "discord"
  | "github";

/**
 * OAuth state for PKCE flow
 */
export interface OAuthState {
  uid: string;
  codeVerifier: string;
  state: string;
  createdAt: Date | any; // Date or Firestore Timestamp
}

/**
 * Twitter connection (OAuth 2.0 with PKCE)
 */
export interface TwitterConnection {
  uid: string;
  twitterUserId: string;
  screenName: string;
  platform: "twitter";
  authVersion: "oauth2";
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | any;
  scopes: string[];
  lastValidated?: Date | any;
  isValid: boolean;
  needsReconnection: boolean;
}

/**
 * LinkedIn connection (OAuth 2.0)
 */
export interface LinkedInConnection {
  uid: string;
  linkedInUserId: string;
  platform: "linkedin";
  authVersion: "oauth2";
  accessToken: string;
  refreshToken: string | null;
  idToken?: string;
  expiresAt: Date | any;
  lastValidated?: Date | any;
  isValid: boolean;
  needsReconnection: boolean;
}

/**
 * Bluesky connection (handle/password auth)
 */
export interface BlueskyConnection {
  uid: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
  did: string;
  platform: "bluesky";
  lastValidated?: Date | any;
  isValid: boolean;
  needsReconnection: boolean;
  decryptedPassword?: string; // Optional, for connection purposes
}

/**
 * TikTok connection (OAuth 2.0)
 */
export interface TikTokConnection {
  uid: string;
  tiktokUserId: string;
  displayName: string;
  platform: "tiktok";
  authVersion: "oauth2";
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | any;
  scopes: string[];
  lastValidated?: Date | any;
  isValid: boolean;
  needsReconnection: boolean;
}

/**
 * Dev.to connection (API key)
 */
export interface DevtoConnection {
  uid: string;
  apiKey: string;
  username?: string;
  platform: "devto";
  isValid: boolean;
  needsReconnection: boolean;
  lastValidated?: Date | any;
}

/**
 * Threads connection (OAuth 2.0)
 */
export interface ThreadsConnection {
  uid: string;
  threadsUserId: string;
  platform: "threads";
  accessToken: string;
  expiresAt?: Date | any;
  isValid: boolean;
  needsReconnection: boolean;
  lastValidated?: Date | any;
}

/**
 * Discord connection (webhook)
 */
export interface DiscordConnection {
  uid: string;
  webhookUrl: string;
  webhookId?: string;
  webhookToken?: string;
  channelName?: string;
  guildName?: string;
  platform: "discord";
  isValid: boolean;
  needsReconnection: boolean;
  lastValidated?: Date | any;
}

/**
 * GitHub connection (Personal Access Token)
 */
export interface GitHubConnection {
  uid: string;
  token: string;
  username?: string;
  userId?: string;
  avatar?: string;
  platform: "github";
  isValid: boolean;
  needsReconnection: boolean;
  lastValidated?: Date | any;
}

/**
 * Union type for all platform connections
 */
export type PlatformConnection =
  | TwitterConnection
  | LinkedInConnection
  | BlueskyConnection
  | TikTokConnection
  | DevtoConnection
  | ThreadsConnection
  | DiscordConnection
  | GitHubConnection;

/**
 * Media type category for Twitter
 */
export type MediaTypeCategory = {
  media_type:
    | EUploadMimeType
    | "image/jpeg"
    | "video/mp4"
    | "video/quicktime"
    | "image/gif"
    | "image/png"
    | "text/plain"
    | "image/webp";
  media_category:
    | "tweet_image"
    | "tweet_video"
    | "tweet_gif"
    | "dm_image"
    | "dm_video"
    | "dm_gif"
    | "subtitles";
};

/**
 * Post options for creating a post
 */
export interface PostOptions {
  text: string;
  mediaUrl?: string | null;
  mediaAltText?: string | null;
  projectName?: string;
  postData?: any; // Platform-specific post data
}

/**
 * Result from posting to a platform
 */
export interface PostResult {
  platform?: string;
  success: boolean;
  result?: {
    id?: string;
    tweetId?: string;
    uri?: string;
    cid?: string;
    publish_id?: string;
    [key: string]: any;
  };
  error?: string;
}

/**
 * Scheduled post structure
 */
export interface ScheduledPost {
  userId: string;
  platforms: Platform[];
  text: string;
  mediaUrl?: string;
  mediaAltText?: string;
  scheduledTime: Date | any;
  timezone?: string;
  status: "pending" | "processing" | "completed" | "failed";
  lastAttempt?: Date | any;
  errorMessage?: string;
  resultId?: string; // Tweet ID, post ID, etc.
  resultUri?: string; // Bluesky Post URI
  resultCid?: string; // Bluesky Post CID
  mediaFilePath?: string; // Path to the media file in storage
}

/**
 * Platform configuration
 */
export interface PlatformConfig {
  platform: Platform;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  [key: string]: any;
}

