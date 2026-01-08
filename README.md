# Sync Plug

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://badge.fury.io/js/%40sync-plug.svg)](https://badge.fury.io/js/%40sync-plug)

A database-agnostic, framework-agnostic TypeScript library for social media authentication and posting. Consolidates the best features from multiple codebases with complete media support.

## Table of Contents

- [Support the Project](#support-the-project)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Supported Platforms](#supported-platforms)
- [Database Adapters](#database-adapters)
- [API Reference](#api-reference)
- [Post Options](#post-options)
- [Error Handling](#error-handling)
- [Contributing](#contributing)
- [License](#license)

## Support the Project

If you find this library useful, please consider supporting its development!

<a href="https://www.paypal.com/ncp/payment/2HWXJA8CMNZTU" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-blue.svg?style=flat-square&logo=paypal" alt="Donate"></a>  

## Features

- **7 Platform Support**: Twitter, LinkedIn, Bluesky, TikTok, Dev.to, Threads, Discord
- **Complete Media Support**: Images, videos, GIFs with automatic handling
- **Database Agnostic**: Works with any database via adapter pattern
- **Framework Agnostic**: Use with any backend framework
- **Type Safe**: Full TypeScript support
- **OAuth 2.0**: Secure PKCE flows for supported platforms
- **Token Management**: Automatic token refresh and validation
- **Error Handling**: Comprehensive error handling and connection state management

## Installation

```bash
npm install @sync-plug
```

## Quick Start

```typescript
import { SocialAuth, FirestoreAdapter } from "@sync-plug";
import { getFirestore } from "firebase-admin/firestore";

const db = getFirestore();
const adapter = new FirestoreAdapter(db);

const socialAuth = new SocialAuth({
  database: adapter,
  platforms: {
    twitter: {
      clientId: process.env.TWITTER_CLIENT_ID!,
      clientSecret: process.env.TWITTER_CLIENT_SECRET!,
    },
    linkedin: {
      clientId: process.env.LINKEDIN_CLIENT_ID!,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
    },
    // ... other platforms
  },
});

// Connect a platform
const { authUrl } = await socialAuth.connect("twitter", userId, {
  redirectUri: "https://yourapp.com/callback",
});

// Handle OAuth callback
const connection = await socialAuth.handleCallback(
  "twitter",
  code,
  state,
  redirectUri
);

// Post to a platform
const result = await socialAuth.post("twitter", userId, {
  text: "Hello, world!",
  mediaUrl: "https://example.com/image.jpg",
  mediaAltText: "An image",
});

// Post to all connected platforms
const results = await socialAuth.postToAll(userId, {
  text: "Cross-platform post!",
});
```

## Supported Platforms

### Twitter
- OAuth 2.0 with PKCE
- Media upload (images, videos, GIFs)
- Automatic token refresh

### LinkedIn
- OAuth 2.0
- Media upload (images, videos)
- Token refresh support

### Bluesky
- Handle/password authentication
- Video and image support
- Session management

### TikTok
- OAuth 2.0 with PKCE
- Video upload with chunking
- Photo upload support

### Dev.to
- API key authentication
- Article publishing
- Markdown support

### Threads
- OAuth 2.0
- Media support (images, videos)
- Container-based posting

### Discord
- Webhook integration
- Embed support
- Media attachments

### Planned Platforms
- YouTube
- Facebook
- Instagram
- Beehiiv

## Database Adapters

### Planned Support
- PostgreSQL
- Supabase
*For now, please use the [Custom Adapter](#custom-adapter).*


### Firestore Adapter

```typescript
import { FirestoreAdapter } from "@sync-plug";
import { getFirestore } from "firebase-admin/firestore";

const db = getFirestore();
const adapter = new FirestoreAdapter(db);
```

### Memory Adapter (for testing)

```typescript
import { MemoryAdapter } from "@sync-plug";

const adapter = new MemoryAdapter();
```

### Custom Adapter

Implement the `DatabaseAdapter` interface to work with any database. Here's an example using PostgreSQL:

```typescript
import { DatabaseAdapter, Platform, PlatformConnection, OAuthState } from "@sync-plug";
import { Pool } from "pg";

class PostgreSQLAdapter implements DatabaseAdapter {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async saveConnection(
    userId: string,
    platform: Platform,
    connection: PlatformConnection
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO connections (user_id, platform, data, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (user_id, platform) 
       DO UPDATE SET data = $3, updated_at = NOW()`,
      [userId, platform, JSON.stringify(connection)]
    );
  }

  async getConnection(
    userId: string,
    platform: Platform
  ): Promise<PlatformConnection | null> {
    const result = await this.pool.query(
      `SELECT data FROM connections WHERE user_id = $1 AND platform = $2`,
      [userId, platform]
    );
    if (result.rows.length === 0) return null;
    return this.convertDates(result.rows[0].data);
  }

  async updateConnection(
    userId: string,
    platform: Platform,
    updates: Partial<PlatformConnection>
  ): Promise<void> {
    const existing = await this.getConnection(userId, platform);
    if (!existing) throw new Error("Connection not found");
    
    const updated = { ...existing, ...updates };
    await this.saveConnection(userId, platform, updated);
  }

  async deleteConnection(userId: string, platform: Platform): Promise<void> {
    await this.pool.query(
      `DELETE FROM connections WHERE user_id = $1 AND platform = $2`,
      [userId, platform]
    );
  }

  async getConnections(userId: string): Promise<PlatformConnection[]> {
    const result = await this.pool.query(
      `SELECT data FROM connections WHERE user_id = $1`,
      [userId]
    );
    return result.rows.map(row => this.convertDates(row.data));
  }

  async saveOAuthState(state: string, data: OAuthState): Promise<void> {
    await this.pool.query(
      `INSERT INTO oauth_states (state, data, created_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (state) DO UPDATE SET data = $2`,
      [state, JSON.stringify(data)]
    );
  }

  async getOAuthState(state: string): Promise<OAuthState | null> {
    const result = await this.pool.query(
      `SELECT data FROM oauth_states WHERE state = $1`,
      [state]
    );
    if (result.rows.length === 0) return null;
    return this.convertDates(result.rows[0].data);
  }

  async deleteOAuthState(state: string): Promise<void> {
    await this.pool.query(`DELETE FROM oauth_states WHERE state = $1`, [state]);
  }

  private convertDates(data: any): any {
    // Convert ISO date strings back to Date objects if needed
    // This depends on how you store dates in your database
    if (data && typeof data === 'object') {
      const converted = { ...data };
      ['expiresAt', 'lastValidated', 'createdAt'].forEach(key => {
        if (converted[key] && typeof converted[key] === 'string') {
          converted[key] = new Date(converted[key]);
        }
      });
      return converted;
    }
    return data;
  }
}
```

**Required Methods:**

- `saveConnection(userId, platform, connection)` - Save a platform connection
- `getConnection(userId, platform)` - Get a specific connection
- `updateConnection(userId, platform, updates)` - Update an existing connection
- `deleteConnection(userId, platform)` - Delete a connection
- `getConnections(userId)` - Get all connections for a user
- `saveOAuthState(state, data)` - Save OAuth state for PKCE flow
- `getOAuthState(state)` - Retrieve OAuth state
- `deleteOAuthState(state)` - Delete OAuth state

**Data Structures:**

- `PlatformConnection` - Union type containing platform-specific connection data (tokens, user IDs, expiration dates, etc.)
- `OAuthState` - Contains `uid`, `codeVerifier`, `state`, and `createdAt` for OAuth PKCE flows
- Date fields (`expiresAt`, `lastValidated`, `createdAt`) can be `Date` objects or database-specific types - convert as needed for your database

## API Reference

### SocialAuth Class

#### `connect(platform, userId, options)`
Initiate platform connection. Returns `{ authUrl }` for OAuth platforms or `{ connection }` for direct auth.

#### `handleCallback(platform, code, state, redirectUri)`
Handle OAuth callback and store connection.

#### `disconnect(platform, userId)`
Disconnect a platform.

#### `getConnections(userId)`
Get all connections for a user.

#### `getConnection(userId, platform)`
Get connection for a specific platform.

#### `refreshToken(platform, userId)`
Refresh access token for a platform.

#### `post(platform, userId, options)`
Post to a specific platform.

#### `postToAll(userId, options, platforms?)`
Post to all connected platforms (or specified platforms).

## Post Options

```typescript
interface PostOptions {
  text: string;
  mediaUrl?: string | null;
  mediaAltText?: string | null;
  projectName?: string;
  postData?: any; // Platform-specific data
}
```

## Error Handling

All methods throw errors or return `PostResult` with `success: false` and an `error` message. Connection state is automatically updated on errors.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to submit changes, report bugs, and suggest features.

## License

MIT

