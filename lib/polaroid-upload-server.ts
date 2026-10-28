import {createHmac, timingSafeEqual} from 'node:crypto';
import {validatePolaroidFile} from './polaroid-upload';

export type UploadReceipt = {
  v: 1;
  id: string;
  userId: string;
  staffId: string;
  path: string;
  size: number;
  contentType: string;
  previousImagePath: string | null;
  expiresAt: number;
};

export class PolaroidUploadError extends Error {
  constructor(message: string, public status: number) {super(message);}
}

function signature(payload: string): Buffer {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('伺服器尚未完成圖片上傳設定');
  // Separate these short-lived upload receipts from every other use of the server key.
  return createHmac('sha256', key).update('mianfengkan:polaroid-upload:v1\0').update(payload).digest();
}

export function signUploadReceipt(receipt: UploadReceipt): string {
  const payload = Buffer.from(JSON.stringify(receipt)).toString('base64url');
  return `${payload}.${signature(payload).toString('base64url')}`;
}

export function verifyUploadReceipt(value: unknown): UploadReceipt {
  const invalid = () => new PolaroidUploadError('上傳憑證無效，請重新選擇圖片上傳', 403);
  if (typeof value !== 'string' || value.length > 4096) throw invalid();
  const parts = value.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) throw invalid();
  const actual = Buffer.from(parts[1], 'base64url');
  const expected = signature(parts[0]);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw invalid();
  let receipt: UploadReceipt;
  try {receipt = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));}
  catch {throw invalid();}
  if (!receipt || receipt.v !== 1 || ![receipt.id, receipt.userId, receipt.staffId, receipt.path].every(v => typeof v === 'string' && v.length > 0)
    || (receipt.previousImagePath !== null && typeof receipt.previousImagePath !== 'string')
    || validatePolaroidFile({size: receipt.size, type: receipt.contentType})
    || !Number.isSafeInteger(receipt.expiresAt)) throw invalid();
  if (receipt.expiresAt <= Date.now()) throw new PolaroidUploadError('上傳憑證已過期，請重新選擇圖片上傳', 410);
  return receipt;
}
