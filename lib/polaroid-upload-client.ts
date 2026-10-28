import { validatePolaroidFile } from './polaroid-upload';

type UploadStorage = {
  from(bucket: string): {
    uploadToSignedUrl(
      path: string,
      token: string,
      file: File,
      options: { contentType: string }
    ): PromiseLike<{ error: unknown }>;
  };
};

type UploadOptions = {
  id: string;
  file: File;
  accessToken: string;
  storage: UploadStorage;
  fetcher?: typeof fetch;
};

class PolaroidUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolaroidUploadError';
  }
}

const LOGIN_ERROR = '登入已失效，請重新登入館員後台後再上傳。';
const RESPONSE_ERROR = '上傳服務暫時回應異常，請稍後再試；若仍失敗，請重新整理後台。';

function errorDetails(error: unknown) {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const message = typeof record.message === 'string' ? record.message : typeof error === 'string' ? error : '';
  const status = Number(record.statusCode ?? record.status ?? record.status_code);
  return { message, status, name: record.name };
}

/** Keep platform text, HTML and JSON parser errors out of the upload alert. */
export function polaroidUploadErrorMessage(error: unknown): string {
  if (error instanceof PolaroidUploadError) return error.message;
  const { message, status, name } = errorDetails(error);
  if (status === 401 || /jwt.*expired|token.*expired|invalid.*jwt|invalid.*token|not authenticated/i.test(message)) return LOGIN_ERROR;
  if (status === 413 || /request entity too large|payload too large|maximum allowed size|exceeded.*size|file.*too large/i.test(message)) {
    return '圖片上傳超過大小限制；請確認不超過 15 MB，並重新整理後台後再試。';
  }
  if (status === 403 || /row.level security|permission denied|not authorized|unauthorized|access denied/i.test(message)) {
    return '沒有權限上傳這筆成品，或上傳授權已失效。請重新整理後台後再試。';
  }
  if (status === 429) return '上傳次數較多，請稍候再試。';
  if (status === 408 || status === 504 || name === 'AbortError' || /timed? ?out|timeout/i.test(message)) {
    return '上傳等候逾時，請檢查網路後再試。';
  }
  if (/failed to fetch|network|load failed|fetch failed/i.test(message)) return '上傳連線中斷，請檢查網路後再試。';
  if (status === 409 || /already exists|duplicate/i.test(message)) return '這次上傳已使用，請重新選擇圖片後再試。';
  if (name === 'SyntaxError' || /unexpected token|not valid json|json.parse|<!doctype|<html/i.test(message)) return RESPONSE_ERROR;
  // Application validation messages are short Chinese text; never display raw service payloads.
  if (message.length <= 200 && /[\u3400-\u9fff]/.test(message) && !/[<>]/.test(message)) return message;
  return RESPONSE_ERROR;
}

export async function readPolaroidUploadResponse(response: Response): Promise<Record<string, unknown>> {
  if (response.status === 401) throw new PolaroidUploadError(LOGIN_ERROR);
  if (response.status === 413) {
    throw new PolaroidUploadError('上傳要求超過大小限制，請重新整理後台後再選擇圖片；支援 JPG、PNG、WEBP，每張最多 15 MB。');
  }
  let data: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(await response.text());
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
  } catch {
    // A proxy may return plain text or HTML instead of the API's JSON response.
  }
  if (!response.ok) {
    throw new PolaroidUploadError(polaroidUploadErrorMessage({
      status: response.status,
      message: typeof data?.error === 'string' ? data.error : '',
    }));
  }
  if (!data || data.ok !== true) throw new PolaroidUploadError(RESPONSE_ERROR);
  return data;
}

/** Only the small prepare/complete messages go through the website API. */
export async function uploadPolaroidFile({ id, file, accessToken, storage, fetcher = fetch }: UploadOptions): Promise<void> {
  const validationError = validatePolaroidFile(file);
  if (validationError) throw new PolaroidUploadError(validationError);
  if (!accessToken) throw new PolaroidUploadError(LOGIN_ERROR);
  if (!id) throw new PolaroidUploadError('找不到成品訂單，請重新整理後台後再試。');

  const request = async (body: Record<string, unknown>) => readPolaroidUploadResponse(await fetcher('/api/staff/polaroids', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));

  try {
    const prepared = await request({ action: 'prepare', id, contentType: file.type, size: file.size });
    const { bucket, path, token, receipt } = prepared;
    if (bucket !== 'polaroids' || typeof path !== 'string' || !path || typeof token !== 'string' || !token || typeof receipt !== 'string' || !receipt) {
      throw new PolaroidUploadError(RESPONSE_ERROR);
    }
    const { error } = await storage.from(bucket).uploadToSignedUrl(path, token, file, { contentType: file.type });
    if (error) throw error;
    await request({ action: 'complete', id, receipt });
  } catch (error) {
    throw new PolaroidUploadError(polaroidUploadErrorMessage(error));
  }
}
