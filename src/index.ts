// Main exports
export { SocialAuth, SocialAuthConfig } from "./client";
export { PostDispatcher, PlatformConfig } from "./dispatcher";

// Types
export * from "./types";

// Database adapters
export { DatabaseAdapter } from "./adapters/base";
export { FirestoreAdapter } from "./adapters/firestore";
export { MemoryAdapter } from "./adapters/memory";

// Connection providers
export { TwitterConnectionProvider, TwitterConfig } from "./connections/twitter";
export { LinkedInConnectionProvider, LinkedInConfig } from "./connections/linkedin";
export { BlueskyConnectionProvider, BlueskyAuthOptions } from "./connections/bluesky";
export { TikTokConnectionProvider, TikTokConfig } from "./connections/tiktok";
export { ThreadsConnectionProvider, ThreadsConfig } from "./connections/threads";
export { DevtoConnectionProvider } from "./connections/devto";
export { DiscordConnectionProvider, DiscordWebhookOptions } from "./connections/discord";
export { GitHubConnectionProvider } from "./connections/github";

// Handlers
export { TwitterHandler } from "./handlers/twitter";
export { LinkedInHandler } from "./handlers/linkedin";
export { BlueskyHandler } from "./handlers/bluesky";
export { TikTokHandler } from "./handlers/tiktok";
export { DevtoHandler } from "./handlers/devto";
export { ThreadsHandler } from "./handlers/threads";
export { DiscordHandler } from "./handlers/discord";
export { GitHubHandler } from "./handlers/github";
export { PlatformHandler } from "./handlers/base";

// Utilities
export * from "./utils";

