# MZ Tech Hub setup

The project now has two parts:

- **Node.js backend:** the root `server.js` file serves the current storefront and exposes `/api/health`, `/api/products`, `/api/orders`, and account registration/sign-in endpoints.
- **React frontend:** `react/` is the React/Vite app. Its development server proxies `/api` requests to Node on port 3000.

## Run the current website

1. Add a MongoDB connection string to the root `.env` file:

```env
MONGODB_URI=your_mongodb_connection_string_here
ADMIN_EMAIL=your-existing-account-email@example.com
```

Create an account through the storefront first, then set `ADMIN_EMAIL` to that account's email address. Only that existing account can sign in to the admin API. The server defaults to the `mz-tech-hub` database and port `3000`.

2. Start the Node backend from the workspace root:

```powershell
npm start
```

Open `http://localhost:3000` for the existing storefront.
Open `http://localhost:3000/admin` to use the shop dashboard. Sign in with the account configured by `ADMIN_EMAIL`.

## Run React with the backend

Open a second terminal:

```powershell
cd react
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually `http://localhost:5173`. Calls such as `fetch('/api/products')` are forwarded to the Node backend.

## Important

The existing root storefront is still the fastest production-ready page. The React project is connected for incremental migration, so React components can be moved over section by section without taking down the current site. MongoDB is required for the Node server to start because orders are stored there.

Checkout asks customers for a name and email address. Requests to `POST /api/orders` must include those details in a `customer` object, along with the cart items.

The storefront also keeps favorites, recently viewed products, and up to three comparison picks in the shopper's browser. To track an order, submit its order number and checkout email to `POST /api/orders/track`; the response contains order progress and item totals without customer details.

New accounts are stored in the configured MongoDB database's `users` collection. Passwords are stored as salted hashes, never as plain text. Registration uses `POST /api/auth/register`; sign-in verifies credentials with `POST /api/auth/login`. The `email` field is unique.

## Private inventory and manual sales API

Sign in with the configured admin account to get a bearer token:

```http
POST /api/admin/login
Content-Type: application/json

{"email":"your-existing-account-email@example.com","password":"your-account-password"}
```

Send the returned `token` in the `Authorization: Bearer <token>` header for the protected endpoints below. Tokens expire after eight hours and are cleared when the server restarts.

- `GET /api/admin/inventory` — list catalog products and their current stock (new products start at zero).
- `POST /api/admin/inventory/adjust` — record a signed stock change. Example: `{"productId":"everyday-case","quantityChange":25,"reason":"New delivery"}`. Stock cannot go below zero. Adjustments are recorded in inventory history.
- `GET /api/admin/inventory/changes?limit=50` — view the latest stock changes; `limit` can be 1–100.
- `POST /api/admin/sales` — record a manual sale with product IDs and quantities. Example: `{"items":[{"productId":"everyday-case","quantity":2}],"note":"Walk-in sale"}`. The server uses catalog prices, and manual sales do not change inventory.
- `GET /api/admin/sales/daily?date=2026-10-09` — view manual sales and the total sale count, item count, and revenue for a UTC calendar day. Omitting `date` selects today in UTC.
- `GET /api/admin/sales/report?from=2026-10-01&to=2026-10-12` — report manual sales across an inclusive UTC date range (up to 366 days), including totals grouped by product.
- `GET /api/admin/orders?limit=50&offset=0&status=received&email=customer@example.com` — list orders, optionally filtered by status or an exact customer email. `limit` can be 1–100.
- Add `from=2026-10-01&to=2026-10-12` to filter orders by an inclusive UTC date range (up to 366 days).
- `GET /api/admin/orders/{orderId}` — view an order.
- `PATCH /api/admin/orders/{orderId}/status` — update order status. Allowed values: `received`, `processing`, `shipped`, `delivered`, and `cancelled`. Set `cancelled` to cancel an order.
- `GET /api/admin/products` — list the active product catalog.
- `POST /api/admin/products` — add a product. Example body: `{"id":"desk-lamp","name":"Desk Lamp","category":"lighting","price":39.99}`. The ID and category must be lowercase slugs; name and price are validated.
- `PATCH /api/admin/products/{productId}` — update any of `name`, `category`, or `price`.
- `DELETE /api/admin/products/{productId}` — remove a product from the active catalog. Products must have zero stock before they can be removed. Past orders and sales keep their saved product details.

Product changes are stored in MongoDB and are reflected by `GET /api/products` and future order/manual-sale validation. Sales reports summarize manual sales recorded through `POST /api/admin/sales`; they do not include online orders.

Keep `.env` private and use HTTPS when exposing the API outside your local development environment.
