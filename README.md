# Cleaning Landing Page

Landing page with a Vercel API endpoint for booking submissions.

## Run locally

### 1) Prerequisites

- Node.js 18+ (Node 20 recommended)
- npm
- Vercel CLI (installed with `npm i -g vercel`, or use `npx vercel`)
- Resend API key for sending booking emails

### 2) Set local environment variables

Create a file named `.env.local` in the project root:

```bash
RESEND_API_KEY=re_xxxxxxxxx
BOOKING_EMAIL_FROM="Island Drift Detailing <bookings@maxim.run>"
```

Notes:
- `RESEND_API_KEY` is required for `/api/booking`.
- `BOOKING_EMAIL_FROM` should be a sender verified in Resend.
- Booking emails are sent to `book@maxim.run` (configured in `api/booking.js`).

### 3) Start local dev server (site + API)

From the project root:

```bash
npx vercel dev
```

Vercel will print a local URL (usually `http://localhost:3000`).

### 4) Test booking flow

1. Open the local URL.
2. Click **Send booking request** in the booking modal.
3. Verify you get a success overlay on the page.
4. Confirm the booking email arrives at `book@maxim.run`.

If the API is not configured, the form shows an error from `/api/booking`.

## Deploy

Push to your tracked branch and deploy through Vercel as usual.
Make sure these environment variables are set in the Vercel project:

- `RESEND_API_KEY`
- `BOOKING_EMAIL_FROM` (recommended)
