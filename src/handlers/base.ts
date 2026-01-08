import { PlatformConnection, PostOptions, PostResult } from "../types";
import { DatabaseAdapter } from "../adapters/base";

/**
 * Base interface for platform handlers
 * Each platform must implement this interface
 */
export interface PlatformHandler {
  /**
   * Send a post to the platform
   * @param userId - User ID
   * @param connection - Platform connection credentials
   * @param options - Post options (text, media, etc.)
   * @param database - Database adapter for updating connection state
   * @returns Post result with success status and result/error
   */
  sendPost(
    userId: string,
    connection: PlatformConnection,
    options: PostOptions,
    database: DatabaseAdapter
  ): Promise<PostResult>;

  /**
   * Validate a connection (optional)
   * @param connection - Platform connection to validate
   * @returns True if connection is valid
   */
  validateConnection?(connection: PlatformConnection): Promise<boolean>;
}

