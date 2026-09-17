export const FEEDBACK_SERVICES = [
  '只點餐而已', '泡湯洗浴', '按摩服務', '耳語陪伴',
  'Q版繪圖(公版)', '拍立得', '簽繪拍立得', '其他服務',
] as const;

export type FeedbackInput = {
  submission_id: string;
  is_anonymous: boolean;
  guest_name: string | null;
  staff_name: string;
  rating: number;
  services: string[];
  comments: string;
};

export function validateFeedback(body: unknown): FeedbackInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('填答格式不正確');
  const input = body as Record<string, unknown>;
  if (typeof input.submission_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.submission_id)) {
    throw new Error('請重新整理頁面後再送出');
  }
  if (typeof input.is_anonymous !== 'boolean') throw new Error('請選擇是否匿名');
  const name = input.is_anonymous ? null : typeof input.guest_name === 'string' ? input.guest_name.trim() : '';
  if (!input.is_anonymous && (!name || name.length > 80)) throw new Error('請填寫 80 字以內的客人姓名，或選擇匿名');
  const staff = typeof input.staff_name === 'string' ? input.staff_name.trim() : '';
  if (!staff || staff.length > 160) throw new Error('請填寫服務館員，沒有則填「無」（最多 160 字）');
  if (typeof input.rating !== 'number' || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new Error('請選擇 1～5 星滿意度');
  if (!Array.isArray(input.services) || !input.services.length || input.services.length > FEEDBACK_SERVICES.length || input.services.some(service => typeof service !== 'string' || !FEEDBACK_SERVICES.includes(service as typeof FEEDBACK_SERVICES[number]))) {
    throw new Error('請至少選擇一項本次服務');
  }
  const services = [...new Set(input.services as string[])];
  if (services.includes('只點餐而已') && services.length > 1) throw new Error('「只點餐而已」不能與其他服務同時選擇');
  if (input.comments !== undefined && typeof input.comments !== 'string') throw new Error('意見格式不正確');
  const comments = typeof input.comments === 'string' ? input.comments.trim() : '';
  if (comments.length > 2000) throw new Error('意見請控制在 2,000 字以內');
  return {submission_id:input.submission_id, is_anonymous:input.is_anonymous, guest_name:name, staff_name:staff, rating:input.rating, services, comments};
}
