import { PlatformHandler } from "./base";
import { GitHubConnection, PostOptions, PostResult } from "../types";
import { DatabaseAdapter } from "../adapters/base";

export class GitHubHandler implements PlatformHandler {
  async sendPost(
    userId: string,
    connection: GitHubConnection,
    options: PostOptions,
    database: DatabaseAdapter
  ): Promise<PostResult> {
    if (!connection.token) {
      throw new Error("Missing GitHub token");
    }

    // GitHub doesn't have a direct posting API like social media
    // This handler could be used for creating gists, issues, or other GitHub content
    // For now, return a not-implemented result
    return {
      platform: "github",
      success: false,
      error: "GitHub posting is not implemented. GitHub is primarily used for repository management, not social posting.",
    };
  }
}

