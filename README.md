# invoice-api

Backend for a small invoicing app. A business user registers, creates invoices, and gets a payment link for each one. The customer opens the link and pays with Stripe Checkout (no account needed). A Stripe webhook marks the invoice as paid. Customers get an email when a payment succeeds, fails or its link expires.

Backend only. Stripe runs in **test mode** only.

## How it works

1. The business user registers and logs in to get a JWT.
2. They create an invoice and get back a `paymentUrl`.
3. The customer opens `paymentUrl`. The API creates a Stripe Checkout Session and redirects to it.
4. The customer pays on Stripe's page.
5. Stripe calls the webhook, and the API marks the invoice `paid`.
6. The API queues an email to the customer in the same database transaction, and a background worker sends it through SMTP (Mailtrap in development), retrying on failure.
7. A business user can also upload a CSV or Excel file of invoices that were already paid. They are saved as `paid` and the business user who uploaded the file gets one summary email.

## Stack

NestJS, TypeScript, PostgreSQL (Docker), Drizzle ORM, Zod, JWT + argon2, Stripe, pino, helmet, throttler, Swagger, Bruno, nodemailer, Mailtrap, csv-parse, read-excel-file, ngrok.

## Requirements

- Node 22 and pnpm
- Docker
- [ngrok](https://ngrok.com/download) with a free account
- A Stripe account (sandbox / test mode)
- A [Mailtrap](https://mailtrap.io) account (free Email Sandbox)
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
| `PUBLIC_URL` | Your ngrok static domain, e.g. `https://your-name.ngrok-free.dev` (see below) |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → API keys → Secret key (must start with `sk_test_`) |
| `STRIPE_WEBHOOK_SECRET` | The webhook signing secret (`whsec_...`, see below) |
| `MAIL_SMTP_HOST` | `sandbox.smtp.mailtrap.io` |
| `MAIL_SMTP_PORT` | `587` (`2525` also works on networks that don't block it) |
| `MAIL_SMTP_USER` | Mailtrap → Sandboxes → your inbox → Integration → SMTP → Username |
| `MAIL_SMTP_PASSWORD` | Same place → Password |
| `MAIL_FROM` | Sender shown on emails, e.g. `Invoice API <billing@invoice-api.test>` |

The app refuses to start if any variable is missing or invalid.

## Run

**1. Set up ngrok** (once):

```bash
ngrok config add-authtoken <your-authtoken>
```

The authtoken is on the [ngrok dashboard](https://dashboard.ngrok.com/get-started/your-authtoken). Every free account gets one static domain (Dashboard → Universal Gateway → Domains), such as `your-name.ngrok-free.dev`. It never changes. Put `https://your-name.ngrok-free.dev` in `PUBLIC_URL`.

**2. Add the Stripe webhook** (once, Dashboard → Developers → Workbench → Webhooks → Add destination):

- Events: `checkout.session.completed`, `checkout.session.expired`, `payment_intent.payment_failed`
- Payload style: **Snapshot**
- Endpoint URL: `https://your-name.ngrok-free.dev/v1/webhooks/stripe`

Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

**3. Start the tunnel** (keep it running):

```bash
ngrok http 3000 --url=your-name.ngrok-free.dev
```

**4. Start the API:**

```bash
pnpm start:dev
```

> Steps 1 and 2 happen once. After that, each session only needs steps 3 and 4.

> On the free plan, ngrok shows a warning page the first time a browser opens the URL. The customer clicks **Visit Site** once before reaching Checkout. Stripe webhooks are not affected.

> Payment methods: the API listens to `checkout.session.completed`, `checkout.session.expired` and `payment_intent.payment_failed`. Keep Checkout on instant methods like cards. In Stripe Dashboard → Settings → Payment methods, turn off delayed methods such as bank debits, or those payments will stay `pending`.

## API

All routes are under `/v1`. Routes need `Authorization: Bearer <token>` unless marked public.

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | public | Create an account |
| POST | `/auth/login` | public | Get an access token |
| POST | `/invoices` | JWT | Create an invoice, returns `paymentUrl` |
| GET | `/invoices?page=1&limit=20` | JWT | List your invoices |
| POST | `/invoices/import` | JWT | Import paid invoices from a `.csv` or `.xlsx` file |
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

## Bulk import

Send `multipart/form-data` with the file in a field named `file`. `.csv` or `.xlsx` (first sheet), up to 1 MB and 1000 rows.

The first row is the header. The columns:

| Column | Required | Rule |
|---|---|---|
| `customerEmail` | yes | valid email |
| `description` | yes | not empty |
| `amountCents` | yes | integer between `50` and `99999999` |
| `currency` | yes | `usd`, `eur` or `gbp` |
| `paidAt` | no | date (`2026-09-01`) or ISO date-time, not in the future. Empty means now |

Example:

```csv
customerEmail,description,amountCents,currency,paidAt
ali@example.com,Website design,150000,usd,2026-09-01
omar@example.com,Monthly hosting,2500,gbp,
```

Responses:

| Status | When |
|---|---|
| `201` | All rows valid. Returns `{ "importId": "...", "importedCount": 2 }` |
| `400` | Missing file, wrong type, bad header, too many rows, or any invalid row. The body lists every bad row and field, with rows numbered as in a spreadsheet (the header is row 1). Nothing is saved. |
| `409` | You already imported this exact file |
| `413` | File larger than 1 MB |

Every imported invoice is saved as `paid`. Customers get no email, because they were already notified when they paid; you get one summary email with the count, the totals per currency and the first 10 invoices.

## Try it

1. Open the `bruno/` folder in Bruno and pick the `local` environment.
2. Run `auth/register`, then `auth/login`. The token is saved for the next requests.
3. Run `invoices/create invoice` and open the `paymentUrl` in a browser.
4. Pay with the test card `4242 4242 4242 4242`, any future date, any CVC.
5. Run `invoices/list invoices`. The invoice is now `paid`.
6. Run `invoices/import csv` or `invoices/import xlsx`. The sample files are in `bruno/fixtures/`. Running the same request twice returns `409`; change a value in the file to import it again.
7. Open your Mailtrap inbox to see the emails.

## Payment rules

- Only the webhook marks an invoice `paid`. The success page never does.
- The webhook updates with `WHERE status = 'pending'`, so duplicate webhooks do nothing.
- The amount always comes from the database, never from the URL.
- The payment link never expires. Each open creates a new Checkout Session and expires the previous one, so only one session is open at a time.
- Opening the link of a paid invoice returns `409`.

## Emails

- Emails are written to the `email_outbox` table in the same transaction as the change that causes them, so a failed send never loses one.
- A worker sends due emails every 5 seconds. A failed send is retried after 1, 2, 4 and 8 minutes, then marked `failed`.
- When the SMTP server says it is rate limited, the worker waits 10 seconds without counting it as a failed attempt. Mailtrap's free sandbox accepts about one email every 15 seconds, so when several emails are queued at once they go out one at a time.
- Each email has a unique key, so webhook retries never send it twice.

| Email | Sent when |
|---|---|
| Payment received | Stripe confirms the payment |
| Payment did not go through | A card is declined, with Stripe's reason and the payment link |
| Payment link expired | A Checkout Session expires unpaid (not when the API closes it because the link was opened again) |
| Import completed | You import a file. Sent to you, not to the customers |

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
    ├── invoices/        Create, list and import invoices
    ├── payments/        Stripe Checkout and webhook
    └── mail/            Email outbox, templates and SMTP worker
drizzle/                 SQL migrations
bruno/                   Bruno requests
```
