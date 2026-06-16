// Referral attribution — stores creator/influencer referral metadata in
// localStorage and a cookie so it survives navigation across the auth flow.

export interface ReferralAttribution {
  referral_source: string;
  campaign_type: string;
  creator_slug: string;
  creator_name: string;
  referral_code: string | null;
  referral_landing_path: string;
  referral_landing_url: string;
  referral_first_seen_at: string;
  referral_last_seen_at: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
}

const REFERRAL_KEY = "neeko_referral_attribution";
const COOKIE_NAME = "neeko_ref";
const COOKIE_TTL_DAYS = 30;

export function saveReferralAttribution(data: ReferralAttribution): void {
  try {
    localStorage.setItem(REFERRAL_KEY, JSON.stringify(data));
  } catch { /* ignore */ }

  try {
    const expires = new Date(Date.now() + COOKIE_TTL_DAYS * 86_400_000).toUTCString();
    const payload = encodeURIComponent(JSON.stringify({
      creator_slug: data.creator_slug,
      creator_name: data.creator_name,
      referral_code: data.referral_code,
      referral_first_seen_at: data.referral_first_seen_at,
    }));
    document.cookie = `${COOKIE_NAME}=${payload}; expires=${expires}; path=/; SameSite=Lax`;
  } catch { /* ignore */ }
}

export function loadReferralAttribution(): ReferralAttribution | null {
  try {
    const raw = localStorage.getItem(REFERRAL_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as ReferralAttribution;
    data.referral_last_seen_at = new Date().toISOString();
    return data;
  } catch {
    return null;
  }
}

export function clearReferralAttribution(): void {
  try { localStorage.removeItem(REFERRAL_KEY); } catch { /* ignore */ }
  try {
    document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  } catch { /* ignore */ }
}
