import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

@Injectable()
export class CryptoService {
  constructor(private readonly config: ConfigService) {}

  encrypt(value: string | null | undefined) {
    if (!value) return null;
    const key = this.key();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      encrypted.toString('base64url'),
    ].join(':');
  }

  decrypt(value: string | null | undefined) {
    if (!value) return '';
    const [version, ivText, tagText, encryptedText] = value.split(':');
    if (version !== 'v1' || !ivText || !tagText || !encryptedText)
      throw new Error('Token OAuth armazenado é inválido');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key(),
      Buffer.from(ivText, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private key() {
    let configured = this.config.get<string>('APP_ENCRYPTION_KEY')?.trim();
    if (!configured) {
      const keyFile = path.resolve(
        this.config.get<string>('APP_ENCRYPTION_KEY_FILE') || '.data/app.key',
      );
      if (existsSync(keyFile)) {
        configured = readFileSync(keyFile, 'utf8').trim();
      } else {
        mkdirSync(path.dirname(keyFile), { recursive: true });
        configured = randomBytes(32).toString('base64');
        writeFileSync(keyFile, configured, { encoding: 'utf8', mode: 0o600 });
      }
    }
    const decoded = /^[a-f0-9]{64}$/i.test(configured)
      ? Buffer.from(configured, 'hex')
      : Buffer.from(configured, 'base64');
    if (decoded.length !== 32)
      throw new ServiceUnavailableException(
        'APP_ENCRYPTION_KEY deve possuir exatamente 32 bytes',
      );
    return decoded;
  }
}
