(() => {
  "use strict";

  const KEYS = Object.freeze({
    theme: "smsd-theme-v5",
    accent: "smsd-accent-v5",
    accentByTheme: "smsd-accent-by-theme-v1",
    layout: "smsd-layout-v5",
  });

  const DEFAULTS = Object.freeze({
    theme: "light",
    layout: "medium",
    accent: "#9687cf",
  });

const ALLOWED = Object.freeze({
  theme: new Set(["light", "dark", "midnight", "chroma", "sunset"]),
  layout: new Set(["compact", "medium", "large"]),
});

  const qs = (id) => document.getElementById(id);

  const read = (key) => {
    try { return localStorage.getItem(key); } catch { return null; }
  };

  const write = (key, value) => {
    try { localStorage.setItem(key, value); } catch {}
  };

  const isValid = (kind, value) => ALLOWED[kind]?.has(value);

  const normalizeTheme = (value) => {
    if (value === "frost") return "chroma";
    return value;
  };

  const normalizeAccent = (hex) => {
    if (typeof hex !== "string") return null;
    const v = hex.trim();
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v : null;
  };

  const readJSON = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };

  const defaultAccentForTheme = (theme) => {
    if (theme === "dark") return "#5E81AC";
    if (theme === "chroma") return "#88c0d0";
    if (theme === "sunset") return "#f80278";
    return "#9687cf";
  };

  const setCSSAccent = (hex) => {
    document.documentElement.style.setProperty("--accent", hex);
  };

  const pickDefaultLayoutIfUnset = () => {
    if (read(KEYS.layout)) return;
    const isMobile = window.matchMedia("(max-width: 720px)").matches;
    write(KEYS.layout, isMobile ? "compact" : DEFAULTS.layout);
  };

  const getInitialPrefs = () => {
    const body = document.body;

    const storedTheme = normalizeTheme(read(KEYS.theme));
    const storedLayout = read(KEYS.layout);
    const storedAccent = read(KEYS.accent);
    const accentByTheme = readJSON(KEYS.accentByTheme, {});

   const theme =
     (isValid("theme", storedTheme) && storedTheme) ||
     DEFAULTS.theme;

    if (storedTheme === "chroma") write(KEYS.theme, "chroma");

    const layout =
      (isValid("layout", storedLayout) && storedLayout) ||
      (isValid("layout", body.getAttribute("data-layout")) && body.getAttribute("data-layout")) ||
      DEFAULTS.layout;

    const themeAccent = normalizeAccent(accentByTheme?.[theme]);
    const accent = themeAccent || normalizeAccent(storedAccent) || defaultAccentForTheme(theme);

    return { theme, layout, accent };
  };

  const syncControls = ({ theme, layout, accent }) => {
    const themeSelect = qs("themeSelect");
    const layoutSelect = qs("layoutSelect");
    const accentPicker = qs("accentPicker");

    if (themeSelect) themeSelect.value = theme;
    if (layoutSelect) layoutSelect.value = layout;
    if (accentPicker) accentPicker.value = accent;
  };

  const apply = () => {
    pickDefaultLayoutIfUnset();

    const body = document.body;
    const prefs = getInitialPrefs();

    body.setAttribute("data-theme", prefs.theme);
    body.setAttribute("data-layout", prefs.layout);
    setCSSAccent(prefs.accent);

    syncControls(prefs);
    return prefs;
  };

  const setPrefs = ({ theme, layout, accent } = {}) => {
    const body = document.body;

    if (theme && isValid("theme", theme)) {
      body.setAttribute("data-theme", theme);
      write(KEYS.theme, theme);
    }

    if (layout && isValid("layout", layout)) {
      body.setAttribute("data-layout", layout);
      write(KEYS.layout, layout);
    }

    if (accent) {
      const hex = normalizeAccent(accent);
      if (hex) {
        setCSSAccent(hex);
        write(KEYS.accent, hex);
        const currentTheme = body.getAttribute("data-theme") || DEFAULTS.theme;
        const accentByTheme = readJSON(KEYS.accentByTheme, {});
        accentByTheme[currentTheme] = hex;
        write(KEYS.accentByTheme, JSON.stringify(accentByTheme));
      }
    }

    // keep any controls on the page in sync
    syncControls({
      theme: body.getAttribute("data-theme") || DEFAULTS.theme,
      layout: body.getAttribute("data-layout") || DEFAULTS.layout,
      accent: normalizeAccent(read(KEYS.accent)) || DEFAULTS.accent,
    });
  };

  const setDotState = (dot, state, title) => {
    if (!dot) return;
    dot.classList.remove("is-checking", "is-up", "is-down", "is-unsupported");
    if (state === "checking") dot.classList.add("is-checking");
    if (state === "up") dot.classList.add("is-up");
    if (state === "down") dot.classList.add("is-down");
    if (state === "unsupported") dot.classList.add("is-unsupported");
    dot.setAttribute("title", title || "");
    dot.setAttribute("aria-label", title || "");
  };

  const probeSwitchHttp = async (ip) => {
    if (!ip) {
      return { state: "unsupported", title: "No IP address available" };
    }

    // Browsers block mixed-content probes when this page is loaded over HTTPS.
    if (window.location.protocol === "https:") {
      return { state: "unsupported", title: "Status check unavailable on HTTPS pages for HTTP switch URLs" };
    }

    const timeoutMs = 2800;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = `http://${ip}/?statusProbe=${Date.now()}`;
      await fetch(url, {
        method: "GET",
        mode: "no-cors",
        cache: "no-store",
        signal: controller.signal,
      });
      return { state: "up", title: "Reachable (HTTP probe succeeded)" };
    } catch (error) {
      if (error?.name === "AbortError") {
        return { state: "down", title: "Unreachable (request timed out)" };
      }
      return { state: "down", title: "Unreachable (network error)" };
    } finally {
      window.clearTimeout(timer);
    }
  };

  const initSwitchStatusDots = () => {
    const body = document.body;
    if (!body || !body.classList.contains("switch-page")) return;

    const rows = Array.from(document.querySelectorAll(".switch-list li"));
    rows.forEach(async (row) => {
      const ipNode = row.querySelector(".switch-ip");
      const nameNode = row.querySelector(".switch-name");
      if (!ipNode || !nameNode) return;

      const ip = (ipNode.textContent || "").trim();
      const dot = document.createElement("span");
      dot.className = "switch-status-dot is-checking";
      dot.setAttribute("role", "img");
      dot.setAttribute("aria-hidden", "false");
      dot.setAttribute("title", "Checking status...");
      row.insertBefore(dot, nameNode);

      const result = await probeSwitchHttp(ip);
      setDotState(dot, result.state, result.title);
    });
  };

  const initSwitchNameTooltips = () => {
    const body = document.body;
    if (!body || !body.classList.contains("switch-page")) return;

    const links = Array.from(document.querySelectorAll(".switch-name a"));
    if (!links.length) return;

    const tooltip = document.createElement("div");
    tooltip.className = "switch-name-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.setAttribute("aria-hidden", "true");
    document.body.appendChild(tooltip);

    const hideTooltip = () => {
      tooltip.classList.remove("is-visible");
      tooltip.setAttribute("aria-hidden", "true");
      tooltip.textContent = "";
    };

    const placeTooltip = (target) => {
      const rect = target.getBoundingClientRect();
      const ttRect = tooltip.getBoundingClientRect();
      const margin = 8;
      let left = rect.left;
      let top = rect.top - ttRect.height - margin;

      if (top < margin) top = rect.bottom + margin;
      if (left + ttRect.width > window.innerWidth - margin) {
        left = window.innerWidth - ttRect.width - margin;
      }
      if (left < margin) left = margin;

      tooltip.style.left = `${Math.round(left)}px`;
      tooltip.style.top = `${Math.round(top)}px`;
    };

    const showTooltip = (link) => {
      if (!link.classList.contains("is-truncated")) return;
      const fullName = link.dataset.fullName || link.textContent?.trim();
      if (!fullName) return;

      tooltip.textContent = fullName;
      tooltip.classList.add("is-visible");
      tooltip.setAttribute("aria-hidden", "false");
      placeTooltip(link);
    };

    const refreshTruncation = () => {
      links.forEach((link) => {
        const host = link.closest(".switch-name");
        if (!host) return;
        const isTruncated = host.scrollWidth > host.clientWidth + 1;
        link.classList.toggle("is-truncated", isTruncated);
        if (isTruncated) {
          link.dataset.fullName = link.textContent?.trim() || "";
        } else {
          delete link.dataset.fullName;
        }
      });
      hideTooltip();
    };

    links.forEach((link) => {
      link.addEventListener("mouseenter", () => showTooltip(link));
      link.addEventListener("mouseleave", hideTooltip);
      link.addEventListener("focus", () => showTooltip(link));
      link.addEventListener("blur", hideTooltip);
    });

    window.addEventListener("resize", refreshTruncation);
    window.addEventListener("scroll", hideTooltip, true);
    refreshTruncation();
  };

  // Public API (handy on switch pages too)
  window.SMSD_PREFS = Object.freeze({
    apply,
    setPrefs,
    setTheme: (theme) => setPrefs({ theme }),
    setLayout: (layout) => setPrefs({ layout }),
    setAccent: (accent) => setPrefs({ accent }),
    keys: KEYS,
    defaults: DEFAULTS,
  });

  document.addEventListener("DOMContentLoaded", () => {
    apply();
    initSwitchStatusDots();
    initSwitchNameTooltips();
  });
})();


