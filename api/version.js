export const runtime = "edge";

export default function handler(request) {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        Allow: "GET",
      },
    });
  }

  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || "";
  const shortSha = commitSha ? commitSha.slice(0, 7) : null;

  return new Response(
    JSON.stringify({
      commitSha: commitSha || null,
      shortSha,
      generatedBy: "vercel",
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    }
  );
}
