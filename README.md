# Cleaning Landing Page

Landing page with a Vercel API endpoint for booking submissions.

## Run locally


```bash
npx vercel dev -H 0.0.0.0
ipconfig getifaddr en0 # for accessing the local version from the mobile phone.
```

## Calendly redirect after booking

In Calendly, set the event confirmation redirect to (use one URL only):

```
https://YOUR-DOMAIN/api/booking-confirmed?event_type_name={{event_type_name}}&event_type_uuid={{event_type_uuid}}&event_start_time={{event_start_time}}&event_end_time={{event_end_time}}&guests={{guests}}&assigned_to={{assigned_to}}&invitee_full_name={{invitee_full_name}}&invitee_email={{invitee_email}}
```

Every query parameter in that URL is captured as-is, formatted in plain language, and sent to email + Slack. Add or remove Calendly variables freely — whatever is in the URL gets forwarded.

The API redirects to `/booking-confirmed?notified=1` for the thank-you page and Google Ads conversion. Do not add client-side notification calls on that page.

Legacy `/booking-confirmed?...` URLs still route through the API via Vercel rewrite, but prefer the direct `/api/booking-confirmed?...` URL above to avoid duplicate delivery paths.

Required env vars: `RESEND_API_KEY`, `SLACK_WEBHOOK_URL`, `BOOKING_EMAIL_TO`, `BOOKING_EMAIL_FROM`.

## Draft 
- Polishing 
- scaratches removal


additional checkbox for heavy grease

test booking form
Test the attachng pictures