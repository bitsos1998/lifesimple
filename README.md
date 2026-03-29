# LifeSimple — Setup Guide

Greek life admin service with Stripe payments, Claude AI-generated PDFs, and SendGrid delivery.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your real keys:

| Variable | Where to get it |
|---|---|
| `STRIPE_SECRET_KEY` | [Stripe Dashboard](https://dashboard.stripe.com/apikeys) → Secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → your endpoint → Signing secret |
| `ANTHROPIC_API_KEY` | [Anthropic Console](https://console.anthropic.com/) → API Keys |
| `SENDGRID_API_KEY` | [SendGrid](https://app.sendgrid.com/settings/api_keys) → Create API Key |
| `SENDGRID_FROM_EMAIL` | A verified sender email in SendGrid |
| `BASE_URL` | Your public domain (e.g. `https://lifesimple.gr`) |

### 3. Set Up Stripe Webhook (Local Dev)

Install Stripe CLI then run:

```bash
stripe listen --forward-to localhost:3000/api/webhook
```

Copy the webhook signing secret it shows and put it in `STRIPE_WEBHOOK_SECRET`.

### 4. Run the Server

```bash
# Development (auto-restart on changes)
npm run dev

# Production
npm start
```

Visit: `http://localhost:3000`

---

## File Structure

```
lifesimple/
├── server.js              ← Express backend (Stripe + Claude + PDF + SendGrid)
├── package.json
├── .env.example           ← Copy to .env and fill in keys
├── README.md
└── public/
    ├── index.html         ← Homepage (all products)
    ├── will.html          ← WillSimple (€29)
    ├── divorce.html       ← DivorceSimple (€19)
    ├── marriage.html      ← MarriageSimple (€12)
    ├── obituary.html      ← ObituarySimple (€19)
    ├── separation.html    ← SeparationSimple (€19)
    ├── success.html       ← Post-payment success page
    ├── css/
    │   └── style.css      ← Global styles (Navy & Gold theme)
    └── js/
        └── main.js        ← Frontend JS (forms, validation, Stripe redirect)
```

---

## How It Works

```
User fills form → clicks Pay
        ↓
POST /api/create-checkout-session
  - Stores form data in memory (keyed by Stripe session ID)
  - Creates Stripe Checkout session
  - Returns Stripe hosted payment URL
        ↓
User pays on Stripe
        ↓
Stripe sends POST /api/webhook
  - Verifies Stripe signature
  - Retrieves stored form data
  - Calls Claude API → generates personalised Greek legal report
  - Builds PDF with pdfkit (Navy & Gold branded)
  - Sends PDF via SendGrid to customer's email
        ↓
Customer receives PDF in email (< 5 minutes)
```

---

## Adding a New Product

1. Create `public/newproduct.html` (copy structure from `will.html`)
2. Set `<input name="product" value="newproductsimple" />`
3. Add the route in `server.js` pages array: `const pages = [..., 'newproduct']`
4. Add a `buildSystemPrompt` case for `newproductsimple`
5. Add the card to `public/index.html`

---

## Production Deployment

1. Set `BASE_URL` to your actual domain in `.env`
2. Configure Stripe webhook endpoint in Stripe Dashboard → Webhooks:
   - URL: `https://yourdomain.com/api/webhook`
   - Events: `checkout.session.completed`
3. Verify your sender email in SendGrid
4. Deploy to any Node.js host (Render, Railway, Heroku, VPS)

---

## Support

Email: support@lifesimple.gr
