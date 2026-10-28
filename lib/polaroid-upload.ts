export const POLAROID_MAX_BYTES = 15 * 1024 * 1024;
export const POLAROID_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export function validatePolaroidFile(file: {size: number; type: string}): string | null {
  if (!Number.isSafeInteger(file.size) || file.size <= 0) return '圖片檔案是空的，請重新選擇圖片';
  if (file.size > POLAROID_MAX_BYTES) return '圖片不可超過 15MB，請選擇較小的檔案';
  if (!(POLAROID_MIME_TYPES as readonly string[]).includes(file.type)) return '僅支援 JPG、PNG、WEBP 圖片';
  return null;
}
