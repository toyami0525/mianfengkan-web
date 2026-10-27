// Shared presentation and validation rules. This module contains no database client.
export const HALLOWEEN_CAMPAIGN_ID = 'airi-halloween-2026';
export const HALLOWEEN_CAMPAIGN_TITLE = '愛梨・萬聖節滿額贈';
export const HALLOWEEN_THRESHOLD = 400000;
export const HALLOWEEN_REWARD_NAME = '萬聖節特別版簽繪';
export const HALLOWEEN_TIMEZONE = 'Asia/Taipei';
export const HALLOWEEN_DAILY_LIMIT = 1;

export type HalloweenCampaignRecord = {
  id: string;
  enabled: boolean;
  published: boolean;
  starts_on: string | null;
  ends_on: string | null;
  updated_at: string;
};

export type HalloweenCampaignConfig = HalloweenCampaignRecord & {
  title: string;
  reward_name: string;
  threshold: number;
  per_day_limit: number;
  timezone: string;
};

export type HalloweenRewardClaim = {
  id: string;
  pickup_code: string;
  pickup_status: string;
  issued_at: string;
  qualifying_total: number;
};

export type HalloweenGuestRow = {
  guest_name: string;
  guest_server: string;
  reservation_total: number;
  dining_total: number;
  game_total: number;
  total: number;
  eligible: boolean;
  can_issue: boolean;
  claim: HalloweenRewardClaim | null;
};

export type HalloweenCampaignDashboard = {
  config: HalloweenCampaignConfig;
  spend_date: string;
  guests: HalloweenGuestRow[];
  summary: {total_guests: number; qualified_guests: number; issued_count: number};
};

export const HALLOWEEN_CONFIG_COLUMNS = 'id,enabled,published,starts_on,ends_on,updated_at';

export function taipeiCampaignDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: HALLOWEEN_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function isCampaignDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function normalizeCampaignGuest(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

export function campaignConfig(record: HalloweenCampaignRecord): HalloweenCampaignConfig {
  return {
    id: HALLOWEEN_CAMPAIGN_ID,
    title: HALLOWEEN_CAMPAIGN_TITLE,
    reward_name: HALLOWEEN_REWARD_NAME,
    threshold: HALLOWEEN_THRESHOLD,
    per_day_limit: HALLOWEEN_DAILY_LIMIT,
    timezone: HALLOWEEN_TIMEZONE,
    enabled: record.enabled === true,
    published: record.published === true,
    starts_on: record.starts_on,
    ends_on: record.ends_on,
    updated_at: record.updated_at,
  };
}

export function campaignIncludesDate(config: HalloweenCampaignRecord, date: string): boolean {
  return isCampaignDate(date) && isCampaignDate(config.starts_on) && isCampaignDate(config.ends_on)
    && config.starts_on <= config.ends_on && date >= config.starts_on && date <= config.ends_on;
}

export function campaignIsPublic(config: HalloweenCampaignRecord, today = taipeiCampaignDate()): boolean {
  return config.enabled === true && config.published === true && campaignIncludesDate(config, today);
}

export function campaignCanIssueOn(config: HalloweenCampaignRecord, date: string, today = taipeiCampaignDate()): boolean {
  // Completed eligible days may still be fulfilled after the announcement ends.
  return config.enabled === true && campaignIncludesDate(config, date) && date <= today;
}

export function campaignAmount(value: unknown): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('活動消費金額格式不正確，請聯絡館主核對');
  return amount;
}
