export const runtime = "edge";
export const config = {
  runtime: "edge",
};

const TO_EMAIL = process.env.BOOKING_EMAIL_TO || "book@maxim.run";
const RESEND_TIMEOUT_MS = 15000;
const SLACK_TIMEOUT_MS = 15000;
const IGNORED_PARAMS = new Set(["notified"]);

function str(value) {
  if (value == null) return "";
  return String(value).trim();
}

function humanizeKey(key) {
  return str(key)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function decodeParamValue(value) {
  const raw = str(value);
  if (!raw) return "";
  try {
    return decodeURIComponent(raw.replace(/\+/g, "%20"));
  } catch (_) {
    return raw.replace(/\+/g, " ");
  }
}

function formatReadableValue(key, value) {
  const decoded = decodeParamValue(value);
  if (!decoded) return decoded;

  const looksLikeDate =
    /(?:time|date|at)$/i.test(key) || /^\d{4}-\d{2}-\d{2}T/.test(decoded);
  if (!looksLikeDate) return decoded;

  const parsed = Date.parse(decoded);
  if (!Number.isFinite(parsed)) return decoded;

  const local = new Date(parsed).toLocaleString("en-CA", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Vancouver",
  });
  return `${local} (${decoded})`;
}

function parseParams(input) {
  const params = {};

  if (input instanceof URL) {
    for (const [key, value] of input.searchParams.entries()) {
      const normalizedKey = str(key);
      if (!normalizedKey || IGNORED_PARAMS.has(normalizedKey)) continue;
      const decoded = decodeParamValue(value);
      if (decoded) params[normalizedKey] = decoded;
    }
    return params;
  }

  if (!input || typeof input !== "object") return params;

  for (const [key, value] of Object.entries(input)) {
    const normalizedKey = str(key);
    if (!normalizedKey || IGNORED_PARAMS.has(normalizedKey)) continue;
    const decoded = decodeParamValue(value);
    if (decoded) params[normalizedKey] = decoded;
  }

  return params;
}

function formatParamLines(params) {
  return Object.keys(params)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `${humanizeKey(key)}: ${formatReadableValue(key, params[key])}`);
}

function buildSubject(params) {
  const name =
    params.invitee_full_name ||
    params.invitee_email ||
    params.assigned_to ||
    params.event_type_name;
  return name ? `Calendly booking confirmed - ${name}` : "Calendly booking confirmed";
}

function buildConfirmationPageUrl(origin, params) {
  const redirectUrl = new URL("/booking-confirmed", origin);
  redirectUrl.searchParams.set("notified", "1");
  if (params.event_end_time) {
    redirectUrl.searchParams.set("event_end_time", params.event_end_time);
  }
  return redirectUrl.toString();
}

async function sendBookingEmail({ requestId, subject, text, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Email delivery is not configured.");
  }

  const fromEmail =
    process.env.BOOKING_EMAIL_FROM || "Island Drift Detailing <hello@booking.maxim.run>";

  const payload = {
    from: fromEmail,
    to: [TO_EMAIL],
    subject: str(subject) || "New booking",
    text: str(text),
  };

  const normalizedReplyTo = str(replyTo);
  if (normalizedReplyTo) {
    payload.reply_to = [normalizedReplyTo];
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("Resend request timeout"), RESEND_TIMEOUT_MS);

  try {
    const sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });

    if (!sendRes.ok) {
      let detail = "";
      try {
        const errJson = await sendRes.json();
        detail = errJson?.message || JSON.stringify(errJson);
      } catch {
        detail = await sendRes.text();
      }
      throw new Error(`Resend error ${sendRes.status}${detail ? `: ${detail}` : ""}`);
    }
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Resend request timed out after ${RESEND_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  console.log(`[${requestId}] Booking email sent successfully`);
}

async function sendBookingSlack({ requestId, text }) {
  const normalizedWebhookUrl = str(process.env.SLACK_WEBHOOK_URL).replace(/^['"]|['"]$/g, "");
  if (!normalizedWebhookUrl) {
    console.warn(`[${requestId}] SLACK_WEBHOOK_URL is missing, skipping Slack notification`);
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("Slack request timeout"), SLACK_TIMEOUT_MS);

  const payload = JSON.stringify({
    text: str(text),
    mrkdwn: true,
  });

  async function postToSlack() {
    const slackResponse = await fetch(normalizedWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: payload,
    });

    if (!slackResponse.ok) {
      const responseText = await slackResponse.text().catch(() => "");
      throw new Error(
        `Slack webhook returned ${slackResponse.status}${
          responseText ? `: ${responseText}` : ""
        }`
      );
    }
  }

  try {
    await postToSlack();
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Slack webhook timed out after ${SLACK_TIMEOUT_MS}ms`);
    }

    console.warn(`[${requestId}] Slack notification first attempt failed, retrying once`, error);
    await postToSlack();
  } finally {
    clearTimeout(timeoutId);
  }

  console.log(`[${requestId}] Slack notification sent`);
}

async function deliverBookingConfirmation({ requestId, params, sourceUrl }) {
  if (Object.keys(params).length === 0) {
    throw new Error("Missing booking details.");
  }

  const lines = [
    "New Calendly booking",
    "",
    ...formatParamLines(params),
  ];

  if (sourceUrl) {
    lines.push("", `Source URL: ${sourceUrl}`);
  }

  const emailText = lines.join("\n");
  const slackText = [
    ":white_check_mark: *New Calendly booking*",
    "",
    ...formatParamLines(params).map((line) => `*${line}*`),
    sourceUrl ? `\n*Source URL:* ${sourceUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  await sendBookingEmail({
    requestId,
    subject: buildSubject(params),
    text: emailText,
    replyTo: params.invitee_email || params.email,
  });

  try {
    await sendBookingSlack({
      requestId,
      text: slackText,
    });
  } catch (error) {
    console.error(`[${requestId}] Failed to send Slack notification`, error);
  }
}

export default async function handler(request) {
  const requestId = `booking-confirmed-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const url = new URL(request.url);

  console.log(`[${requestId}] Incoming booking-confirmed request`, {
    method: request.method,
    url: request.url,
  });

  if (request.method === "GET") {
    const params = parseParams(url);

    console.log(`[${requestId}] Parsed booking params`, {
      paramCount: Object.keys(params).length,
      keys: Object.keys(params),
    });

    if (!process.env.RESEND_API_KEY) {
      console.error(`[${requestId}] RESEND_API_KEY is missing`);
      return Response.redirect(buildConfirmationPageUrl(url.origin, params), 302);
    }

    if (Object.keys(params).length > 0) {
      try {
        await deliverBookingConfirmation({
          requestId,
          params,
          sourceUrl: request.url,
        });
        console.log(`[${requestId}] Booking confirmation delivered successfully`);
      } catch (error) {
        console.error(`[${requestId}] Failed to deliver booking confirmation`, error);
      }
    } else {
      console.warn(`[${requestId}] GET redirect arrived without booking params`);
    }

    return Response.redirect(buildConfirmationPageUrl(url.origin, params), 302);
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!process.env.RESEND_API_KEY) {
    console.error(`[${requestId}] RESEND_API_KEY is missing`);
    return new Response(JSON.stringify({ error: "Email delivery is not configured." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (error) {
    console.error(`[${requestId}] Failed to parse JSON body`, error);
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const params = parseParams(body?.params || {});
  const sourceUrl = str(body?.source_url);

  if (Object.keys(params).length === 0) {
    console.warn(`[${requestId}] No booking params received`);
    return new Response(JSON.stringify({ error: "Missing booking details." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    await deliverBookingConfirmation({
      requestId,
      params,
      sourceUrl: sourceUrl || request.url,
    });
  } catch (error) {
    console.error(`[${requestId}] Failed to deliver booking confirmation`, error);
    return new Response(JSON.stringify({ error: "Failed to send booking email." }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
