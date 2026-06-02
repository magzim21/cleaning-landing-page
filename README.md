# Cleaning Landing Page

Landing page with a Vercel API endpoint for booking submissions.

## Run locally


```bash
npx vercel dev -H 0.0.0.0
ipconfig getifaddr en0 # for accessing the local version from the mobile phone.
```

## Calendly redirect after booking

In Calendly, set the event confirmation redirect to:

```
https://YOUR-DOMAIN/booking-confirmed?event_type_name={{event_type_name}}&event_type_uuid={{event_type_uuid}}&event_start_time={{event_start_time}}&event_end_time={{event_end_time}}&guests={{guests}}&assigned_to={{assigned_to}}&invitee_full_name={{invitee_full_name}}&invitee_email={{invitee_email}}
```

Every query parameter in that URL is captured as-is, formatted in plain language, and sent to email + Slack. Add or remove Calendly variables freely — whatever is in the URL gets forwarded.

### How delivery stays exactly-once

`/booking-confirmed` loads the page. The browser is the single delivery trigger:

1. The page reads the booking params and computes a stable booking key.
2. It guards delivery with `localStorage` (atomic + durable per browser) so a booking can never be delivered twice from the same device — even on refresh or double navigation.
3. It sends **one** `POST` to `/api/booking-confirmed`, which sends the email + Slack message, and fires the Google Ads conversion once.

The legacy `/api/booking-confirmed?...` redirect URL still works (it delivers server-side, then redirects to `/booking-confirmed?notified=1` for the thank-you UI + conversion), but prefer the `/booking-confirmed?...` URL above so there is a single, reliable delivery path.

Required env vars: `RESEND_API_KEY`, `SLACK_WEBHOOK_URL`, `BOOKING_EMAIL_TO`, `BOOKING_EMAIL_FROM`.

## Draft 
- Polishing 
- scaratches removal


additional checkbox for heavy grease

test booking form
Test the attachng pictures