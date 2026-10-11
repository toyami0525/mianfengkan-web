export const AIRI_QUEUE_LIMIT = 5;
export const QUEUE_WAITING_STATUSES = ['pending', 'acknowledged'];

export function isQueueStaff(staff: {slug?: string | null}) {
  return staff.slug === 'airi';
}

export function queueSummary(rows: {status?: string | null}[]) {
  return {
    booking_mode: 'queue' as const,
    queue_count: rows.filter(row => QUEUE_WAITING_STATUSES.includes(String(row.status))).length,
    queue_limit: AIRI_QUEUE_LIMIT,
    queue_serving: rows.some(row => ['confirmed','已確認'].includes(String(row.status))),
  };
}
