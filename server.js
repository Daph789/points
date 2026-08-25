import "dotenv/config";
import dotenv from "dotenv";
import express from "express";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomInt, randomUUID } from "node:crypto";

dotenv.config({ path: ".env.local" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 4174);

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || "";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const adminPassword = process.env.ADMIN_DONOS_PASSWORD || "";
const publicAppUrl = process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const supabaseAdmin =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

const pointPacks = {
  "50": { points: 50, amount: 620, baseAmount: 500, feeAmount: 120, stripeFeeAmount: 45, label: "50 puntos" },
  "100": { points: 100, amount: 1120, baseAmount: 1000, feeAmount: 120, stripeFeeAmount: 61, label: "100 puntos" },
  "250": { points: 250, amount: 2620, baseAmount: 2500, feeAmount: 120, stripeFeeAmount: 110, label: "250 puntos" },
  "500": { points: 500, amount: 5120, baseAmount: 5000, feeAmount: 120, stripeFeeAmount: 191, label: "500 puntos" },
};

function pointPackFor(points) {
  return pointPacks[String(points)] || null;
}

function computedStripeFeeForRecharge(recharge) {
  const pack = pointPackFor(recharge?.points);
  return pack ? pack.stripeFeeAmount : Number(recharge?.stripe_fee_amount || 0);
}

function publicOriginForRequest(request) {
  if (publicAppUrl) return publicAppUrl.replace(/\/+$/, "");

  const headerOrigin = String(request.headers.origin || "").trim();
  if (headerOrigin) {
    try {
      const url = new URL(headerOrigin);
      if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return url.origin;
      url.protocol = "https:";
      return url.origin;
    } catch (_error) {}
  }

  const host = String(request.get("host") || "").trim();
  if (!host) return `http://localhost:${port}`;
  const hostname = host.split(":")[0];
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = hostname === "localhost" || hostname === "127.0.0.1" ? "http" : forwardedProto === "https" ? "https" : "https";
  return `${protocol}://${host}`;
}

function enrichRechargeAccounting(recharge) {
  const pack = pointPackFor(recharge?.points);
  const amountTotal = Number(recharge?.amount_total || pack?.amount || 0);
  const baseAmount = pack?.baseAmount ?? Number(recharge?.points || 0) * 10;
  const donosFeeAmount = pack?.feeAmount ?? Math.max(amountTotal - baseAmount, 0);
  const stripeFeeAmount = computedStripeFeeForRecharge(recharge);
  const netAmount = amountTotal - stripeFeeAmount;
  const companyMargin = donosFeeAmount - stripeFeeAmount;

  return {
    ...recharge,
    amount_total: amountTotal,
    stripe_fee_amount: stripeFeeAmount,
    net_amount: netAmount,
    point_value_cents: baseAmount,
    donos_fee_amount: donosFeeAmount,
    donos_company_margin_cents: Math.max(companyMargin, 0),
    donos_debt_cents: Math.max(-companyMargin, 0),
  };
}

async function getPointPackSettings() {
  const defaults = Object.values(pointPacks).map((pack) => ({
    ...pack,
    is_disabled: false,
  }));

  if (!supabaseAdmin) return defaults;

  try {
    const { data, error } = await supabaseAdmin
      .from("point_pack_settings")
      .select("points, is_disabled")
      .in("points", defaults.map((pack) => pack.points));

    if (error) {
      if (error.code !== "42P01") console.error("Point pack settings error:", error);
      return defaults;
    }

    const settingsByPoints = Object.fromEntries((data || []).map((item) => [Number(item.points), Boolean(item.is_disabled)]));
    return defaults.map((pack) => ({
      ...pack,
      is_disabled: Boolean(settingsByPoints[pack.points]),
    }));
  } catch (error) {
    console.error("Point pack settings fatal error:", error);
    return defaults;
  }
}

function generateDonosTransactionId() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  const characters = [
    ...Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]),
    ...Array.from({ length: 8 }, () => digits[Math.floor(Math.random() * digits.length)]),
  ];

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }

  return characters.join("");
}

function cleanValidDonosId(value) {
  const clean = String(value || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const letters = clean.replace(/[^A-Z]/g, "").length;
  const digits = clean.replace(/[^0-9]/g, "").length;
  return clean.length === 12 && letters === 4 && digits === 8 ? clean : "";
}

function transferPublicProfile(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    display_name: profile.display_name,
    email: profile.email,
    phone: profile.phone,
    account_type: profile.account_type,
    transaction_id: profile.transaction_id,
    is_verified: Boolean(profile.is_verified),
  };
}

function businessPublicProfile(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    display_name: profile.display_name,
    bio: profile.bio || "",
    account_type: profile.account_type,
    business_categories: profile.business_categories || [],
    address: profile.address || "",
    neighborhood: profile.neighborhood || "",
    transaction_id: profile.transaction_id || "",
    is_verified: Boolean(profile.is_verified),
    profile_photo_data_url: profile.profile_photo_data_url || "",
  };
}

function referralPublicProfile(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    display_name: profile.display_name,
    account_type: profile.account_type,
    transaction_id: profile.transaction_id,
    is_verified: Boolean(profile.is_verified),
  };
}

function addDays(date, days) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString();
}

function premiumPointsForAccountType(accountType) {
  return accountType === "business" ? 30 : 20;
}

function premiumPublicStatus(subscription, profile) {
  const points = premiumPointsForAccountType(profile?.account_type);
  const status = subscription?.status || profile?.premium_status || "inactive";
  return {
    status,
    points,
    is_active: status === "active",
    started_at: subscription?.started_at || profile?.premium_started_at || null,
    next_charge_at: subscription?.next_charge_at || profile?.premium_next_charge_at || null,
    failed_at: subscription?.failed_at || profile?.premium_failed_at || null,
  };
}

function premiumIdentityPublic(profile) {
  return {
    dni: profile?.premium_identity_dni || "",
    photo_data_url: profile?.premium_identity_photo_data_url || "",
    verified_at: profile?.premium_identity_verified_at || null,
    updated_at: profile?.premium_identity_updated_at || null,
    is_complete: Boolean(profile?.premium_identity_dni && profile?.premium_identity_photo_data_url),
  };
}

function cleanIdentityDni(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

async function syncBusinessVerification(profile) {
  if (!supabaseAdmin || profile?.account_type !== "business") return;
  const { error } = await supabaseAdmin
    .from("business_offers")
    .update({
      business_display_name: profile.display_name,
      business_is_verified: Boolean(profile.is_verified),
    })
    .eq("business_id", profile.id);

  if (error && error.code !== "42P01") console.error("Business verification sync error:", error);
}

async function loadPremiumSubscription(profileId) {
  const { data, error } = await supabaseAdmin
    .from("premium_subscriptions")
    .select("id, profile_id, account_type, points, status, started_at, next_charge_at, last_charge_at, failed_at, created_at, updated_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function loadAdminVerifiedForProfile(profile) {
  if (typeof profile?.admin_verified === "boolean") return profile.admin_verified;
  if (!supabaseAdmin || !profile?.id) return false;
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("admin_verified")
    .eq("id", profile.id)
    .maybeSingle();
  if (error?.code === "42703") return false;
  if (error) throw error;
  return Boolean(data?.admin_verified);
}

async function syncPremiumForProfile(profile) {
  if (!supabaseAdmin || !profile?.id) return { profile, subscription: null, charges: [] };

  let subscription = null;
  try {
    subscription = await loadPremiumSubscription(profile.id);
  } catch (error) {
    if (error.code === "42P01" || error.code === "42703") {
      return { profile, subscription: null, charges: [], missingSql: true };
    }
    throw error;
  }

  if (subscription?.status === "active" && subscription.next_charge_at && new Date(subscription.next_charge_at).getTime() <= Date.now()) {
    const points = premiumPointsForAccountType(profile.account_type);
    const currentPoints = Number(profile.points || 0);
    const now = new Date().toISOString();

    if (currentPoints >= points) {
      const nextChargeAt = addDays(now, 31);
      const updatedPoints = currentPoints - points;
      const [{ data: updatedProfile, error: profileError }, { data: updatedSubscription, error: subscriptionError }, { error: chargeError }] =
        await Promise.all([
          supabaseAdmin
            .from("profiles")
            .update({
              points: updatedPoints,
              is_verified: true,
              premium_status: "active",
              premium_next_charge_at: nextChargeAt,
              premium_failed_at: null,
            })
            .eq("id", profile.id)
            .select("id, account_type, display_name, bio, email, phone, neighborhood, address, business_categories, tax_id, transaction_id, points, is_verified, admin_verified, premium_status, premium_started_at, premium_next_charge_at, premium_failed_at, premium_identity_dni, premium_identity_photo_data_url, premium_identity_verified_at, premium_identity_updated_at")
            .maybeSingle(),
          supabaseAdmin
            .from("premium_subscriptions")
            .update({
              points,
              status: "active",
              last_charge_at: now,
              next_charge_at: nextChargeAt,
              failed_at: null,
              updated_at: now,
            })
            .eq("id", subscription.id)
            .select("id, profile_id, account_type, points, status, started_at, next_charge_at, last_charge_at, failed_at, created_at, updated_at")
            .maybeSingle(),
          supabaseAdmin.from("premium_subscription_charges").insert({
            subscription_id: subscription.id,
            profile_id: profile.id,
            points,
            status: "paid",
            reason: "renewal",
          }),
        ]);

      if (profileError || subscriptionError || chargeError) throw profileError || subscriptionError || chargeError;
      profile = updatedProfile || { ...profile, points: updatedPoints, is_verified: true, premium_status: "active", premium_next_charge_at: nextChargeAt };
      subscription = updatedSubscription || { ...subscription, points, status: "active", next_charge_at: nextChargeAt, last_charge_at: now, failed_at: null };
      await syncBusinessVerification(profile);
    } else {
      const keepAdminVerification = await loadAdminVerifiedForProfile(profile);
      const [{ data: updatedProfile, error: profileError }, { data: updatedSubscription, error: subscriptionError }, { error: chargeError }] =
        await Promise.all([
          supabaseAdmin
            .from("profiles")
            .update({
              is_verified: keepAdminVerification,
              premium_status: "failed",
              premium_failed_at: now,
            })
            .eq("id", profile.id)
            .select("id, account_type, display_name, bio, email, phone, neighborhood, address, business_categories, tax_id, transaction_id, points, is_verified, admin_verified, premium_status, premium_started_at, premium_next_charge_at, premium_failed_at, premium_identity_dni, premium_identity_photo_data_url, premium_identity_verified_at, premium_identity_updated_at")
            .maybeSingle(),
          supabaseAdmin
            .from("premium_subscriptions")
            .update({
              status: "failed",
              failed_at: now,
              updated_at: now,
            })
            .eq("id", subscription.id)
            .select("id, profile_id, account_type, points, status, started_at, next_charge_at, last_charge_at, failed_at, created_at, updated_at")
            .maybeSingle(),
          supabaseAdmin.from("premium_subscription_charges").insert({
            subscription_id: subscription.id,
            profile_id: profile.id,
            points,
            status: "failed",
            reason: "insufficient_points",
          }),
        ]);

      if (profileError || subscriptionError || chargeError) throw profileError || subscriptionError || chargeError;
      profile = updatedProfile || { ...profile, is_verified: keepAdminVerification, premium_status: "failed", premium_failed_at: now };
      subscription = updatedSubscription || { ...subscription, status: "failed", failed_at: now };
      await syncBusinessVerification(profile);
    }
  }

  const { data: charges, error: chargesError } = await supabaseAdmin
    .from("premium_subscription_charges")
    .select("id, points, status, reason, created_at")
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(12);

  if (chargesError && chargesError.code !== "42P01") throw chargesError;
  return { profile, subscription, charges: charges || [], missingSql: false };
}

function parsePlanProfilePhotos(value) {
  const raw = String(value || "");
  if (!raw) return [];
  if (raw.startsWith("data:image/")) return [raw];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => String(item || "").startsWith("data:image/")).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function normalizedPlanProfilePhotos(values) {
  const photos = (Array.isArray(values) ? values : [values])
    .map((value) => String(value || ""))
    .filter((value) => value.startsWith("data:image/"))
    .slice(0, 5);
  if (photos.length === 0) return null;
  const encoded = JSON.stringify(photos);
  if (encoded.length > 4200000) {
    const error = new Error("photo_too_large");
    error.code = "photo_too_large";
    throw error;
  }
  return encoded;
}

function compactNotificationCounts(events, readKeys) {
  const unread = events.filter((event) => !readKeys.has(event.key));
  const sections = {};
  const subsections = {};

  for (const event of unread) {
    sections[event.section] = (sections[event.section] || 0) + 1;
    const subsectionKey = `${event.section}:${event.subsection}`;
    subsections[subsectionKey] = (subsections[subsectionKey] || 0) + 1;
  }

  return { total: unread.length, sections, subsections };
}

function pushNotification(events, event) {
  if (!event?.key || !event?.created_at) return;
  events.push({
    section: "historial",
    href: "historial.html",
    ...event,
  });
}

function normalizeAnalyticsPage(value) {
  const clean = String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9_/#?=.-]/g, "")
    .slice(0, 120);
  return clean || "unknown";
}

function analyticsDateRange(body = {}) {
  const endInput = String(body.endDate || "").slice(0, 10);
  const startInput = String(body.startDate || "").slice(0, 10);
  const endDate = /^\d{4}-\d{2}-\d{2}$/.test(endInput) ? new Date(`${endInput}T23:59:59.999Z`) : new Date();
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(startInput)
    ? new Date(`${startInput}T00:00:00.000Z`)
    : new Date(endDate.getTime() - 6 * 24 * 60 * 60 * 1000);
  return {
    startIso: startDate.toISOString(),
    endIso: endDate.toISOString(),
  };
}

function generateTicketValidationCode() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 7 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

function generateTicketSecurityCode() {
  return Array.from({ length: 4 }, () => String(randomInt(10))).join("");
}

function cleanTicketValidationCode(value) {
  return String(value || "").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 7);
}

function cleanTicketSecurityCode(value) {
  return String(value || "").replace(/[^0-9]/g, "").slice(0, 4);
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function metadataText(metadata, key) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

async function ensureProfileForUser(user) {
  if (!supabaseAdmin || !user?.id) return null;

  const baseProfileColumns = "id, account_type, display_name, email, phone, neighborhood, address, business_categories, tax_id, transaction_id, points, is_verified";
  const profileIdentityColumns = `${baseProfileColumns}, bio`;
  const bankProfileColumns = `${baseProfileColumns}, bank_account_holder, bank_iban, bank_name, bank_bic`;
  const premiumProfileColumns = `${baseProfileColumns}, premium_status, premium_started_at, premium_next_charge_at, premium_failed_at, premium_identity_dni, premium_identity_photo_data_url, premium_identity_verified_at, premium_identity_updated_at`;
  const profileColumns = `${profileIdentityColumns}, profile_photo_data_url, bank_account_holder, bank_iban, bank_name, bank_bic, premium_status, premium_started_at, premium_next_charge_at, premium_failed_at, premium_identity_dni, premium_identity_photo_data_url, premium_identity_verified_at, premium_identity_updated_at, plan_gender_preference, plan_photo_data_url`;
  let { data: existing, error: existingError } = await supabaseAdmin
    .from("profiles")
    .select(profileColumns)
    .eq("id", user.id)
    .maybeSingle();

  if (existingError?.code === "42703") {
    const fallback = await supabaseAdmin
      .from("profiles")
      .select(baseProfileColumns)
      .eq("id", user.id)
      .maybeSingle();
    existing = fallback.data;
    existingError = fallback.error;
  }

  if (existingError) throw existingError;
  const metadata = user.user_metadata || user.raw_user_meta_data || {};
  if (existing) {
    const metadataBio = metadataText(metadata, "bio");
    if (metadataBio && !existing.bio) {
      try {
        const { data: updated, error: updateError } = await supabaseAdmin
          .from("profiles")
          .update({ bio: metadataBio })
          .eq("id", user.id)
          .select(profileColumns)
          .maybeSingle();
        if (!updateError && updated) return updated;
        if (updateError?.code !== "42703") console.error("Profile bio backfill error:", updateError);
      } catch (error) {
        if (error?.code !== "42703") console.error("Profile bio backfill fatal error:", error);
      }
    }
    const metadataBankIban = metadataText(metadata, "bank_iban").replace(/[^A-Z0-9]/gi, "").toUpperCase();
    if (existing.account_type === "business" && metadataBankIban && !existing.bank_iban) {
      try {
        const { data: updated, error: updateError } = await supabaseAdmin
          .from("profiles")
          .update({
            bank_account_holder: metadataText(metadata, "bank_account_holder") || existing.display_name,
            bank_iban: metadataBankIban,
            bank_name: metadataText(metadata, "bank_name") || null,
            bank_bic: metadataText(metadata, "bank_bic").replace(/\s+/g, "").toUpperCase() || null,
          })
          .eq("id", user.id)
          .select(profileColumns)
          .maybeSingle();
        if (!updateError && updated) return updated;
        if (updateError?.code !== "42703") console.error("Business bank details backfill error:", updateError);
      } catch (error) {
        if (error?.code !== "42703") console.error("Business bank details backfill fatal error:", error);
      }
    }
    await registerReferralForProfile(existing, metadata);
    return existing;
  }

  const accountType = metadataText(metadata, "account_type") === "business" ? "business" : "user";
  const businessCategories = Array.isArray(metadata.business_categories) ? metadata.business_categories : null;
  const displayName =
    metadataText(metadata, "display_name") ||
    metadataText(metadata, "full_name") ||
    String(user.email || "").split("@")[0] ||
    "Tu cuenta";

  const baseProfile = {
    id: user.id,
    account_type: accountType,
    display_name: displayName,
    bio: metadataText(metadata, "bio") || null,
    email: user.email || metadataText(metadata, "email"),
    phone: metadataText(metadata, "phone") || null,
    neighborhood: metadataText(metadata, "neighborhood") || "Donostia",
    address: metadataText(metadata, "address") || null,
    business_categories: businessCategories,
    tax_id: metadataText(metadata, "tax_id") || null,
    points: 0,
    is_verified: false,
  };

  if (accountType === "business") {
    baseProfile.bank_account_holder = metadataText(metadata, "bank_account_holder") || null;
    baseProfile.bank_iban = metadataText(metadata, "bank_iban").replace(/[^A-Z0-9]/gi, "").toUpperCase() || null;
    baseProfile.bank_name = metadataText(metadata, "bank_name") || null;
    baseProfile.bank_bic = metadataText(metadata, "bank_bic").replace(/\s+/g, "").toUpperCase() || null;
  }

  const metadataId = cleanValidDonosId(metadata.transaction_id);
  const transactionIds = [
    metadataId,
    ...Array.from({ length: 8 }, () => generateDonosTransactionId()),
  ].filter(Boolean);

  let lastError = null;

  for (const transactionId of transactionIds) {
    let { data: created, error } = await supabaseAdmin
      .from("profiles")
      .insert({ ...baseProfile, transaction_id: transactionId })
      .select(profileColumns)
      .maybeSingle();

    if (error?.code === "42703") {
      const { bio: _bio, ...profileWithoutBio } = baseProfile;
      const fallback = await supabaseAdmin
        .from("profiles")
        .insert({ ...profileWithoutBio, transaction_id: transactionId })
        .select(baseProfileColumns)
        .maybeSingle();
      created = fallback.data;
      error = fallback.error;
    }

    if (!error && created) {
      await registerReferralForProfile(created, metadata);
      return created;
    }

    lastError = error;
    if (error?.code !== "23505") break;
  }

  throw lastError || new Error("Could not create profile");
}

async function registerReferralForProfile(profile, metadata = {}) {
  if (!supabaseAdmin || !profile?.id) return null;
  const referralCode = cleanValidDonosId(metadata.referral_code || metadata.referrer_code || metadata.referred_by_code);
  if (!referralCode) return null;

  try {
    const { data: referrer, error: referrerError } = await supabaseAdmin
      .from("profiles")
      .select("id, transaction_id")
      .eq("transaction_id", referralCode)
      .maybeSingle();

    if (referrerError || !referrer?.id || referrer.id === profile.id) return null;

    const { data, error } = await supabaseAdmin
      .from("referrals")
      .insert({
        referrer_profile_id: referrer.id,
        referred_profile_id: profile.id,
        referral_code: referralCode,
      })
      .select("id")
      .maybeSingle();

    if (error && error.code !== "23505") throw error;
    return data || null;
  } catch (error) {
    if (error.code !== "42P01" && error.code !== "42703") console.error("Referral register error:", error);
    return null;
  }
}

async function markReferralRecharge(userId) {
  if (!supabaseAdmin || !userId) return;
  try {
    const now = new Date().toISOString();
    const { data: referral, error } = await supabaseAdmin
      .from("referrals")
      .update({ referred_recharged_at: now, reward_eligible_at: now, updated_at: now })
      .eq("referred_profile_id", userId)
      .is("referred_recharged_at", null)
      .select("id, referrer_profile_id")
      .maybeSingle();

    if (error && error.code !== "PGRST116") throw error;
    if (!referral?.referrer_profile_id) return;

    const { count } = await supabaseAdmin
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("referrer_profile_id", referral.referrer_profile_id)
      .not("referred_recharged_at", "is", null);

    if (Number(count || 0) >= 5) {
      await supabaseAdmin
        .from("referrals")
        .update({ reward_eligible_at: now, updated_at: now })
        .eq("referrer_profile_id", referral.referrer_profile_id)
        .not("referred_recharged_at", "is", null)
        .is("reward_paid_at", null);
    }
  } catch (error) {
    if (error.code !== "42P01" && error.code !== "42703") console.error("Referral recharge mark error:", error);
  }
}

async function ensureProfileForUserId(userId) {
  if (!supabaseAdmin || !userId) return null;

  const { data: userData, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !userData?.user) {
    console.error("Could not load auth user:", error);
    return null;
  }

  return ensureProfileForUser(userData.user);
}

app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (request, response) => {
  if (!stripe || !supabaseAdmin) {
    return response.status(500).send("Stripe or Supabase admin is not configured");
  }

  let event;

  try {
    event = stripeWebhookSecret
      ? stripe.webhooks.constructEvent(request.body, request.headers["stripe-signature"], stripeWebhookSecret)
      : JSON.parse(request.body.toString("utf8"));
  } catch (error) {
    return response.status(400).send(`Webhook error: ${error.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userId = session.metadata?.user_id;
    const points = Number(session.metadata?.points || 0);

    if (userId && points > 0 && session.payment_status === "paid") {
      await ensureProfileForUserId(userId);
      const stripeAmounts = await getStripeAmounts(session);
      const { error } = await supabaseAdmin.rpc("credit_points_from_stripe", {
        p_user_id: userId,
        p_points: points,
        p_stripe_session_id: session.id,
        p_amount_total: stripeAmounts.amountTotal,
        p_currency: stripeAmounts.currency,
        p_stripe_fee_amount: stripeAmounts.feeAmount,
        p_net_amount: stripeAmounts.netAmount,
        p_customer_email: session.customer_details?.email || session.customer_email || "",
      });

      if (error) {
        console.error("Supabase credit error:", error);
        return response.status(500).send("Could not credit points");
      }
      await markReferralRecharge(userId);
    }
  }

  response.json({ received: true });
});

app.use(express.json({ limit: "6mb" }));

app.get("/api/me/referral-program", async (request, response) => {
  if (!supabaseAdmin) return response.status(500).json({ error: "Supabase admin is not configured" });
  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const profile = await ensureProfileForUser(auth.user);
    const origin = publicOriginForRequest(request);
    const referralCode = cleanValidDonosId(profile?.transaction_id);
    const referralLink = referralCode ? `${origin}/?ref=${encodeURIComponent(referralCode)}` : "";

    const [{ data: referrals, error: referralsError }, { data: sponsorRows, error: sponsorError }] = await Promise.all([
      supabaseAdmin
        .from("referrals")
        .select("id, referrer_profile_id, referred_profile_id, referral_code, referred_recharged_at, reward_eligible_at, reward_paid_at, reward_points, created_at")
        .eq("referrer_profile_id", profile.id)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("referrals")
        .select("id, referrer_profile_id, referred_profile_id, referral_code, referred_recharged_at, reward_paid_at, created_at")
        .eq("referred_profile_id", profile.id)
        .limit(1),
    ]);

    if (referralsError) throw referralsError;
    if (sponsorError) throw sponsorError;

    const referredIds = [...new Set((referrals || []).map((item) => item.referred_profile_id).filter(Boolean))];
    const sponsorIds = [...new Set((sponsorRows || []).map((item) => item.referrer_profile_id).filter(Boolean))];
    const profileIds = [...new Set([...referredIds, ...sponsorIds])];
    let profilesById = {};

    if (profileIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, account_type, transaction_id, is_verified")
        .in("id", profileIds);
      if (profilesError) throw profilesError;
      profilesById = Object.fromEntries((profiles || []).map((item) => [item.id, referralPublicProfile(item)]));
    }

    const completedCount = (referrals || []).filter((item) => item.referred_recharged_at).length;
    const rewardPaid = (referrals || []).some((item) => item.reward_paid_at);

    response.json({
      referral_code: referralCode,
      referral_link: referralLink,
      target_count: 5,
      reward_points: 100,
      total_referred: (referrals || []).length,
      completed_count: completedCount,
      reward_ready: completedCount >= 5 && !rewardPaid,
      reward_paid: rewardPaid,
      referrals: (referrals || []).map((item) => ({
        ...item,
        referred_profile: profilesById[item.referred_profile_id] || null,
        has_recharged: Boolean(item.referred_recharged_at),
      })),
      sponsor: sponsorRows?.[0]
        ? {
            ...sponsorRows[0],
            referrer_profile: profilesById[sponsorRows[0].referrer_profile_id] || null,
          }
        : null,
    });
  } catch (error) {
    console.error("Referral program error:", error);
    response.status(500).json({ error: error.code === "42P01" ? "referrals_sql_missing" : "referrals_failed" });
  }
});

app.post("/api/admin/referrals", async (request, response) => {
  if (!supabaseAdmin) return response.status(500).json({ error: "Supabase admin is not configured" });
  if (!adminPassword || request.body?.password !== adminPassword) {
    return response.status(401).json({ error: "Mot de passe incorrect" });
  }

  try {
    const { data: referrals, error } = await supabaseAdmin
      .from("referrals")
      .select("id, referrer_profile_id, referred_profile_id, referral_code, referred_recharged_at, reward_eligible_at, reward_paid_at, reward_points, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;

    const ids = [...new Set((referrals || []).flatMap((item) => [item.referrer_profile_id, item.referred_profile_id]).filter(Boolean))];
    let profilesById = {};
    if (ids.length > 0) {
      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, email, phone, account_type, transaction_id, points, is_verified")
        .in("id", ids);
      if (profilesError) throw profilesError;
      profilesById = Object.fromEntries((profiles || []).map((item) => [item.id, item]));
    }

    const grouped = {};
    for (const referral of referrals || []) {
      const key = referral.referrer_profile_id;
      if (!grouped[key]) {
        grouped[key] = {
          referrer: referralPublicProfile(profilesById[key]),
          referrer_private: profilesById[key] || null,
          referrals: [],
          total: 0,
          completed: 0,
          reward_paid: false,
        };
      }
      grouped[key].total += 1;
      if (referral.referred_recharged_at) grouped[key].completed += 1;
      if (referral.reward_paid_at) grouped[key].reward_paid = true;
      grouped[key].referrals.push({
        ...referral,
        referred_profile: referralPublicProfile(profilesById[referral.referred_profile_id]),
      });
    }

    const groups = Object.values(grouped).sort((a, b) => b.completed - a.completed || b.total - a.total);

    response.json({
      referrals: (referrals || []).map((item) => ({
        ...item,
        referrer_profile: referralPublicProfile(profilesById[item.referrer_profile_id]),
        referred_profile: referralPublicProfile(profilesById[item.referred_profile_id]),
      })),
      groups,
      summary: {
        total_referrals: (referrals || []).length,
        total_completed: (referrals || []).filter((item) => item.referred_recharged_at).length,
        reward_ready: groups.filter((group) => group.completed >= 5 && !group.reward_paid).length,
        reward_paid: groups.filter((group) => group.reward_paid).length,
      },
    });
  } catch (error) {
    console.error("Admin referrals error:", error);
    response.status(500).json({ error: error.code === "42P01" ? "referrals_sql_missing" : "No se han podido cargar los referidos" });
  }
});

app.post("/api/admin/referrals/reward", async (request, response) => {
  if (!supabaseAdmin) return response.status(500).json({ error: "Supabase admin is not configured" });
  if (!adminPassword || request.body?.password !== adminPassword) {
    return response.status(401).json({ error: "Mot de passe incorrect" });
  }

  const referrerId = String(request.body?.referrerId || "").trim();
  const rewardPoints = Math.max(Math.floor(Number(request.body?.points || 100)), 1);
  if (!referrerId) return response.status(400).json({ error: "Falta la cuenta" });

  try {
    const { data: referrals, error: referralsError } = await supabaseAdmin
      .from("referrals")
      .select("id, referred_recharged_at, reward_paid_at")
      .eq("referrer_profile_id", referrerId);
    if (referralsError) throw referralsError;

    const completed = (referrals || []).filter((item) => item.referred_recharged_at);
    const alreadyPaid = (referrals || []).some((item) => item.reward_paid_at);
    if (alreadyPaid) return response.status(409).json({ error: "reward_already_paid" });
    if (completed.length < 5) return response.status(400).json({ error: "not_enough_referrals" });

    const now = new Date().toISOString();
    const { error: markError } = await supabaseAdmin
      .from("referrals")
      .update({ reward_paid_at: now, reward_points: rewardPoints, updated_at: now })
      .eq("referrer_profile_id", referrerId)
      .not("referred_recharged_at", "is", null);

    if (markError) throw markError;
    response.json({ ok: true, reward_points: rewardPoints, marked_only: true });
  } catch (error) {
    console.error("Admin referral reward error:", error);
    response.status(500).json({ error: "No se ha podido entregar el bonus" });
  }
});

app.post("/api/admin/recharges", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  if (!adminPassword || request.body?.password !== adminPassword) {
    return response.status(401).json({ error: "Mot de passe incorrect" });
  }

  const { data, error } = await supabaseAdmin
    .from("stripe_point_recharges")
    .select("id, user_id, stripe_session_id, points, amount_total, stripe_fee_amount, net_amount, customer_email, currency, created_at")
    .order("created_at", { ascending: false })
    .limit(250);

  if (error) {
    console.error("Admin recharges error:", error);
    return response.status(500).json({ error: "No se han podido cargar los pagos" });
  }

  const userIds = [...new Set((data || []).map((item) => item.user_id).filter(Boolean))];
  let profilesById = {};

  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, email, phone, neighborhood, address, account_type, transaction_id, points, is_verified")
      .in("id", userIds);

    if (profilesError) {
      console.error("Admin profiles error:", profilesError);
    }

    profilesById = Object.fromEntries((profiles || []).map((profile) => [profile.id, profile]));
  }

  response.json({
    recharges: (data || []).map((item) => enrichRechargeAccounting({
      ...item,
      profiles: profilesById[item.user_id] || null,
    })),
  });
});

app.post("/api/admin/recharges/delete", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  if (!adminPassword || request.body?.password !== adminPassword) {
    return response.status(401).json({ error: "Mot de passe incorrect" });
  }

  const rechargeId = String(request.body?.rechargeId || "");
  if (!rechargeId) {
    return response.status(400).json({ error: "Falta el pago a eliminar" });
  }

  const { data, error } = await supabaseAdmin.rpc("admin_delete_stripe_recharge", {
    p_recharge_id: rechargeId,
  });

  if (error) {
    console.error("Admin delete recharge error:", error);
    return response.status(500).json({ error: "No se ha podido eliminar el pago" });
  }

  response.json({ deleted: data?.[0] || null });
});

app.get("/api/point-packs", async (_request, response) => {
  response.json({ packs: await getPointPackSettings() });
});

app.post("/api/admin/point-packs/toggle", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  if (!adminPassword || request.body?.password !== adminPassword) {
    return response.status(401).json({ error: "Mot de passe incorrect" });
  }

  const points = Number(request.body?.points || 0);
  const pack = pointPackFor(points);
  if (!pack) return response.status(400).json({ error: "Pack no válido" });

  const isDisabled = Boolean(request.body?.isDisabled);
  const { data, error } = await supabaseAdmin
    .from("point_pack_settings")
    .upsert({
      points: pack.points,
      is_disabled: isDisabled,
      updated_at: new Date().toISOString(),
    }, { onConflict: "points" })
    .select("points, is_disabled")
    .maybeSingle();

  if (error) {
    console.error("Admin point pack toggle error:", error);
    return response.status(500).json({
      error: error.code === "42P01" ? "Falta ejecutar el SQL de packs." : "No se ha podido actualizar el pack",
    });
  }

  response.json({ pack: { ...pack, is_disabled: Boolean(data?.is_disabled) } });
});

app.post("/api/admin/stripe-debts", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  if (!adminPassword || request.body?.password !== adminPassword) {
    return response.status(401).json({ error: "Mot de passe incorrect" });
  }

  const { data, error } = await supabaseAdmin
    .from("stripe_point_recharges")
    .select("id, user_id, stripe_session_id, points, amount_total, stripe_fee_amount, net_amount, customer_email, currency, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("Admin stripe debts error:", error);
    return response.status(500).json({ error: "No se han podido cargar las deudas" });
  }

  const enriched = (data || []).map(enrichRechargeAccounting).filter((item) => Number(item.donos_debt_cents || 0) > 0);
  const userIds = [...new Set(enriched.map((item) => item.user_id).filter(Boolean))];
  let profilesById = {};

  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, email, phone, neighborhood, address, account_type, transaction_id, points, is_verified")
      .in("id", userIds);

    if (profilesError) console.error("Admin stripe debt profiles error:", profilesError);
    profilesById = Object.fromEntries((profiles || []).map((profile) => [profile.id, profile]));
  }

  response.json({
    debts: enriched.map((item) => ({
      ...item,
      profiles: profilesById[item.user_id] || null,
    })),
    summary: {
      total_debt_cents: enriched.reduce((sum, item) => sum + Number(item.donos_debt_cents || 0), 0),
      total_items: enriched.length,
    },
  });
});

app.post("/api/admin/bank-fee-debts", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  if (!adminPassword || request.body?.password !== adminPassword) {
    return response.status(401).json({ error: "Mot de passe incorrect" });
  }

  const { data, error } = await supabaseAdmin
    .from("business_payouts")
    .select("id, business_id, points, amount_cents, bank_fee_cents, note, period_start, period_end, created_at")
    .gt("bank_fee_cents", 0)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("Admin bank fee debts error:", error);
    return response.status(500).json({
      error: error.code === "42P01" || error.code === "42703"
        ? "Falta ejecutar el SQL de liquidaciones actualizado."
        : "No se han podido cargar las deudas bancarias",
    });
  }

  const businessIds = [...new Set((data || []).map((item) => item.business_id).filter(Boolean))];
  let businessesById = {};

  if (businessIds.length > 0) {
    const { data: businesses, error: businessesError } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, email, phone, address, account_type, transaction_id, points, is_verified")
      .in("id", businessIds);

    if (businessesError) console.error("Admin bank fee debt profiles error:", businessesError);
    businessesById = Object.fromEntries((businesses || []).map((business) => [business.id, business]));
  }

  response.json({
    debts: (data || []).map((item) => ({
      ...item,
      business: businessesById[item.business_id] || null,
    })),
    summary: {
      total_debt_cents: (data || []).reduce((sum, item) => sum + Number(item.bank_fee_cents || 0), 0),
      total_items: (data || []).length,
      total_paid_to_businesses_cents: (data || []).reduce((sum, item) => sum + Number(item.amount_cents || 0), 0),
    },
  });
});

app.post("/api/admin/accounts", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  if (!adminPassword || request.body?.password !== adminPassword) {
    return response.status(401).json({ error: "Mot de passe incorrect" });
  }

  const [
    { data: accounts, error: accountsError },
    { data: recharges, error: rechargesError },
    { data: payoutFees, error: payoutFeesError },
    { data: premiumSubscriptions, error: premiumSubscriptionsError },
    { data: premiumCharges, error: premiumChargesError },
  ] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, display_name, email, phone, neighborhood, address, account_type, business_categories, tax_id, transaction_id, points, is_verified, premium_status, premium_identity_dni, premium_identity_photo_data_url, premium_identity_verified_at, premium_identity_updated_at, created_at")
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("stripe_point_recharges")
      .select("amount_total, stripe_fee_amount, net_amount, points"),
    supabaseAdmin
      .from("business_payouts")
      .select("amount_cents, bank_fee_cents"),
    supabaseAdmin
      .from("premium_subscriptions")
      .select("id, profile_id, account_type, points, status, started_at, next_charge_at, last_charge_at, failed_at, created_at, updated_at"),
    supabaseAdmin
      .from("premium_subscription_charges")
      .select("id, profile_id, subscription_id, points, status, reason, created_at"),
  ]);

  if (accountsError) {
    console.error("Admin accounts error:", accountsError);
    return response.status(500).json({ error: "No se han podido cargar las cuentas" });
  }

  if (rechargesError) {
    console.error("Admin accounts recharges error:", rechargesError);
  }
  if (payoutFeesError && payoutFeesError.code !== "42P01" && payoutFeesError.code !== "42703") {
    console.error("Admin accounts payout fees error:", payoutFeesError);
  }
  if (premiumSubscriptionsError && premiumSubscriptionsError.code !== "42P01" && premiumSubscriptionsError.code !== "42703") {
    console.error("Admin premium subscriptions error:", premiumSubscriptionsError);
  }
  if (premiumChargesError && premiumChargesError.code !== "42P01" && premiumChargesError.code !== "42703") {
    console.error("Admin premium charges error:", premiumChargesError);
  }

  const syncedAccounts = [];
  for (const account of accounts || []) {
    try {
      const premium = await syncPremiumForProfile(account);
      syncedAccounts.push(premium.profile || account);
    } catch (error) {
      if (error.code !== "42P01" && error.code !== "42703") console.error("Admin premium sync error:", error);
      syncedAccounts.push(account);
    }
  }

  let latestPremiumSubscriptions = premiumSubscriptions || [];
  let latestPremiumCharges = premiumCharges || [];
  if (!premiumSubscriptionsError && !premiumChargesError) {
    const [{ data: refreshedSubscriptions, error: refreshedSubscriptionsError }, { data: refreshedCharges, error: refreshedChargesError }] =
      await Promise.all([
        supabaseAdmin
          .from("premium_subscriptions")
          .select("id, profile_id, account_type, points, status, started_at, next_charge_at, last_charge_at, failed_at, created_at, updated_at"),
        supabaseAdmin
          .from("premium_subscription_charges")
          .select("id, profile_id, subscription_id, points, status, reason, created_at"),
      ]);
    if (!refreshedSubscriptionsError) latestPremiumSubscriptions = refreshedSubscriptions || [];
    if (!refreshedChargesError) latestPremiumCharges = refreshedCharges || [];
  }

  const subscriptionsByProfile = {};
  for (const subscription of latestPremiumSubscriptions) {
    const current = subscriptionsByProfile[subscription.profile_id];
    if (!current || new Date(subscription.created_at || 0).getTime() > new Date(current.created_at || 0).getTime()) {
      subscriptionsByProfile[subscription.profile_id] = subscription;
    }
  }

  const premiumChargesByProfile = {};
  for (const charge of latestPremiumCharges) {
    if (!premiumChargesByProfile[charge.profile_id]) premiumChargesByProfile[charge.profile_id] = [];
    premiumChargesByProfile[charge.profile_id].push(charge);
  }

  const enrichedAccounts = syncedAccounts.map((account) => {
    const points = Number(account.points || 0);
    const subscription = subscriptionsByProfile[account.id] || null;
    const charges = premiumChargesByProfile[account.id] || [];
    const paidCharges = charges.filter((charge) => charge.status === "paid");
    const premiumPaidPoints = paidCharges.reduce((sum, charge) => sum + Number(charge.points || 0), 0);
    return {
      ...account,
      point_value_cents: points * 10,
      premium: {
        ...premiumPublicStatus(subscription, account),
        paid_points: premiumPaidPoints,
        paid_value_cents: premiumPaidPoints * 10,
        charges_count: charges.length,
      },
    };
  });

  const totalPoints = enrichedAccounts.reduce((sum, account) => sum + Number(account.points || 0), 0);
  const enrichedRecharges = (recharges || []).map(enrichRechargeAccounting);
  const totalPaid = enrichedRecharges.reduce((sum, item) => sum + Number(item.amount_total || 0), 0);
  const totalFees = enrichedRecharges.reduce((sum, item) => sum + Number(item.stripe_fee_amount || 0), 0);
  const totalNet = enrichedRecharges.reduce((sum, item) => sum + Number(item.net_amount || 0), 0);
  const premiumRevenue = latestPremiumCharges
    .filter((charge) => charge.status === "paid")
    .reduce((sum, charge) => sum + Number(charge.points || 0) * 10, 0);
  const donosTransactionMoney = enrichedRecharges.reduce((sum, item) => sum + Number(item.donos_company_margin_cents || 0), 0);
  const donosCompanyMoney = donosTransactionMoney + premiumRevenue;
  const donosDebt = enrichedRecharges.reduce((sum, item) => sum + Number(item.donos_debt_cents || 0), 0);
  const bankFeeDebt = payoutFeesError ? 0 : (payoutFees || []).reduce((sum, item) => sum + Number(item.bank_fee_cents || 0), 0);
  const businessPayoutsPaid = payoutFeesError ? 0 : (payoutFees || []).reduce((sum, item) => sum + Number(item.amount_cents || 0), 0);
  const totalOperationalDebt = donosDebt + bankFeeDebt;
  const donosAvailableProfit = donosCompanyMoney - totalOperationalDebt;
  const missingToGreen = Math.max(-donosAvailableProfit, 0);
  const estimatedCash = totalNet - businessPayoutsPaid - bankFeeDebt;
  const totalLiability = totalPoints * 10;

  response.json({
    accounts: enrichedAccounts,
    summary: {
      total_accounts: enrichedAccounts.length,
      total_users: enrichedAccounts.filter((account) => account.account_type !== "business").length,
      total_businesses: enrichedAccounts.filter((account) => account.account_type === "business").length,
      total_verified: enrichedAccounts.filter((account) => account.is_verified).length,
      total_points: totalPoints,
      total_point_value_cents: totalLiability,
      total_paid_cents: totalPaid,
      total_stripe_fees_cents: totalFees,
      total_net_cents: totalNet,
      business_payouts_paid_cents: businessPayoutsPaid,
      estimated_cash_cents: estimatedCash,
      reserve_margin_cents: estimatedCash - totalLiability,
      donos_company_money_cents: donosCompanyMoney,
      donos_transaction_money_cents: donosTransactionMoney,
      premium_revenue_cents: premiumRevenue,
      premium_subscribers: enrichedAccounts.filter((account) => account.premium?.status === "active").length,
      donos_debt_cents: donosDebt,
      bank_fee_debt_cents: bankFeeDebt,
      total_operational_debt_cents: totalOperationalDebt,
      donos_available_profit_cents: donosAvailableProfit,
      missing_to_green_cents: missingToGreen,
    },
  });
});

app.post("/api/admin/accounts/verify", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  if (!adminPassword || request.body?.password !== adminPassword) {
    return response.status(401).json({ error: "Mot de passe incorrect" });
  }

  const profileId = String(request.body?.profileId || "");
  const isVerified = Boolean(request.body?.isVerified);

  if (!profileId) {
    return response.status(400).json({ error: "Falta la cuenta" });
  }

  let { data: currentProfile, error: currentError } = await supabaseAdmin
    .from("profiles")
    .select("id, premium_status")
    .eq("id", profileId)
    .maybeSingle();

  if (currentError?.code === "42703") {
    const fallback = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", profileId)
      .maybeSingle();
    currentProfile = fallback.data ? { ...fallback.data, premium_status: "inactive" } : null;
    currentError = fallback.error;
  }

  if (currentError || !currentProfile) {
    console.error("Admin verify load account error:", currentError);
    return response.status(500).json({ error: "No se ha podido cargar la cuenta" });
  }

  const finalVerified = isVerified || currentProfile.premium_status === "active";
  let { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .update({ admin_verified: isVerified, is_verified: finalVerified })
    .eq("id", profileId)
    .select("id, display_name, account_type, is_verified, admin_verified, premium_status")
    .maybeSingle();

  if (error?.code === "42703") {
    const fallback = await supabaseAdmin
      .from("profiles")
      .update({ is_verified: finalVerified })
      .eq("id", profileId)
      .select("id, display_name, account_type, is_verified, premium_status")
      .maybeSingle();
    profile = fallback.data ? { ...fallback.data, admin_verified: isVerified } : null;
    error = fallback.error;
  }

  if (error || !profile) {
    console.error("Admin verify account error:", error);
    return response.status(500).json({ error: "No se ha podido actualizar la cuenta" });
  }

  if (profile.account_type === "business") {
    const { error: offersError } = await supabaseAdmin
      .from("business_offers")
      .update({
        business_display_name: profile.display_name,
        business_is_verified: profile.is_verified,
      })
      .eq("business_id", profile.id);

    if (offersError) {
      console.error("Admin verify offers sync error:", offersError);
    }
  }

  response.json({ profile });
});

app.post("/api/admin/accounts/email", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  if (!adminPassword || request.body?.password !== adminPassword) {
    return response.status(401).json({ error: "Mot de passe incorrect" });
  }

  const profileId = String(request.body?.profileId || "").trim();
  const email = String(request.body?.email || "").trim().toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!profileId) {
    return response.status(400).json({ error: "Falta la cuenta" });
  }

  if (!emailPattern.test(email)) {
    return response.status(400).json({ error: "Correo no válido" });
  }

  const { data: currentProfile, error: currentError } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, email")
    .eq("id", profileId)
    .maybeSingle();

  if (currentError || !currentProfile) {
    console.error("Admin email load account error:", currentError);
    return response.status(404).json({ error: "No se ha encontrado la cuenta" });
  }

  if (String(currentProfile.email || "").toLowerCase() === email) {
    return response.json({ profile: { ...currentProfile, email } });
  }

  const authUpdate = await supabaseAdmin.auth.admin.updateUserById(profileId, {
    email,
    email_confirm: true,
  });

  if (authUpdate.error) {
    console.error("Admin auth email update error:", authUpdate.error);
    const message = String(authUpdate.error.message || "").toLowerCase();
    if (message.includes("already") || message.includes("exists") || message.includes("duplicate")) {
      return response.status(409).json({ error: "Ya existe una cuenta con ese correo" });
    }
    return response.status(500).json({ error: "No se ha podido actualizar el correo de inicio de sesión" });
  }

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .update({ email })
    .eq("id", profileId)
    .select("id, display_name, email")
    .maybeSingle();

  if (error || !profile) {
    console.error("Admin profile email update error:", error);
    return response.status(500).json({ error: "El login cambió, pero no se pudo actualizar la ficha del perfil" });
  }

  response.json({ profile });
});

app.post("/api/admin/accounts/profile", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  if (!adminPassword || request.body?.password !== adminPassword) {
    return response.status(401).json({ error: "Mot de passe incorrect" });
  }

  const profileId = String(request.body?.profileId || "").trim();
  const displayName = String(request.body?.display_name || "").trim().replace(/\s+/g, " ");
  const dni = cleanIdentityDni(request.body?.premium_identity_dni);
  const photoDataUrl = String(request.body?.premium_identity_photo_data_url || "").trim();

  if (!profileId) return response.status(400).json({ error: "Falta la cuenta" });
  if (displayName.length < 2 || displayName.length > 60) return response.status(400).json({ error: "Nombre no válido" });
  if (dni && (dni.length < 5 || dni.length > 20)) return response.status(400).json({ error: "DNI/NIE no válido" });
  if (photoDataUrl && !photoDataUrl.startsWith("data:image/")) return response.status(400).json({ error: "Foto no válida" });

  const now = new Date().toISOString();
  const payload = {
    display_name: displayName,
    premium_identity_dni: dni || null,
    premium_identity_photo_data_url: photoDataUrl || null,
    premium_identity_updated_at: now,
    premium_identity_verified_at: dni && photoDataUrl ? now : null,
  };

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .update(payload)
    .eq("id", profileId)
    .select("id, display_name, account_type, is_verified, premium_identity_dni, premium_identity_photo_data_url, premium_identity_verified_at, premium_identity_updated_at")
    .maybeSingle();

  if (error || !profile) {
    console.error("Admin profile update error:", error);
    if (error?.code === "42703") return response.status(500).json({ error: "Falta ejecutar el SQL de identidad Premium." });
    return response.status(500).json({ error: "No se ha podido actualizar la ficha" });
  }

  if (profile.account_type === "business") {
    await syncBusinessVerification(profile);
  }

  response.json({ profile });
});

async function countAdminTable(table) {
  if (!supabaseAdmin) return 0;
  const { count, error } = await supabaseAdmin
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) {
    if (["42P01", "42703"].includes(error.code)) return 0;
    throw error;
  }
  return count || 0;
}

async function deleteAdminTable(table, column = "id") {
  if (!supabaseAdmin) return 0;
  const before = await countAdminTable(table);
  if (before === 0) return 0;
  const { error } = await supabaseAdmin
    .from(table)
    .delete()
    .not(column, "is", null);
  if (error) {
    if (["42P01", "42703"].includes(error.code)) return 0;
    throw error;
  }
  return before;
}

async function resetLaunchProfiles(resetPremium) {
  const basePayload = { points: 0 };
  const premiumPayload = resetPremium
    ? {
        premium_status: "inactive",
        premium_started_at: null,
        premium_next_charge_at: null,
        premium_failed_at: null,
      }
    : {};

  let { count, error } = await supabaseAdmin
    .from("profiles")
    .update({ ...basePayload, ...premiumPayload })
    .not("id", "is", null)
    .select("id", { count: "exact", head: true });

  if (error?.code === "42703") {
    const fallback = await supabaseAdmin
      .from("profiles")
      .update(basePayload)
      .not("id", "is", null)
      .select("id", { count: "exact", head: true });
    count = fallback.count;
    error = fallback.error;
  }

  if (error) throw error;
  return count || 0;
}

app.post("/api/admin/launch-reset/preview", async (request, response) => {
  if (!supabaseAdmin) return response.status(500).json({ error: "Supabase admin is not configured" });
  if (!adminPassword || request.body?.password !== adminPassword) {
    return response.status(401).json({ error: "Mot de passe incorrect" });
  }

  try {
    const tables = [
      "profiles",
      "business_offers",
      "purchases",
      "ticket_verifications",
      "point_transfers",
      "liked_offers",
      "stripe_point_recharges",
      "premium_subscriptions",
      "premium_subscription_charges",
      "business_payouts",
      "social_plans",
      "social_plan_members",
      "social_plan_messages",
      "social_plan_message_reads",
      "social_plan_side_group_messages",
      "social_plan_side_group_message_reads",
      "social_plan_side_group_merges",
      "notification_reads",
      "app_activity_events",
    ];
    const counts = {};
    for (const table of tables) counts[table] = await countAdminTable(table);
    response.json({ counts });
  } catch (error) {
    console.error("Launch reset preview error:", error);
    response.status(500).json({ error: "No se ha podido preparar el resumen" });
  }
});

app.post("/api/admin/launch-reset", async (request, response) => {
  if (!supabaseAdmin) return response.status(500).json({ error: "Supabase admin is not configured" });
  if (!adminPassword || request.body?.password !== adminPassword) {
    return response.status(401).json({ error: "Mot de passe incorrect" });
  }

  const confirmation = String(request.body?.confirmation || "").trim().toUpperCase();
  if (confirmation !== "LANZAMIENTO") {
    return response.status(400).json({ error: "Escribe LANZAMIENTO para confirmar" });
  }

  const options = request.body?.options || {};
  const deleted = {};

  try {
    if (options.social !== false) {
      deleted.social_plan_side_group_message_reads = await deleteAdminTable("social_plan_side_group_message_reads", "message_id");
      deleted.social_plan_side_group_messages = await deleteAdminTable("social_plan_side_group_messages");
      deleted.social_plan_side_group_merges = await deleteAdminTable("social_plan_side_group_merges");
      deleted.social_plan_message_reads = await deleteAdminTable("social_plan_message_reads", "message_id");
      deleted.social_plan_messages = await deleteAdminTable("social_plan_messages");
      deleted.social_plan_members = await deleteAdminTable("social_plan_members");
      deleted.social_plans = await deleteAdminTable("social_plans");
    }

    if (options.purchases !== false) {
      deleted.ticket_verifications = await deleteAdminTable("ticket_verifications");
      deleted.purchases = await deleteAdminTable("purchases");
    }

    if (options.offers !== false) deleted.business_offers = await deleteAdminTable("business_offers");
    if (options.transfers !== false) deleted.point_transfers = await deleteAdminTable("point_transfers");
    if (options.likes !== false) deleted.liked_offers = await deleteAdminTable("liked_offers");
    if (options.stripe !== false) deleted.stripe_point_recharges = await deleteAdminTable("stripe_point_recharges");

    if (options.premium !== false) {
      deleted.premium_subscription_charges = await deleteAdminTable("premium_subscription_charges");
      deleted.premium_subscriptions = await deleteAdminTable("premium_subscriptions");
    }

    if (options.payouts !== false) deleted.business_payouts = await deleteAdminTable("business_payouts");
    if (options.notifications !== false) deleted.notification_reads = await deleteAdminTable("notification_reads", "profile_id");
    if (options.analytics === true) deleted.app_activity_events = await deleteAdminTable("app_activity_events");
    if (options.points !== false) deleted.profiles_reset = await resetLaunchProfiles(options.premium !== false);

    response.json({ ok: true, deleted });
  } catch (error) {
    console.error("Launch reset error:", error);
    response.status(500).json({
      error: ["42P01", "42703"].includes(error.code)
        ? "Falta ejecutar algún SQL antes de poder resetear todo."
        : "No se ha podido completar el reset de lanzamiento",
    });
  }
});

app.post("/api/analytics/track", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(204).end();
  }

  const now = new Date().toISOString();
  const page = normalizeAnalyticsPage(request.body?.page);
  const sessionKey = String(request.body?.sessionKey || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  const source = String(request.body?.source || page || "app").slice(0, 40);
  const metadata = typeof request.body?.metadata === "object" && request.body?.metadata !== null ? request.body.metadata : {};
  const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  let userId = null;

  if (token) {
    const { data: userData } = await supabaseAdmin.auth.getUser(token);
    userId = userData?.user?.id || null;
    if (userId) {
      await ensureProfileForUser(userData.user).catch((error) => console.error("Analytics ensure profile error:", error));
    }
  }

  if (!sessionKey && !userId) {
    return response.status(204).end();
  }

  const { error } = await supabaseAdmin
    .from("app_activity_events")
    .insert({
      user_id: userId,
      session_key: sessionKey || null,
      page,
      source,
      metadata,
      user_agent: String(request.headers["user-agent"] || "").slice(0, 500),
      last_seen_at: now,
    });

  if (error) {
    if (error.code !== "42P01") console.error("Analytics track error:", error);
    return response.status(204).end();
  }

  response.status(204).end();
});

app.post("/api/admin/activity", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  if (!adminPassword || request.body?.password !== adminPassword) {
    return response.status(401).json({ error: "Mot de passe incorrect" });
  }

  const { startIso, endIso } = analyticsDateRange(request.body || {});

  const { data: events, error } = await supabaseAdmin
    .from("app_activity_events")
    .select("id, user_id, session_key, page, source, metadata, created_at, last_seen_at")
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    console.error("Admin activity error:", error);
    return response.status(500).json({
      error: error.code === "42P01" ? "Falta ejecutar supabase-activity-analytics.sql." : "No se ha podido cargar la actividad.",
    });
  }

  const rows = events || [];
  const userIds = [...new Set(rows.map((event) => event.user_id).filter(Boolean))];
  let profilesById = {};

  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, email, phone, account_type, transaction_id, is_verified")
      .in("id", userIds);
    if (profilesError) console.error("Admin activity profiles error:", profilesError);
    profilesById = Object.fromEntries((profiles || []).map((profile) => [profile.id, transferPublicProfile(profile)]));
  }

  const dayMap = new Map();
  const sessionMap = new Map();
  const pageMap = new Map();
  const accountMap = new Map();

  for (const event of rows) {
    const created = new Date(event.created_at);
    const day = event.created_at.slice(0, 10);
    const key = event.user_id || event.session_key || event.id;
    const profile = profilesById[event.user_id] || null;
    const pageKey = event.page || "unknown";
    const dayItem = dayMap.get(day) || {
      date: day,
      events: 0,
      sessions: new Set(),
      users: new Set(),
      anonymous_sessions: new Set(),
      landing_events: 0,
      app_events: 0,
      duration_ms: 0,
    };
    dayItem.events += 1;
    dayItem.sessions.add(key);
    if (event.user_id) dayItem.users.add(event.user_id);
    else dayItem.anonymous_sessions.add(key);
    if (pageKey === "landing") dayItem.landing_events += 1;
    else dayItem.app_events += 1;
    dayMap.set(day, dayItem);

    pageMap.set(pageKey, (pageMap.get(pageKey) || 0) + 1);

    const session = sessionMap.get(key) || {
      key,
      user_id: event.user_id || null,
      profile,
      session_key: event.session_key || null,
      first_seen_at: event.created_at,
      last_seen_at: event.created_at,
      events: 0,
      pages: new Set(),
      source: event.source || "",
    };
    session.events += 1;
    session.pages.add(pageKey);
    if (new Date(event.created_at) < new Date(session.first_seen_at)) session.first_seen_at = event.created_at;
    if (new Date(event.created_at) > new Date(session.last_seen_at)) session.last_seen_at = event.created_at;
    session.profile = session.profile || profile;
    sessionMap.set(key, session);

    if (event.user_id) {
      const account = accountMap.get(event.user_id) || {
        user_id: event.user_id,
        profile,
        events: 0,
        sessions: new Set(),
        pages: new Set(),
        first_seen_at: event.created_at,
        last_seen_at: event.created_at,
      };
      account.events += 1;
      account.sessions.add(key);
      account.pages.add(pageKey);
      if (created < new Date(account.first_seen_at)) account.first_seen_at = event.created_at;
      if (created > new Date(account.last_seen_at)) account.last_seen_at = event.created_at;
      accountMap.set(event.user_id, account);
    }
  }

  const sessions = Array.from(sessionMap.values()).map((session) => {
    const durationMs = Math.max(new Date(session.last_seen_at).getTime() - new Date(session.first_seen_at).getTime(), session.events > 1 ? 30_000 : 0);
    return {
      ...session,
      pages: Array.from(session.pages),
      duration_seconds: Math.round(durationMs / 1000),
    };
  });

  const summaryDurationSeconds = sessions.reduce((sum, session) => sum + Number(session.duration_seconds || 0), 0);
  const landingVisitors = new Set(rows.filter((event) => event.page === "landing").map((event) => event.user_id || event.session_key || event.id)).size;
  const connectedUsers = new Set(rows.map((event) => event.user_id).filter(Boolean)).size;

  response.json({
    range: { start: startIso, end: endIso },
    summary: {
      total_events: rows.length,
      total_sessions: sessions.length,
      connected_users: connectedUsers,
      anonymous_visitors: new Set(rows.filter((event) => !event.user_id).map((event) => event.session_key || event.id)).size,
      landing_visitors: landingVisitors,
      app_sessions: sessions.filter((session) => session.user_id).length,
      avg_session_seconds: sessions.length ? Math.round(summaryDurationSeconds / sessions.length) : 0,
      total_duration_seconds: summaryDurationSeconds,
    },
    days: Array.from(dayMap.values())
      .map((day) => ({
        ...day,
        sessions: day.sessions.size,
        users: day.users.size,
        anonymous_sessions: day.anonymous_sessions.size,
      }))
      .sort((a, b) => b.date.localeCompare(a.date)),
    pages: Array.from(pageMap.entries())
      .map(([page, count]) => ({ page, count }))
      .sort((a, b) => b.count - a.count),
    sessions: sessions.sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at)).slice(0, 300),
    accounts: Array.from(accountMap.values())
      .map((account) => ({
        ...account,
        sessions: account.sessions.size,
        pages: Array.from(account.pages),
        duration_seconds: Math.max(0, Math.round((new Date(account.last_seen_at).getTime() - new Date(account.first_seen_at).getTime()) / 1000)),
      }))
      .sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at)),
  });
});

async function enrichBusinessesForSettlement(businesses) {
  const businessIds = (businesses || []).map((business) => business.id).filter(Boolean);
  if (businessIds.length === 0) return [];

  const [{ data: sales, error: salesError }, { data: recharges, error: rechargesError }, { data: payouts, error: payoutsError }] = await Promise.all([
    supabaseAdmin
      .from("purchases")
      .select("id, buyer_id, receiver_profile_id, offer_id, total_points, created_at")
      .in("receiver_profile_id", businessIds)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("stripe_point_recharges")
      .select("id, user_id, points, amount_total, created_at")
      .in("user_id", businessIds),
    supabaseAdmin
      .from("business_payouts")
      .select("id, business_id, points, amount_cents, bank_fee_cents, note, period_start, period_end, created_at")
      .in("business_id", businessIds),
  ]);

  if (salesError && salesError.code !== "42P01") console.error("Admin settlement sales error:", salesError);
  if (rechargesError && rechargesError.code !== "42P01") console.error("Admin settlement recharges error:", rechargesError);
  if (payoutsError && payoutsError.code !== "42P01") console.error("Admin settlement payouts error:", payoutsError);

  const salesRows = salesError ? [] : (sales || []);
  const rechargeRows = rechargesError ? [] : (recharges || []);
  const payoutRows = payoutsError ? [] : (payouts || []);

  return (businesses || []).map((business) => {
    const businessSales = salesRows.filter((item) => item.receiver_profile_id === business.id);
    const businessRecharges = rechargeRows.filter((item) => item.user_id === business.id);
    const businessPayouts = payoutRows.filter((item) => item.business_id === business.id);
    const soldPoints = businessSales.reduce((sum, item) => sum + Number(item.total_points || 0), 0);
    const rechargedPoints = businessRecharges.reduce((sum, item) => sum + Number(item.points || 0), 0);
    const paidOutPoints = businessPayouts.reduce((sum, item) => sum + Number(item.points || 0), 0);
    const currentPoints = Number(business.points || 0);

    return {
      ...business,
      sold_points: soldPoints,
      recharged_points: rechargedPoints,
      paid_out_points: paidOutPoints,
      current_points: currentPoints,
      current_value_cents: currentPoints * 10,
      gross_total_points: soldPoints + rechargedPoints,
      gross_total_value_cents: (soldPoints + rechargedPoints) * 10,
      payout_count: businessPayouts.length,
      last_payout_at: businessPayouts[0]?.created_at || null,
    };
  });
}

app.post("/api/admin/business-settlements", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  if (!adminPassword || request.body?.password !== adminPassword) {
    return response.status(401).json({ error: "Mot de passe incorrect" });
  }

  const { data: businesses, error } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, email, phone, address, neighborhood, transaction_id, points, is_verified, bank_account_holder, bank_iban, bank_name, bank_bic, created_at")
    .eq("account_type", "business")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Admin business settlements error:", error);
    return response.status(500).json({ error: "No se han podido cargar las empresas" });
  }

  const enriched = await enrichBusinessesForSettlement(businesses || []);
  response.json({
    businesses: enriched,
    summary: {
      total_businesses: enriched.length,
      total_current_points: enriched.reduce((sum, item) => sum + Number(item.current_points || 0), 0),
      total_current_value_cents: enriched.reduce((sum, item) => sum + Number(item.current_value_cents || 0), 0),
      total_sold_points: enriched.reduce((sum, item) => sum + Number(item.sold_points || 0), 0),
      total_recharged_points: enriched.reduce((sum, item) => sum + Number(item.recharged_points || 0), 0),
    },
  });
});

app.post("/api/admin/business-settlements/:businessId", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  if (!adminPassword || request.body?.password !== adminPassword) {
    return response.status(401).json({ error: "Mot de passe incorrect" });
  }

  const businessId = String(request.params.businessId || "");
  const { data: business, error: businessError } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, email, phone, address, neighborhood, transaction_id, points, is_verified, bank_account_holder, bank_iban, bank_name, bank_bic, created_at")
    .eq("id", businessId)
    .eq("account_type", "business")
    .maybeSingle();

  if (businessError || !business) {
    return response.status(404).json({ error: "Empresa no encontrada" });
  }

  const [{ data: purchases, error: purchasesError }, { data: payouts, error: payoutsError }] = await Promise.all([
    supabaseAdmin
      .from("purchases")
      .select("id, buyer_id, offer_id, total_points, delivery_method, created_at")
      .eq("receiver_profile_id", businessId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabaseAdmin
      .from("business_payouts")
      .select("id, points, amount_cents, bank_fee_cents, note, period_start, period_end, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(250),
  ]);

  if (purchasesError && purchasesError.code !== "42P01") {
    console.error("Admin business settlement purchases error:", purchasesError);
  }
  if (payoutsError && payoutsError.code !== "42P01") {
    console.error("Admin business settlement payouts error:", payoutsError);
  }

  const buyerIds = [...new Set((purchases || []).map((purchase) => purchase.buyer_id).filter(Boolean))];
  const offerIds = [...new Set((purchases || []).map((purchase) => purchase.offer_id).filter(Boolean))];
  let buyersById = {};
  let offersById = {};

  if (buyerIds.length > 0) {
    const { data: buyers } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, email, phone, transaction_id, neighborhood")
      .in("id", buyerIds);
    buyersById = Object.fromEntries((buyers || []).map((buyer) => [buyer.id, buyer]));
  }

  if (offerIds.length > 0) {
    const { data: offers } = await supabaseAdmin
      .from("business_offers")
      .select("id, title")
      .in("id", offerIds);
    offersById = Object.fromEntries((offers || []).map((offer) => [offer.id, offer]));
  }

  response.json({
    business: (await enrichBusinessesForSettlement([business]))[0],
    purchases: (purchases || []).map((purchase) => ({
      ...purchase,
      buyer: buyersById[purchase.buyer_id] || null,
      offer: offersById[purchase.offer_id] || null,
    })),
    payouts: payoutsError ? [] : (payouts || []),
  });
});

app.post("/api/admin/business-settlements/:businessId/pay", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  if (!adminPassword || request.body?.password !== adminPassword) {
    return response.status(401).json({ error: "Mot de passe incorrect" });
  }

  const businessId = String(request.params.businessId || "");
  const points = Math.floor(Number(request.body?.points || 0));
  const note = String(request.body?.note || "").trim().slice(0, 180);
  const periodStart = String(request.body?.periodStart || "").trim() || null;
  const periodEnd = String(request.body?.periodEnd || "").trim() || null;
  const bankFeeCents = Math.max(Math.round(Number(request.body?.bankFeeCents || 0)), 0);

  if (!Number.isFinite(points) || points <= 0) {
    return response.status(400).json({ error: "Cantidad de puntos inválida" });
  }

  const { data: business, error: businessError } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, points, account_type")
    .eq("id", businessId)
    .maybeSingle();

  if (businessError || !business || business.account_type !== "business") {
    return response.status(404).json({ error: "Empresa no encontrada" });
  }

  const currentPoints = Number(business.points || 0);
  if (points > currentPoints) {
    return response.status(400).json({ error: "La empresa no tiene tantos puntos" });
  }

  const { data: updatedBusiness, error: updateError } = await supabaseAdmin
    .from("profiles")
    .update({ points: currentPoints - points })
    .eq("id", businessId)
    .select("points")
    .maybeSingle();

  let payout = null;
  let payoutError = null;
  if (!updateError) {
    const payoutResult = await supabaseAdmin
      .from("business_payouts")
      .insert({
        business_id: businessId,
        points,
        amount_cents: points * 10,
        bank_fee_cents: bankFeeCents,
        note: note || null,
        period_start: periodStart,
        period_end: periodEnd,
      })
      .select("id, points, amount_cents, bank_fee_cents, note, period_start, period_end, created_at")
      .maybeSingle();
    payout = payoutResult.data;
    payoutError = payoutResult.error;
  }

  if (updateError || payoutError) {
    console.error("Admin business payout error:", updateError || payoutError);
    if (!updateError) await supabaseAdmin.from("profiles").update({ points: currentPoints }).eq("id", businessId);
    if (payout?.id) await supabaseAdmin.from("business_payouts").delete().eq("id", payout.id);
    return response.status(500).json({
      error: payoutError?.code === "42P01" || payoutError?.code === "42703"
        ? "Falta ejecutar el SQL de liquidaciones actualizado."
        : "No se ha podido registrar la liquidación",
    });
  }

  response.json({
    payout,
    business_points: Number(updatedBusiness?.points || 0),
  });
});

app.get("/api/me/profile", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    return response.status(401).json({ error: "Not authenticated" });
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  const userId = userData?.user?.id;

  if (userError || !userId) {
    return response.status(401).json({ error: "Not authenticated" });
  }

  try {
    let profile = await ensureProfileForUser(userData.user);
    const premium = await syncPremiumForProfile(profile);
    profile = premium.profile || profile;
    response.json({
      profile: profile ? {
        ...profile,
        plan_photo_data_urls: parsePlanProfilePhotos(profile.plan_photo_data_url),
        premium_identity: premiumIdentityPublic(profile),
      } : null,
      premium: premiumPublicStatus(premium.subscription, profile),
      premium_charges: premium.charges || [],
      premium_sql_missing: Boolean(premium.missingSql),
    });
  } catch (error) {
    console.error("Me profile error:", error);
    return response.status(500).json({ error: "Could not load profile" });
  }
});

app.put("/api/me/profile", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  const hasDisplayName = Object.prototype.hasOwnProperty.call(request.body || {}, "display_name");
  const hasBio = Object.prototype.hasOwnProperty.call(request.body || {}, "bio");
  const hasProfilePhoto = Object.prototype.hasOwnProperty.call(request.body || {}, "profile_photo_data_url");
  const hasNeighborhood = Object.prototype.hasOwnProperty.call(request.body || {}, "neighborhood");
  const displayName = String(request.body?.display_name || "").trim().replace(/\s+/g, " ");
  const bio = String(request.body?.bio || "").trim().replace(/\s+/g, " ");
  const profilePhoto = String(request.body?.profile_photo_data_url || "");
  const neighborhood = String(request.body?.neighborhood || "").trim().replace(/\s+/g, " ");
  if (!hasDisplayName && !hasBio && !hasProfilePhoto && !hasNeighborhood) {
    return response.status(400).json({ error: "nothing_to_update" });
  }
  if (hasDisplayName && (displayName.length < 2 || displayName.length > 60)) {
    return response.status(400).json({ error: "invalid_display_name" });
  }
  if (hasBio && (bio.length < 20 || bio.length > 500)) {
    return response.status(400).json({ error: "invalid_bio" });
  }
  if (hasProfilePhoto && profilePhoto && (!profilePhoto.startsWith("data:image/") || profilePhoto.length > 1400000)) {
    return response.status(400).json({ error: "invalid_profile_photo" });
  }
  if (hasNeighborhood && (neighborhood.length < 2 || neighborhood.length > 60)) {
    return response.status(400).json({ error: "invalid_neighborhood" });
  }

  try {
    const profile = await ensureProfileForUser(auth.user);
    if (hasProfilePhoto && profile.account_type !== "business") {
      return response.status(403).json({ error: "business_only" });
    }
    const payload = {};
    if (hasDisplayName) payload.display_name = displayName;
    if (hasBio) payload.bio = bio;
    if (hasProfilePhoto) payload.profile_photo_data_url = profilePhoto || null;
    if (hasNeighborhood) payload.neighborhood = neighborhood;
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(payload)
      .eq("id", profile.id)
      .select("id, account_type, display_name, bio, profile_photo_data_url, email, phone, neighborhood, address, business_categories, tax_id, transaction_id, points, is_verified, admin_verified, premium_status, premium_started_at, premium_next_charge_at, premium_failed_at, premium_identity_dni, premium_identity_photo_data_url, premium_identity_verified_at, premium_identity_updated_at")
      .maybeSingle();

    if (error?.code === "42703") return response.status(500).json({ error: hasProfilePhoto ? "profile_photo_sql_missing" : "profile_bio_sql_missing" });
    if (error) throw error;
    await syncBusinessVerification(data);

    response.json({ profile: data });
  } catch (error) {
    console.error("Me profile update error:", error);
    response.status(500).json({ error: "profile_update_failed" });
  }
});

app.put("/api/me/premium/identity", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  const dni = cleanIdentityDni(request.body?.dni);
  const photoDataUrl = String(request.body?.photo_data_url || "").trim();

  if (dni.length < 5 || dni.length > 20) {
    return response.status(400).json({ error: "invalid_dni" });
  }

  if (!photoDataUrl.startsWith("data:image/")) {
    return response.status(400).json({ error: "identity_photo_required" });
  }

  try {
    const profile = await ensureProfileForUser(auth.user);
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({
        premium_identity_dni: dni,
        premium_identity_photo_data_url: photoDataUrl,
        premium_identity_updated_at: now,
        premium_identity_verified_at: profile?.premium_identity_verified_at || now,
      })
      .eq("id", profile.id)
      .select("id, premium_identity_dni, premium_identity_photo_data_url, premium_identity_verified_at, premium_identity_updated_at")
      .maybeSingle();

    if (error) throw error;
    response.json({ premium_identity: premiumIdentityPublic(data) });
  } catch (error) {
    console.error("Premium identity update error:", error);
    if (error.code === "42703") return response.status(500).json({ error: "premium_identity_sql_missing" });
    response.status(500).json({ error: "premium_identity_update_failed" });
  }
});

app.post("/api/me/premium/subscribe", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    let profile = await ensureProfileForUser(auth.user);
    const current = await syncPremiumForProfile(profile);
    if (current.missingSql) {
      return response.status(500).json({ error: "premium_sql_missing" });
    }

    profile = current.profile || profile;
    if (!premiumIdentityPublic(profile).is_complete) {
      return response.status(400).json({ error: "premium_identity_required" });
    }

    const points = premiumPointsForAccountType(profile.account_type);
    const currentPoints = Number(profile.points || 0);
    if (currentPoints < points) {
      return response.status(400).json({ error: "insufficient_points", required_points: points, current_points: currentPoints });
    }

    const now = new Date().toISOString();
    const nextChargeAt = addDays(now, 31);
    const subscription = current.subscription;
    let savedSubscription = null;

    if (subscription?.id) {
      const { data, error } = await supabaseAdmin
        .from("premium_subscriptions")
        .update({
          account_type: profile.account_type,
          points,
          status: "active",
          started_at: subscription.started_at || now,
          next_charge_at: nextChargeAt,
          last_charge_at: now,
          failed_at: null,
          updated_at: now,
        })
        .eq("id", subscription.id)
        .select("id, profile_id, account_type, points, status, started_at, next_charge_at, last_charge_at, failed_at, created_at, updated_at")
        .maybeSingle();
      if (error) throw error;
      savedSubscription = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from("premium_subscriptions")
        .insert({
          profile_id: profile.id,
          account_type: profile.account_type,
          points,
          status: "active",
          started_at: now,
          next_charge_at: nextChargeAt,
          last_charge_at: now,
        })
        .select("id, profile_id, account_type, points, status, started_at, next_charge_at, last_charge_at, failed_at, created_at, updated_at")
        .maybeSingle();
      if (error) throw error;
      savedSubscription = data;
    }

    const { data: updatedProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        points: currentPoints - points,
        is_verified: true,
        premium_status: "active",
        premium_started_at: profile.premium_started_at || now,
        premium_next_charge_at: nextChargeAt,
        premium_failed_at: null,
      })
      .eq("id", profile.id)
      .select("id, account_type, display_name, bio, email, phone, neighborhood, address, business_categories, tax_id, transaction_id, points, is_verified, admin_verified, premium_status, premium_started_at, premium_next_charge_at, premium_failed_at, premium_identity_dni, premium_identity_photo_data_url, premium_identity_verified_at, premium_identity_updated_at")
      .maybeSingle();

    if (profileError) throw profileError;

    const { error: chargeError } = await supabaseAdmin.from("premium_subscription_charges").insert({
      subscription_id: savedSubscription.id,
      profile_id: profile.id,
      points,
      status: "paid",
      reason: "manual_activation",
    });
    if (chargeError) throw chargeError;

    await syncBusinessVerification(updatedProfile);

    response.json({
      profile: updatedProfile,
      premium: premiumPublicStatus(savedSubscription, updatedProfile),
      message: "Premium activado correctamente.",
    });
  } catch (error) {
    console.error("Premium subscribe error:", error);
    if (error.code === "42P01" || error.code === "42703") {
      return response.status(500).json({ error: "premium_sql_missing" });
    }
    response.status(500).json({ error: "premium_subscribe_failed" });
  }
});

app.get("/api/me/plan-photos", async (request, response) => {
  if (!supabaseAdmin) return response.status(500).json({ error: "Supabase admin is not configured" });

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const profile = await ensureProfileForUser(auth.user);
    response.json({ photos: parsePlanProfilePhotos(profile?.plan_photo_data_url) });
  } catch (error) {
    console.error("Plan photos load error:", error);
    response.status(500).json({ error: error.code === "42703" ? "plan_photos_sql_missing" : "plan_photos_failed" });
  }
});

app.put("/api/me/plan-preferences", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  const gender = ["woman", "man"].includes(request.body?.gender) ? request.body.gender : null;

  try {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({ plan_gender_preference: gender, updated_at: new Date().toISOString() })
      .eq("id", auth.user.id)
      .select("id, plan_gender_preference")
      .maybeSingle();

    if (error) {
      return response.status(500).json({ error: error.code === "42703" ? "plan_gender_sql_missing" : "plan_preferences_failed" });
    }

    response.json({ gender: data?.plan_gender_preference || "" });
  } catch (error) {
    console.error("Plan preferences save fatal error:", error);
    response.status(500).json({ error: error.code === "42703" ? "plan_gender_sql_missing" : "plan_preferences_failed" });
  }
});

app.put("/api/me/plan-photos", async (request, response) => {
  if (!supabaseAdmin) return response.status(500).json({ error: "Supabase admin is not configured" });

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const profile = await ensureProfileForUser(auth.user);
    const encoded = normalizedPlanProfilePhotos(request.body?.photos || []);
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({ plan_photo_data_url: encoded, updated_at: new Date().toISOString() })
      .eq("id", profile.id)
      .select("id, plan_photo_data_url")
      .maybeSingle();

    if (error) {
      console.error("Plan photos save error:", error);
      return response.status(500).json({ error: error.code === "42703" ? "plan_photos_sql_missing" : "plan_photos_failed" });
    }

    response.json({ photos: parsePlanProfilePhotos(data?.plan_photo_data_url) });
  } catch (error) {
    console.error("Plan photos save fatal error:", error);
    if (error.code === "photo_too_large") return response.status(413).json({ error: "photo_too_large" });
    response.status(500).json({ error: "plan_photos_failed" });
  }
});

async function getAuthenticatedUser(request) {
  if (!supabaseAdmin) return { error: "Supabase admin is not configured", status: 500 };

  const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return { error: "Not authenticated", status: 401 };

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  const user = userData?.user;

  if (userError || !user?.id) return { error: "Not authenticated", status: 401 };

  return { user };
}

async function buildNotificationsForProfile(profile) {
  const events = [];
  if (!profile?.id) return events;

  try {
    const { data: purchases, error } = await supabaseAdmin
      .from("purchases")
      .select("id, offer_id, total_points, created_at")
      .eq("buyer_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(80);

    if (!error) {
      const offerIds = [...new Set((purchases || []).map((purchase) => purchase.offer_id).filter(Boolean))];
      let offersById = {};
      if (offerIds.length > 0) {
        const { data: offers } = await supabaseAdmin
          .from("business_offers")
          .select("id, title, business_display_name")
          .in("id", offerIds);
        offersById = Object.fromEntries((offers || []).map((offer) => [offer.id, offer]));
      }

      for (const purchase of purchases || []) {
        const offer = offersById[purchase.offer_id] || {};
        pushNotification(events, {
          key: `purchase:${purchase.id}:buyer`,
          subsection: "purchases",
          title: `Compra confirmada: ${offer.title || "pedido Donoss"}`,
          detail: `${purchase.total_points || 0} ptos. · ${offer.business_display_name || "Donoss"}`,
          href: `order-detail.html?id=${purchase.id}`,
          created_at: purchase.created_at,
        });
      }
    }
  } catch (error) {
    console.error("Notification purchases error:", error);
  }

  try {
    const { data: movements, error } = await supabaseAdmin
      .from("point_transfers")
      .select("id, from_profile_id, to_profile_id, points, transfer_type, status, created_at, completed_at")
      .or(`from_profile_id.eq.${profile.id},to_profile_id.eq.${profile.id}`)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!error) {
      for (const movement of movements || []) {
        const isDebt = movement.transfer_type === "request" && movement.status === "pending" && movement.from_profile_id === profile.id;
        pushNotification(events, {
          key: `points:${movement.id}:${profile.id}:${movement.status}`,
          subsection: isDebt ? "debts" : "points",
          title: isDebt ? `Solicitud pendiente de ${movement.points || 0} ptos.` : `Movimiento de ${movement.points || 0} ptos.`,
          detail: movement.transfer_type === "request" ? "Solicitud de puntos" : "Transferencia de puntos",
          href: `historial.html?tab=${isDebt ? "debts" : "points"}`,
          created_at: movement.completed_at || movement.created_at,
        });
      }
    }
  } catch (error) {
    console.error("Notification movements error:", error);
  }

  try {
    const { data: ownedPlans, error: ownedPlansError } = await supabaseAdmin
      .from("social_plans")
      .select("id, title")
      .eq("creator_id", profile.id)
      .limit(120);

    if (!ownedPlansError && (ownedPlans || []).length > 0) {
      const planIds = ownedPlans.map((plan) => plan.id);
      const plansById = Object.fromEntries(ownedPlans.map((plan) => [plan.id, plan]));
      const { data: members, error: membersError } = await supabaseAdmin
        .from("social_plan_members")
        .select("id, plan_id, user_id, status, created_at, updated_at")
        .in("plan_id", planIds)
        .neq("user_id", profile.id)
        .order("updated_at", { ascending: false })
        .limit(120);

      if (!membersError) {
        for (const member of members || []) {
          const plan = plansById[member.plan_id] || {};
          pushNotification(events, {
            section: "quedar",
            href: "plans.html?tab=mine",
            key: `quedar:mine:${member.id}:${member.status}:${member.updated_at || member.created_at}`,
            subsection: "mine",
            title: member.status === "waiting" ? "Nueva persona en espera" : member.status === "accepted" ? "Nueva persona aceptada" : "Movimiento en tu plan",
            detail: plan.title || "Plan Donoss",
            created_at: member.updated_at || member.created_at,
          });
        }
      }

      const { data: oldAdmins, error: oldAdminsError } = await supabaseAdmin
        .from("social_plan_members")
        .select("id, plan_id, note, created_at, updated_at")
        .in("plan_id", planIds)
        .eq("note", "Antiguo administrador")
        .order("created_at", { ascending: false })
        .limit(80);

      if (!oldAdminsError) {
        for (const oldAdmin of oldAdmins || []) {
          const plan = plansById[oldAdmin.plan_id] || {};
          pushNotification(events, {
            section: "quedar",
            href: "plans.html?tab=mine",
            key: `quedar:admin-transfer:${oldAdmin.plan_id}:${oldAdmin.id}`,
            subsection: "mine",
            kind: "admin_transfer",
            plan_id: oldAdmin.plan_id,
            title: "Ahora administras este plan",
            detail: plan.title || "Plan Donoss",
            created_at: oldAdmin.updated_at || oldAdmin.created_at,
          });
        }
      }
    }

    const { data: joinedMembers, error: joinedError } = await supabaseAdmin
      .from("social_plan_members")
      .select("id, plan_id, status, created_at, updated_at")
      .eq("user_id", profile.id)
      .order("updated_at", { ascending: false })
      .limit(120);

    if (!joinedError && (joinedMembers || []).length > 0) {
      const joinedPlanIds = [...new Set(joinedMembers.map((member) => member.plan_id).filter(Boolean))];
      let plansById = {};
      if (joinedPlanIds.length > 0) {
        const { data: plans } = await supabaseAdmin
          .from("social_plans")
          .select("id, title, status")
          .in("id", joinedPlanIds);
        plansById = Object.fromEntries((plans || []).map((plan) => [plan.id, plan]));
      }

      for (const member of joinedMembers || []) {
        const plan = plansById[member.plan_id] || {};
        pushNotification(events, {
          section: "quedar",
          href: "plans.html?tab=joined",
          key: `quedar:joined:${member.id}:${member.status}:${member.updated_at || member.created_at}`,
          subsection: "joined",
          title: member.status === "accepted" ? "Te aceptaron en un plan" : member.status === "waiting" ? "Sigues en lista de espera" : member.status === "removed" ? "Ya no estás en este plan" : "Actualización de plan",
          detail: plan.title || "Plan Donoss",
          created_at: member.updated_at || member.created_at,
        });
        if (["waiting", "removed"].includes(member.status) && plan.status === "confirmed") {
          pushNotification(events, {
            section: "quedar",
            href: `side-group.html?id=${member.plan_id}&status=${member.status}`,
            key: `quedar:side:${member.id}:${member.status}:${member.updated_at || member.created_at}`,
            subsection: "joined",
            kind: "side_available",
            plan_id: member.plan_id,
            side_status: member.status,
            title: member.status === "waiting" ? "Grupo alternativo disponible" : "Grupo aparte disponible",
            detail: plan.title || "Plan Donoss",
            created_at: member.updated_at || member.created_at,
          });
        }
      }
    }

    const sideMembers = (joinedMembers || []).filter((member) => ["waiting", "removed"].includes(member.status) && plansById[member.plan_id]?.status === "confirmed");
    const sidePlanIds = [...new Set(sideMembers.map((member) => member.plan_id).filter(Boolean))];
    const sideMemberByPlanId = new Map(sideMembers.map((member) => [member.plan_id, member]));

    if (sidePlanIds.length > 0) {
      const { data: sideMessages, error: sideMessagesError } = await supabaseAdmin
        .from("social_plan_side_group_messages")
        .select("id, plan_id, group_status, sender_id, body, created_at")
        .in("plan_id", sidePlanIds)
        .neq("sender_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(160);

      if (sideMessagesError && sideMessagesError.code !== "42P01") console.error("Notification side messages error:", sideMessagesError);
      if (!sideMessagesError) {
        for (const message of sideMessages || []) {
          const member = sideMemberByPlanId.get(message.plan_id);
          if (!member) continue;
          if (![member.status, "merged"].includes(message.group_status)) continue;
          const plan = plansById[message.plan_id] || {};
          pushNotification(events, {
            section: "quedar",
            href: `side-group.html?id=${message.plan_id}&status=${member.status}`,
            key: `quedar:side-chat:${message.id}:${profile.id}`,
            subsection: "joined",
            kind: "side_chat",
            plan_id: message.plan_id,
            side_status: member.status,
            title: member.status === "waiting" ? "Mensaje en grupo alternativo" : "Mensaje en grupo aparte",
            detail: `${plan.title || "Plan Donoss"} · ${String(message.body || "").slice(0, 80)}`,
            created_at: message.created_at,
          });
        }
      }

      const { data: mergeRequests, error: mergeError } = await supabaseAdmin
        .from("social_plan_side_group_merges")
        .select("id, plan_id, from_status, to_status, requester_id, status, created_at, accepted_at")
        .in("plan_id", sidePlanIds)
        .or("status.eq.pending,status.eq.accepted")
        .order("created_at", { ascending: false })
        .limit(160);

      if (mergeError && mergeError.code !== "42P01") console.error("Notification side merge error:", mergeError);
      if (!mergeError) {
        for (const requestRow of mergeRequests || []) {
          const member = sideMemberByPlanId.get(requestRow.plan_id);
          if (!member || ![requestRow.from_status, requestRow.to_status].includes(member.status)) continue;
          const plan = plansById[requestRow.plan_id] || {};
          if (requestRow.status === "pending" && requestRow.to_status === member.status && requestRow.requester_id !== profile.id) {
            pushNotification(events, {
              section: "quedar",
              href: `side-group.html?id=${requestRow.plan_id}&status=${member.status}`,
              key: `quedar:side-merge-request:${requestRow.id}:${profile.id}`,
              subsection: "joined",
              kind: "side_merge",
              plan_id: requestRow.plan_id,
              side_status: member.status,
              title: "Solicitud para unir grupos",
              detail: plan.title || "Plan Donoss",
              created_at: requestRow.created_at,
            });
          }
          if (requestRow.status === "accepted") {
            pushNotification(events, {
              section: "quedar",
              href: `side-group.html?id=${requestRow.plan_id}&status=${member.status}`,
              key: `quedar:side-merge-accepted:${requestRow.id}:${profile.id}`,
              subsection: "joined",
              kind: "side_merge",
              plan_id: requestRow.plan_id,
              side_status: member.status,
              title: "Grupos unidos",
              detail: plan.title || "Plan Donoss",
              created_at: requestRow.accepted_at || requestRow.created_at,
            });
          }
        }
      }
    }

    const chatPlanSubsections = new Map();
    for (const plan of ownedPlans || []) {
      chatPlanSubsections.set(plan.id, "mine");
    }
    for (const member of joinedMembers || []) {
      if (member.status === "accepted") chatPlanSubsections.set(member.plan_id, "joined");
    }

    const chatPlanIds = [...chatPlanSubsections.keys()].filter(Boolean);
    if (chatPlanIds.length > 0) {
      const { data: chatPlans } = await supabaseAdmin
        .from("social_plans")
        .select("id, title")
        .in("id", chatPlanIds);
      const chatPlansById = Object.fromEntries((chatPlans || []).map((plan) => [plan.id, plan]));
      const { data: messages, error: messagesError } = await supabaseAdmin
        .from("social_plan_messages")
        .select("id, plan_id, sender_id, body, created_at")
        .in("plan_id", chatPlanIds)
        .neq("sender_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(160);

      if (messagesError && messagesError.code !== "42P01") console.error("Notification social plan chat error:", messagesError);
      if (!messagesError) {
        for (const message of messages || []) {
          const plan = chatPlansById[message.plan_id] || {};
          pushNotification(events, {
            section: "quedar",
            href: `plan-chat.html?id=${message.plan_id}`,
            key: `quedar:chat:${message.id}:${profile.id}`,
            subsection: chatPlanSubsections.get(message.plan_id) || "joined",
            kind: "chat",
            plan_id: message.plan_id,
            title: "Nuevo mensaje en el grupo",
            detail: `${plan.title || "Plan Donoss"} · ${String(message.body || "").slice(0, 80)}`,
            created_at: message.created_at,
          });
        }
      }
    }
  } catch (error) {
    console.error("Notification social plans error:", error);
  }

  if (profile.account_type === "business") {
    try {
      const { data: sales, error } = await supabaseAdmin
        .from("purchases")
        .select("id, offer_id, buyer_id, total_points, created_at")
        .eq("receiver_profile_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (!error) {
        const offerIds = [...new Set((sales || []).map((purchase) => purchase.offer_id).filter(Boolean))];
        let offersById = {};
        if (offerIds.length > 0) {
          const { data: offers } = await supabaseAdmin
            .from("business_offers")
            .select("id, title")
            .in("id", offerIds);
          offersById = Object.fromEntries((offers || []).map((offer) => [offer.id, offer]));
        }

        for (const sale of sales || []) {
          const offer = offersById[sale.offer_id] || {};
          pushNotification(events, {
            key: `sale:${sale.id}:business`,
            subsection: "incoming",
            title: `Nueva venta: ${offer.title || "publicación"}`,
            detail: `+${sale.total_points || 0} ptos. recibidos`,
            href: `incoming-detail.html?id=${sale.id}`,
            created_at: sale.created_at,
          });
        }
      }
    } catch (error) {
      console.error("Notification sales error:", error);
    }

    try {
      const { data: scans, error } = await supabaseAdmin
        .from("ticket_verifications")
        .select("id, purchase_id, status, checked_at")
        .eq("business_id", profile.id)
        .order("checked_at", { ascending: false })
        .limit(100);

      if (!error) {
        for (const scan of scans || []) {
          pushNotification(events, {
            key: `scan:${scan.id}`,
            subsection: "scanned",
            title: "Billete comprobado",
            detail: scan.status === "valid" ? "Validación correcta" : `Estado: ${scan.status || "revisado"}`,
            href: `scanned-ticket-detail.html?id=${scan.id}`,
            created_at: scan.checked_at,
          });
        }
      }
    } catch (error) {
      console.error("Notification scans error:", error);
    }

    try {
      const { data: offers, error } = await supabaseAdmin
        .from("business_offers")
        .select("id, title, stock_quantity, sold_count, out_of_stock_since, created_at")
        .eq("business_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(250);

      if (!error) {
        for (const offer of offers || []) {
          if (offer.stock_quantity === null || offer.stock_quantity === undefined) continue;
          const remaining = Math.max(Number(offer.stock_quantity || 0) - Number(offer.sold_count || 0), 0);
          if (remaining > 3) continue;
          pushNotification(events, {
            key: `stock:${offer.id}:${remaining}`,
            subsection: "stock",
            title: remaining === 0 ? `Agotado: ${offer.title || "publicación"}` : `Stock bajo: ${offer.title || "publicación"}`,
            detail: remaining === 0 ? "Producto en ruptura de stock" : `Quedan ${remaining} unidades`,
            href: `admin-offer.html?id=${offer.id}`,
            created_at: offer.out_of_stock_since || offer.created_at,
          });
        }
      }
    } catch (error) {
      console.error("Notification stock error:", error);
    }

    try {
      const { data: payouts, error } = await supabaseAdmin
        .from("business_payouts")
        .select("id, points, amount_cents, note, created_at")
        .eq("business_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(80);

      if (!error) {
        for (const payout of payouts || []) {
          pushNotification(events, {
            key: `payout:${payout.id}`,
            subsection: "payouts",
            title: `Liquidación recibida: ${payout.points || 0} ptos.`,
            detail: `${((Number(payout.amount_cents || 0)) / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€ enviados por Donoss`,
            href: "historial.html?tab=payouts",
            created_at: payout.created_at,
          });
        }
      }
    } catch (error) {
      console.error("Notification payouts error:", error);
    }
  }

  return events.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

app.get("/api/me/notifications", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const profile = await ensureProfileForUser(auth.user);
    const events = await buildNotificationsForProfile(profile);
    const keys = events.map((event) => event.key);
    let readKeys = new Set();

    if (keys.length > 0) {
      const { data: reads, error: readsError } = await supabaseAdmin
        .from("notification_reads")
        .select("notification_key")
        .eq("profile_id", profile.id)
        .in("notification_key", keys);

      if (readsError) {
        return response.status(500).json({
          error: readsError.code === "42P01" ? "notification_reads_table_missing" : "notifications_failed",
        });
      }
      readKeys = new Set((reads || []).map((read) => read.notification_key));
    }

    response.json({
      counts: compactNotificationCounts(events, readKeys),
      events: events.map((event) => ({ ...event, read: readKeys.has(event.key) })),
      unread_keys: events.filter((event) => !readKeys.has(event.key)).map((event) => event.key),
    });
  } catch (error) {
    console.error("Notifications fatal error:", error);
    response.status(500).json({ error: error.code === "42P01" ? "notification_reads_table_missing" : "notifications_failed" });
  }
});

app.post("/api/me/notifications/read", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const profile = await ensureProfileForUser(auth.user);
    const keys = Array.isArray(request.body?.keys)
      ? [...new Set(request.body.keys.map((key) => String(key || "").trim()).filter(Boolean))]
      : [];

    if (keys.length === 0) return response.json({ read: 0 });

    const rows = keys.map((key) => ({
      profile_id: profile.id,
      notification_key: key,
      read_at: new Date().toISOString(),
    }));

    const { error } = await supabaseAdmin
      .from("notification_reads")
      .upsert(rows, { onConflict: "profile_id,notification_key" });

    if (error) {
      return response.status(500).json({
        error: error.code === "42P01" ? "notification_reads_table_missing" : "notification_read_failed",
      });
    }

    response.json({ read: rows.length });
  } catch (error) {
    console.error("Notification read fatal error:", error);
    response.status(500).json({ error: error.code === "42P01" ? "notification_reads_table_missing" : "notification_read_failed" });
  }
});

async function enrichPurchases(purchases) {
  const offerIds = [...new Set((purchases || []).map((purchase) => purchase.offer_id).filter(Boolean))];
  const receiverIds = [...new Set((purchases || []).map((purchase) => purchase.receiver_profile_id).filter(Boolean))];
  let offersById = {};
  let receiversById = {};

  if (offerIds.length > 0) {
    const { data: offers, error: offersError } = await supabaseAdmin
      .from("business_offers")
      .select("id, business_id, title, cover_photo_data_url, presentation_image_data_urls, address, categories, base_price, reduced_price, required_points, hours, start_date, end_date, qr_valid_from, qr_valid_until, age, description, cart_button_text, delivery_pickup_enabled, delivery_home_enabled, delivery_home_points, business_display_name, business_is_verified, author")
      .in("id", offerIds);

    if (offersError) console.error("Purchase history offers error:", offersError);
    const businessIds = [...new Set((offers || []).map((offer) => offer.business_id).filter(Boolean))];
    let businessesById = {};

    if (businessIds.length > 0) {
      const { data: businesses, error: businessesError } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, is_verified")
        .in("id", businessIds);

      if (businessesError) console.error("Purchase history businesses error:", businessesError);
      businessesById = Object.fromEntries((businesses || []).map((profile) => [profile.id, profile]));
    }

    offersById = Object.fromEntries((offers || []).map((offer) => {
      const business = businessesById[offer.business_id];
      return [offer.id, {
        ...offer,
        business_display_name: business?.display_name || offer.business_display_name,
        business_is_verified: Boolean(business?.is_verified || offer.business_is_verified),
      }];
    }));
  }

  if (receiverIds.length > 0) {
    const { data: receivers, error: receiversError } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, email, phone, transaction_id, is_verified")
      .in("id", receiverIds);

    if (receiversError) console.error("Purchase history receivers error:", receiversError);
    receiversById = Object.fromEntries((receivers || []).map((profile) => [profile.id, profile]));
  }

  return (purchases || []).map((purchase) => ({
    ...purchase,
    offer: offersById[purchase.offer_id] || null,
    receiver: receiversById[purchase.receiver_profile_id] || null,
  }));
}

const publicOfferSelect =
  "id, business_id, title, cover_photo_data_url, presentation_image_data_urls, address, categories, base_price, reduced_price, required_points, hours, start_date, end_date, qr_valid_from, qr_valid_until, age, description, cart_button_text, delivery_pickup_enabled, delivery_home_enabled, delivery_home_points, business_display_name, business_is_verified, author, stock_quantity, sold_count, out_of_stock_since, is_hidden, created_at";

function remainingOfferStock(offer) {
  if (offer?.stock_quantity === null || offer?.stock_quantity === undefined || offer?.stock_quantity === "") return null;
  return Math.max(Number(offer.stock_quantity || 0) - Number(offer.sold_count || 0), 0);
}

function isOfferVisibleForPublic(offer) {
  if (!offer || offer.is_hidden) return false;
  const today = todayDateString();
  const validUntil = offer.qr_valid_until || offer.end_date || null;
  if (validUntil && String(validUntil).slice(0, 10) < today) return false;
  const remaining = remainingOfferStock(offer);
  if (remaining === null || remaining > 0) return true;
  if (!offer.out_of_stock_since) return true;
  return Date.now() - new Date(offer.out_of_stock_since).getTime() < 24 * 60 * 60 * 1000;
}

async function enrichOffersWithBusiness(offers) {
  const businessIds = [...new Set((offers || []).map((offer) => offer.business_id).filter(Boolean))];
  let businessesById = {};

  if (businessIds.length > 0) {
    const { data: businesses, error } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, is_verified")
      .in("id", businessIds);

    if (error) console.error("Offers business enrichment error:", error);
    businessesById = Object.fromEntries((businesses || []).map((business) => [business.id, business]));
  }

  return (offers || []).map((offer) => {
    const business = businessesById[offer.business_id];
    return {
      ...offer,
      business_display_name: business?.display_name || offer.business_display_name,
      business_is_verified: Boolean(business?.is_verified || offer.business_is_verified),
    };
  });
}

function publicPlanProfile(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    display_name: profile.display_name,
    neighborhood: profile.neighborhood,
    transaction_id: profile.transaction_id,
    is_verified: Boolean(profile.is_verified),
  };
}

function privatePlanProfile(profile) {
  const base = publicPlanProfile(profile);
  if (!base) return null;
  return {
    ...base,
    plan_photo_data_urls: parsePlanProfilePhotos(profile.plan_photo_data_url),
  };
}

function countPlanMembers(members = []) {
  const accepted = members.filter((member) => member.status === "accepted");
  const waiting = members.filter((member) => member.status === "waiting");
  const removed = members.filter((member) => member.status === "removed");
  return {
    accepted: accepted.length,
    waiting: waiting.length,
    removed: removed.length,
    women: accepted.filter((member) => member.gender === "woman").length,
    men: accepted.filter((member) => member.gender === "man").length,
    open: accepted.filter((member) => member.gender === "open").length,
  };
}

function nextPlanMemberStatus(plan, members, gender) {
  if (plan.status !== "open") return "waiting";
  const counts = countPlanMembers(members);
  const totalWanted = Number(plan.wanted_women || 0) + Number(plan.wanted_men || 0) + Number(plan.wanted_open || 0);
  if (gender === "woman" && counts.women < Number(plan.wanted_women || 0)) return "accepted";
  if (gender === "man" && counts.men < Number(plan.wanted_men || 0)) return "accepted";
  if (gender === "open" && counts.open < Number(plan.wanted_open || 0)) return "accepted";
  if (Number(plan.wanted_open || 0) > 0 && counts.accepted < totalWanted) return "accepted";
  return "waiting";
}

function isSocialPlanExpired(plan) {
  const validUntil = plan?.purchase?.qr_valid_until || plan?.purchase?.offer?.qr_valid_until || plan?.purchase?.offer?.end_date || null;
  if (!validUntil) return false;
  const today = todayDateString();
  return String(validUntil).slice(0, 10) < today;
}

function filterPublicSocialPlans(plans, viewerId) {
  return (plans || []).filter((plan) => {
    if (!isSocialPlanExpired(plan)) return true;
    return plan.is_owner || Boolean(plan.viewer_member);
  });
}

function parseSocialPlanPhotos(value) {
  const raw = String(value || "");
  if (!raw) return [];
  if (raw.startsWith("data:image/")) return [raw];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => String(item || "").startsWith("data:image/")).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function normalizedSocialPlanPhotos(values) {
  const photos = (Array.isArray(values) ? values : [values])
    .map((value) => String(value || ""))
    .filter((value) => value.startsWith("data:image/"))
    .slice(0, 5);
  if (photos.length === 0) return null;
  const encoded = JSON.stringify(photos);
  if (encoded.length > 4200000) {
    const error = new Error("photo_too_large");
    error.code = "photo_too_large";
    throw error;
  }
  return encoded;
}

async function enrichSocialPlans(plans, viewerId = "") {
  const planRows = plans || [];
  const creatorIds = [...new Set(planRows.map((plan) => plan.creator_id).filter(Boolean))];
  const purchaseIds = [...new Set(planRows.map((plan) => plan.purchase_id).filter(Boolean))];
  const planIds = [...new Set(planRows.map((plan) => plan.id).filter(Boolean))];
  let creatorsById = {};
  let purchasesById = {};
  let membersByPlanId = {};

  if (creatorIds.length > 0) {
    let { data: creators, error } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, neighborhood, transaction_id, is_verified, plan_photo_data_url")
      .in("id", creatorIds);
    if (error?.code === "42703") {
      const fallback = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, neighborhood, transaction_id, is_verified")
        .in("id", creatorIds);
      creators = fallback.data;
      error = fallback.error;
    }
    if (error) console.error("Social plan creators error:", error);
    creatorsById = Object.fromEntries((creators || []).map((profile) => [profile.id, profile]));
  }

  if (purchaseIds.length > 0) {
    const { data: purchases, error } = await supabaseAdmin
      .from("purchases")
      .select("id, buyer_id, offer_id, delivery_method, offer_points, delivery_points, total_points, receiver_profile_id, created_at")
      .in("id", purchaseIds);
    if (error) console.error("Social plan purchases error:", error);
    const enriched = await enrichPurchases(purchases || []);
    purchasesById = Object.fromEntries(enriched.map((purchase) => [purchase.id, purchase]));
  }

  if (planIds.length > 0) {
    const { data: members, error } = await supabaseAdmin
      .from("social_plan_members")
      .select("id, plan_id, user_id, gender, status, note, created_at, updated_at")
      .in("plan_id", planIds)
      .order("created_at", { ascending: true });
    if (error) console.error("Social plan members error:", error);
    const memberUserIds = [...new Set((members || []).map((member) => member.user_id).filter(Boolean))];
    let usersById = {};
    if (memberUserIds.length > 0) {
      let { data: users, error: usersError } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, neighborhood, transaction_id, is_verified, plan_photo_data_url")
        .in("id", memberUserIds);
      if (usersError?.code === "42703") {
        const fallback = await supabaseAdmin
          .from("profiles")
          .select("id, display_name, neighborhood, transaction_id, is_verified")
          .in("id", memberUserIds);
        users = fallback.data;
        usersError = fallback.error;
      }
      if (usersError) console.error("Social plan member users error:", usersError);
      usersById = Object.fromEntries((users || []).map((profile) => [profile.id, profile]));
    }
    for (const member of members || []) {
      if (!membersByPlanId[member.plan_id]) membersByPlanId[member.plan_id] = [];
      membersByPlanId[member.plan_id].push({
        ...member,
        user: usersById[member.user_id],
      });
    }
  }

  return planRows.map((plan) => {
    const members = membersByPlanId[plan.id] || [];
    const viewerMember = members.find((member) => member.user_id === viewerId) || null;
    const canViewParticipantPhotos =
      plan.creator_id === viewerId ||
      members.some((member) => member.user_id === viewerId && member.status === "accepted");
    const publicMembers = members.map((member) => ({
      ...member,
      user: canViewParticipantPhotos || member.user_id === viewerId
        ? privatePlanProfile(member.user)
        : publicPlanProfile(member.user),
    }));
    const purchase = purchasesById[plan.purchase_id] || null;
    const enrichedPlan = {
      ...plan,
      purchase,
    };
    return {
      ...plan,
      photo_data_urls: parseSocialPlanPhotos(plan.photo_data_url),
      creator: canViewParticipantPhotos || plan.creator_id === viewerId
        ? privatePlanProfile(creatorsById[plan.creator_id])
        : publicPlanProfile(creatorsById[plan.creator_id]),
      purchase,
      members: publicMembers,
      counts: countPlanMembers(publicMembers),
      viewer_member: viewerMember ? {
        ...viewerMember,
        user: privatePlanProfile(viewerMember.user),
      } : null,
      is_owner: plan.creator_id === viewerId,
      is_expired: isSocialPlanExpired(enrichedPlan),
    };
  });
}

async function getSocialPlanChatAccess(planId, profileId) {
  const { data: plan, error: planError } = await supabaseAdmin
    .from("social_plans")
    .select("id, creator_id, purchase_id, title, message, photo_data_url, wanted_women, wanted_men, wanted_open, status, confirmed_at, created_at, updated_at")
    .eq("id", planId)
    .maybeSingle();
  if (planError) throw planError;
  if (!plan || plan.status === "cancelled") return { allowed: false, reason: "plan_not_found" };
  if (plan.creator_id === profileId) return { allowed: true, role: "owner", plan };

  const { data: member, error: memberError } = await supabaseAdmin
    .from("social_plan_members")
    .select("id, status")
    .eq("plan_id", plan.id)
    .eq("user_id", profileId)
    .maybeSingle();
  if (memberError) throw memberError;
  if (member?.status === "accepted") return { allowed: true, role: "member", plan };
  return { allowed: false, reason: member ? "not_accepted" : "not_member", plan };
}

async function markPlanChatMessagesRead(messages = [], planId, readerId) {
  const readableMessages = (messages || []).filter((message) => message.sender_id !== readerId && !message.deleted_at);
  if (readableMessages.length === 0) return;
  const now = new Date().toISOString();
  const rows = readableMessages.map((message) => ({
    message_id: message.id,
    plan_id: planId,
    reader_id: readerId,
    read_at: now,
  }));
  const { error } = await supabaseAdmin
    .from("social_plan_message_reads")
    .upsert(rows, { onConflict: "message_id,reader_id" });
  if (error && !["42P01", "42703"].includes(error.code)) {
    console.error("Social plan chat read receipt error:", error);
  }
}

async function enrichPlanChatMessages(messages = []) {
  const senderIds = [...new Set(messages.map((message) => message.sender_id).filter(Boolean))];
  const messageIds = [...new Set(messages.map((message) => message.id).filter(Boolean))];
  let sendersById = {};
  let readsByMessageId = {};
  if (senderIds.length > 0) {
    let { data: senders, error } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, email, transaction_id, is_verified, plan_photo_data_url")
      .in("id", senderIds);
    if (error?.code === "42703") {
      const fallback = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, email, transaction_id, is_verified")
        .in("id", senderIds);
      senders = fallback.data;
      error = fallback.error;
    }
    if (error) console.error("Social plan chat senders error:", error);
    sendersById = Object.fromEntries((senders || []).map((profile) => [profile.id, {
      ...transferPublicProfile(profile),
      plan_photo_data_urls: parsePlanProfilePhotos(profile.plan_photo_data_url),
    }]));
  }
  if (messageIds.length > 0) {
    const { data: reads, error } = await supabaseAdmin
      .from("social_plan_message_reads")
      .select("message_id, reader_id, read_at")
      .in("message_id", messageIds)
      .order("read_at", { ascending: true });
    if (error) {
      if (!["42P01", "42703"].includes(error.code)) console.error("Social plan chat reads error:", error);
    } else {
      const readerIds = [...new Set((reads || []).map((read) => read.reader_id).filter(Boolean))];
      let readersById = {};
      if (readerIds.length > 0) {
        let { data: readers, error: readersError } = await supabaseAdmin
          .from("profiles")
          .select("id, display_name, email, transaction_id, is_verified, plan_photo_data_url")
          .in("id", readerIds);
        if (readersError?.code === "42703") {
          const fallback = await supabaseAdmin
            .from("profiles")
            .select("id, display_name, email, transaction_id, is_verified")
            .in("id", readerIds);
          readers = fallback.data;
          readersError = fallback.error;
        }
        if (readersError) console.error("Social plan chat readers error:", readersError);
        readersById = Object.fromEntries((readers || []).map((profile) => [profile.id, {
          ...transferPublicProfile(profile),
          plan_photo_data_urls: parsePlanProfilePhotos(profile.plan_photo_data_url),
        }]));
      }
      for (const read of reads || []) {
        if (!readsByMessageId[read.message_id]) readsByMessageId[read.message_id] = [];
        readsByMessageId[read.message_id].push({
          read_at: read.read_at,
          reader: readersById[read.reader_id] || { id: read.reader_id, display_name: "Usuario Donoss" },
        });
      }
    }
  }
  return messages.map((message) => ({
    ...message,
    sender: sendersById[message.sender_id] || null,
    read_by: readsByMessageId[message.id] || [],
  }));
}

function canEditChatMessage(message) {
  if (!message?.created_at || message.deleted_at) return false;
  return Date.now() - new Date(message.created_at).getTime() <= 15 * 60 * 1000;
}

function normalizeSideGroupStatus(value) {
  return ["waiting", "removed"].includes(value) ? value : "";
}

function otherSideGroupStatus(value) {
  return value === "waiting" ? "removed" : "waiting";
}

async function getSideGroupAccess(planId, profileId, requestedStatus) {
  const status = normalizeSideGroupStatus(requestedStatus);
  if (!status) return { allowed: false, reason: "invalid_side_group" };

  const { data: plan, error: planError } = await supabaseAdmin
    .from("social_plans")
    .select("id, creator_id, purchase_id, title, message, photo_data_url, wanted_women, wanted_men, wanted_open, status, confirmed_at, created_at, updated_at")
    .eq("id", planId)
    .maybeSingle();
  if (planError) throw planError;
  if (!plan || plan.status !== "confirmed") return { allowed: false, reason: "side_group_not_ready" };

  const { data: member, error: memberError } = await supabaseAdmin
    .from("social_plan_members")
    .select("id, plan_id, user_id, gender, status, note, created_at, updated_at")
    .eq("plan_id", plan.id)
    .eq("user_id", profileId)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!member || member.status !== status) return { allowed: false, reason: "not_in_side_group", plan };

  return { allowed: true, plan, member, status };
}

async function getAcceptedSideMerge(planId) {
  const { data: merge, error } = await supabaseAdmin
    .from("social_plan_side_group_merges")
    .select("id, plan_id, from_status, to_status, requester_id, status, created_at, accepted_at")
    .eq("plan_id", planId)
    .eq("status", "accepted")
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error && error.code !== "42P01") throw error;
  return merge || null;
}

async function enrichSideMessages(messages = []) {
  const senderIds = [...new Set(messages.map((message) => message.sender_id).filter(Boolean))];
  const messageIds = [...new Set(messages.map((message) => message.id).filter(Boolean))];
  let sendersById = {};
  let readsByMessageId = {};
  if (senderIds.length > 0) {
    let { data: senders, error } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, email, transaction_id, is_verified, plan_photo_data_url")
      .in("id", senderIds);
    if (error?.code === "42703") {
      const fallback = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, email, transaction_id, is_verified")
        .in("id", senderIds);
      senders = fallback.data;
      error = fallback.error;
    }
    if (error) console.error("Side group message senders error:", error);
    sendersById = Object.fromEntries((senders || []).map((profile) => [profile.id, {
      ...transferPublicProfile(profile),
      plan_photo_data_urls: parsePlanProfilePhotos(profile.plan_photo_data_url),
    }]));
  }
  if (messageIds.length > 0) {
    const { data: reads, error } = await supabaseAdmin
      .from("social_plan_side_group_message_reads")
      .select("message_id, reader_id, read_at")
      .in("message_id", messageIds)
      .order("read_at", { ascending: true });
    if (error) {
      if (!["42P01", "42703"].includes(error.code)) console.error("Side group message reads error:", error);
    } else {
      const readerIds = [...new Set((reads || []).map((read) => read.reader_id).filter(Boolean))];
      let readersById = {};
      if (readerIds.length > 0) {
        let { data: readers, error: readersError } = await supabaseAdmin
          .from("profiles")
          .select("id, display_name, email, transaction_id, is_verified, plan_photo_data_url")
          .in("id", readerIds);
        if (readersError?.code === "42703") {
          const fallback = await supabaseAdmin
            .from("profiles")
            .select("id, display_name, email, transaction_id, is_verified")
            .in("id", readerIds);
          readers = fallback.data;
          readersError = fallback.error;
        }
        if (readersError) console.error("Side group readers error:", readersError);
        readersById = Object.fromEntries((readers || []).map((profile) => [profile.id, {
          ...transferPublicProfile(profile),
          plan_photo_data_urls: parsePlanProfilePhotos(profile.plan_photo_data_url),
        }]));
      }
      for (const read of reads || []) {
        if (!readsByMessageId[read.message_id]) readsByMessageId[read.message_id] = [];
        readsByMessageId[read.message_id].push({
          read_at: read.read_at,
          reader: readersById[read.reader_id] || { id: read.reader_id, display_name: "Usuario Donoss" },
        });
      }
    }
  }
  return messages.map((message) => ({ ...message, sender: sendersById[message.sender_id] || null, read_by: readsByMessageId[message.id] || [] }));
}

async function markSideGroupMessagesRead(messages = [], planId, readerId) {
  const readableMessages = (messages || []).filter((message) => message.sender_id !== readerId && !message.deleted_at);
  if (readableMessages.length === 0) return;
  const now = new Date().toISOString();
  const rows = readableMessages.map((message) => ({
    message_id: message.id,
    plan_id: planId,
    reader_id: readerId,
    read_at: now,
  }));
  const { error } = await supabaseAdmin
    .from("social_plan_side_group_message_reads")
    .upsert(rows, { onConflict: "message_id,reader_id" });
  if (error && !["42P01", "42703"].includes(error.code)) {
    console.error("Side group read receipt error:", error);
  }
}

app.get("/api/offers/featured", async (_request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const wantedCategories = ["Libros", "Cine", "Festivales", "Conciertos", "Museos", "Gaming", "Música", "Viajes", "Restaurantes"];

  try {
    const { data, error } = await supabaseAdmin
      .from("business_offers")
      .select(publicOfferSelect)
      .order("created_at", { ascending: false })
      .limit(250);

    if (error) {
      console.error("Featured offers error:", error);
      return response.status(500).json({ error: "featured_offers_failed" });
    }

    const visibleOffers = await enrichOffersWithBusiness((data || []).filter(isOfferVisibleForPublic));
    const usedIds = new Set();
    const featured = [];

    for (const category of wantedCategories) {
      const offer = visibleOffers.find((item) => !usedIds.has(item.id) && (item.categories || []).includes(category));
      if (offer) {
        usedIds.add(offer.id);
        featured.push({ ...offer, featured_category: category });
      }
    }

    if (featured.length < 6) {
      for (const offer of visibleOffers) {
        if (usedIds.has(offer.id)) continue;
        usedIds.add(offer.id);
        featured.push({ ...offer, featured_category: offer.categories?.[0] || "Oferta" });
        if (featured.length >= 6) break;
      }
    }

    response.json({ offers: featured });
  } catch (error) {
    console.error("Featured offers fatal error:", error);
    response.status(500).json({ error: "featured_offers_failed" });
  }
});

app.get("/api/offers/categories/summary", async (_request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const wantedCategories = ["Libros", "Cine", "Festivales", "Conciertos", "Museos", "Gaming", "Música", "Viajes", "Restaurantes"];

  try {
    const { data, error } = await supabaseAdmin
      .from("business_offers")
      .select(publicOfferSelect)
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      console.error("Offer category summary error:", error);
      return response.status(500).json({ error: "offer_category_summary_failed" });
    }

    const visibleOffers = await enrichOffersWithBusiness((data || []).filter(isOfferVisibleForPublic));
    const summary = wantedCategories.map((category) => {
      const offers = visibleOffers.filter((offer) => (offer.categories || []).includes(category));
      const preview = offers[0] || null;
      return {
        category,
        count: offers.length,
        preview: preview
          ? {
              id: preview.id,
              title: preview.title,
              cover_photo_data_url: preview.cover_photo_data_url || preview.presentation_image_data_urls?.[0] || "",
              required_points: preview.required_points,
              business_display_name: preview.business_display_name,
              business_is_verified: Boolean(preview.business_is_verified),
            }
          : null,
      };
    });

    response.json({
      categories: summary,
      active_categories: summary.filter((item) => item.count > 0),
      total: visibleOffers.length,
    });
  } catch (error) {
    console.error("Offer category summary fatal error:", error);
    response.status(500).json({ error: "offer_category_summary_failed" });
  }
});

app.get("/api/me/liked-offers", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const profile = await ensureProfileForUser(auth.user);
    const { data: likes, error } = await supabaseAdmin
      .from("liked_offers")
      .select("id, offer_id, created_at")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(250);

    if (error) {
      console.error("Liked offers load error:", error);
      return response.status(500).json({
        error: error.code === "42P01" ? "liked_offers_table_missing" : "liked_offers_failed",
      });
    }

    const offerIds = [...new Set((likes || []).map((like) => like.offer_id).filter(Boolean))];
    let offersById = {};

    if (offerIds.length > 0) {
      const { data: offers, error: offersError } = await supabaseAdmin
        .from("business_offers")
        .select(publicOfferSelect)
        .in("id", offerIds);

      if (offersError) console.error("Liked offers detail error:", offersError);
      const enriched = await enrichOffersWithBusiness(offers || []);
      offersById = Object.fromEntries(enriched.map((offer) => [offer.id, offer]));
    }

    response.json({
      likes: (likes || []).map((like) => ({
        ...like,
        offer: offersById[like.offer_id] || null,
      })),
      offer_ids: (likes || []).map((like) => like.offer_id),
    });
  } catch (error) {
    console.error("Liked offers fatal error:", error);
    response.status(500).json({ error: "liked_offers_failed" });
  }
});

app.post("/api/me/liked-offers", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  const offerId = String(request.body?.offerId || "").trim();
  const shouldLike = request.body?.liked !== false;
  if (!offerId) return response.status(400).json({ error: "offer_missing" });

  try {
    const profile = await ensureProfileForUser(auth.user);

    if (shouldLike) {
      const { error } = await supabaseAdmin
        .from("liked_offers")
        .upsert({ profile_id: profile.id, offer_id: offerId }, { onConflict: "profile_id,offer_id" });

      if (error) {
        console.error("Liked offer save error:", error);
        return response.status(500).json({
          error: error.code === "42P01" ? "liked_offers_table_missing" : "liked_offer_save_failed",
        });
      }
    } else {
      const { error } = await supabaseAdmin
        .from("liked_offers")
        .delete()
        .eq("profile_id", profile.id)
        .eq("offer_id", offerId);

      if (error) {
        console.error("Liked offer delete error:", error);
        return response.status(500).json({
          error: error.code === "42P01" ? "liked_offers_table_missing" : "liked_offer_delete_failed",
        });
      }
    }

    response.json({ offer_id: offerId, liked: shouldLike });
  } catch (error) {
    console.error("Liked offer fatal error:", error);
    response.status(500).json({ error: "liked_offer_save_failed" });
  }
});

app.get("/api/businesses/:businessId/profile", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const businessId = String(request.params.businessId || "").trim();
  if (!businessId) return response.status(400).json({ error: "business_missing" });

  let viewerProfile = null;
  const auth = await getAuthenticatedUser(request);
  if (!auth.error) {
    try {
      viewerProfile = await ensureProfileForUser(auth.user);
    } catch (error) {
      console.error("Business profile viewer error:", error);
    }
  }

  try {
    let { data: business, error: businessError } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, bio, account_type, business_categories, address, neighborhood, transaction_id, is_verified, profile_photo_data_url")
      .eq("id", businessId)
      .maybeSingle();

    if (businessError?.code === "42703") {
      const fallback = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, account_type, business_categories, address, neighborhood, transaction_id, is_verified")
        .eq("id", businessId)
        .maybeSingle();
      business = fallback.data;
      businessError = fallback.error;
    }

    if (businessError) throw businessError;
    if (!business) return response.status(404).json({ error: "business_not_found" });

    const { data: offers, error: offersError } = await supabaseAdmin
      .from("business_offers")
      .select(publicOfferSelect)
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(300);

    if (offersError) throw offersError;
    const publicOffers = await enrichOffersWithBusiness((offers || []).filter(isOfferVisibleForPublic));
    const offerIds = publicOffers.map((offer) => offer.id);

    let totalLikes = 0;
    if (offerIds.length > 0) {
      const { data: likes, error: likesError } = await supabaseAdmin
        .from("liked_offers")
        .select("offer_id")
        .in("offer_id", offerIds);
      if (likesError && likesError.code !== "42P01") console.error("Business likes count error:", likesError);
      totalLikes = (likes || []).length;
    }

    let followersCount = 0;
    let isFollowing = false;
    let followsSqlMissing = false;
    const { data: followers, error: followersError } = await supabaseAdmin
      .from("business_follows")
      .select("follower_id")
      .eq("business_id", business.id);

    if (followersError) {
      followsSqlMissing = followersError.code === "42P01";
      if (!followsSqlMissing) console.error("Business followers count error:", followersError);
    } else {
      followersCount = (followers || []).length;
      isFollowing = Boolean(viewerProfile?.id && (followers || []).some((follow) => follow.follower_id === viewerProfile.id));
    }

    response.json({
      business: businessPublicProfile(business),
      offers: publicOffers,
      stats: {
        publications_count: publicOffers.length,
        total_likes: totalLikes,
        followers_count: followersCount,
      },
      is_following: isFollowing,
      is_self: viewerProfile?.id === business.id,
      follows_sql_missing: followsSqlMissing,
    });
  } catch (error) {
    console.error("Business profile load error:", error);
    response.status(500).json({ error: "business_profile_failed" });
  }
});

app.post("/api/businesses/:businessId/follow", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  const businessId = String(request.params.businessId || "").trim();
  if (!businessId) return response.status(400).json({ error: "business_missing" });

  try {
    const viewer = await ensureProfileForUser(auth.user);
    if (viewer.id === businessId) return response.status(400).json({ error: "cannot_follow_self" });

    const { data: business, error: businessError } = await supabaseAdmin
      .from("profiles")
      .select("id, account_type")
      .eq("id", businessId)
      .maybeSingle();
    if (businessError) throw businessError;
    if (!business) return response.status(404).json({ error: "business_not_found" });

    const { error } = await supabaseAdmin
      .from("business_follows")
      .upsert({ business_id: business.id, follower_id: viewer.id }, { onConflict: "business_id,follower_id" });

    if (error) {
      console.error("Business follow error:", error);
      return response.status(500).json({ error: error.code === "42P01" ? "business_follows_sql_missing" : "business_follow_failed" });
    }

    const { data: followers } = await supabaseAdmin
      .from("business_follows")
      .select("id")
      .eq("business_id", business.id);

    response.json({ is_following: true, followers_count: (followers || []).length });
  } catch (error) {
    console.error("Business follow fatal error:", error);
    response.status(500).json({ error: "business_follow_failed" });
  }
});

app.delete("/api/businesses/:businessId/follow", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  const businessId = String(request.params.businessId || "").trim();
  if (!businessId) return response.status(400).json({ error: "business_missing" });

  try {
    const viewer = await ensureProfileForUser(auth.user);
    const { error } = await supabaseAdmin
      .from("business_follows")
      .delete()
      .eq("business_id", businessId)
      .eq("follower_id", viewer.id);

    if (error) {
      console.error("Business unfollow error:", error);
      return response.status(500).json({ error: error.code === "42P01" ? "business_follows_sql_missing" : "business_unfollow_failed" });
    }

    const { data: followers } = await supabaseAdmin
      .from("business_follows")
      .select("id")
      .eq("business_id", businessId);

    response.json({ is_following: false, followers_count: (followers || []).length });
  } catch (error) {
    console.error("Business unfollow fatal error:", error);
    response.status(500).json({ error: "business_unfollow_failed" });
  }
});

app.get("/api/me/purchases", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    await ensureProfileForUser(auth.user);

    const { data: purchases, error } = await supabaseAdmin
      .from("purchases")
      .select("id, buyer_id, offer_id, delivery_method, offer_points, delivery_points, delivery_address, total_points, receiver_transaction_id, receiver_profile_id, validation_code, security_code, qr_token, qr_valid_from, qr_valid_until, verified_at, last_verified_at, verification_count, created_at")
      .eq("buyer_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(250);

    if (error) {
      console.error("Purchase history error:", error);
      return response.status(500).json({
        error: error.code === "42P01" ? "purchases_table_missing" : "purchase_history_failed",
      });
    }

    response.json({ purchases: await enrichPurchases(purchases || []) });
  } catch (error) {
    console.error("Purchase history fatal error:", error);
    response.status(500).json({ error: "purchase_history_failed" });
  }
});

app.get("/api/me/plan-tickets", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    await ensureProfileForUser(auth.user);
    const { data: purchases, error } = await supabaseAdmin
      .from("purchases")
      .select("id, buyer_id, offer_id, delivery_method, offer_points, delivery_points, total_points, receiver_profile_id, created_at")
      .eq("buyer_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(120);

    if (error) {
      console.error("Plan tickets error:", error);
      return response.status(500).json({
        error: error.code === "42P01" ? "purchases_table_missing" : "plan_tickets_failed",
      });
    }

    response.json({ tickets: await enrichPurchases(purchases || []) });
  } catch (error) {
    console.error("Plan tickets fatal error:", error);
    response.status(500).json({ error: "plan_tickets_failed" });
  }
});

app.get("/api/social-plans", async (request, response) => {
  if (!supabaseAdmin) return response.status(500).json({ error: "Supabase admin is not configured" });

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const viewer = await ensureProfileForUser(auth.user);
    const { data: plans, error } = await supabaseAdmin
      .from("social_plans")
      .select("id, creator_id, purchase_id, title, message, photo_data_url, wanted_women, wanted_men, wanted_open, status, confirmed_at, created_at, updated_at")
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(120);

    if (error) {
      console.error("Social plans list error:", error);
      return response.status(500).json({ error: error.code === "42P01" ? "social_plans_table_missing" : "social_plans_failed" });
    }

    const enriched = await enrichSocialPlans(plans || [], viewer.id);
    response.json({ plans: filterPublicSocialPlans(enriched, viewer.id) });
  } catch (error) {
    console.error("Social plans list fatal error:", error);
    response.status(500).json({ error: "social_plans_failed" });
  }
});

app.get("/api/social-plans/me", async (request, response) => {
  if (!supabaseAdmin) return response.status(500).json({ error: "Supabase admin is not configured" });

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const viewer = await ensureProfileForUser(auth.user);
    const { data: owned, error: ownedError } = await supabaseAdmin
      .from("social_plans")
      .select("id, creator_id, purchase_id, title, message, photo_data_url, wanted_women, wanted_men, wanted_open, status, confirmed_at, created_at, updated_at")
      .eq("creator_id", viewer.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (ownedError) {
      console.error("My social plans owned error:", ownedError);
      return response.status(500).json({ error: ownedError.code === "42P01" ? "social_plans_table_missing" : "social_plans_failed" });
    }

    const { data: memberRows, error: memberError } = await supabaseAdmin
      .from("social_plan_members")
      .select("plan_id")
      .eq("user_id", viewer.id)
      .in("status", ["accepted", "waiting", "removed"])
      .limit(120);

    if (memberError && memberError.code !== "42P01") console.error("My social plans member error:", memberError);
    const memberPlanIds = [...new Set((memberRows || []).map((row) => row.plan_id).filter(Boolean))];
    let joined = [];
    if (memberPlanIds.length > 0) {
      const { data: joinedPlans, error: joinedError } = await supabaseAdmin
        .from("social_plans")
        .select("id, creator_id, purchase_id, title, message, photo_data_url, wanted_women, wanted_men, wanted_open, status, confirmed_at, created_at, updated_at")
        .in("id", memberPlanIds)
        .order("created_at", { ascending: false });
      if (joinedError) console.error("My social plans joined error:", joinedError);
      joined = joinedError ? [] : (joinedPlans || []);
    }

    response.json({
      owned: await enrichSocialPlans(owned || [], viewer.id),
      joined: await enrichSocialPlans(joined || [], viewer.id),
    });
  } catch (error) {
    console.error("My social plans fatal error:", error);
    response.status(500).json({ error: "social_plans_failed" });
  }
});

app.post("/api/social-plans", async (request, response) => {
  if (!supabaseAdmin) return response.status(500).json({ error: "Supabase admin is not configured" });

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const creator = await ensureProfileForUser(auth.user);
    if (creator.account_type === "business") return response.status(403).json({ error: "users_only" });

    const purchaseId = String(request.body?.purchaseId || "").trim();
    const { data: purchase, error: purchaseError } = await supabaseAdmin
      .from("purchases")
      .select("id, buyer_id")
      .eq("id", purchaseId)
      .eq("buyer_id", creator.id)
      .maybeSingle();

    if (purchaseError) throw purchaseError;
    if (!purchase) return response.status(404).json({ error: "purchase_not_found" });

    const wantedWomen = Math.max(Math.floor(Number(request.body?.wantedWomen || 0)), 0);
    const wantedMen = Math.max(Math.floor(Number(request.body?.wantedMen || 0)), 0);
    const wantedOpen = Math.max(Math.floor(Number(request.body?.wantedOpen || 0)), 0);
    const totalWanted = wantedWomen + wantedMen + wantedOpen;
    if (totalWanted <= 0 || totalWanted > 20) return response.status(400).json({ error: "invalid_group_size" });
    const planPhotoDataUrl = normalizedSocialPlanPhotos(request.body?.photoDataUrls || request.body?.photoDataUrl);
    if (parseSocialPlanPhotos(planPhotoDataUrl).length < 2) return response.status(400).json({ error: "plan_photos_required" });

    const { error: profilePhotosError } = await supabaseAdmin
      .from("profiles")
      .update({ plan_photo_data_url: planPhotoDataUrl, updated_at: new Date().toISOString() })
      .eq("id", creator.id);
    if (profilePhotosError) {
      console.error("Create social plan profile photos sync error:", profilePhotosError);
      return response.status(500).json({ error: profilePhotosError.code === "42703" ? "plan_photos_sql_missing" : "plan_photos_failed" });
    }

    const { data: plan, error } = await supabaseAdmin
      .from("social_plans")
      .insert({
        creator_id: creator.id,
        purchase_id: purchaseId,
        title: String(request.body?.title || "").trim().slice(0, 90) || null,
        message: String(request.body?.message || "").trim().slice(0, 420) || null,
        photo_data_url: planPhotoDataUrl,
        wanted_women: wantedWomen,
        wanted_men: wantedMen,
        wanted_open: wantedOpen,
      })
      .select("id, creator_id, purchase_id, title, message, photo_data_url, wanted_women, wanted_men, wanted_open, status, confirmed_at, created_at, updated_at")
      .maybeSingle();

    if (error) {
      console.error("Create social plan error:", error);
      return response.status(500).json({
        error: error.code === "23505" ? "purchase_already_has_plan" : error.code === "42P01" ? "social_plans_table_missing" : "create_plan_failed",
      });
    }

    response.json({ plan: (await enrichSocialPlans([plan], creator.id))[0] });
  } catch (error) {
    console.error("Create social plan fatal error:", error);
    if (error.code === "photo_too_large") return response.status(413).json({ error: "photo_too_large" });
    response.status(500).json({ error: "create_plan_failed" });
  }
});

app.patch("/api/social-plans/:id", async (request, response) => {
  if (!supabaseAdmin) return response.status(500).json({ error: "Supabase admin is not configured" });

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const owner = await ensureProfileForUser(auth.user);
    if (owner.account_type === "business") return response.status(403).json({ error: "users_only" });

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("social_plans")
      .select("id, creator_id, purchase_id, status")
      .eq("id", request.params.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing || existing.creator_id !== owner.id) return response.status(404).json({ error: "plan_not_found" });
    if (existing.status === "confirmed") return response.status(400).json({ error: "plan_confirmed" });
    if (existing.status === "cancelled") return response.status(400).json({ error: "plan_cancelled" });

    const wantedWomen = Math.max(Math.floor(Number(request.body?.wantedWomen || 0)), 0);
    const wantedMen = Math.max(Math.floor(Number(request.body?.wantedMen || 0)), 0);
    const wantedOpen = Math.max(Math.floor(Number(request.body?.wantedOpen || 0)), 0);
    const totalWanted = wantedWomen + wantedMen + wantedOpen;
    if (totalWanted <= 0 || totalWanted > 20) return response.status(400).json({ error: "invalid_group_size" });

    const { data: members, error: membersError } = await supabaseAdmin
      .from("social_plan_members")
      .select("id, status")
      .eq("plan_id", existing.id)
      .eq("status", "accepted");
    if (membersError) throw membersError;
    if (totalWanted < (members || []).length) return response.status(400).json({ error: "group_size_below_accepted" });

    const purchaseId = String(request.body?.purchaseId || existing.purchase_id || "").trim();
    const { data: purchase, error: purchaseError } = await supabaseAdmin
      .from("purchases")
      .select("id, buyer_id")
      .eq("id", purchaseId)
      .eq("buyer_id", owner.id)
      .maybeSingle();

    if (purchaseError) throw purchaseError;
    if (!purchase) return response.status(404).json({ error: "purchase_not_found" });
    const planPhotoDataUrl = normalizedSocialPlanPhotos(request.body?.photoDataUrls || request.body?.photoDataUrl);
    if (parseSocialPlanPhotos(planPhotoDataUrl).length < 2) return response.status(400).json({ error: "plan_photos_required" });

    const { error: profilePhotosError } = await supabaseAdmin
      .from("profiles")
      .update({ plan_photo_data_url: planPhotoDataUrl, updated_at: new Date().toISOString() })
      .eq("id", owner.id);
    if (profilePhotosError) {
      console.error("Update social plan profile photos sync error:", profilePhotosError);
      return response.status(500).json({ error: profilePhotosError.code === "42703" ? "plan_photos_sql_missing" : "plan_photos_failed" });
    }

    const { data: plan, error } = await supabaseAdmin
      .from("social_plans")
      .update({
        purchase_id: purchaseId,
        title: String(request.body?.title || "").trim().slice(0, 90) || null,
        message: String(request.body?.message || "").trim().slice(0, 420) || null,
        photo_data_url: planPhotoDataUrl,
        wanted_women: wantedWomen,
        wanted_men: wantedMen,
        wanted_open: wantedOpen,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("creator_id", owner.id)
      .select("id, creator_id, purchase_id, title, message, photo_data_url, wanted_women, wanted_men, wanted_open, status, confirmed_at, created_at, updated_at")
      .maybeSingle();

    if (error) {
      console.error("Update social plan error:", error);
      return response.status(500).json({
        error: error.code === "23505" ? "purchase_already_has_plan" : error.code === "42P01" ? "social_plans_table_missing" : "update_plan_failed",
      });
    }

    response.json({ plan: (await enrichSocialPlans([plan], owner.id))[0] });
  } catch (error) {
    console.error("Update social plan fatal error:", error);
    if (error.code === "photo_too_large") return response.status(413).json({ error: "photo_too_large" });
    response.status(500).json({ error: "update_plan_failed" });
  }
});

app.post("/api/social-plans/:id/join", async (request, response) => {
  if (!supabaseAdmin) return response.status(500).json({ error: "Supabase admin is not configured" });

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const user = await ensureProfileForUser(auth.user);
    if (user.account_type === "business") return response.status(403).json({ error: "users_only" });

    const { data: plan, error: planError } = await supabaseAdmin
      .from("social_plans")
      .select("id, creator_id, purchase_id, title, message, photo_data_url, wanted_women, wanted_men, wanted_open, status, confirmed_at, created_at, updated_at")
      .eq("id", request.params.id)
      .maybeSingle();
    if (planError) throw planError;
    if (!plan || plan.status === "cancelled") return response.status(404).json({ error: "plan_not_found" });
    if (plan.creator_id === user.id) return response.status(400).json({ error: "owner_cannot_join" });
    if (plan.status === "confirmed") return response.status(400).json({ error: "plan_confirmed" });

    const { data: planPurchase, error: planPurchaseError } = await supabaseAdmin
      .from("purchases")
      .select("id, offer_id")
      .eq("id", plan.purchase_id)
      .maybeSingle();
    if (planPurchaseError) throw planPurchaseError;
    if (!planPurchase?.offer_id) return response.status(404).json({ error: "purchase_not_found" });

    const { data: matchingPurchase, error: matchingPurchaseError } = await supabaseAdmin
      .from("purchases")
      .select("id")
      .eq("buyer_id", user.id)
      .eq("offer_id", planPurchase.offer_id)
      .limit(1)
      .maybeSingle();
    if (matchingPurchaseError) throw matchingPurchaseError;
    if (!matchingPurchase) return response.status(403).json({ error: "ticket_required" });
    const { data: photoProfile, error: photoProfileError } = await supabaseAdmin
      .from("profiles")
      .select("plan_photo_data_url")
      .eq("id", user.id)
      .maybeSingle();
    if (photoProfileError) {
      if (photoProfileError.code === "42703") return response.status(500).json({ error: "plan_photos_sql_missing" });
      throw photoProfileError;
    }
    if (parsePlanProfilePhotos(photoProfile?.plan_photo_data_url).length < 2) {
      return response.status(403).json({ error: "plan_photos_required" });
    }

    const gender = ["woman", "man", "open"].includes(request.body?.gender) ? request.body.gender : "open";
    const note = String(request.body?.note || "").trim().slice(0, 160) || null;
    const { data: members } = await supabaseAdmin
      .from("social_plan_members")
      .select("id, plan_id, user_id, gender, status")
      .eq("plan_id", plan.id)
      .in("status", ["accepted", "waiting"]);
    const status = nextPlanMemberStatus(plan, members || [], gender);

    const { data: member, error } = await supabaseAdmin
      .from("social_plan_members")
      .insert({ plan_id: plan.id, user_id: user.id, gender, status, note })
      .select("id, plan_id, user_id, gender, status, note, created_at, updated_at")
      .maybeSingle();

    if (error) {
      console.error("Join social plan error:", error);
      return response.status(500).json({
        error: error.code === "23505" ? "already_joined" : error.code === "42P01" ? "social_plans_table_missing" : "join_plan_failed",
      });
    }

    response.json({ member, status });
  } catch (error) {
    console.error("Join social plan fatal error:", error);
    response.status(500).json({ error: "join_plan_failed" });
  }
});

app.patch("/api/social-plans/:id/members/:memberId", async (request, response) => {
  if (!supabaseAdmin) return response.status(500).json({ error: "Supabase admin is not configured" });

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const owner = await ensureProfileForUser(auth.user);
    const nextStatus = ["accepted", "waiting", "removed"].includes(request.body?.status) ? request.body.status : "";
    if (!nextStatus) return response.status(400).json({ error: "invalid_status" });

    const { data: plan, error: planError } = await supabaseAdmin
      .from("social_plans")
      .select("id, creator_id, status")
      .eq("id", request.params.id)
      .maybeSingle();
    if (planError) throw planError;
    if (!plan || plan.creator_id !== owner.id) return response.status(404).json({ error: "plan_not_found" });
    if (plan.status === "confirmed") return response.status(400).json({ error: "plan_confirmed" });

    const { data: member, error } = await supabaseAdmin
      .from("social_plan_members")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", request.params.memberId)
      .eq("plan_id", plan.id)
      .select("id, plan_id, user_id, gender, status, note, created_at, updated_at")
      .maybeSingle();
    if (error) throw error;
    if (!member) return response.status(404).json({ error: "member_not_found" });

    const { data: updatedPlan, error: updatedPlanError } = await supabaseAdmin
      .from("social_plans")
      .select("id, creator_id, purchase_id, title, message, photo_data_url, wanted_women, wanted_men, wanted_open, status, confirmed_at, created_at, updated_at")
      .eq("id", plan.id)
      .maybeSingle();
    if (updatedPlanError) throw updatedPlanError;

    response.json({ member, plan: updatedPlan ? (await enrichSocialPlans([updatedPlan], owner.id))[0] : null });
  } catch (error) {
    console.error("Update social plan member fatal error:", error);
    response.status(500).json({ error: "member_update_failed" });
  }
});

app.get("/api/social-plans/:id/chat", async (request, response) => {
  if (!supabaseAdmin) return response.status(500).json({ error: "Supabase admin is not configured" });

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const profile = await ensureProfileForUser(auth.user);
    const access = await getSocialPlanChatAccess(request.params.id, profile.id);
    if (!access.allowed) return response.status(access.reason === "plan_not_found" ? 404 : 403).json({ error: access.reason });

    const { data: messages, error } = await supabaseAdmin
      .from("social_plan_messages")
      .select("id, plan_id, sender_id, body, edited_at, deleted_at, created_at")
      .eq("plan_id", access.plan.id)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) {
      console.error("Social plan chat list error:", error);
      return response.status(500).json({ error: ["42P01", "42703"].includes(error.code) ? "plan_chat_table_missing" : "plan_chat_failed" });
    }
    await markPlanChatMessagesRead(messages || [], access.plan.id, profile.id);

    response.json({
      profile: privatePlanProfile(profile),
      plan: (await enrichSocialPlans([access.plan], profile.id))[0],
      messages: await enrichPlanChatMessages(messages || []),
    });
  } catch (error) {
    console.error("Social plan chat list fatal error:", error);
    response.status(500).json({ error: "plan_chat_failed" });
  }
});

app.post("/api/social-plans/:id/chat", async (request, response) => {
  if (!supabaseAdmin) return response.status(500).json({ error: "Supabase admin is not configured" });

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const profile = await ensureProfileForUser(auth.user);
    const access = await getSocialPlanChatAccess(request.params.id, profile.id);
    if (!access.allowed) return response.status(access.reason === "plan_not_found" ? 404 : 403).json({ error: access.reason });

    const body = String(request.body?.body || "").replace(/\s+/g, " ").trim().slice(0, 800);
    if (!body) return response.status(400).json({ error: "empty_message" });

    const { data: message, error } = await supabaseAdmin
      .from("social_plan_messages")
      .insert({ plan_id: access.plan.id, sender_id: profile.id, body })
      .select("id, plan_id, sender_id, body, edited_at, deleted_at, created_at")
      .maybeSingle();

    if (error) {
      console.error("Social plan chat send error:", error);
      return response.status(500).json({ error: ["42P01", "42703"].includes(error.code) ? "plan_chat_table_missing" : "send_message_failed" });
    }

    const [enriched] = await enrichPlanChatMessages([message]);
    response.json({ message: enriched });
  } catch (error) {
    console.error("Social plan chat send fatal error:", error);
    response.status(500).json({ error: "send_message_failed" });
  }
});

app.patch("/api/social-plans/:id/chat/:messageId", async (request, response) => {
  if (!supabaseAdmin) return response.status(500).json({ error: "Supabase admin is not configured" });

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const profile = await ensureProfileForUser(auth.user);
    const access = await getSocialPlanChatAccess(request.params.id, profile.id);
    if (!access.allowed) return response.status(access.reason === "plan_not_found" ? 404 : 403).json({ error: access.reason });

    const body = String(request.body?.body || "").replace(/\s+/g, " ").trim().slice(0, 800);
    if (!body) return response.status(400).json({ error: "empty_message" });

    const { data: current, error: currentError } = await supabaseAdmin
      .from("social_plan_messages")
      .select("id, plan_id, sender_id, body, edited_at, deleted_at, created_at")
      .eq("id", request.params.messageId)
      .eq("plan_id", access.plan.id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current || current.sender_id !== profile.id) return response.status(404).json({ error: "message_not_found" });
    if (!canEditChatMessage(current)) return response.status(403).json({ error: "edit_window_closed" });

    const { data: message, error } = await supabaseAdmin
      .from("social_plan_messages")
      .update({ body, edited_at: new Date().toISOString() })
      .eq("id", current.id)
      .select("id, plan_id, sender_id, body, edited_at, deleted_at, created_at")
      .maybeSingle();
    if (error) throw error;
    const [enriched] = await enrichPlanChatMessages([message]);
    response.json({ message: enriched });
  } catch (error) {
    console.error("Social plan chat edit fatal error:", error);
    response.status(500).json({ error: ["42P01", "42703"].includes(error.code) ? "plan_chat_table_missing" : "edit_message_failed" });
  }
});

app.delete("/api/social-plans/:id/chat/:messageId", async (request, response) => {
  if (!supabaseAdmin) return response.status(500).json({ error: "Supabase admin is not configured" });

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const profile = await ensureProfileForUser(auth.user);
    const access = await getSocialPlanChatAccess(request.params.id, profile.id);
    if (!access.allowed) return response.status(access.reason === "plan_not_found" ? 404 : 403).json({ error: access.reason });

    const { data: current, error: currentError } = await supabaseAdmin
      .from("social_plan_messages")
      .select("id, plan_id, sender_id")
      .eq("id", request.params.messageId)
      .eq("plan_id", access.plan.id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current || current.sender_id !== profile.id) return response.status(404).json({ error: "message_not_found" });

    const { data: message, error } = await supabaseAdmin
      .from("social_plan_messages")
      .update({ body: "Mensaje eliminado", deleted_at: new Date().toISOString(), edited_at: null })
      .eq("id", current.id)
      .select("id, plan_id, sender_id, body, edited_at, deleted_at, created_at")
      .maybeSingle();
    if (error) throw error;
    const [enriched] = await enrichPlanChatMessages([message]);
    response.json({ message: enriched });
  } catch (error) {
    console.error("Social plan chat delete fatal error:", error);
    response.status(500).json({ error: ["42P01", "42703"].includes(error.code) ? "plan_chat_table_missing" : "delete_message_failed" });
  }
});

app.get("/api/social-plans/:id/side-group/:status", async (request, response) => {
  if (!supabaseAdmin) return response.status(500).json({ error: "Supabase admin is not configured" });

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const profile = await ensureProfileForUser(auth.user);
    const access = await getSideGroupAccess(request.params.id, profile.id, request.params.status);
    if (!access.allowed) return response.status(403).json({ error: access.reason });

    const otherStatus = otherSideGroupStatus(access.status);
    const merge = await getAcceptedSideMerge(access.plan.id);
    const isMerged = Boolean(merge);
    const statuses = isMerged ? ["waiting", "removed"] : [access.status];
    const messageStatuses = isMerged ? ["waiting", "removed", "merged"] : [access.status];

    const { data: members, error: membersError } = await supabaseAdmin
      .from("social_plan_members")
      .select("id, plan_id, user_id, gender, status, note, created_at, updated_at")
      .eq("plan_id", access.plan.id)
      .in("status", statuses)
      .order("created_at", { ascending: true });
    if (membersError) throw membersError;

    const memberUserIds = [...new Set((members || []).map((member) => member.user_id).filter(Boolean))];
    let usersById = {};
    if (memberUserIds.length > 0) {
      const { data: users, error: usersError } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, neighborhood, transaction_id, is_verified, plan_photo_data_url")
        .in("id", memberUserIds);
      if (usersError) throw usersError;
      usersById = Object.fromEntries((users || []).map((user) => [user.id, user]));
    }

    const { count: otherCount } = await supabaseAdmin
      .from("social_plan_members")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", access.plan.id)
      .eq("status", otherStatus);

    const { data: messages, error: messagesError } = await supabaseAdmin
      .from("social_plan_side_group_messages")
      .select("id, plan_id, group_status, sender_id, body, edited_at, deleted_at, created_at")
      .eq("plan_id", access.plan.id)
      .in("group_status", messageStatuses)
      .order("created_at", { ascending: true })
      .limit(240);
    if (messagesError) return response.status(500).json({ error: ["42P01", "42703"].includes(messagesError.code) ? "side_groups_sql_missing" : "side_group_failed" });
    await markSideGroupMessagesRead(messages || [], access.plan.id, profile.id);

    const { data: mergeRequests, error: mergeError } = await supabaseAdmin
      .from("social_plan_side_group_merges")
      .select("id, plan_id, from_status, to_status, requester_id, status, created_at, accepted_at")
      .eq("plan_id", access.plan.id)
      .eq("status", "pending")
      .or(`from_status.eq.${access.status},to_status.eq.${access.status}`)
      .order("created_at", { ascending: false });
    if (mergeError) return response.status(500).json({ error: ["42P01", "42703"].includes(mergeError.code) ? "side_groups_sql_missing" : "side_group_failed" });

    response.json({
      profile: privatePlanProfile(profile),
      plan: (await enrichSocialPlans([access.plan], profile.id))[0],
      status: access.status,
      other_status: otherStatus,
      other_count: Number(otherCount || 0),
      merged: isMerged,
      members: (members || []).map((member) => ({ ...member, user: privatePlanProfile(usersById[member.user_id]) })),
      messages: await enrichSideMessages(messages || []),
      merge_requests: mergeRequests || [],
    });
  } catch (error) {
    console.error("Side group fatal error:", error);
    response.status(500).json({ error: error.code === "42P01" ? "side_groups_sql_missing" : "side_group_failed" });
  }
});

app.post("/api/social-plans/:id/side-group/:status/messages", async (request, response) => {
  if (!supabaseAdmin) return response.status(500).json({ error: "Supabase admin is not configured" });

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const profile = await ensureProfileForUser(auth.user);
    const access = await getSideGroupAccess(request.params.id, profile.id, request.params.status);
    if (!access.allowed) return response.status(403).json({ error: access.reason });
    const body = String(request.body?.body || "").replace(/\s+/g, " ").trim().slice(0, 800);
    if (!body) return response.status(400).json({ error: "empty_message" });
    const merge = await getAcceptedSideMerge(access.plan.id);
    const groupStatus = merge ? "merged" : access.status;

    const { data: message, error } = await supabaseAdmin
      .from("social_plan_side_group_messages")
      .insert({ plan_id: access.plan.id, group_status: groupStatus, sender_id: profile.id, body })
      .select("id, plan_id, group_status, sender_id, body, edited_at, deleted_at, created_at")
      .maybeSingle();
    if (error) return response.status(500).json({ error: ["42P01", "42703"].includes(error.code) ? "side_groups_sql_missing" : "side_message_failed" });
    const [enriched] = await enrichSideMessages([message]);
    response.json({ message: enriched });
  } catch (error) {
    console.error("Side group message fatal error:", error);
    response.status(500).json({ error: "side_message_failed" });
  }
});

app.patch("/api/social-plans/:id/side-group/:status/messages/:messageId", async (request, response) => {
  if (!supabaseAdmin) return response.status(500).json({ error: "Supabase admin is not configured" });

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const profile = await ensureProfileForUser(auth.user);
    const access = await getSideGroupAccess(request.params.id, profile.id, request.params.status);
    if (!access.allowed) return response.status(403).json({ error: access.reason });

    const body = String(request.body?.body || "").replace(/\s+/g, " ").trim().slice(0, 800);
    if (!body) return response.status(400).json({ error: "empty_message" });

    const { data: current, error: currentError } = await supabaseAdmin
      .from("social_plan_side_group_messages")
      .select("id, plan_id, sender_id, body, edited_at, deleted_at, created_at")
      .eq("id", request.params.messageId)
      .eq("plan_id", access.plan.id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current || current.sender_id !== profile.id) return response.status(404).json({ error: "message_not_found" });
    if (!canEditChatMessage(current)) return response.status(403).json({ error: "edit_window_closed" });

    const { data: message, error } = await supabaseAdmin
      .from("social_plan_side_group_messages")
      .update({ body, edited_at: new Date().toISOString() })
      .eq("id", current.id)
      .select("id, plan_id, group_status, sender_id, body, edited_at, deleted_at, created_at")
      .maybeSingle();
    if (error) throw error;
    const [enriched] = await enrichSideMessages([message]);
    response.json({ message: enriched });
  } catch (error) {
    console.error("Side group edit fatal error:", error);
    response.status(500).json({ error: ["42P01", "42703"].includes(error.code) ? "side_groups_sql_missing" : "edit_message_failed" });
  }
});

app.delete("/api/social-plans/:id/side-group/:status/messages/:messageId", async (request, response) => {
  if (!supabaseAdmin) return response.status(500).json({ error: "Supabase admin is not configured" });

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const profile = await ensureProfileForUser(auth.user);
    const access = await getSideGroupAccess(request.params.id, profile.id, request.params.status);
    if (!access.allowed) return response.status(403).json({ error: access.reason });

    const { data: current, error: currentError } = await supabaseAdmin
      .from("social_plan_side_group_messages")
      .select("id, plan_id, sender_id")
      .eq("id", request.params.messageId)
      .eq("plan_id", access.plan.id)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current || current.sender_id !== profile.id) return response.status(404).json({ error: "message_not_found" });

    const { data: message, error } = await supabaseAdmin
      .from("social_plan_side_group_messages")
      .update({ body: "Mensaje eliminado", deleted_at: new Date().toISOString(), edited_at: null })
      .eq("id", current.id)
      .select("id, plan_id, group_status, sender_id, body, edited_at, deleted_at, created_at")
      .maybeSingle();
    if (error) throw error;
    const [enriched] = await enrichSideMessages([message]);
    response.json({ message: enriched });
  } catch (error) {
    console.error("Side group delete fatal error:", error);
    response.status(500).json({ error: ["42P01", "42703"].includes(error.code) ? "side_groups_sql_missing" : "delete_message_failed" });
  }
});

app.post("/api/social-plans/:id/side-group/:status/merge-request", async (request, response) => {
  if (!supabaseAdmin) return response.status(500).json({ error: "Supabase admin is not configured" });

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const profile = await ensureProfileForUser(auth.user);
    const access = await getSideGroupAccess(request.params.id, profile.id, request.params.status);
    if (!access.allowed) return response.status(403).json({ error: access.reason });
    const otherStatus = otherSideGroupStatus(access.status);

    const { count: otherCount } = await supabaseAdmin
      .from("social_plan_members")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", access.plan.id)
      .eq("status", otherStatus);
    if (Number(otherCount || 0) <= 0) return response.status(400).json({ error: "other_group_empty" });

    const { data: requestRow, error } = await supabaseAdmin
      .from("social_plan_side_group_merges")
      .insert({ plan_id: access.plan.id, from_status: access.status, to_status: otherStatus, requester_id: profile.id })
      .select("id, plan_id, from_status, to_status, requester_id, status, created_at, accepted_at")
      .maybeSingle();
    if (error) return response.status(500).json({ error: ["42P01", "42703"].includes(error.code) ? "side_groups_sql_missing" : "merge_request_failed" });
    response.json({ request: requestRow });
  } catch (error) {
    console.error("Side group merge request fatal error:", error);
    response.status(500).json({ error: "merge_request_failed" });
  }
});

app.post("/api/social-plans/:id/side-group/:status/merge-request/:requestId/accept", async (request, response) => {
  if (!supabaseAdmin) return response.status(500).json({ error: "Supabase admin is not configured" });

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const profile = await ensureProfileForUser(auth.user);
    const access = await getSideGroupAccess(request.params.id, profile.id, request.params.status);
    if (!access.allowed) return response.status(403).json({ error: access.reason });

    const { data: merge, error: mergeError } = await supabaseAdmin
      .from("social_plan_side_group_merges")
      .select("id, plan_id, to_status, status")
      .eq("id", request.params.requestId)
      .eq("plan_id", access.plan.id)
      .eq("to_status", access.status)
      .eq("status", "pending")
      .maybeSingle();
    if (mergeError) throw mergeError;
    if (!merge) return response.status(404).json({ error: "merge_request_not_found" });

    const { data: accepted, error } = await supabaseAdmin
      .from("social_plan_side_group_merges")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", merge.id)
      .select("id, plan_id, from_status, to_status, requester_id, status, created_at, accepted_at")
      .maybeSingle();
    if (error) return response.status(500).json({ error: ["42P01", "42703"].includes(error.code) ? "side_groups_sql_missing" : "merge_accept_failed" });
    response.json({ request: accepted });
  } catch (error) {
    console.error("Side group merge accept fatal error:", error);
    response.status(500).json({ error: "merge_accept_failed" });
  }
});

app.post("/api/social-plans/:id/confirm", async (request, response) => {
  if (!supabaseAdmin) return response.status(500).json({ error: "Supabase admin is not configured" });

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const owner = await ensureProfileForUser(auth.user);
    const { data: plan, error } = await supabaseAdmin
      .from("social_plans")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", request.params.id)
      .eq("creator_id", owner.id)
      .neq("status", "cancelled")
      .select("id, creator_id, purchase_id, title, message, photo_data_url, wanted_women, wanted_men, wanted_open, status, confirmed_at, created_at, updated_at")
      .maybeSingle();
    if (error) throw error;
    if (!plan) return response.status(404).json({ error: "plan_not_found" });
    response.json({ plan: (await enrichSocialPlans([plan], owner.id))[0] });
  } catch (error) {
    console.error("Confirm social plan fatal error:", error);
    response.status(500).json({ error: "confirm_plan_failed" });
  }
});

app.post("/api/social-plans/:id/cancel", async (request, response) => {
  if (!supabaseAdmin) return response.status(500).json({ error: "Supabase admin is not configured" });

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const owner = await ensureProfileForUser(auth.user);
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("social_plans")
      .select("id, creator_id, purchase_id, title, message, photo_data_url, wanted_women, wanted_men, wanted_open, status, confirmed_at, created_at, updated_at")
      .eq("id", request.params.id)
      .eq("creator_id", owner.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing || existing.status === "confirmed") return response.status(404).json({ error: "plan_not_found" });

    const { data: acceptedMembers, error: membersError } = await supabaseAdmin
      .from("social_plan_members")
      .select("id, user_id, created_at")
      .eq("plan_id", existing.id)
      .eq("status", "accepted")
      .neq("user_id", owner.id)
      .order("created_at", { ascending: true });
    if (membersError) throw membersError;

    if ((acceptedMembers || []).length > 0) {
      const nextAdmin = acceptedMembers[Math.floor(Math.random() * acceptedMembers.length)];
      const now = new Date().toISOString();
      const { data: transferredPlan, error: transferError } = await supabaseAdmin
        .from("social_plans")
        .update({ creator_id: nextAdmin.user_id, updated_at: now })
        .eq("id", existing.id)
        .eq("creator_id", owner.id)
        .select("id, creator_id, purchase_id, title, message, photo_data_url, wanted_women, wanted_men, wanted_open, status, confirmed_at, created_at, updated_at")
        .maybeSingle();
      if (transferError) throw transferError;
      if (!transferredPlan) return response.status(404).json({ error: "plan_not_found" });

      await supabaseAdmin
        .from("social_plan_members")
        .delete()
        .eq("plan_id", existing.id)
        .eq("user_id", owner.id);
      await supabaseAdmin
        .from("social_plan_members")
        .insert({ plan_id: existing.id, user_id: owner.id, gender: ["woman", "man"].includes(owner.plan_gender_preference) ? owner.plan_gender_preference : "open", status: "waiting", note: "Antiguo administrador" });

      response.json({
        ok: true,
        transferred: true,
        message: "La administración se ha transferido y ahora estás en lista de espera.",
        plan: (await enrichSocialPlans([transferredPlan], owner.id))[0],
      });
      return;
    }

    const { data: plan, error } = await supabaseAdmin
      .from("social_plans")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("creator_id", owner.id)
      .select("id, creator_id, purchase_id, title, message, photo_data_url, wanted_women, wanted_men, wanted_open, status, confirmed_at, created_at, updated_at")
      .maybeSingle();
    if (error) throw error;
    response.json({ ok: true, transferred: false, plan });
  } catch (error) {
    console.error("Cancel social plan fatal error:", error);
    response.status(500).json({ error: "cancel_plan_failed" });
  }
});

app.get("/api/business/incoming-purchases", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const businessProfile = await ensureProfileForUser(auth.user);
    if (businessProfile?.account_type !== "business") {
      return response.status(403).json({ error: "business_account_required" });
    }

    const { data: purchases, error } = await supabaseAdmin
      .from("purchases")
      .select("id, buyer_id, offer_id, delivery_method, offer_points, delivery_points, delivery_address, total_points, receiver_transaction_id, receiver_profile_id, validation_code, security_code, qr_token, qr_valid_from, qr_valid_until, verified_at, last_verified_at, verification_count, created_at")
      .eq("receiver_profile_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(250);

    if (error) {
      console.error("Business incoming purchases error:", error);
      return response.status(500).json({
        error: error.code === "42P01" ? "purchases_table_missing" : "incoming_history_failed",
      });
    }

    const buyerIds = [...new Set((purchases || []).map((purchase) => purchase.buyer_id).filter(Boolean))];
    let buyersById = {};

    if (buyerIds.length > 0) {
      const { data: buyers, error: buyersError } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, email, phone, neighborhood, address, transaction_id")
        .in("id", buyerIds);

      if (buyersError) console.error("Business incoming buyers error:", buyersError);
      buyersById = Object.fromEntries((buyers || []).map((buyer) => [buyer.id, buyer]));
    }

    const enriched = await enrichPurchases(purchases || []);

    response.json({
      purchases: enriched.map((purchase) => ({
        ...purchase,
        buyer: buyersById[purchase.buyer_id] || null,
      })),
    });
  } catch (error) {
    console.error("Business incoming purchases fatal error:", error);
    response.status(500).json({ error: "incoming_history_failed" });
  }
});

app.get("/api/business/scanned-tickets", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const businessProfile = await ensureProfileForUser(auth.user);
    if (businessProfile?.account_type !== "business") {
      return response.status(403).json({ error: "business_account_required" });
    }

    const { data: scans, error } = await supabaseAdmin
      .from("ticket_verifications")
      .select("id, purchase_id, business_id, method, status, checked_at")
      .eq("business_id", auth.user.id)
      .order("checked_at", { ascending: false })
      .limit(300);

    if (error) {
      console.error("Business scanned tickets error:", error);
      return response.status(500).json({
        error: error.code === "42P01" ? "ticket_verifications_table_missing" : "scanned_tickets_failed",
      });
    }

    const purchaseIds = [...new Set((scans || []).map((scan) => scan.purchase_id).filter(Boolean))];
    let purchases = [];

    if (purchaseIds.length > 0) {
      const { data: purchaseRows, error: purchasesError } = await supabaseAdmin
        .from("purchases")
        .select("id, buyer_id, offer_id, delivery_method, offer_points, delivery_points, delivery_address, total_points, receiver_transaction_id, receiver_profile_id, validation_code, security_code, qr_token, qr_valid_from, qr_valid_until, verified_at, last_verified_at, verification_count, created_at")
        .in("id", purchaseIds);

      if (purchasesError) {
        console.error("Business scanned purchases error:", purchasesError);
      }

      purchases = purchaseRows || [];
    }

    const buyerIds = [...new Set(purchases.map((purchase) => purchase.buyer_id).filter(Boolean))];
    let buyersById = {};

    if (buyerIds.length > 0) {
      const { data: buyers, error: buyersError } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, email, phone, neighborhood, address, transaction_id")
        .in("id", buyerIds);

      if (buyersError) console.error("Business scanned buyers error:", buyersError);
      buyersById = Object.fromEntries((buyers || []).map((buyer) => [buyer.id, buyer]));
    }

    const enrichedPurchases = await enrichPurchases(purchases);
    const purchasesById = Object.fromEntries(enrichedPurchases.map((purchase) => [purchase.id, purchase]));

    response.json({
      scans: (scans || []).map((scan) => {
        const purchase = purchasesById[scan.purchase_id] || null;
        return {
          ...scan,
          purchase: purchase ? { ...purchase, buyer: buyersById[purchase.buyer_id] || null } : null,
        };
      }),
    });
  } catch (error) {
    console.error("Business scanned tickets fatal error:", error);
    response.status(500).json({ error: "scanned_tickets_failed" });
  }
});

app.get("/api/business/payouts", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const businessProfile = await ensureProfileForUser(auth.user);
    if (businessProfile?.account_type !== "business") {
      return response.status(403).json({ error: "business_account_required" });
    }

    const { data: payouts, error } = await supabaseAdmin
      .from("business_payouts")
        .select("id, points, amount_cents, bank_fee_cents, note, period_start, period_end, created_at")
      .eq("business_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(250);

    if (error) {
      console.error("Business payouts error:", error);
      return response.status(500).json({
        error: error.code === "42P01" ? "business_payouts_table_missing" : "business_payouts_failed",
      });
    }

    response.json({ payouts: payouts || [] });
  } catch (error) {
    console.error("Business payouts fatal error:", error);
    response.status(500).json({ error: "business_payouts_failed" });
  }
});

app.get("/api/me/purchases/:id", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    await ensureProfileForUser(auth.user);

    const { data: purchase, error } = await supabaseAdmin
      .from("purchases")
      .select("id, buyer_id, offer_id, delivery_method, offer_points, delivery_points, delivery_address, total_points, receiver_transaction_id, receiver_profile_id, validation_code, security_code, qr_token, qr_valid_from, qr_valid_until, verified_at, last_verified_at, verification_count, created_at")
      .eq("id", request.params.id)
      .eq("buyer_id", auth.user.id)
      .maybeSingle();

    if (error) {
      console.error("Purchase detail error:", error);
      return response.status(500).json({
        error: error.code === "42P01" ? "purchases_table_missing" : "purchase_detail_failed",
      });
    }

    if (!purchase) return response.status(404).json({ error: "purchase_not_found" });

    const [enriched] = await enrichPurchases([purchase]);
    response.json({ purchase: enriched });
  } catch (error) {
    console.error("Purchase detail fatal error:", error);
    response.status(500).json({ error: "purchase_detail_failed" });
  }
});

app.post("/api/business/tickets/verify", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  const validationCode = cleanTicketValidationCode(request.body?.validationCode);
  const securityCode = cleanTicketSecurityCode(request.body?.securityCode);
  const qrToken = String(request.body?.qrToken || "").trim();
  const method = qrToken ? "qr" : "manual";

  if (!qrToken && (validationCode.length !== 7 || securityCode.length !== 4)) {
    return response.status(400).json({ error: "missing_ticket_codes" });
  }

  try {
    const businessProfile = await ensureProfileForUser(auth.user);
    if (businessProfile?.account_type !== "business") {
      return response.status(403).json({ error: "business_account_required" });
    }

    let query = supabaseAdmin
      .from("purchases")
      .select("id, buyer_id, offer_id, delivery_method, offer_points, delivery_points, delivery_address, total_points, receiver_transaction_id, receiver_profile_id, validation_code, security_code, qr_token, qr_valid_from, qr_valid_until, verified_at, verified_by, verification_method, verification_count, last_verified_at, created_at")
      .limit(1);

    query = qrToken
      ? query.eq("qr_token", qrToken)
      : query.eq("validation_code", validationCode).eq("security_code", securityCode);

    const { data: purchaseRows, error: purchaseError } = await query;
    const purchase = purchaseRows?.[0];

    if (purchaseError) {
      console.error("Ticket verification lookup error:", purchaseError);
      return response.status(500).json({ error: "ticket_lookup_failed" });
    }

    if (!purchase) return response.status(404).json({ error: "ticket_not_found" });

    const [enriched] = await enrichPurchases([purchase]);
    const offer = enriched.offer || {};

    if (offer.business_id !== auth.user.id && purchase.receiver_profile_id !== auth.user.id) {
      return response.status(403).json({ error: "ticket_not_owned_by_business" });
    }

    const today = todayDateString();
    const validFrom = purchase.qr_valid_from || offer.qr_valid_from || offer.start_date || null;
    const validUntil = purchase.qr_valid_until || offer.qr_valid_until || offer.end_date || null;
    const notStarted = validFrom && today < validFrom;
    const expired = validUntil && today > validUntil;
    const alreadyVerified = Boolean(purchase.verified_at);
    const ticketStatus = alreadyVerified ? "already_verified" : notStarted ? "not_started" : expired ? "expired" : "valid";

    const shouldConsumeTicket = ticketStatus === "valid";
    const { data: updatedPurchase, error: updateError } = await supabaseAdmin
      .from("purchases")
      .update({
        verified_at: shouldConsumeTicket ? (purchase.verified_at || new Date().toISOString()) : purchase.verified_at,
        verified_by: shouldConsumeTicket ? auth.user.id : purchase.verified_by,
        verification_method: shouldConsumeTicket ? method : purchase.verification_method,
        verification_count: Number(purchase.verification_count || 0) + 1,
        last_verified_at: new Date().toISOString(),
      })
      .eq("id", purchase.id)
      .select("id, verified_at, verified_by, verification_method, verification_count, last_verified_at")
      .maybeSingle();

    if (updateError) {
      console.error("Ticket verification update error:", updateError);
      return response.status(500).json({ error: "ticket_verify_failed" });
    }

    const checkedAt = updatedPurchase?.last_verified_at || new Date().toISOString();
    const { error: logError } = await supabaseAdmin
      .from("ticket_verifications")
      .insert({
        purchase_id: purchase.id,
        business_id: auth.user.id,
        method,
        status: ticketStatus,
        checked_at: checkedAt,
      });

    if (logError && logError.code !== "42P01") {
      console.error("Ticket verification log error:", logError);
    }

    const { data: verificationLog, error: verificationLogError } = await supabaseAdmin
      .from("ticket_verifications")
      .select("id, method, status, checked_at")
      .eq("purchase_id", purchase.id)
      .order("checked_at", { ascending: false })
      .limit(50);

    if (verificationLogError && verificationLogError.code !== "42P01") {
      console.error("Ticket verification log read error:", verificationLogError);
    }

    const { data: buyer } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, email, phone, neighborhood, address, transaction_id")
      .eq("id", purchase.buyer_id)
      .maybeSingle();

    response.json({
      status: ticketStatus,
      purchase: {
        ...enriched,
        ...updatedPurchase,
        qr_valid_from: validFrom,
        qr_valid_until: validUntil,
      },
      buyer: buyer || null,
      business: {
        display_name: businessProfile.display_name,
        transaction_id: businessProfile.transaction_id,
        is_verified: Boolean(businessProfile.is_verified),
      },
      verifications: verificationLog || [
        {
          id: "latest",
          method,
          status: ticketStatus,
          checked_at: checkedAt,
        },
      ],
    });
  } catch (error) {
    console.error("Ticket verification fatal error:", error);
    response.status(500).json({ error: "ticket_verify_failed" });
  }
});

app.get("/api/stripe/config", (_request, response) => {
  response.json({
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
  });
});

app.get("/api/stripe/recharge-status", async (request, response) => {
  if (!stripe || !supabaseAdmin) {
    return response.status(500).json({ error: "Stripe or Supabase admin is not configured" });
  }

  const sessionId = String(request.query.session_id || "");
  if (!sessionId.startsWith("cs_")) {
    return response.status(400).json({ error: "Missing Stripe session" });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const userId = session.metadata?.user_id;
    const points = Number(session.metadata?.points || 0);
    const isPaid = session.payment_status === "paid";

    if (userId && points > 0 && isPaid) {
      await ensureProfileForUserId(userId);
      const stripeAmounts = await getStripeAmounts(session);
      const { error } = await supabaseAdmin.rpc("credit_points_from_stripe", {
        p_user_id: userId,
        p_points: points,
        p_stripe_session_id: session.id,
        p_amount_total: stripeAmounts.amountTotal,
        p_currency: stripeAmounts.currency,
        p_stripe_fee_amount: stripeAmounts.feeAmount,
        p_net_amount: stripeAmounts.netAmount,
        p_customer_email: session.customer_details?.email || session.customer_email || "",
      });

      if (error) {
        console.error("Recharge status credit error:", error);
        return response.status(500).json({ error: "Could not credit points" });
      }
      await markReferralRecharge(userId);
    }

    let { data: profile } = userId
      ? await supabaseAdmin.from("profiles").select("points").eq("id", userId).maybeSingle()
      : { data: null };

    if (isPaid && userId && points > 0 && Number(profile?.points || 0) < points) {
      const { data: recharge } = await supabaseAdmin
        .from("stripe_point_recharges")
        .select("id, created_at")
        .eq("stripe_session_id", session.id)
        .eq("user_id", userId)
        .maybeSingle();

      if (recharge?.id) {
        const { data: correctedProfile, error: correctionError } = await supabaseAdmin
          .from("profiles")
          .update({ points: Number(profile?.points || 0) + points })
          .eq("id", userId)
          .select("points")
          .maybeSingle();

        if (!correctionError && correctedProfile) profile = correctedProfile;
        if (!correctionError && correctedProfile) await markReferralRecharge(userId);
      }
    }

    response.json({
      paid: isPaid,
      credited: isPaid && Boolean(userId),
      points: Number(profile?.points || 0),
    });
  } catch (error) {
    console.error("Recharge status error:", error);
    response.status(500).json({ error: "Could not check recharge" });
  }
});

app.post("/api/purchases/offer", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    return response.status(401).json({ error: "Not authenticated" });
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  const user = userData?.user;

  if (userError || !user?.id) {
    return response.status(401).json({ error: "Not authenticated" });
  }

  const offerId = String(request.body?.offerId || "");
  const rawDeliveryMethod = String(request.body?.deliveryMethod || "").trim();
  const deliveryMethod = rawDeliveryMethod === "home" ? "home" : rawDeliveryMethod === "none" ? "none" : "pickup";
  const deliveryAddress = String(request.body?.deliveryAddress || "").trim();

  if (!offerId) {
    return response.status(400).json({ error: "Missing offer" });
  }

  try {
    const buyerProfile = await ensureProfileForUser(user);

    const { data: offer, error: offerError } = await supabaseAdmin
      .from("business_offers")
      .select("*")
      .eq("id", offerId)
      .maybeSingle();

    if (offerError || !offer) {
      return response.status(404).json({ error: "offer_not_found" });
    }

    if (offer.is_hidden) {
      return response.status(400).json({ error: "offer_hidden" });
    }

    const validUntil = offer.qr_valid_until || offer.end_date || null;
    if (validUntil && String(validUntil).slice(0, 10) < todayDateString()) {
      return response.status(400).json({ error: "offer_expired" });
    }

    if (deliveryMethod === "none" && (offer.delivery_pickup_enabled === true || offer.delivery_home_enabled === true)) {
      return response.status(400).json({ error: "delivery_method_required" });
    }

    if (deliveryMethod === "pickup" && offer.delivery_pickup_enabled === false) {
      return response.status(400).json({ error: "pickup_not_available" });
    }

    if (deliveryMethod === "home" && offer.delivery_home_enabled !== true) {
      return response.status(400).json({ error: "home_delivery_not_available" });
    }

    if (deliveryMethod === "home" && deliveryAddress.length < 4) {
      return response.status(400).json({ error: "delivery_address_missing" });
    }

    const receiverId = cleanValidDonosId(offer.receiver_transaction_id);
    if (!receiverId) {
      return response.status(400).json({ error: "receiver_missing" });
    }

    const { data: receiverProfile, error: receiverError } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, transaction_id, points")
      .eq("transaction_id", receiverId)
      .maybeSingle();

	    if (receiverError || !receiverProfile) {
	      return response.status(400).json({ error: "receiver_not_found" });
	    }

	    if (offer.business_id === user.id || receiverProfile.id === user.id) {
	      return response.status(400).json({ error: "own_offer_not_allowed" });
	    }

	    const hasStockLimit = offer.stock_quantity !== null && offer.stock_quantity !== undefined && Number.isFinite(Number(offer.stock_quantity));
	    const stockLimit = hasStockLimit ? Math.max(Math.floor(Number(offer.stock_quantity)), 0) : null;
	    const soldCount = Math.max(Number(offer.sold_count || 0), 0);

	    if (hasStockLimit && soldCount >= stockLimit) {
	      return response.status(400).json({ error: "out_of_stock" });
	    }

	    const offerPoints = Math.max(Number(offer.required_points || 0), 0);
    const deliveryPoints = deliveryMethod === "home" ? Math.max(Number(offer.delivery_home_points || 0), 0) : 0;
    const totalPoints = offerPoints + deliveryPoints;
    const buyerPoints = Number(buyerProfile?.points || 0);

    if (buyerPoints < totalPoints) {
      return response.status(400).json({ error: "insufficient_points" });
    }

    if (deliveryMethod === "home" && deliveryAddress !== (buyerProfile.address || "")) {
      await supabaseAdmin.from("profiles").update({ address: deliveryAddress }).eq("id", user.id);
    }

    let purchase = null;
    let purchaseError = null;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const { data, error } = await supabaseAdmin
        .from("purchases")
        .insert({
          buyer_id: user.id,
          offer_id: offer.id,
          delivery_method: deliveryMethod,
          offer_points: offerPoints,
          delivery_points: deliveryPoints,
          delivery_address: deliveryMethod === "home" ? deliveryAddress : null,
          total_points: totalPoints,
          receiver_transaction_id: receiverProfile.transaction_id,
          receiver_profile_id: receiverProfile.id,
          validation_code: generateTicketValidationCode(),
          security_code: generateTicketSecurityCode(),
          qr_token: randomUUID(),
          qr_valid_from: offer.qr_valid_from || offer.start_date || todayDateString(),
          qr_valid_until: offer.qr_valid_until || offer.end_date || null,
        })
        .select("id")
        .maybeSingle();

      purchase = data;
      purchaseError = error;

      if (!error || error.code !== "23505") break;
    }

	    if (purchaseError) {
	      console.error("Purchase insert error:", purchaseError);
      return response.status(500).json({
        error: purchaseError.code === "42P01" ? "purchases_table_missing" : "purchase_insert_failed",
        detail: purchaseError.message || "",
	      });
	    }

	    if (hasStockLimit) {
	      const nextSoldCount = soldCount + 1;
	      const isNowOutOfStock = nextSoldCount >= stockLimit;
	      const { data: stockUpdate, error: stockError } = await supabaseAdmin
	        .from("business_offers")
	        .update({
	          sold_count: nextSoldCount,
	          out_of_stock_since: isNowOutOfStock ? (offer.out_of_stock_since || new Date().toISOString()) : null,
	        })
	        .eq("id", offer.id)
	        .eq("sold_count", soldCount)
	        .select("id")
	        .maybeSingle();

	      if (stockError || !stockUpdate) {
	        if (stockError) console.error("Purchase stock update error:", stockError);
	        await supabaseAdmin.from("purchases").delete().eq("id", purchase?.id);
	        return response.status(400).json({ error: "out_of_stock" });
	      }
	    }

	    const [{ data: updatedBuyer, error: buyerError }, { error: receiverUpdateError }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .update({ points: buyerPoints - totalPoints })
        .eq("id", user.id)
        .select("points")
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .update({ points: Number(receiverProfile.points || 0) + totalPoints })
        .eq("id", receiverProfile.id),
    ]);

	    if (buyerError || receiverUpdateError) {
	      console.error("Purchase points update error:", buyerError || receiverUpdateError);
	      await supabaseAdmin.from("purchases").delete().eq("id", purchase?.id);
	      if (hasStockLimit) {
	        await supabaseAdmin.from("business_offers").update({ sold_count, out_of_stock_since: offer.out_of_stock_since || null }).eq("id", offer.id);
	      }
	      return response.status(500).json({
        error: "points_update_failed",
        detail: buyerError?.message || receiverUpdateError?.message || "",
      });
    }

    response.json({
      purchase_id: purchase?.id,
      total_points: totalPoints,
      buyer_points: Number(updatedBuyer?.points || 0),
      receiver_display_name: receiverProfile.display_name,
    });
  } catch (error) {
    console.error("Purchase error:", error);
    response.status(500).json({ error: "purchase_failed" });
  }
});

app.get("/api/points/lookup", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  const donosId = cleanValidDonosId(request.query?.donos_id);
  if (!donosId) return response.status(400).json({ error: "invalid_donos_id" });

  try {
    await ensureProfileForUser(auth.user);
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, email, phone, account_type, transaction_id, is_verified")
      .eq("transaction_id", donosId)
      .maybeSingle();

    if (error) throw error;
    if (!profile) return response.status(404).json({ error: "profile_not_found" });

    response.json({ profile: transferPublicProfile(profile), is_self: profile.id === auth.user.id });
  } catch (error) {
    console.error("Point lookup error:", error);
    response.status(500).json({ error: "lookup_failed" });
  }
});

app.get("/api/me/point-movements", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  try {
    const profile = await ensureProfileForUser(auth.user);
    const { data, error } = await supabaseAdmin
      .from("point_transfers")
      .select("id, from_profile_id, to_profile_id, points, transfer_type, status, note, completed_at, created_at")
      .or(`from_profile_id.eq.${profile.id},to_profile_id.eq.${profile.id}`)
      .order("created_at", { ascending: false })
      .limit(250);

    if (error) {
      console.error("Point movements error:", error);
      return response.status(500).json({
        error: error.code === "42P01" ? "point_transfers_table_missing" : "point_movements_failed",
      });
    }

    const profileIds = [...new Set((data || []).flatMap((item) => [item.from_profile_id, item.to_profile_id]).filter(Boolean))];
    let profilesById = {};

    if (profileIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, email, phone, account_type, transaction_id, is_verified")
        .in("id", profileIds);

      if (profilesError) console.error("Point movements profiles error:", profilesError);
      profilesById = Object.fromEntries((profiles || []).map((item) => [item.id, transferPublicProfile(item)]));
    }

    response.json({
      profile_id: profile.id,
      movements: (data || []).map((item) => ({
        ...item,
        from_profile: profilesById[item.from_profile_id] || null,
        to_profile: profilesById[item.to_profile_id] || null,
        direction: item.from_profile_id === profile.id ? "out" : "in",
      })),
    });
  } catch (error) {
    console.error("Point movements fatal error:", error);
    response.status(500).json({ error: "point_movements_failed" });
  }
});

app.post("/api/points/send", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  const receiverDonosId = cleanValidDonosId(request.body?.receiverDonosId);
  const points = Math.floor(Number(request.body?.points || 0));
  const note = String(request.body?.note || "").trim().slice(0, 180);

  if (!receiverDonosId) return response.status(400).json({ error: "invalid_donos_id" });
  if (!Number.isFinite(points) || points <= 0) return response.status(400).json({ error: "invalid_points" });

  try {
    const sender = await ensureProfileForUser(auth.user);
    const { data: receiver, error: receiverError } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, email, phone, account_type, transaction_id, points, is_verified")
      .eq("transaction_id", receiverDonosId)
      .maybeSingle();

    if (receiverError) throw receiverError;
    if (!receiver) return response.status(404).json({ error: "receiver_not_found" });
    if (receiver.id === sender.id) return response.status(400).json({ error: "self_transfer_not_allowed" });

    const senderPoints = Number(sender.points || 0);
    if (senderPoints < points) return response.status(400).json({ error: "insufficient_points" });

    const [{ data: updatedSender, error: senderError }, { error: receiverUpdateError }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .update({ points: senderPoints - points })
        .eq("id", sender.id)
        .select("points")
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .update({ points: Number(receiver.points || 0) + points })
        .eq("id", receiver.id),
    ]);

    if (senderError || receiverUpdateError) {
      console.error("Point send update error:", senderError || receiverUpdateError);
      return response.status(500).json({ error: "points_update_failed" });
    }

    const { data: movement, error: movementError } = await supabaseAdmin
      .from("point_transfers")
      .insert({
        from_profile_id: sender.id,
        to_profile_id: receiver.id,
        points,
        transfer_type: "send",
        status: "completed",
        note: note || null,
        completed_at: new Date().toISOString(),
      })
      .select("id, created_at")
      .maybeSingle();

    if (movementError) {
      console.error("Point send log error:", movementError);
      await Promise.all([
        supabaseAdmin.from("profiles").update({ points: senderPoints }).eq("id", sender.id),
        supabaseAdmin.from("profiles").update({ points: Number(receiver.points || 0) }).eq("id", receiver.id),
      ]);
      return response.status(500).json({ error: movementError.code === "42P01" ? "point_transfers_table_missing" : "movement_log_failed" });
    }

    response.json({
      movement_id: movement?.id || null,
      sender_points: Number(updatedSender?.points || 0),
      receiver: transferPublicProfile(receiver),
      points,
    });
  } catch (error) {
    console.error("Point send fatal error:", error);
    response.status(500).json({ error: error.code === "42P01" ? "point_transfers_table_missing" : "send_failed" });
  }
});

app.post("/api/points/request", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  const payerDonosId = cleanValidDonosId(request.body?.payerDonosId);
  const points = Math.floor(Number(request.body?.points || 0));
  const note = String(request.body?.note || "").trim().slice(0, 180);

  if (!payerDonosId) return response.status(400).json({ error: "invalid_donos_id" });
  if (!Number.isFinite(points) || points <= 0) return response.status(400).json({ error: "invalid_points" });

  try {
    const requester = await ensureProfileForUser(auth.user);
    const { data: payer, error: payerError } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, email, phone, account_type, transaction_id, points, is_verified")
      .eq("transaction_id", payerDonosId)
      .maybeSingle();

    if (payerError) throw payerError;
    if (!payer) return response.status(404).json({ error: "payer_not_found" });
    if (payer.id === requester.id) return response.status(400).json({ error: "self_request_not_allowed" });

    const { data: movement, error } = await supabaseAdmin
      .from("point_transfers")
      .insert({
        from_profile_id: payer.id,
        to_profile_id: requester.id,
        points,
        transfer_type: "request",
        status: "pending",
        note: note || null,
      })
      .select("id, created_at")
      .maybeSingle();

    if (error) throw error;

    response.json({
      movement_id: movement?.id || null,
      payer: transferPublicProfile(payer),
      points,
    });
  } catch (error) {
    console.error("Point request fatal error:", error);
    response.status(500).json({ error: error.code === "42P01" ? "point_transfers_table_missing" : "request_failed" });
  }
});

app.post("/api/points/requests/:id/respond", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.error) return response.status(auth.status).json({ error: auth.error });

  const action = request.body?.action === "decline" ? "decline" : "pay";

  try {
    const payer = await ensureProfileForUser(auth.user);
    const { data: movement, error: movementError } = await supabaseAdmin
      .from("point_transfers")
      .select("id, from_profile_id, to_profile_id, points, transfer_type, status")
      .eq("id", request.params.id)
      .maybeSingle();

    if (movementError) throw movementError;
    if (!movement) return response.status(404).json({ error: "request_not_found" });
    if (movement.from_profile_id !== payer.id) return response.status(403).json({ error: "request_not_for_you" });
    if (movement.transfer_type !== "request" || movement.status !== "pending") {
      return response.status(400).json({ error: "request_not_pending" });
    }

    if (action === "decline") {
      const { error } = await supabaseAdmin
        .from("point_transfers")
        .update({ status: "declined" })
        .eq("id", movement.id);

      if (error) throw error;
      return response.json({ status: "declined", points: Number(payer.points || 0) });
    }

    const points = Number(movement.points || 0);
    if (Number(payer.points || 0) < points) return response.status(400).json({ error: "insufficient_points" });

    const { data: receiver, error: receiverError } = await supabaseAdmin
      .from("profiles")
      .select("id, points")
      .eq("id", movement.to_profile_id)
      .maybeSingle();

    if (receiverError || !receiver) return response.status(400).json({ error: "receiver_not_found" });

    const [{ data: updatedPayer, error: payerError }, { error: receiverUpdateError }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .update({ points: Number(payer.points || 0) - points })
        .eq("id", payer.id)
        .select("points")
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .update({ points: Number(receiver.points || 0) + points })
        .eq("id", receiver.id),
    ]);

    if (payerError || receiverUpdateError) {
      console.error("Point request pay update error:", payerError || receiverUpdateError);
      return response.status(500).json({ error: "points_update_failed" });
    }

    const { error: completeError } = await supabaseAdmin
      .from("point_transfers")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", movement.id);

    if (completeError) {
      console.error("Point request complete error:", completeError);
      await Promise.all([
        supabaseAdmin.from("profiles").update({ points: payerPoints }).eq("id", payer.id),
        supabaseAdmin.from("profiles").update({ points: Number(receiver.points || 0) }).eq("id", receiver.id),
      ]);
      return response.status(500).json({ error: "request_complete_failed" });
    }

    response.json({ status: "completed", points: Number(updatedPayer?.points || 0) });
  } catch (error) {
    console.error("Point request respond fatal error:", error);
    response.status(500).json({ error: error.code === "42P01" ? "point_transfers_table_missing" : "request_response_failed" });
  }
});

app.post("/api/stripe/create-checkout-session", async (request, response) => {
  if (!stripe) {
    return response.status(500).json({ error: "Stripe is not configured" });
  }

  const { userId, pack } = request.body || {};
  const selectedPack = pointPacks[String(pack)];

  if (!userId || !selectedPack) {
    return response.status(400).json({ error: "Missing user or invalid points pack" });
  }

  const packSettings = await getPointPackSettings();
  const selectedPackSettings = packSettings.find((item) => item.points === selectedPack.points);
  if (selectedPackSettings?.is_disabled) {
    return response.status(403).json({ error: "point_pack_disabled" });
  }

  const origin = publicOriginForRequest(request);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: selectedPack.amount,
            product_data: {
              name: `Recarga Donoss · ${selectedPack.label}`,
              description: `Incluye ${formatCents(selectedPack.baseAmount)} de puntos + ${formatCents(selectedPack.feeAmount)} de gastos operativos`,
            },
          },
        },
      ],
      metadata: {
        user_id: userId,
        points: String(selectedPack.points),
        base_amount: String(selectedPack.baseAmount),
        fee_amount: String(selectedPack.feeAmount),
      },
      success_url: `${origin}/transfer.html?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/transfer.html?stripe=cancelled`,
    });

    response.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    response.status(500).json({ error: error.message || "Could not create Stripe Checkout session" });
  }
});

function formatCents(amount) {
  return `${(amount / 100).toFixed(2).replace(".", ",")}€`;
}

async function getStripeAmounts(session) {
  const pack = pointPackFor(session.metadata?.points);
  const fallback = {
    amountTotal: session.amount_total || 0,
    feeAmount: pack?.stripeFeeAmount || 0,
    netAmount: Math.max(Number(session.amount_total || 0) - Number(pack?.stripeFeeAmount || 0), 0),
    currency: session.currency || "eur",
  };

  if (!stripe || !session.payment_intent) return fallback;

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent, {
      expand: ["latest_charge.balance_transaction"],
    });
    const balanceTransaction = paymentIntent.latest_charge?.balance_transaction;

    if (!balanceTransaction || typeof balanceTransaction === "string") {
      return fallback;
    }

    return {
      amountTotal: balanceTransaction.amount || fallback.amountTotal,
      feeAmount: balanceTransaction.fee || 0,
      netAmount: balanceTransaction.net || fallback.netAmount,
      currency: balanceTransaction.currency || fallback.currency,
    };
  } catch (error) {
    console.error("Stripe balance transaction error:", error);
    return fallback;
  }
}

app.get("/api/app-update/latest", async (_request, response) => {
  if (!supabaseAdmin) {
    return response.status(204).end();
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("app_update_broadcasts")
      .select("id, title, message, update_size, created_at, expires_at")
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (error.code === "42P01") return response.json({ update: null, missing_sql: true });
      console.error("App update latest error:", error);
      return response.status(500).json({ error: "app_update_latest_failed" });
    }

    response.json({ update: data || null });
  } catch (error) {
    console.error("App update latest fatal error:", error);
    response.status(500).json({ error: "app_update_latest_failed" });
  }
});

app.post("/api/admin/app-update", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  if (!adminPassword || request.body?.password !== adminPassword) {
    return response.status(401).json({ error: "Mot de passe incorrect" });
  }

  const updateSize = request.body?.updateSize === "large" ? "large" : "small";
  const title = updateSize === "large" ? "Gran actualización Donoss" : "Nueva actualización Donoss";
  const message = updateSize === "large"
    ? "Hay una actualización importante en la app. Lánzala para cargar la nueva versión sin cerrar sesión."
    : "Hay una novedad en la app. Lánzala para cargar la última versión sin cerrar sesión.";
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("app_update_broadcasts")
    .insert({
      title,
      message,
      update_size: updateSize,
      created_by: "admin",
      expires_at: expiresAt,
    })
    .select("id, title, message, update_size, created_at, expires_at")
    .maybeSingle();

  if (error) {
    console.error("Admin app update broadcast error:", error);
    return response.status(500).json({
      error: error.code === "42P01" ? "Falta ejecutar el SQL de actualizaciones." : "No se ha podido lanzar la actualización",
    });
  }

  response.json({ update: data });
});

app.use(express.static(__dirname));

app.listen(port, () => {
  console.log(`Donoss server running on http://localhost:${port}`);
});
