import { PlatformHandler } from "./base";
import { DevtoConnection, PostOptions, PostResult } from "../types";
import { DatabaseAdapter } from "../adapters/base";

const DEVTO_API_BASE_URL = "https://dev.to/api";

export class DevtoHandler implements PlatformHandler {
  async sendPost(
    userId: string,
    connection: DevtoConnection,
    options: PostOptions,
    database: DatabaseAdapter
  ): Promise<PostResult> {
    if (!connection.apiKey) {
      throw new Error("Missing Dev.to API key");
    }

    try {
      let title: string;
      let bodyMarkdown: string;
      let description: string;
      let tags: string[];

      // Use structured Dev.to fields if available in postData
      if (options.postData?.devtoBodyMarkdown) {
        title =
          options.postData.devtoTitle ||
          options.text?.split("\n")[0] ||
          "Untitled";
        bodyMarkdown = options.postData.devtoBodyMarkdown;
        description = options.postData.devtoDescription || "";
        tags = options.postData.devtoTags
          ? options.postData.devtoTags.split(",").map((t: string) => t.trim())
          : this.extractTags(options.text);
      } else {
        // Parse from text format
        const parsed = this.parseContent(options.text);
        title = parsed.title;
        bodyMarkdown = parsed.bodyMarkdown;
        description = "";
        tags = this.extractTags(options.text);
      }

      // Build article payload
      const articleData: any = {
        article: {
          title: title,
          body_markdown: bodyMarkdown,
          description: description || undefined,
          published: true,
          tags: tags.length > 0 ? tags : ["general", "development"],
          main_image: options.mediaUrl || undefined,
        },
      };

      // Add series if project name is provided
      if (options.projectName && options.projectName.trim()) {
        articleData.article.series = options.projectName.trim();
      }

      const response = await fetch(`${DEVTO_API_BASE_URL}/articles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": connection.apiKey,
        },
        body: JSON.stringify(articleData),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        if (this.isAuthError(response.status)) {
          await database.updateConnection(userId, "devto", {
            isValid: false,
            needsReconnection: true,
          });
        }
        return {
          platform: "devto",
          success: false,
          error: `Dev.to API Error: ${response.status} - ${response.statusText} - ${errorBody}`,
        };
      }

      const result = await response.json();

      await database.updateConnection(userId, "devto", {
        isValid: true,
        needsReconnection: false,
        lastValidated: new Date(),
      });

      const resultData = result as {
        id: number;
        url: string;
        title: string;
      };
      return {
        platform: "devto",
        success: true,
        result: {
          id: resultData.id.toString(),
          url: resultData.url,
          title: resultData.title,
        },
      };
    } catch (error: any) {
      await database.updateConnection(userId, "devto", {
        isValid: false,
        needsReconnection: true,
      });

      return {
        platform: "devto",
        success: false,
        error: error.message || "Unknown Dev.to API error",
      };
    }
  }

  private parseContent(
    text: string
  ): { title: string; bodyMarkdown: string } {
    const lines = text.split("\n");

    if (lines.length >= 3 && lines[0].trim() && lines[1].trim() === "") {
      const title = lines[0].trim();
      const body = lines.slice(2).join("\n").trim();
      return {
        title: title,
        bodyMarkdown: body || text,
      };
    }

    const firstLine = lines[0].trim();
    const title =
      firstLine.length > 60
        ? firstLine.substring(0, 57) + "..."
        : firstLine || "Untitled Article";

    return {
      title: title,
      bodyMarkdown: text,
    };
  }

  private extractTags(text: string): string[] {
    const tags: string[] = [];
    const hashtagRegex = /#(\w+)/g;
    const matches = text.matchAll(hashtagRegex);
    for (const match of matches) {
      const tag = match[1].toLowerCase();
      if (tag.length > 0 && tag.length <= 20 && !tags.includes(tag)) {
        tags.push(tag);
      }
    }
    return tags.slice(0, 4);
  }

  private isAuthError(status: number): boolean {
    return status === 401 || status === 403;
  }
}

