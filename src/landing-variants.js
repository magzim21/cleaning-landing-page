const LANDINGS = Object.freeze({
  "/used-car-reset": {
    id: "used_car_reset_v1",
    name: "Used Car Reset",
    eyebrow: "Used Car Reset · Comox Valley & Campbell River",
    headline: "Make your used car feel clean, fresh, and yours",
    lede: "A deep mobile interior reset for recently purchased vehicles—built to remove the previous owner's dirt, buildup, and everyday grime at your home or office.",
    price: "From $399 CAD",
    priceNote: "Deep interior resets start at $399 CAD. Final price depends on vehicle size and condition.",
    cta: "Book my used-car reset",
    bullets: ["Deep interior clean", "Seats, carpets, plastics, and touchpoints", "Mobile service at your location"],
    calendlyUrl: null,
  },
  "/odour-removal": {
    id: "odour_removal_v1",
    name: "Odour Removal",
    eyebrow: "Vehicle Odour Removal · Comox Valley & Campbell River",
    headline: "Get stubborn vehicle odours under control",
    lede: "A focused deep-clean for vehicles affected by smoke, pets, food, moisture, or lingering everyday smells—completed at your home or office.",
    price: "Services start at $399 CAD",
    priceNote: "Odour-removal services start at $399 CAD. Final price depends on vehicle size, condition, and the source of the odour.",
    cta: "Request an odour-removal booking",
    bullets: ["Source-focused interior cleaning", "Fabric, carpet, and hard-surface treatment", "Condition assessed before final pricing"],
    calendlyUrl: null,
  },
  "/sell-your-car": {
    id: "sell_your_car_v1",
    name: "Sell Your Car",
    eyebrow: "Pre-Sale Car Detailing · Comox Valley & Campbell River",
    headline: "Present a cleaner car before you list or trade it",
    lede: "A mobile pre-sale detail designed to improve the vehicle's first impression for photos, viewings, and trade-in appointments.",
    price: "From $449 CAD",
    priceNote: "Pre-sale detailing starts at $449 CAD. Final price depends on vehicle size and condition.",
    cta: "Book my pre-sale detail",
    bullets: ["Interior and exterior presentation reset", "Photo-ready finishing touches", "Mobile service before your listing or appraisal"],
    calendlyUrl: null,
  },
  "/work-truck-detailing": {
    id: "work_truck_detailing_v1",
    name: "Work Truck Detailing",
    eyebrow: "Mobile Work-Truck Detailing · Comox Valley & Campbell River",
    headline: "Get the work-truck cab back under control",
    lede: "A practical mobile deep-clean for dirt, dust, mud, food spills, and daily job-site buildup—without taking the truck to a waiting room.",
    price: "From $399 CAD",
    priceNote: "Work-truck interior detailing starts at $399 CAD. Final price depends on vehicle size and condition.",
    cta: "Book my work-truck detail",
    bullets: ["Cab-focused deep cleaning", "Seats, floors, storage areas, and touchpoints", "We bring water, power, and professional tools"],
    calendlyUrl: null,
  },
  "/family-car-reset": {
    id: "family_car_reset_v1",
    name: "Family Car Reset",
    eyebrow: "Family Car Reset · Comox Valley & Campbell River",
    headline: "Reset the family car without losing your weekend",
    lede: "A mobile interior refresh for crumbs, spills, pet hair, fingerprints, and the everyday mess that builds up around busy family life.",
    price: "From $349 CAD",
    priceNote: "Family-car interior resets start at $349 CAD. Final price depends on vehicle size and condition.",
    cta: "Book my family-car reset",
    bullets: ["Family-mess interior clean", "Seats, carpets, plastics, and cargo areas", "Convenient service at your home or office"],
    calendlyUrl: null,
  },
});

function normalizePath(pathname) {
  const normalized = String(pathname || "/").replace(/\/+$/, "");
  return normalized || "/";
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
  return element;
}

function upsertMeta(name, content) {
  let meta = document.querySelector(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = name;
    document.head.append(meta);
  }
  meta.content = content;
}

function appendLandingParams(rawUrl, landing) {
  if (!rawUrl) return rawUrl;
  try {
    const url = new URL(rawUrl, window.location.origin);
    url.searchParams.set("utm_source", url.searchParams.get("utm_source") || "google_ads");
    url.searchParams.set("utm_medium", url.searchParams.get("utm_medium") || "cpc");
    url.searchParams.set("utm_campaign", landing.id);
    url.searchParams.set("utm_content", normalizePath(window.location.pathname));
    return url.toString();
  } catch (_) {
    return rawUrl;
  }
}

function addHiddenField(form, name, value) {
  let field = form.querySelector(`input[name="${name}"]`);
  if (!field) {
    field = document.createElement("input");
    field.type = "hidden";
    field.name = name;
    form.append(field);
  }
  field.value = value;
}

function track(eventName, landing) {
  const params = {
    landing_id: landing.id,
    landing_variant: landing.name,
    landing_path: normalizePath(window.location.pathname),
  };
  if (typeof window.gtag === "function") {
    window.gtag("event", eventName, params);
  } else {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: eventName, ...params });
  }
}

function applyLanding(landing) {
  const path = normalizePath(window.location.pathname);
  window.__LANDING_VARIANT__ = Object.freeze({
    id: landing.id,
    name: landing.name,
    path,
  });

  document.documentElement.dataset.landingId = landing.id;
  document.title = `${landing.name} | Island Drift Detailing`;
  upsertMeta("description", `${landing.lede} ${landing.priceNote}`);

  setText(".hero .eyebrow", landing.eyebrow);
  setText(".hero h1", landing.headline);
  const lede = setText(".hero .hero-lede", landing.lede);

  const panel = document.createElement("div");
  panel.className = "landing-offer";
  panel.setAttribute("aria-label", `${landing.name} offer`);
  panel.innerHTML = `
    <p class="landing-offer__price"></p>
    <p class="landing-offer__note"></p>
    <ul class="landing-offer__bullets"></ul>
  `;
  panel.querySelector(".landing-offer__price").textContent = landing.price;
  panel.querySelector(".landing-offer__note").textContent = landing.priceNote;
  const list = panel.querySelector(".landing-offer__bullets");
  landing.bullets.forEach((bullet) => {
    const item = document.createElement("li");
    item.textContent = bullet;
    list.append(item);
  });
  if (lede) lede.insertAdjacentElement("afterend", panel);

  const style = document.createElement("style");
  style.textContent = `
    .landing-offer { margin: 1.25rem 0 1.5rem; padding: 1rem 1.1rem; border: 1px solid rgba(255,255,255,.22); border-radius: 16px; background: rgba(6,23,38,.72); backdrop-filter: blur(8px); }
    .landing-offer__price { margin: 0 0 .3rem; color: #fff; font-size: clamp(1.35rem, 3vw, 1.8rem); font-weight: 800; }
    .landing-offer__note { margin: 0; color: rgba(255,255,255,.9); line-height: 1.45; }
    .landing-offer__bullets { display: flex; flex-wrap: wrap; gap: .45rem 1rem; margin: .8rem 0 0; padding: 0; list-style: none; color: rgba(255,255,255,.92); font-size: .92rem; }
    .landing-offer__bullets li::before { content: "✓"; margin-right: .4rem; color: #7fe0d1; font-weight: 800; }
  `;
  document.head.append(style);

  document.querySelectorAll(".js-open-booking, [data-calendly-url]").forEach((trigger) => {
    trigger.dataset.bookingSource = `${landing.name} (${landing.id})`;
    const configuredUrl = landing.calendlyUrl || trigger.dataset.calendlyUrl;
    if (configuredUrl) trigger.dataset.calendlyUrl = appendLandingParams(configuredUrl, landing);
  });

  const primaryCta = document.querySelector(".hero .js-open-booking");
  if (primaryCta) primaryCta.textContent = landing.cta;

  document.querySelectorAll("form").forEach((form) => {
    addHiddenField(form, "landing_id", landing.id);
    addHiddenField(form, "landing_variant", landing.name);
    addHiddenField(form, "landing_path", path);
  });

  document.addEventListener(
    "click",
    (event) => {
      const trigger = event.target.closest(".js-open-booking, [data-calendly-url]");
      if (trigger) track("landing_cta_click", landing);
    },
    true
  );

  track("landing_variant_view", landing);
}

const landing = LANDINGS[normalizePath(window.location.pathname)];
if (landing) applyLanding(landing);

export { LANDINGS, normalizePath };
