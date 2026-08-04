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

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const supabaseAdmin =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

const pointPacks = {
  "50": { points: 50, amount: 620, baseAmount: 500, feeAmount: 120, label: "50 puntos" },
  "100": { points: 100, amount: 1120, baseAmount: 1000, feeAmount: 120, label: "100 puntos" },
  "250": { points: 250, amount: 2620, baseAmount: 2500, feeAmount: 120, label: "250 puntos" },
  "500": { points: 500, amount: 5120, baseAmount: 5000, feeAmount: 120, label: "500 puntos" },
};

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

  const profileColumns = "id, account_type, display_name, email, phone, neighborhood, address, business_categories, tax_id, transaction_id, points, is_verified";
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("profiles")
    .select(profileColumns)
    .eq("id", user.id)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const metadata = user.user_metadata || user.raw_user_meta_data || {};
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
    email: user.email || metadataText(metadata, "email"),
    phone: metadataText(metadata, "phone") || null,
    neighborhood: metadataText(metadata, "neighborhood") || "Donostia",
    address: metadataText(metadata, "address") || null,
    business_categories: businessCategories,
    tax_id: metadataText(metadata, "tax_id") || null,
    points: 0,
    is_verified: false,
  };

  const metadataId = cleanValidDonosId(metadata.transaction_id);
  const transactionIds = [
    metadataId,
    ...Array.from({ length: 8 }, () => generateDonosTransactionId()),
  ].filter(Boolean);

  let lastError = null;

  for (const transactionId of transactionIds) {
    const { data: created, error } = await supabaseAdmin
      .from("profiles")
      .insert({ ...baseProfile, transaction_id: transactionId })
      .select(profileColumns)
      .maybeSingle();

    if (!error && created) return created;

    lastError = error;
    if (error?.code !== "23505") break;
  }

  throw lastError || new Error("Could not create profile");
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
    }
  }

  response.json({ received: true });
});

app.use(express.json());

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
    recharges: (data || []).map((item) => ({
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

app.post("/api/admin/accounts", async (request, response) => {
  if (!supabaseAdmin) {
    return response.status(500).json({ error: "Supabase admin is not configured" });
  }

  if (!adminPassword || request.body?.password !== adminPassword) {
    return response.status(401).json({ error: "Mot de passe incorrect" });
  }

  const [{ data: accounts, error: accountsError }, { data: recharges, error: rechargesError }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, display_name, email, phone, neighborhood, address, account_type, business_categories, tax_id, transaction_id, points, is_verified, created_at")
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("stripe_point_recharges")
      .select("amount_total, stripe_fee_amount, net_amount, points"),
  ]);

  if (accountsError) {
    console.error("Admin accounts error:", accountsError);
    return response.status(500).json({ error: "No se han podido cargar las cuentas" });
  }

  if (rechargesError) {
    console.error("Admin accounts recharges error:", rechargesError);
  }

  const enrichedAccounts = (accounts || []).map((account) => {
    const points = Number(account.points || 0);
    return {
      ...account,
      point_value_cents: points * 10,
    };
  });

  const totalPoints = enrichedAccounts.reduce((sum, account) => sum + Number(account.points || 0), 0);
  const totalPaid = (recharges || []).reduce((sum, item) => sum + Number(item.amount_total || 0), 0);
  const totalFees = (recharges || []).reduce((sum, item) => sum + Number(item.stripe_fee_amount || 0), 0);
  const totalNet = (recharges || []).reduce((sum, item) => sum + Number(item.net_amount || 0), 0);
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
      reserve_margin_cents: totalNet - totalLiability,
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

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .update({ is_verified: isVerified })
    .eq("id", profileId)
    .select("id, display_name, account_type, is_verified")
    .maybeSingle();

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
    const profile = await ensureProfileForUser(userData.user);
    response.json({ profile: profile || null });
  } catch (error) {
    console.error("Me profile error:", error);
    return response.status(500).json({ error: "Could not load profile" });
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
          title: `Compra confirmada: ${offer.title || "pedido Donos"}`,
          detail: `${purchase.total_points || 0} ptos. · ${offer.business_display_name || "Donos"}`,
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
  const deliveryMethod = request.body?.deliveryMethod === "home" ? "home" : "pickup";
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

  const origin = request.headers.origin || `http://localhost:${port}`;

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
              name: `Recarga Donos · ${selectedPack.label}`,
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
  const fallback = {
    amountTotal: session.amount_total || 0,
    feeAmount: 0,
    netAmount: session.amount_total || 0,
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

app.use(express.static(__dirname));

app.listen(port, () => {
  console.log(`Donos server running on http://localhost:${port}`);
});
