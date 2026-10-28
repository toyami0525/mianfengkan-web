import {randomUUID} from 'node:crypto';
import {NextRequest, NextResponse} from 'next/server';
import {adminSupabase} from '@/lib/supabase-admin';
import {validatePolaroidFile} from '@/lib/polaroid-upload';
import {PolaroidUploadError, signUploadReceipt, verifyUploadReceipt, type UploadReceipt} from '@/lib/polaroid-upload-server';

export const runtime = 'nodejs';
const BUCKET = 'polaroids';
const NO_STORE = {'Cache-Control': 'private, no-store, max-age=0'};
const RECEIPT_LIFETIME_MS = 2 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type DB = ReturnType<typeof adminSupabase>;
type Pickup = {id: string; staff_id: string; image_path: string | null; status: string};
type Auth = {db: DB; userId: string; account: {role: string; staff_id: string | null}};

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, {status, headers: NO_STORE});

async function accountFrom(req: NextRequest): Promise<Auth> {
  const bearer = (req.headers.get('authorization') || '').match(/^Bearer\s+(\S+)$/i);
  if (!bearer) throw new PolaroidUploadError('請重新登入館員後台', 401);
  const db = adminSupabase();
  const {data: {user}, error: authError} = await db.auth.getUser(bearer[1]);
  if (authError || !user) throw new PolaroidUploadError('登入已失效，請重新登入館員後台', 401);
  const {data: account, error} = await db.from('staff_accounts').select('role,staff_id,active')
    .eq('user_id', user.id).eq('active', true).maybeSingle();
  if (error) throw error;
  if (!account) throw new PolaroidUploadError('此帳號沒有成品上傳權限', 403);
  return {db, userId: user.id, account};
}

async function authorizedPickup(auth: Auth, id: unknown): Promise<Pickup> {
  if (typeof id !== 'string' || !UUID.test(id)) throw new PolaroidUploadError('找不到成品訂單', 400);
  const {data: pickup, error} = await auth.db.from('polaroid_pickups').select('id,staff_id,image_path,status').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!pickup) throw new PolaroidUploadError('找不到成品訂單', 404);
  if (auth.account.role !== 'owner' && (!auth.account.staff_id || auth.account.staff_id !== pickup.staff_id)) {
    throw new PolaroidUploadError('沒有權限上傳此成品', 403);
  }
  return pickup;
}

function uploadReceipt(auth: Auth, pickup: Pickup, size: number, contentType: string): UploadReceipt {
  const message = validatePolaroidFile({size, type: contentType});
  if (message) throw new PolaroidUploadError(message, 400);
  const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  return {v: 1, id: pickup.id, userId: auth.userId, staffId: pickup.staff_id,
    path: `${pickup.staff_id}/${pickup.id}/${randomUUID()}.${extension}`, size, contentType,
    previousImagePath: pickup.image_path || null, expiresAt: Date.now() + RECEIPT_LIFETIME_MS};
}

async function finishUpload(auth: Auth, pickup: Pickup, receipt: UploadReceipt) {
  if (receipt.id !== pickup.id || receipt.userId !== auth.userId || receipt.staffId !== pickup.staff_id) {
    throw new PolaroidUploadError('上傳憑證與此成品不符，請重新上傳', 403);
  }
  // A lost response can be retried without replacing the same image or deleting it.
  if (pickup.image_path === receipt.path && pickup.status === 'ready') return json({ok: true});
  if ((pickup.image_path || null) !== receipt.previousImagePath) {
    throw new PolaroidUploadError('此成品已由另一個上傳更新，請重新整理後確認', 409);
  }
  const storage = auth.db.storage.from(BUCKET);
  const {data: info, error: infoError} = await storage.info(receipt.path);
  if (infoError || !info) throw new PolaroidUploadError('圖片尚未完整上傳，請重新上傳', 400);
  const storedSize = info.size ?? 0;
  const storedType = info.contentType ?? '';
  const invalid = validatePolaroidFile({size: storedSize, type: storedType});
  if (invalid || storedSize !== receipt.size || storedType !== receipt.contentType) {
    throw new PolaroidUploadError(invalid || '上傳圖片與原本選擇的檔案不符，請重新上傳', 400);
  }
  let update = auth.db.from('polaroid_pickups').update({image_path: receipt.path, status: 'ready', completed_at: new Date().toISOString()})
    .eq('id', pickup.id).eq('staff_id', pickup.staff_id);
  update = receipt.previousImagePath === null ? update.is('image_path', null) : update.eq('image_path', receipt.previousImagePath);
  const {data: saved, error: updateError} = await update.select('id').maybeSingle();
  if (updateError) throw new PolaroidUploadError('成品登記暫時失敗，請稍後重試；原有成品仍保留', 500);
  if (!saved) {
    const current = await authorizedPickup(auth, pickup.id);
    if (current.image_path === receipt.path && current.status === 'ready') return json({ok: true});
    throw new PolaroidUploadError('此成品已由另一個上傳更新，請重新整理後確認', 409);
  }
  // Keep the previous deliverable until its replacement has been committed.
  if (receipt.previousImagePath && receipt.previousImagePath !== receipt.path) {
    try {
      const {error: removeError} = await storage.remove([receipt.previousImagePath]);
      if (removeError) console.warn('成品已完成，舊圖清理稍後再處理');
    } catch {console.warn('成品已完成，舊圖清理稍後再處理');}
  }
  return json({ok: true});
}

export async function POST(req: NextRequest) {
  try {
    const auth = await accountFrom(req);
    const contentType = req.headers.get('content-type') || '';
    // Retain compatibility for already-open tabs uploading small files.
    if (contentType.toLowerCase().startsWith('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) throw new PolaroidUploadError('請選擇要上傳的成品圖片', 400);
      const pickup = await authorizedPickup(auth, form.get('id'));
      const receipt = uploadReceipt(auth, pickup, file.size, file.type);
      const {error} = await auth.db.storage.from(BUCKET).upload(receipt.path, new Uint8Array(await file.arrayBuffer()), {contentType: file.type, upsert: false});
      if (error) throw new PolaroidUploadError('圖片上傳失敗，請稍後重試', 502);
      return await finishUpload(auth, pickup, receipt);
    }
    if (!contentType.toLowerCase().startsWith('application/json')) throw new PolaroidUploadError('請重新整理後台，再選擇圖片上傳', 415);
    const raw = await req.text();
    if (raw.length > 8192) throw new PolaroidUploadError('上傳資料過大，請重新整理後台再試', 413);
    let body;
    try {body = JSON.parse(raw);} catch {throw new PolaroidUploadError('上傳資料格式錯誤，請重新整理後台再試', 400);}
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new PolaroidUploadError('上傳資料格式錯誤', 400);
    if (body.action === 'prepare') {
      const pickup = await authorizedPickup(auth, body.id);
      const receipt = uploadReceipt(auth, pickup, body.size, body.contentType);
      const signedReceipt = signUploadReceipt(receipt);
      const {data, error} = await auth.db.storage.from(BUCKET).createSignedUploadUrl(receipt.path, {upsert: false});
      if (error || !data?.token) throw new PolaroidUploadError('暫時無法準備圖片上傳，請稍後重試', 502);
      return json({ok: true, bucket: BUCKET, path: receipt.path, token: data.token, receipt: signedReceipt});
    }
    if (body.action === 'complete') {
      const receipt = verifyUploadReceipt(body.receipt);
      if (body.id !== receipt.id) throw new PolaroidUploadError('上傳憑證與此成品不符，請重新上傳', 403);
      const pickup = await authorizedPickup(auth, body.id);
      return await finishUpload(auth, pickup, receipt);
    }
    throw new PolaroidUploadError('不支援的上傳操作，請重新整理後台再試', 400);
  } catch (error) {
    if (error instanceof PolaroidUploadError) return json({error: error.message}, error.status);
    console.error('成品上傳服務發生錯誤');
    return json({error: '圖片上傳服務暫時無法使用，請稍後重試'}, 500);
  }
}
