(function () {
  const CART_KEY = "vrf-cart";
  const products = window.VRF_PRODUCTS || [];
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

  function readCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; }
    catch { return {}; }
  }

  function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateCartCount();
  }

  function product(id) { return products.find((item) => item.id === id); }
  function cartCount(cart = readCart()) { return Object.values(cart).reduce((sum, qty) => sum + qty, 0); }
  function cartItems(cart = readCart()) {
    return Object.entries(cart).map(([id, quantity]) => ({ ...product(id), quantity })).filter((item) => item.name && item.price != null);
  }

  function updateCartCount() {
    document.querySelectorAll("[data-cart-count]").forEach((node) => {
      const count = cartCount();
      node.textContent = count;
      node.setAttribute("aria-label", `${count} items in cart`);
    });
  }

  function addToCart(id) {
    const item = product(id);
    if (!item || item.price == null) return;
    const cart = readCart();
    cart[id] = (cart[id] || 0) + 1;
    saveCart(cart);
    announce(`${item.name} added to your cart.`);
    document.querySelector("[data-cart-button]")?.classList.add("cart-bump");
    setTimeout(() => document.querySelector("[data-cart-button]")?.classList.remove("cart-bump"), 300);
  }

  function setQuantity(id, quantity) {
    const cart = readCart();
    if (quantity <= 0) delete cart[id]; else cart[id] = quantity;
    saveCart(cart);
    renderCheckout();
  }

  function announce(message) {
    const region = document.querySelector("[data-live]");
    if (region) region.textContent = message;
  }

  function productCard(item) {
    return `<article class="product-card">
      <div class="product-photo">${item.image ? `<img src="${item.image}" alt="${item.alt}" loading="lazy">` : `<div class="product-placeholder" role="img" aria-label="Patch photo coming soon">Patch photo coming soon</div>`}</div>
      <div class="product-info">
        <p class="eyebrow">${item.category}</p>
        <h3>${item.name}</h3>
        <p class="product-description">${item.description}</p>
        <div class="fulfillment">${item.fulfillment}</div>
        <div class="product-action">
          <strong>${item.price == null ? "Price coming soon" : money.format(item.price)}</strong>
          ${item.price == null ? `<span class="button button-small" aria-label="Not yet available">Coming soon</span>` : `<button class="button button-small" data-add="${item.id}">Add to cart</button>`}
        </div>
      </div>
    </article>`;
  }

  function renderProducts() {
    document.querySelectorAll("[data-products]").forEach((grid) => {
      const category = grid.dataset.products;
      const limit = Number(grid.dataset.limit || 99);
      const list = products.filter((item) => !category || category === "all" || (category === "featured" ? item.featured : item.category === category)).slice(0, limit);
      grid.innerHTML = list.map(productCard).join("");
    });
  }

  function renderCheckout() {
    const list = document.querySelector("[data-checkout-items]");
    if (!list) return;
    const items = cartItems();
    const empty = document.querySelector("[data-empty-cart]");
    const content = document.querySelector("[data-checkout-content]");
    if (!items.length) {
      empty.hidden = false;
      content.hidden = true;
      return;
    }
    empty.hidden = true;
    content.hidden = false;
    list.innerHTML = items.map((item) => `<li class="checkout-item">
      <img src="${item.image}" alt="">
      <div><strong>${item.name}</strong><span>${money.format(item.price)} each</span></div>
      <div class="quantity" aria-label="Quantity for ${item.name}">
        <button data-qty="${item.id}" data-change="-1" aria-label="Remove one ${item.name}">−</button>
        <span>${item.quantity}</span>
        <button data-qty="${item.id}" data-change="1" aria-label="Add one ${item.name}">+</button>
      </div>
      <strong>${money.format(item.price * item.quantity)}</strong>
    </li>`).join("");
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    document.querySelector("[data-subtotal]").textContent = money.format(subtotal);
    document.querySelector("[data-total]").textContent = money.format(subtotal);
    const pickupOnly = items.some((item) => item.fulfillment.toLowerCase().includes("pickup only"));
    const shipping = document.querySelector("[data-shipping-option]");
    if (shipping) {
      shipping.hidden = pickupOnly;
      if (pickupOnly && shipping.querySelector("input").checked) document.querySelector("#pickup").checked = true;
    }
    const note = document.querySelector("[data-fulfillment-note]");
    if (note) note.textContent = pickupOnly ? "Your cart contains eating eggs, so this order is available for local pickup only. Fertile hatching eggs may be shipped when ordered separately." : "Choose local pickup or shipping. Fertile hatching eggs and candles may be shipped.";
  }

  document.addEventListener("click", (event) => {
    const add = event.target.closest("[data-add]");
    if (add) addToCart(add.dataset.add);
    const qty = event.target.closest("[data-qty]");
    if (qty) {
      const cart = readCart();
      setQuantity(qty.dataset.qty, (cart[qty.dataset.qty] || 0) + Number(qty.dataset.change));
    }
    const menu = event.target.closest("[data-menu-toggle]");
    if (menu) {
      const nav = document.querySelector("[data-mobile-nav]");
      const open = nav.classList.toggle("open");
      menu.setAttribute("aria-expanded", String(open));
    }
  });

  document.querySelector("[data-checkout-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.querySelector("[data-checkout-message]");
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    message.hidden = true;
    button.disabled = true;
    button.textContent = "Opening secure checkout…";
    try {
      const response = await fetch("/api/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cart: readCart(), fulfillment: form.elements.namedItem("fulfillment").value, email: form.elements.namedItem("email").value })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Checkout is unavailable.");
      if (!/^https:\/\/(?:sandbox\.)?(?:square\.link|checkout\.square\.site)\//.test(result.url)) throw new Error("Invalid checkout link.");
      window.location.assign(result.url);
    } catch (error) {
      message.textContent = error.message || "Checkout is unavailable. Please try again.";
      message.hidden = false;
      message.focus();
      button.disabled = false;
      button.textContent = "Continue to secure Square checkout";
    }
  });

  renderProducts();
  renderCheckout();
  updateCartCount();
})();
