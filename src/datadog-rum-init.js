import { datadogRum } from "@datadog/browser-rum";

const cfg = typeof window !== "undefined" ? window.__DD_RUM_CONFIG__ : null;

if (cfg?.applicationId && cfg?.clientToken) {
  datadogRum.init({
    applicationId: cfg.applicationId,
    clientToken: cfg.clientToken,
    site: "us5.datadoghq.com",
    service: cfg.service,
    env: cfg.ddEnv,
    version: cfg.version,
    sessionSampleRate: 100,
    sessionReplaySampleRate: 100,
    trackResources: true,
    trackUserInteractions: true,
    trackLongTasks: true,
  });
}
