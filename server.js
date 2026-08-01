import "dotenv/config";
import dotenv from "dotenv";
import express from "express";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function metadataText(metadata, key) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

async function ensureProfileForUser(user) {
  if (!supabaseAdmin || !user?.id) return null;

  const profileColumns = "id, account_type, display_name, email, phone, neighborhood, address, business_categories, tax_id, transaction_id, points";
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
      .select("id, display_name, email, phone, neighborhood, address, account_type, transaction_id, points")
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
      return response.status(500).json({ error: "points_update_failed" });
    }

    const { data: purchase, error: purchaseError } = await supabaseAdmin
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
      })
      .select("id")
      .maybeSingle();

    if (purchaseError) {
      console.error("Purchase insert error:", purchaseError);
      return response.status(500).json({ error: "purchase_insert_failed" });
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
