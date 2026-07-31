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

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const supabaseAdmin =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

const pointPacks = {
  "50": { points: 50, amount: 500, label: "50 puntos" },
  "100": { points: 100, amount: 1000, label: "100 puntos" },
  "250": { points: 250, amount: 2500, label: "250 puntos" },
  "500": { points: 500, amount: 5000, label: "500 puntos" },
};

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
      const { error } = await supabaseAdmin.rpc("credit_points_from_stripe", {
        p_user_id: userId,
        p_points: points,
        p_stripe_session_id: session.id,
        p_amount_total: session.amount_total || 0,
        p_currency: session.currency || "eur",
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

app.get("/api/stripe/config", (_request, response) => {
  response.json({
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
  });
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
              description: "Recarga de puntos Donos",
            },
          },
        },
      ],
      metadata: {
        user_id: userId,
        points: String(selectedPack.points),
      },
      success_url: `${origin}/transfer.html?stripe=success`,
      cancel_url: `${origin}/transfer.html?stripe=cancelled`,
    });

    response.json({ url: session.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    response.status(500).json({ error: error.message || "Could not create Stripe Checkout session" });
  }
});

app.use(express.static(__dirname));

app.listen(port, () => {
  console.log(`Donos server running on http://localhost:${port}`);
});
