# invoice-api

Backend for a small invoicing app. A business user registers, creates invoices, and gets a payment link for each one. The customer opens the link and pays with Stripe Checkout (no account needed). A Stripe webhook marks the invoice as paid.

Backend only. Stripe runs in **test mode** only.

## How it works

1. The business user registers and logs in to get a JWT.
2. They create an invoice and get back a `paymentUrl`.
3. The customer opens `paymentUrl`. The API creates a Stripe Checkout Session and redirects to it.
4. The customer pays on Stripe's page.
5. Stripe calls the webhook, and the API marks the invoice `paid`.

## Stack

NestJS, TypeScript, PostgreSQL (Docker), Drizzle ORM, Zod, JWT + argon2, Stripe, pino, helmet, throttler, Swagger, Bruno, Cloudflare Tunnel.

## Requirements

- Node 22 and pnpm
- Docker
- [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
- A Stripe account (sandbox / test mode)
- [Bruno](https://www.usebruno.com/) (optional, for manual testing)

## Setup

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrate
```

Fill in `.env`:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Keep the default if you use `docker-compose.yml` |
| `JWT_SECRET` | Any random string, at least 32 characters (`openssl rand -hex 32`) |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `1h` |
| `PUBLIC_URL` | Your tunnel URL (see below) |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → API keys → Secret key (must start with `sk_test_`) |
| `STRIPE_WEBHOOK_SECRET` | The webhook signing secret (`whsec_...`, see below) |

The app refuses to start if any variable is missing or invalid.

## Run

**1. Start the tunnel** (keep it running):

```bash
cloudflared tunnel --url http://localhost:3000
```

Copy the `https://xxx.trycloudflare.com` URL it prints into `PUBLIC_URL` in `.env`.

**2. Add the Stripe webhook** (Dashboard → Developers → Workbench → Webhooks → Add destination):

- Events: `checkout.session.completed`
- Payload style: **Snapshot**
- Endpoint URL: `https://xxx.trycloudflare.com/v1/webhooks/stripe`

Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

**3. Start the API:**

```bash
pnpm start:dev
```

> The quick tunnel URL changes every time `cloudflared` restarts. When that happens, update `PUBLIC_URL`, update the endpoint URL in Stripe, and restart the API.

> Payment methods: the API only listens to `checkout.session.completed`. Keep Checkout on instant methods like cards. In Stripe Dashboard → Settings → Payment methods, turn off delayed methods such as bank debits, or those payments will stay `pending`.

## API

All routes are under `/v1`. Routes need `Authorization: Bearer <token>` unless marked public.

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | public | Create an account |
| POST | `/auth/login` | public | Get an access token |
| POST | `/invoices` | JWT | Create an invoice, returns `paymentUrl` |
| GET | `/invoices?page=1&limit=20` | JWT | List your invoices |
| GET | `/invoices/:id/checkout` | public | Redirect to Stripe Checkout |
| GET | `/checkout/success` | public | Simple success message |
| GET | `/checkout/cancel` | public | Simple cancel message |
| POST | `/webhooks/stripe` | public | Stripe webhook (signature checked) |

Interactive docs: `http://localhost:3000/docs`

Create invoice body:

```json
{
  "customerEmail": "customer@example.com",
  "description": "Website design",
  "amountCents": 15000,
  "currency": "usd"
}
```

- `amountCents` is an integer in cents (`15000` = $150.00), between `50` and `99999999`.
- `currency` is `usd`, `eur` or `gbp`.

## Try it

1. Open the `bruno/` folder in Bruno and pick the `local` environment.
2. Run `auth/register`, then `auth/login`. The token is saved for the next requests.
3. Run `invoices/create invoice` and open the `paymentUrl` in a browser.
4. Pay with the test card `4242 4242 4242 4242`, any future date, any CVC.
5. Run `invoices/list invoices`. The invoice is now `paid`.

## Payment rules

- Only the webhook marks an invoice `paid`. The success page never does.
- The webhook updates with `WHERE status = 'pending'`, so duplicate webhooks do nothing.
- The amount always comes from the database, never from the URL.
- The payment link never expires. Each open creates a new Checkout Session and expires the previous one, so only one session is open at a time.
- Opening the link of a paid invoice returns `409`.

## Scripts

| Command | What it does |
|---|---|
| `pnpm start:dev` | Run the API with reload on change |
| `pnpm build` | Compile to `dist/` |
| `pnpm lint` | Lint the code |
| `pnpm db:generate` | Create a migration from schema changes |
| `pnpm db:migrate` | Apply pending migrations |

## Project structure

```
src/
├── main.ts              App bootstrap (helmet, prefix, Swagger)
├── app.module.ts        Global config, logging, validation, rate limit
├── config/env.ts        Env vars, validated with Zod
├── database/            Drizzle connection and tables
└── modules/
    ├── users/           Users repository
    ├── auth/            Register, login, JWT guard
    ├── invoices/        Create and list invoices
    └── payments/        Stripe Checkout and webhook
drizzle/                 SQL migrations
bruno/                   Bruno requests
```
