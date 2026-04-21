export const runtime = "edge";
export const config = {
  runtime: "edge",
};

const TO_EMAIL = "book@maxim.run";

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
  if (!apiKey) {
    console.error(`[${requestId}] RESEND_API_KEY is missing`);
    return new Response(JSON.stringify({ error: "Email delivery is not configured." }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const fromEmail =
    process.env.BOOKING_EMAIL_FROM || "Island Drift Detailing <onboarding@resend.dev>";

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

  if (!clientEmail || !clientMobile || !clientAddress || !preferredStart || !preferredEnd || !carModel || !packageType) {
    console.warn(`[${requestId}] Missing required fields`, {
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

  for (const item of stainItems) {
    if (!(item instanceof File) || item.size <= 0) continue;
    photoCount += 1;
    const buf = await item.arrayBuffer();
    attachments.push({
      filename: item.name || "photo",
      content: arrayBufferToBase64(buf),
    });
  }

  const emailBody = [
    `Booking source: ${bookingSource}`,
    `Email: ${clientEmail}`,
    `Mobile number: ${clientMobile}`,
    `Client address: ${clientAddress}`,
    `Preferred from: ${preferredStart}`,
    `Preferred to: ${preferredEnd}`,
    `Car model: ${carModel}`,
    `Package type: ${packageType}`,
    `Stain photos attached: ${photoCount} file(s)`,
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
  });

  let sendRes;
  try {
    sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error(`[${requestId}] Could not reach Resend`, error);
    return new Response(JSON.stringify({ error: "Could not reach email service." }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
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

  console.log(`[${requestId}] Booking email sent successfully`);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
