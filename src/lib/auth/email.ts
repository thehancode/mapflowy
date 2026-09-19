export const ALLOWED_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
]);

export function validateConsumerEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  const local = at > 0 ? normalized.slice(0, at) : "";
  const domain = at > 0 ? normalized.slice(at + 1) : "";
  if (!local || !domain || local.length > 64 || !/^[^\s@]+$/.test(local) || !ALLOWED_EMAIL_DOMAINS.has(domain)) {
    return "Use a Gmail, Outlook, Hotmail, Live, MSN, or Googlemail address.";
  }
  return "";
}
