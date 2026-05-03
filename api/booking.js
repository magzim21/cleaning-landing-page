export const runtime = "edge";
export const config = {
  runtime: "edge",
};

const TO_EMAIL = process.env.BOOKING_EMAIL_TO || "book@maxim.run";
const RESEND_TIMEOUT_MS = 15000;
const SLACK_TIMEOUT_MS = 8000;
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

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
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
  carModel,
  packageType,
  photoCount,
  skippedPhotos,
}) {
  if (!webhookUrl) {
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
    `*Car model:* ${carModel}`,
    `*Package:* ${packageType}`,
    `*Stain photos attached:* ${photoCount}`,
    `*Stain photos skipped:* ${skippedPhotos}`,
  ].join("\n");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("Slack request timeout"), SLACK_TIMEOUT_MS);

  try {
    const slackResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        text: slackText,
      }),
    });

    if (!slackResponse.ok) {
      const responseText = await slackResponse.text().catch(() => "");
      throw new Error(
        `Slack webhook returned ${slackResponse.status}${
          responseText ? `: ${responseText}` : ""
        }`
      );
    }
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Slack webhook timed out after ${SLACK_TIMEOUT_MS}ms`);
    }
    throw error;
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
  const carModel = str(formData.get("car_model"));
  const packageType = str(formData.get("package_type")) || "Not specified";

  if (!clientName || !clientEmail || !clientMobile || !clientAddress || !preferredStart || !preferredEnd || !carModel || !packageType) {
    console.warn(`[${requestId}] Missing required fields`, {
      hasName: Boolean(clientName),
      hasEmail: Boolean(clientEmail),
      hasMobile: Boolean(clientMobile),
      hasAddress: Boolean(clientAddress),
      hasPreferredStart: Boolean(preferredStart),
      hasPreferredEnd: Boolean(preferredEnd),
      hasCarModel: Boolean(carModel),
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
    if (!(item instanceof File) || item.size <= 0) continue;
    if (item.size > MAX_PHOTO_SIZE_BYTES) {
      console.warn(`[${requestId}] Skipping photo larger than limit`, {
        filename: item.name,
        size: item.size,
      });
      skippedPhotos += 1;
      continue;
    }
    if (totalPhotoBytes + item.size > MAX_TOTAL_PHOTO_SIZE_BYTES) {
      console.warn(`[${requestId}] Skipping photo due to total attachment limit`, {
        filename: item.name,
        size: item.size,
        totalPhotoBytes,
      });
      skippedPhotos += 1;
      continue;
    }
    photoCount += 1;
    totalPhotoBytes += item.size;
    const buf = await item.arrayBuffer();
    attachments.push({
      filename: item.name || "photo",
      content: arrayBufferToBase64(buf),
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
    `Car model: ${carModel}`,
    `Package type: ${packageType}`,
    `Stain photos attached: ${photoCount} file(s)`,
    `Stain photos skipped: ${skippedPhotos} file(s)`,
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
      carModel,
      packageType,
      photoCount,
      skippedPhotos,
    });
    console.log(`[${requestId}] Slack notification sent`);
  } catch (error) {
    console.error(`[${requestId}] Failed to send Slack notification`, error);
    return new Response(
      JSON.stringify({
        error:
          "Booking email was sent, but Slack notification failed. Please check server logs.",
      }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  console.log(`[${requestId}] Booking email sent successfully`);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
