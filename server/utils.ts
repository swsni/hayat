import crypto from "crypto";
import path from "path";
import fs from "fs";
import { isSafeCustomerReference } from "../utils/helpers";

export const compareTokensConstantTime = (providedToken: string, storedToken: string): boolean => {
  const provided = Buffer.from(providedToken);
  const stored = Buffer.from(storedToken);
  if (provided.length !== stored.length) return false;
  return crypto.timingSafeEqual(provided, stored);
};

let hasWarnedMissingCafeLinkSecret = false;
export const getCafeLinkSigningSecret = (): string => {
  const explicit = process.env.CAFE_LINK_SIGNING_SECRET;
  if (explicit && explicit.trim()) return explicit.trim();
  return "";
};

export const getCafeLinkMaxAgeMs = (): number => {
  const raw = Number(process.env.CAFE_LINK_MAX_AGE_DAYS || "3650");
  const days = Number.isFinite(raw) ? Math.max(1, raw) : 3650;
  return days * 24 * 60 * 60 * 1000;
};

export const createCafeLinkSignature = (customerId: string, issuedAtMs: number, secret: string): string => {
  return crypto
    .createHmac("sha256", secret)
    .update(`${customerId}:${issuedAtMs}`)
    .digest("hex");
};

export const getWalletPassLinkSigningSecret = (): string => {
  const explicit = process.env.WALLET_PASS_LINK_SIGNING_SECRET;
  if (explicit && explicit.trim()) return explicit.trim();
  return getCafeLinkSigningSecret();
};

export const getWalletPassLinkMaxAgeMs = (): number => {
  const raw = Number(process.env.WALLET_PASS_LINK_MAX_AGE_DAYS || process.env.CAFE_LINK_MAX_AGE_DAYS || "3650");
  const days = Number.isFinite(raw) ? Math.max(1, raw) : 3650;
  return days * 24 * 60 * 60 * 1000;
};

export type PassLocationConfig = {
  latitude: number;
  longitude: number;
  relevantText?: string;
  [key: string]: unknown;
};

export type PassJsonConfig = {
  description?: string;
  organizationName?: string;
  logoText?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  labelColor?: string;
  webServiceURL?: string;
  maxDistance?: number;
  locations?: PassLocationConfig[];
};

const PASS_JSON_CANDIDATE_PATHS = [
  path.join(process.cwd(), "pass.json"),
  path.join(process.cwd(), "dist", "pass.json"),
];

export const loadPassJsonConfig = (): PassJsonConfig => {
  for (const candidatePath of PASS_JSON_CANDIDATE_PATHS) {
    try {
      if (!fs.existsSync(candidatePath)) continue;
      const parsed = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
      if (parsed && typeof parsed === "object") {
        return parsed as PassJsonConfig;
      }
    } catch (err) {
      console.warn(`[Wallet Pass] Could not parse pass.json from ${candidatePath}:`, err);
    }
  }

  return {};
};

export const ensureHttpsUrl = (candidate: string, fallback: string): string => {
  const trimmed = String(candidate || "").trim();
  if (!trimmed) return fallback;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") {
      console.warn(`[Wallet Pass] webServiceURL must be HTTPS. Falling back to ${fallback}. Received: ${trimmed}`);
      return fallback;
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    console.warn(`[Wallet Pass] Invalid webServiceURL. Falling back to ${fallback}. Received: ${trimmed}`);
    return fallback;
  }
};

export const normalizePassLocations = (locations: unknown): PassLocationConfig[] => {
  if (!Array.isArray(locations)) return [];

  const normalized: PassLocationConfig[] = [];
  for (const location of locations) {
    if (!location || typeof location !== "object") continue;
    const candidate = location as Record<string, unknown>;
    const latitude = Number(candidate.latitude);
    const longitude = Number(candidate.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) continue;

    const relevantText = typeof candidate.relevantText === "string" ? candidate.relevantText.trim() : "";
    normalized.push({
      latitude,
      longitude,
      ...(relevantText ? { relevantText } : {}),
    });
  }

  return normalized;
};

export const normalizeMaxDistance = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.min(100000, Math.floor(parsed));
};

export const buildSignedCustomerQuery = (
  customerId: string,
  secret: string,
  issuedAtMs: number = Date.now()
): URLSearchParams => {
  const signature = createCafeLinkSignature(customerId, issuedAtMs, secret);
  const query = new URLSearchParams();
  query.set("cid", customerId);
  query.set("ts", String(issuedAtMs));
  query.set("sig", signature);
  return query;
};

export type ResolvedCustomerFromLink =
  | { ok: true; customerId: string; resolvedVia: "signed" | "legacy" }
  | { ok: false; status: number; error: string };

export const resolveCustomerReferenceFromLink = (params: {
  signedCustomerId: string;
  signedTsRaw: string;
  signedSignature: string;
  legacyCustomerId: string;
  allowLegacy: boolean;
  secret: string;
  maxAgeMs: number;
}): ResolvedCustomerFromLink => {
  const {
    signedCustomerId,
    signedTsRaw,
    signedSignature,
    legacyCustomerId,
    allowLegacy,
    secret,
    maxAgeMs,
  } = params;

  const hasAnySignedParam = Boolean(signedCustomerId || signedTsRaw || signedSignature);

  if (hasAnySignedParam) {
    if (!signedCustomerId || !signedTsRaw || !signedSignature) {
      return { ok: false, status: 400, error: "Invalid signed link parameters" };
    }
    if (!secret) {
      return { ok: false, status: 503, error: "Signed link verification unavailable" };
    }

    const signedTs = Number(signedTsRaw);
    if (!Number.isFinite(signedTs) || signedTs <= 0) {
      return { ok: false, status: 400, error: "Invalid signed timestamp" };
    }

    const now = Date.now();
    const maxFutureSkewMs = 5 * 60 * 1000;
    if (signedTs > now + maxFutureSkewMs || now - signedTs > maxAgeMs) {
      return { ok: false, status: 401, error: "Signed link expired" };
    }

    const expectedSignature = createCafeLinkSignature(signedCustomerId, signedTs, secret);
    if (!compareTokensConstantTime(signedSignature, expectedSignature)) {
      return { ok: false, status: 401, error: "Invalid signed link" };
    }

    if (!isSafeCustomerReference(signedCustomerId)) {
      return { ok: false, status: 400, error: "Invalid customer reference format" };
    }

    return { ok: true, customerId: signedCustomerId, resolvedVia: "signed" };
  }

  if (!allowLegacy) {
    return { ok: false, status: 401, error: "Legacy customerId links are disabled" };
  }
  if (!legacyCustomerId) {
    return { ok: false, status: 400, error: "Missing customer reference" };
  }
  if (!isSafeCustomerReference(legacyCustomerId)) {
    return { ok: false, status: 400, error: "Invalid customer reference format" };
  }
  return { ok: true, customerId: legacyCustomerId, resolvedVia: "legacy" };
};

export const buildCafeOrderLink = (customerId: string): string => {
  const baseOrigin = (process.env.PUBLIC_APP_URL || "https://hayat.beauty").replace(/\/+$/, "");
  const secret = getCafeLinkSigningSecret();
  const url = new URL("/cafe", baseOrigin);

  if (!secret) {
    if (!hasWarnedMissingCafeLinkSecret) {
      console.warn("[Cafe Link] CAFE_LINK_SIGNING_SECRET is not set. Falling back to legacy customerId links.");
      hasWarnedMissingCafeLinkSecret = true;
    }
    url.searchParams.set("customerId", customerId);
    return url.toString();
  }

  const signedQuery = buildSignedCustomerQuery(customerId, secret);
  signedQuery.forEach((value, key) => url.searchParams.set(key, value));
  return url.toString();
};

export const buildWalletPassDownloadLink = (customerId: string, baseOriginOverride?: string): string => {
  const baseOrigin = (baseOriginOverride || process.env.PUBLIC_APP_URL || "https://hayat.beauty").replace(/\/+$/, "");
  const url = new URL("/api/wallet/pass", baseOrigin);
  const secret = getWalletPassLinkSigningSecret();

  if (!secret) {
    url.searchParams.set("customerId", customerId);
    return url.toString();
  }

  const signedQuery = buildSignedCustomerQuery(customerId, secret);
  signedQuery.forEach((value, key) => url.searchParams.set(key, value));
  return url.toString();
};
