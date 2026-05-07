import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;

function vercelEnvToDd(envName) {
  if (envName === "production") return "prod";
  if (envName === "preview") return "preview";
  if (envName === "development") return "dev";
  return typeof envName === "string" && envName.trim() ? envName.trim() : "dev";
}

/** First 7 chars of commit: Vercel SHA in deploys, else local `git rev-parse`, else `local`. */
function getShortSha() {
  const fromVercel = (process.env.VERCEL_GIT_COMMIT_SHA || "").trim().slice(0, 7);
  if (fromVercel) return fromVercel;
  try {
    const sha = execSync("git rev-parse --short HEAD", {
      cwd: root,
      encoding: "utf8",
    }).trim();
    return sha.slice(0, 7) || "local";
  } catch {
    return "local";
  }
}

/**
 * Datadog env: Vercel sets VERCEL_ENV. Locally, npm sets NODE_ENV=production during `npm run build`,
 * so we must not use NODE_ENV as a fallback (it would wrongly tag builds as prod).
 * Optional override: DD_ENV or RUM_ENV.
 */
function resolveDdEnv() {
  const explicit = process.env.DD_ENV || process.env.RUM_ENV;
  if (explicit) return vercelEnvToDd(explicit);
  if (process.env.VERCEL_ENV) return vercelEnvToDd(process.env.VERCEL_ENV);
  return "dev";
}

const shortSha = getShortSha();

/** Browser RUM credentials: set in CI (e.g. Vercel env). Never commit generated datadog-rum-env.js. */
const applicationId =
  (process.env.RUM_APPLICATION_ID || process.env.DD_APPLICATION_ID || "").trim();
const clientToken =
  (
    process.env.RUM_APPLICATION_CLIENT_TOKEN
    || process.env.DD_CLIENT_TOKEN
    || ""
  ).trim();

if (process.env.VERCEL_ENV === "production" && (!applicationId || !clientToken)) {
  console.error(
    "Missing Datadog RUM credentials. Set RUM_APPLICATION_ID and RUM_APPLICATION_CLIENT_TOKEN "
      + "(or DD_APPLICATION_ID and DD_CLIENT_TOKEN) for production builds."
  );
  process.exit(1);
}

fs.writeFileSync(
  path.join(root, "build-info.json"),
  `${JSON.stringify({ shortSha })}\n`
);

const rumConfig = {
  applicationId,
  clientToken,
  service:
    process.env.DD_SERVICE
    || process.env.RUM_SERVICE_NAME
    || "cleaning-landing-page",
  ddEnv: resolveDdEnv(),
  version: shortSha || "local",
};

fs.writeFileSync(
  path.join(root, "datadog-rum-env.js"),
  `window.__DD_RUM_CONFIG__ = Object.freeze(${JSON.stringify(rumConfig)});\n`
);

execSync(
  "npx esbuild src/datadog-rum-init.js --bundle --minify --outfile=datadog-rum.bundle.js --format=esm --platform=browser",
  { cwd: root, stdio: "inherit" }
);
