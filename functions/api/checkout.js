const CATALOG = {
  "honey-4oz": ["Honey (4 oz jar)", 600, true],
  "vanilla-latte-oval": ["Coconut Beeswax Candle — Oval", 2400, true],
  "vanilla-latte-round": ["Coconut Beeswax Candle — Round", 2400, true],
  "heart-patch-pair": ["Heart Iron-On Patch (2 Pack)", 300, true],
  "patch-2in": ["Patch (2 inch)", 500, false],
  "fall-pumpkin-pair": ["Pumpkin Patch Pair", 300, true],
  "fall-maple-leaf-pair": ["Maple Leaf Patch Pair", 300, true],
  "fall-acorn-pair": ["Acorn Patch Pair", 300, true]
}; // Honey, the Coconut Beeswax Candles, and all Patches are currently available; all other products are sold out.
const FREE_SHIPPING_PATCHES = new Set(["fall-pumpkin-pair", "fall-maple-leaf-pair", "fall-acorn-pair", "heart-patch-pair"]);
const HONEY_IDS = new Set(["honey-4oz"]);
const CANDLE_IDS = new Set(["vanilla-latte-oval", "vanilla-latte-round"]);
// Candle subscription: one Square plan with two monthly variations (1 candle $22, 2 candles $40, shipping included).
const SUBSCRIPTION_PLAN_NAME = "Candle Subscription";
const SUBSCRIPTION_TIERS = {
  one: { name: "1 Candle Monthly", priceCents: 2200, candles: 1 },
  two: { name: "2 Candles Monthly", priceCents: 4000, candles: 2 }
};
const SUBSCRIPTION_SCENTS = ["Vanilla Latte", "Pumpkin Spice", "Gardenia", "Apple Pie", "Vanilla", "Banana Bread", "Seasonal"];
const SUBSCRIPTION_WICKS = ["Hemp wick", "Wood wick"];
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});
async function squareFetch(env, path, method, body) {
  const response = await fetch(`https://connect.squareup.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`, "Square-Version": "2026-09-16", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const rawText = await response.text();
  let result = null;
  try { result = JSON.parse(rawText); } catch { result = null; }
  return { ok: response.ok, status: response.status, result };
}
// Finds the subscription plan and its two variations in Square, creating them on first use.
// Returns { one: variationId, two: variationId }.
async function ensureSubscriptionPlans(env) {
  const list = await squareFetch(env, "/v2/catalog/list?types=SUBSCRIPTION_PLAN", "GET");
  let plan = null;
  if (list.ok && Array.isArray(list.result?.objects)) {
    plan = list.result.objects.find((o) => o.type === "SUBSCRIPTION_PLAN" && o.subscription_plan_data?.name === SUBSCRIPTION_PLAN_NAME) || null;
  }
  if (!plan) {
    const created = await squareFetch(env, "/v2/catalog/object", "POST", {
      idempotency_key: "vrf-candle-subscription-plan",
      object: { type: "SUBSCRIPTION_PLAN", id: "#candle-subscription", present_at_all_locations: true,
        subscription_plan_data: { name: SUBSCRIPTION_PLAN_NAME, all_items: true } }
    });
    if (!created.ok || !created.result?.catalog_object?.id) throw new Error("Could not set up the candle subscription plan.");
    plan = created.result.catalog_object;
  }
  const variations = plan.subscription_plan_data?.subscription_plan_variations || [];
  const ids = {};
  for (const [tier, def] of Object.entries(SUBSCRIPTION_TIERS)) {
    const existing = variations.find((v) => v.subscription_plan_variation_data?.name === def.name);
    if (existing) { ids[tier] = existing.id; continue; }
    const created = await squareFetch(env, "/v2/catalog/object", "POST", {
      idempotency_key: `vrf-candle-subscription-${tier}`,
      object: { type: "SUBSCRIPTION_PLAN_VARIATION", id: `#candle-subscription-${tier}`, present_at_all_locations: true,
        subscription_plan_variation_data: { name: def.name, subscription_plan_id: plan.id,
          phases: [{ cadence: "MONTHLY", ordinal: 0, pricing: { type: "STATIC", price: { amount: def.priceCents, currency: "USD" } } }] } }
    });
    if (!created.ok || !created.result?.catalog_object?.id) throw new Error("Could not set up the candle subscription plan.");
    ids[tier] = created.result.catalog_object.id;
  }
  return ids;
}
function candleChoiceName(choice) {
  const shape = choice.id === "vanilla-latte-round" ? "Round" : "Oval";
  return `${choice.scent} Candle — ${shape} — ${choice.wick}`;
}
async function handleSubscription(input, env) {
  const { subscription, fulfillment, email } = input;
  const tier = SUBSCRIPTION_TIERS[subscription.tier];
  if (!tier || !Array.isArray(subscription.candles) || subscription.candles.length !== tier.candles) {
    return json({ error: "Please choose your subscription candles." }, 400);
  }
  for (const c of subscription.candles) {
    if (!c || !CANDLE_IDS.has(c.id) || !SUBSCRIPTION_SCENTS.includes(c.scent) || !SUBSCRIPTION_WICKS.includes(c.wick)) {
      return json({ error: "Please check your candle choices." }, 400);
    }
  }
  if (!["pickup", "shipping"].includes(fulfillment)) return json({ error: "Please choose pickup or shipping." }, 400);
  let variationIds;
  try {
    variationIds = await ensureSubscriptionPlans(env);
  } catch (error) {
    console.error("Subscription plan setup error", error);
    return json({ error: "Subscriptions are temporarily unavailable. Please try again later." }, 400);
  }
  const detail = subscription.candles.map(candleChoiceName).join(" + ");
  const body = {
    idempotency_key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`,
    quick_pay: {
      name: `Candle Subscription — ${tier.candles} candle${tier.candles > 1 ? "s" : ""}/month: ${detail}`,
      price_money: { amount: tier.priceCents, currency: "USD" },
      location_id: env.SQUARE_LOCATION_ID
    },
    checkout_options: {
      subscription_plan_id: variationIds[subscription.tier],
      ask_for_shipping_address: fulfillment === "shipping"
    },
    pre_populated_data: { buyer_email: email.trim() },
    payment_note: `Valley Ridge Farm — Candle Subscription, ${tier.candles} candle${tier.candles > 1 ? "s" : ""} monthly, ${fulfillment === "pickup" ? "local pickup" : "shipping included"}`
  };
  try {
    const response = await fetch("https://connect.squareup.com/v2/online-checkout/payment-links", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`, "Square-Version": "2026-09-16", "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const rawText = await response.text();
    let result = null;
    try { result = JSON.parse(rawText); } catch { result = null; }
    if (!response.ok || !result?.payment_link?.url) {
      const codes = result?.errors?.map(e => e.code) || [];
      console.error("Square subscription checkout error", response.status, codes);
      if (codes.includes("INVALID_EMAIL_ADDRESS")) return json({ error: "Square didn't accept that email address. Please check it and try again." }, 400);
      return json({ error: "Square could not start checkout. Please try again later." }, 400);
    }
    return json({ url: result.payment_link.url });
  } catch (error) {
    console.error("Square subscription checkout network error", error);
    return json({ error: "Checkout is temporarily unavailable. Please try again later." }, 400);
  }
}
export async function onRequestPost({ request, env }) {
  if (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID) return json({ error: "Checkout is being set up. Please try again soon." }, 400);
  try {
  let input;
  try { input = await request.json(); } catch { return json({ error: "Invalid cart." }, 400); }
  const { cart, fulfillment, email, promo, subscription } = input || {};
  const emailOk = typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (subscription) {
    if (!emailOk) return json({ error: "Please check your email address." }, 400);
    return handleSubscription(input, env);
  }
  if (!cart || typeof cart !== "object" || Array.isArray(cart) || !["pickup", "shipping"].includes(fulfillment) || !emailOk) {
    return json({ error: "Please check your cart and email address." }, 400);
  }
  const promoCode = typeof promo === "string" ? promo.trim().toLowerCase() : "";
  if (promoCode && promoCode !== "seraphiim") return json({ error: "That promo code isn't valid." }, 400);
  const seraphiim = promoCode === "seraphiim";
  const entries = Object.entries(cart);
  if (!entries.length || entries.length > 20) return json({ error: "Your cart is empty or too large." }, 400);
  let count = 0;
  let subtotalCents = 0;
  let honeyUnits = 0;
  let candleUnits = 0;
  const line_items = [];
  for (const [key, quantity] of entries) {
    // Cart keys are "product-id" or "product-id|Option|Option" for products with variants.
    const parts = String(key).split("|");
    const id = parts[0];
    const variant = parts.slice(1).filter(Boolean);
    const item = CATALOG[id];
    if (!item || !Number.isInteger(quantity) || quantity < 1 || quantity > 25) return json({ error: "This item is sold out. Please refresh your cart and try again." }, 400);
    if (fulfillment === "shipping" && !item[2]) return json({ error: "One or more items in your cart are available for pickup only." }, 400);
    count += quantity;
    let name = item[0];
    if (variant.length) {
      if (CANDLE_IDS.has(id) && variant.length >= 2) {
        const shape = id === "vanilla-latte-round" ? "Round" : "Oval";
        name = `${variant[0]} Candle — ${shape} — ${variant[1]}`;
      } else {
        name = `${item[0]} — ${variant.join(", ")}`;
      }
    }
    if (seraphiim && (HONEY_IDS.has(id) || CANDLE_IDS.has(id))) {
      for (let i = 0; i < quantity; i++) {
        let unitPrice;
        if (HONEY_IDS.has(id)) {
          honeyUnits++;
          unitPrice = honeyUnits === 1 ? 0 : item[1];
        } else {
          candleUnits++;
          unitPrice = candleUnits === 1 ? Math.round(item[1] / 2) : item[1];
        }
        subtotalCents += unitPrice;
        line_items.push({ name, quantity: "1", base_price_money: { amount: unitPrice, currency: "USD" } });
      }
    } else {
      subtotalCents += item[1] * quantity;
      line_items.push({ name, quantity: String(quantity), base_price_money: { amount: item[1], currency: "USD" } });
    }
  }
  if (count > 50) return json({ error: "Please reduce your cart quantity." }, 400);
  const freePatchShipping = entries.every(([key]) => FREE_SHIPPING_PATCHES.has(String(key).split("|")[0]));
  // Flat shipping is $8 (800 cents) by default; set SHIPPING_FEE_CENTS in Cloudflare to override it.
  // Shipping is free when the order subtotal is $55+ or the cart holds only free-shipping patches.
  const freeShipping = freePatchShipping || subtotalCents >= 5500 || seraphiim;
  const shippingCents = freeShipping ? 0 : Number(env.SHIPPING_FEE_CENTS ?? 800);
  if (fulfillment === "shipping" && !freeShipping && (!Number.isSafeInteger(shippingCents) || shippingCents < 0 || shippingCents > 10000)) {
    return json({ error: "Shipping checkout is not available yet. Please choose pickup." }, 400);
  }
  const body = {
    idempotency_key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`,
    order: { location_id: env.SQUARE_LOCATION_ID, line_items },
    checkout_options: {
      ask_for_shipping_address: fulfillment === "shipping",
      enable_coupon: true,
      ...(fulfillment === "shipping" && !freeShipping ? { shipping_fee: { name: "Shipping", charge: { amount: shippingCents, currency: "USD" } } } : {})
    },
    pre_populated_data: { buyer_email: email.trim() },
    payment_note: `Valley Ridge Farm — ${fulfillment === "pickup" ? "local pickup; arrange after purchase" : "shipping"}`
  };
  try {
    const response = await fetch("https://connect.squareup.com/v2/online-checkout/payment-links", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`, "Square-Version": "2026-09-16", "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const rawText = await response.text();
    let result = null;
    try { result = JSON.parse(rawText); } catch { result = null; }
    if (!response.ok || !result?.payment_link?.url) {
      const codes = result?.errors?.map(e => e.code) || [];
      console.error("Square checkout error", response.status, codes);
      if (codes.includes("INVALID_EMAIL_ADDRESS")) return json({ error: "Square didn't accept that email address. Please check it and try again." }, 400);
      return json({ error: "Square could not start checkout. Please try again later." }, 400);
    }
    return json({ url: result.payment_link.url });
  } catch (error) {
    console.error("Square checkout network error", error);
    return json({ error: "Checkout is temporarily unavailable. Please try again later." }, 400);
  }
  } catch (error) {
    console.error("Checkout handler error", error);
    return json({ error: "Checkout error: " + (error && error.message ? error.message : String(error)) }, 400);
  }
}
