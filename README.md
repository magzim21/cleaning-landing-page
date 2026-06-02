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
https://YOUR-DOMAIN/api/booking-confirmed?event_type_name={{event_type_name}}&event_type_uuid={{event_type_uuid}}&event_start_time={{event_start_time}}&event_end_time={{event_end_time}}&guests={{guests}}&assigned_to={{assigned_to}}&invitee_full_name={{invitee_full_name}}&invitee_email={{invitee_email}}
```

**This must be the only path that triggers the API.** Do not also configure `/booking-confirmed?...` as a Calendly redirect — that would hit the API a second time and duplicate email + Slack.

The API sends email + Slack, then redirects to `/booking-confirmed?notified=1` where the Google Ads conversion fires once and the thank-you overlay is shown.

Required env vars: `RESEND_API_KEY`, `SLACK_WEBHOOK_URL`, `BOOKING_EMAIL_TO`, `BOOKING_EMAIL_FROM`.

## Draft 
- Polishing 
- scaratches removal


additional checkbox for heavy grease

test booking form
Test the attachng pictures