export const SESSION_COOKIE = "session";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function getKey() {
  const secret = process.env.APP_PASSWORD;
  if (!secret) throw new Error("APP_PASSWORD is not set");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

// Buffer isn't available in the Edge runtime (middleware), so encode base64url by hand.
function toBase64Url(bytes: ArrayBuffer) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(payload: string) {
  const key = await getKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toBase64Url(sig);
}

export async function createSessionCookieValue() {
  const expiresAt = Date.now() + THIRTY_DAYS_MS;
  const payload = String(expiresAt);
  const sig = await sign(payload);
  return `${payload}.${sig}`;
}

export async function verifySessionCookieValue(value: string | undefined) {
  if (!value) return false;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return false;

  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const expectedSig = await sign(payload);
  if (expectedSig.length !== sig.length) return false;

  // Constant-time-ish comparison to avoid short-circuiting on the first differing byte.
  let mismatch = 0;
  for (let i = 0; i < expectedSig.length; i++) {
    mismatch |= expectedSig.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return mismatch === 0;
}

export function checkPassword(candidate: string) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) throw new Error("APP_PASSWORD is not set");
  if (candidate.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= candidate.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
