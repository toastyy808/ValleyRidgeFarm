# Valley Ridge Farms storefront

Static storefront prepared for Cloudflare Pages.

## Edit the catalog

All starter product names, prices, descriptions, images, and fulfillment rules live in `dist/assets/products.js`. Eating eggs use `Local pickup only`; candles and fertile hatching eggs use `Pickup or shipping`.

## Edit the About page

The starter story is in `dist/about/index.html`. Replace the three paragraphs inside the `about-copy` article with the final family story before launch.

## Square checkout

The cart posts to `functions/api/checkout.js`, which validates items, quantities, prices, and pickup-only restrictions before creating a Square-hosted payment link. In Cloudflare Pages set production encrypted secrets `SQUARE_ACCESS_TOKEN` and `SQUARE_LOCATION_ID`. Set `SHIPPING_FEE_CENTS` (integer USD cents, for example `800` for $8) to enable shipping checkout; pickup works without it. Set up tax rules and review the actual payment page before accepting orders. Never put credentials in public files or GitHub. Verify completed orders and payments in Square Dashboard; a redirect alone is not proof of payment. Keep `functions` at repository root and Pages build output at `dist`.

## Stock-photo sources

- Candle photo: Ron Lach via Pexels — https://www.pexels.com/photo/clear-candle-glass-on-a-wooden-table-8271811/
- Egg photo: Angelo via Pexels — https://www.pexels.com/photo/basket-of-fresh-eggs-on-rustic-ground-37939737/
- Farm photo: Helena Lopes via Pexels — https://www.pexels.com/photo/sunset-over-grassy-field-and-rural-cottage-4409319/

Each source page marked its photo free to use under the Pexels license when selected on September 24, 2026.
