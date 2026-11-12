const CATALOG = {
  "honey-4oz": ["Honey (4 oz jar)", 600, true],
  "vanilla-latte-oval": ["Coconut Beeswax Candle — Oval", 1800, true],
  "vanilla-latte-round": ["Coconut Beeswax Candle — Round", 1800, true],
  "heart-patch-pair": ["Heart Iron-On Patch (2 Pack)", 300, true],
  "patch-2in": ["Patch (2 inch)", 500, false],
  "fall-pumpkin-pair": ["Pumpkin Patch Pair", 300, true],
  "fall-maple-leaf-pair": ["Maple Leaf Patch Pair", 300, true],
  "fall-acorn-pair": ["Acorn Patch Pair", 300, true]
}; // Honey, the Coconut Beeswax Candles, and all Patches are currently available; all other products are sold out.
const FREE_SHIPPING_PATCHES = new Set(["fall-pumpkin-pair", "fall-maple-leaf-pair", "fall-acorn-pair", "heart-patch-pair"]);
const HONEY_IDS = new Set(["honey-4oz"]);
const CANDLE_IDS = new Set(["vanilla-latte-oval", "vanilla-latte-round"]);
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});
export async function onRequestPost({ request, env }) {
  if (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID) return json({ error: "Checkout is being set up. Please try again soon." }, 503);
  try {
  let input;
  try { input = await request.json(); } catch { return json({ error: "Invalid cart." }, 400); }
  const { cart, fulfillment, email, promo } = input || {};
  if (!cart || typeof cart !== "object" || Array.isArray(cart) || !["pickup", "shipping"].includes(fulfillment) ||
      typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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
    const name = variant.length ? `${item[0]} — ${variant.join(", ")}` : item[0];
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
    return json({ error: "Shipping checkout is not available yet. Please choose pickup." }, 503);
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
    const result = await response.json();
    if (!response.ok || !result.payment_link?.url) {
      console.error("Square checkout error", response.status, result.errors?.map(e => e.code));
      return json({ error: "Square could not start checkout. Please try again later." }, 502);
    }
    return json({ url: result.payment_link.url });
  } catch (error) {
    console.error("Square checkout network error", error);
    return json({ error: "Checkout is temporarily unavailable. Please try again later." }, 502);
  }
  } catch (error) {
    console.error("Checkout handler error", error);
    return json({ error: "Checkout error: " + (error && error.message ? error.message : String(error)) }, 502);
  }
}
