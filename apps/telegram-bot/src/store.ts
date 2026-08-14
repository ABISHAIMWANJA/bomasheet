import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config';

const ALGO = 'aes-256-gcm';

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
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS connections (
        telegram_user_id TEXT PRIMARY KEY,
        encrypted_token TEXT NOT NULL,
        connected_at TEXT NOT NULL
      );
    `);
  }

  connect(telegramUserId: number, personalAccessToken: string): void {
    this.db
      .prepare(
        `INSERT INTO connections (telegram_user_id, encrypted_token, connected_at)
         VALUES (?, ?, ?)
         ON CONFLICT(telegram_user_id) DO UPDATE SET
           encrypted_token = excluded.encrypted_token,
           connected_at = excluded.connected_at`
      )
      .run(String(telegramUserId), encrypt(personalAccessToken), new Date().toISOString());
  }

  getToken(telegramUserId: number): string | undefined {
    const row = this.db
      .prepare<[string], { encrypted_token: string }>(
        'SELECT encrypted_token FROM connections WHERE telegram_user_id = ?'
      )
      .get(String(telegramUserId));
    return row ? decrypt(row.encrypted_token) : undefined;
  }

  disconnect(telegramUserId: number): boolean {
    const result = this.db
      .prepare('DELETE FROM connections WHERE telegram_user_id = ?')
      .run(String(telegramUserId));
    return result.changes > 0;
  }

  close(): void {
    this.db.close();
  }
}
