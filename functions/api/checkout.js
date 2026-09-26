const CATALOG = {
  "cedar-glow": ["Cedar Glow Candle", 1800, true],
  "vanilla-hearth": ["Vanilla Hearth Candle", 1800, true],
  "lavender-linen": ["Lavender Linen Candle", 1800, true],
  "farm-eggs": ["Farm-Fresh Chicken Eggs (dozen)", 500, false],
  "fertile-hatching-eggs": ["Fertile Hatching Eggs", 2400, true],
  "seasonal-box": ["Valley Ridge Gift Box", 2800, true]
};
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});
export async function onRequestPost({ request, env }) {
  if (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID) return json({ error: "Checkout is being set up. Please try again soon." }, 503);
  let input;
  try { input = await request.json(); } catch { return json({ error: "Invalid cart." }, 400); }
  const { cart, fulfillment, email } = input || {};
  if (!cart || typeof cart !== "object" || Array.isArray(cart) || !["pickup", "shipping"].includes(fulfillment) ||
      typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Please check your cart and email address." }, 400);
  }
  const entries = Object.entries(cart);
  if (!entries.length || entries.length > 20) return json({ error: "Your cart is empty or too large." }, 400);
  let count = 0;
  const line_items = [];
  for (const [id, quantity] of entries) {
    const item = CATALOG[id];
    if (!item || !Number.isInteger(quantity) || quantity < 1 || quantity > 25) return json({ error: "Please refresh your cart and try again." }, 400);
    if (fulfillment === "shipping" && !item[2]) return json({ error: "Fresh eating eggs are available for pickup only." }, 400);
    count += quantity;
    line_items.push({ name: item[0], quantity: String(quantity), base_price_money: { amount: item[1], currency: "USD" } });
  }
  if (count > 50) return json({ error: "Please reduce your cart quantity." }, 400);
  const shippingCents = Number(env.SHIPPING_FEE_CENTS);
  if (fulfillment === "shipping" && (env.SHIPPING_FEE_CENTS == null || !Number.isSafeInteger(shippingCents) || shippingCents < 0 || shippingCents > 10000)) {
    return json({ error: "Shipping checkout is not available yet. Please choose pickup." }, 503);
  }
  const body = {
    idempotency_key: crypto.randomUUID(),
    order: { location_id: env.SQUARE_LOCATION_ID, line_items },
    checkout_options: {
      ask_for_shipping_address: fulfillment === "shipping",
      enable_coupon: false,
      ...(fulfillment === "shipping" ? { shipping_fee: { name: "Shipping", charge: { amount: shippingCents, currency: "USD" } } } : {})
    },
    pre_populated_data: { buyer_email: email.trim() },
    payment_note: `Valley Ridge Farms — ${fulfillment === "pickup" ? "local pickup; arrange after purchase" : "shipping"}`
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
}
