import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config';

const ALGO = 'aes-256-gcm';

/** Chat platforms a user can connect from. */
export type IPlatform = 'telegram' | 'whatsapp';

function loadKey(): Buffer {
  const key = Buffer.from(config.encryptionKey, 'hex');
  if (key.length !== 32) {
    throw new Error(
      'BOMACLAW_ENCRYPTION_KEY must be 32 bytes of hex (64 hex characters). ' +
        'Generate one with: openssl rand -hex 32'
    );
  }
  return key;
}

const key = loadKey();

function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString('base64')).join('.');
}

function decrypt(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed stored token');
  }
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

export class TokenStore {
  private db: Database.Database;

  constructor(path: string = config.dbPath) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    // Keyed by (platform, external id): the same person may connect from
    // Telegram and WhatsApp independently, and the ids are unrelated
    // namespaces -- a Telegram numeric id and a WhatsApp phone number could
    // otherwise collide in a single-column key.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS connections (
        platform TEXT NOT NULL,
        external_id TEXT NOT NULL,
        encrypted_token TEXT NOT NULL,
        connected_at TEXT NOT NULL,
        PRIMARY KEY (platform, external_id)
      );
    `);
  }

  connect(platform: IPlatform, externalId: string, personalAccessToken: string): void {
    this.db
      .prepare(
        `INSERT INTO connections (platform, external_id, encrypted_token, connected_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(platform, external_id) DO UPDATE SET
           encrypted_token = excluded.encrypted_token,
           connected_at = excluded.connected_at`
      )
      .run(platform, externalId, encrypt(personalAccessToken), new Date().toISOString());
  }

  getToken(platform: IPlatform, externalId: string): string | undefined {
    const row = this.db
      .prepare<[string, string], { encrypted_token: string }>(
        'SELECT encrypted_token FROM connections WHERE platform = ? AND external_id = ?'
      )
      .get(platform, externalId);
    return row ? decrypt(row.encrypted_token) : undefined;
  }

  disconnect(platform: IPlatform, externalId: string): boolean {
    const result = this.db
      .prepare('DELETE FROM connections WHERE platform = ? AND external_id = ?')
      .run(platform, externalId);
    return result.changes > 0;
  }

  close(): void {
    this.db.close();
  }
}
