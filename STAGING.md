# Valley Ridge Market test website

The `staging` branch is the test copy of the storefront. It was created from the live production commit `9ab038a8208dd5e4e85bcd50347290d4d788975e` on October 6, 2026 (UTC). All storefront files initially match production.

## Workflow

- Make and commit test changes on `staging`.
- Cloudflare Pages project `valleyridgefarm` automatically builds non-production branches as preview deployments. Use the stable branch alias returned by Cloudflare for reviews.
- `main` remains the production branch for https://valleyridgefarm.us and https://www.valleyridgefarm.us.
- Publishing staging commits does not update the customer website. Promote reviewed changes to `main` only after the owner explicitly asks to update the live website.
- Before promotion, check for any newer production changes, review the diff, and verify the shop, cart, responsive layout, and checkout behavior.

## Payments and isolation

The Cloudflare preview environment currently has no Square credentials. Browsing and cart interactions can be tested, but real checkout is disabled by the existing server-side credential check. Do not copy production Square credentials into preview. Payment testing requires a separately configured Square Sandbox integration; it has not been configured here.

The test site has its own origin, so its browser-local cart does not share storage with the production website. A preview URL is not a password-protected site; do not place customer data or secrets in source or public assets.
