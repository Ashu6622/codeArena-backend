import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 3;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await this.derive(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, KEY_LENGTH);
    return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('hex'), key.toString('hex')].join(
      '$',
    );
  }

  async verify(password: string, storedHash?: string): Promise<boolean> {
    const fallbackSalt = Buffer.alloc(16);
    let salt = fallbackSalt;
    let expected = Buffer.alloc(KEY_LENGTH);
    let validFormat = false;

    if (storedHash) {
      const [algorithm, nText, rText, pText, saltHex, keyHex, extra] = storedHash.split('$');
      const n = Number(nText);
      const r = Number(rText);
      const p = Number(pText);
      const parsedSalt = Buffer.from(saltHex ?? '', 'hex');
      const parsedKey = Buffer.from(keyHex ?? '', 'hex');

      validFormat =
        !extra &&
        algorithm === 'scrypt' &&
        n === SCRYPT_N &&
        r === SCRYPT_R &&
        p === SCRYPT_P &&
        parsedSalt.length === 16 &&
        parsedKey.length === KEY_LENGTH;

      if (validFormat) {
        salt = parsedSalt;
        expected = parsedKey;
      }
    }

    const actual = await this.derive(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, KEY_LENGTH);
    return validFormat && timingSafeEqual(actual, expected);
  }

  private derive(
    password: string,
    salt: Buffer,
    n: number,
    r: number,
    p: number,
    length: number,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      scrypt(password, salt, length, { N: n, r, p, maxmem: MAX_MEMORY }, (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      });
    });
  }
}
