export const runtime = "edge";
export const config = {
  runtime: "edge",
};

const TO_EMAIL = process.env.BOOKING_EMAIL_TO || "book@maxim.run";
const RESEND_TIMEOUT_MS = 15000;
const SLACK_TIMEOUT_MS = 15000;
const MAX_PHOTO_COUNT = 5;
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_PHOTO_SIZE_BYTES = 18 * 1024 * 1024;

function str(value) {
  if (value == null) return "";
  return String(value).trim();
}

function readFirst(formData, keys) {
  for (const key of keys) {
    const value = str(formData.get(key));
    if (value) return value;
  }
  return "";
}

function getCalculatorDetailsLines(detailsRaw) {
  const details = str(detailsRaw);
  if (!details || details === "Not specified" || details === "Skipped calculator") {
    return [details || "Not specified"];
  }

  const segments = details
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (!segments.length) return [details];
  return segments;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function getStainPhotoSummaryLines({ photoCount, skippedPhotos }) {
  const attached = Number.isFinite(photoCount) ? photoCount : 0;
  const skipped = Number.isFinite(skippedPhotos) ? skippedPhotos : 0;

  if (attached <= 0 && skipped <= 0) {
    return ["Stain photos: none provided"];
  }

  if (attached > 0 && skipped <= 0) {
    return [`Stain photos: ${attached} attached`];
  }

  if (attached <= 0 && skipped > 0) {
    return [`Stain photos: ${skipped} skipped (file too large or unsupported)`];
  }

  return [
    `Stain photos: ${attached} attached`,
    `Stain photos: ${skipped} skipped (file too large or unsupported)`,
  ];
}

async function sendSlackBookingNotification({
  requestId,
  webhookUrl,
  bookingSource,
  clientName,
  clientEmail,
  clientMobile,
  clientAddress,
  preferredStart,
  preferredEnd,
  packageType,
  calculatorDetailsLines,
  photoCount,
  skippedPhotos,
}) {
  const normalizedWebhookUrl = str(webhookUrl).replace(/^['"]|['"]$/g, "");
  if (!normalizedWebhookUrl) {
    console.warn(`[${requestId}] SLACK_WEBHOOK_URL is missing, skipping Slack notification`);
    return;
  }

  const slackText = [
    ":rotating_light: *New booking request*",
    `*Source:* ${bookingSource}`,
    `*Name:* ${clientName}`,
    `*Email:* ${clientEmail}`,
    `*Phone:* ${clientMobile}`,
    `*Address:* ${clientAddress}`,
    `*Preferred from:* ${preferredStart}`,
    `*Preferred to:* ${preferredEnd}`,
    `*Package:* ${packageType}`,
    "*Calculator details:*",
    ...calculatorDetailsLines.map((line) => `• ${line}`),
    ...getStainPhotoSummaryLines({ photoCount, skippedPhotos }).map((line) => `*${line}*`),
  ].join("\n");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("Slack request timeout"), SLACK_TIMEOUT_MS);

  const payload = JSON.stringify({
    text: slackText,
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
}

export default async function handler(request) {
  const requestId = `booking-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  console.log(`[${requestId}] Incoming booking request`, {
    method: request.method,
    url: request.url,
  });

  if (request.method !== "POST") {
    console.warn(`[${requestId}] Rejected non-POST request`);
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!apiKey) {
    console.error(`[${requestId}] RESEND_API_KEY is missing`);
    return new Response(JSON.stringify({ error: "Email delivery is not configured." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const fromEmail =
    process.env.BOOKING_EMAIL_FROM || "Island Drift Detailing <hello@booking.maxim.run>;";

  let formData;
  try {
    formData = await request.formData();
  } catch (error) {
    console.error(`[${requestId}] Failed to parse form data`, error);
    return new Response(JSON.stringify({ error: "Invalid form data." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const bookingSource = str(formData.get("booking_source")) || "Website";
  const clientName = readFirst(formData, [
    "client_name",
    "contact_name",
    "name",
    "full_name",
  ]);
  const clientEmail = readFirst(formData, [
    "contact_email",
    "email",
    "client_email",
  ]);
  const clientMobile = readFirst(formData, [
    "contact_phone",
    "tel",
    "phone",
    "mobile",
    "client_mobile",
  ]);
  const clientAddress = str(formData.get("client_address"));
  const preferredStart = str(formData.get("preferred_start"));
  const preferredEnd = str(formData.get("preferred_end"));
  const packageType = str(formData.get("package_type")) || "Not specified";
  const calculatorDetails = str(formData.get("calculator_details")) || "Not specified";
  const calculatorDetailsLines = getCalculatorDetailsLines(calculatorDetails);

  if (!clientName || !clientEmail || !clientMobile || !clientAddress || !preferredStart || !preferredEnd || !packageType) {
    console.warn(`[${requestId}] Missing required fields`, {
      hasName: Boolean(clientName),
      hasEmail: Boolean(clientEmail),
      hasMobile: Boolean(clientMobile),
      hasAddress: Boolean(clientAddress),
      hasPreferredStart: Boolean(preferredStart),
      hasPreferredEnd: Boolean(preferredEnd),
      hasPackageType: Boolean(packageType),
    });
    return new Response(JSON.stringify({ error: "Missing required fields." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const emailSubject = `Booking request - ${packageType}`;
  const stainItems = formData.getAll("stain_photos");
  const attachments = [];
  let photoCount = 0;
  let totalPhotoBytes = 0;
  let skippedPhotos = Math.max(stainItems.length - MAX_PHOTO_COUNT, 0);

  if (stainItems.length > MAX_PHOTO_COUNT) {
    console.warn(`[${requestId}] Too many stain photos provided`, {
      provided: stainItems.length,
      max: MAX_PHOTO_COUNT,
    });
  }

  for (const item of stainItems.slice(0, MAX_PHOTO_COUNT)) {
    const hasArrayBuffer = item && typeof item.arrayBuffer === "function";
    const itemSize = Number(item && item.size);
    if (!hasArrayBuffer || !Number.isFinite(itemSize) || itemSize <= 0) {
      continue;
    }
    if (itemSize > MAX_PHOTO_SIZE_BYTES) {
      console.warn(`[${requestId}] Skipping photo larger than limit`, {
        filename: item && item.name,
        size: itemSize,
      });
      skippedPhotos += 1;
      continue;
    }
    if (totalPhotoBytes + itemSize > MAX_TOTAL_PHOTO_SIZE_BYTES) {
      console.warn(`[${requestId}] Skipping photo due to total attachment limit`, {
        filename: item && item.name,
        size: itemSize,
        totalPhotoBytes,
      });
      skippedPhotos += 1;
      continue;
    }
    photoCount += 1;
    totalPhotoBytes += itemSize;
    const buf = await item.arrayBuffer();
    const filename = str(item && item.name) || `photo-${photoCount}.jpg`;
    const contentType = str(item && item.type) || "application/octet-stream";
    attachments.push({
      filename,
      content: arrayBufferToBase64(buf),
      content_type: contentType,
    });
  }

  const emailBody = [
    `Booking source: ${bookingSource}`,
    `Name: ${clientName}`,
    `Email: ${clientEmail}`,
    `Mobile number: ${clientMobile}`,
    `Client address: ${clientAddress}`,
    `Preferred from: ${preferredStart}`,
    `Preferred to: ${preferredEnd}`,
    `Package type: ${packageType}`,
    "Price calculator details:",
    ...calculatorDetailsLines.map((line) => `  - ${line}`),
    ...getStainPhotoSummaryLines({ photoCount, skippedPhotos }),
  ].join("\n");

  const payload = {
    from: fromEmail,
    to: [TO_EMAIL],
    reply_to: [clientEmail],
    subject: emailSubject,
    text: emailBody,
  };

  if (attachments.length > 0) {
    payload.attachments = attachments;
  }

  console.log(`[${requestId}] Sending booking email`, {
    bookingSource,
    packageType,
    attachments: attachments.length,
    totalPhotoBytes,
    skippedPhotos,
  });

  let sendRes;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("Resend request timeout"), RESEND_TIMEOUT_MS);
  try {
    sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    if (error && error.name === "AbortError") {
      console.error(`[${requestId}] Resend request timed out`, {
        timeoutMs: RESEND_TIMEOUT_MS,
      });
      return new Response(
        JSON.stringify({
          error:
            "Email service took too long to respond. Please try again in a moment.",
        }),
        {
          status: 504,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    console.error(`[${requestId}] Could not reach Resend`, error);
    return new Response(JSON.stringify({ error: "Could not reach email service." }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!sendRes.ok) {
    let detail = "";
    try {
      const errJson = await sendRes.json();
      detail = errJson?.message || JSON.stringify(errJson);
    } catch {
      detail = await sendRes.text();
    }
    console.error(`[${requestId}] Resend error`, {
      status: sendRes.status,
      detail,
    });
    return new Response(JSON.stringify({ error: "Failed to send booking email." }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    await sendSlackBookingNotification({
      requestId,
      webhookUrl: slackWebhookUrl,
      bookingSource,
      clientName,
      clientEmail,
      clientMobile,
      clientAddress,
      preferredStart,
      preferredEnd,
      packageType,
      calculatorDetailsLines,
      photoCount,
      skippedPhotos,
    });
    console.log(`[${requestId}] Slack notification sent`);
  } catch (error) {
    console.error(`[${requestId}] Failed to send Slack notification`, error);
  }

  console.log(`[${requestId}] Booking email sent successfully`);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
