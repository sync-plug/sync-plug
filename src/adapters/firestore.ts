import { DatabaseAdapter } from "./base";
import { PlatformConnection, OAuthState, Platform } from "../types";

// Firestore types - these are from firebase-admin/firestore (peer dependency)
// Using any to avoid requiring the package at compile time
type Firestore = any;
type DocumentReference = any;
type Timestamp = any;
type FieldValue = any;

/**
 * Firestore implementation of DatabaseAdapter
 */
export class FirestoreAdapter implements DatabaseAdapter {
  private db: Firestore;
  private usersCollection: string;
  private connectionsCollection: string;
  private oauthStateCollection: string;

  constructor(
    db: Firestore,
    options?: {
      usersCollection?: string;
      connectionsCollection?: string;
      oauthStateCollection?: string;
    }
  ) {
    this.db = db;
    this.usersCollection = options?.usersCollection || "users";
    this.connectionsCollection =
      options?.connectionsCollection || "platformConnections";
    this.oauthStateCollection = options?.oauthStateCollection || "oauthState";
  }

  private getConnectionRef(
    userId: string,
    platform: Platform
  ): DocumentReference {
    return this.db
      .collection(this.usersCollection)
      .doc(userId)
      .collection(this.connectionsCollection)
      .doc(platform);
  }

  async saveConnection(
    userId: string,
    platform: Platform,
    connection: PlatformConnection
  ): Promise<void> {
    const ref = this.getConnectionRef(userId, platform);
    // Convert Date to Timestamp if needed
    const data = this.convertDatesToTimestamps(connection);
    await ref.set(data);
  }

  async getConnection(
    userId: string,
    platform: Platform
  ): Promise<PlatformConnection | null> {
    const ref = this.getConnectionRef(userId, platform);
    const doc = await ref.get();
    if (!doc.exists) {
      return null;
    }
    const data = doc.data();
    return this.convertTimestampsToDates(data as any) as PlatformConnection;
  }

  async updateConnection(
    userId: string,
    platform: Platform,
    updates: Partial<PlatformConnection>
  ): Promise<void> {
    const ref = this.getConnectionRef(userId, platform);
    const data = this.convertDatesToTimestamps(updates);
    // Use serverTimestamp for lastValidated if not provided
    if (!data.lastValidated && !updates.lastValidated) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { FieldValue } = require("firebase-admin/firestore");
      data.lastValidated = FieldValue.serverTimestamp();
    }
    await ref.update(data);
  }

  async deleteConnection(userId: string, platform: Platform): Promise<void> {
    const ref = this.getConnectionRef(userId, platform);
    await ref.delete();
  }

  async getConnections(userId: string): Promise<PlatformConnection[]> {
    const connectionsRef = this.db
      .collection(this.usersCollection)
      .doc(userId)
      .collection(this.connectionsCollection);
    const snapshot = await connectionsRef.get();
    return snapshot.docs.map((doc: { data: () => any }) => {
      const data = doc.data();
      return this.convertTimestampsToDates(data as any) as PlatformConnection;
    });
  }

  async saveOAuthState(state: string, data: OAuthState): Promise<void> {
    const ref = this.db.collection(this.oauthStateCollection).doc(state);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Timestamp } = require("firebase-admin/firestore");
    const stateData = {
      ...data,
      createdAt: data.createdAt instanceof Date
        ? Timestamp.fromDate(data.createdAt)
        : data.createdAt,
    };
    await ref.set(stateData);
  }

  async getOAuthState(state: string): Promise<OAuthState | null> {
    const ref = this.db.collection(this.oauthStateCollection).doc(state);
    const doc = await ref.get();
    if (!doc.exists) {
      return null;
    }
    const data = doc.data() as any;
    return {
      ...data,
      createdAt:
        data.createdAt?.toDate?.() || data.createdAt || new Date(),
    } as OAuthState;
  }

  async deleteOAuthState(state: string): Promise<void> {
    const ref = this.db.collection(this.oauthStateCollection).doc(state);
    await ref.delete();
  }

  /**
   * Convert Date objects to Firestore Timestamps
   */
  private convertDatesToTimestamps(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    if (obj instanceof Date) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Timestamp } = require("firebase-admin/firestore");
      return Timestamp.fromDate(obj);
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.convertDatesToTimestamps(item));
    }
    if (typeof obj === "object") {
      const result: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          result[key] = this.convertDatesToTimestamps(obj[key]);
        }
      }
      return result;
    }
    return obj;
  }

  /**
   * Convert Firestore Timestamps to Date objects
   */
  private convertTimestampsToDates(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    if (obj.toDate && typeof obj.toDate === "function") {
      // Firestore Timestamp
      return obj.toDate();
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.convertTimestampsToDates(item));
    }
    if (typeof obj === "object") {
      const result: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          result[key] = this.convertTimestampsToDates(obj[key]);
        }
      }
      return result;
    }
    return obj;
  }
}

