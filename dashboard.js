(() => {
  "use strict";

  const KEYS = Object.freeze({
    theme: "smsd-theme-v5",
    accent: "smsd-accent-v5",
    layout: "smsd-layout-v5",
  });

  const DEFAULTS = Object.freeze({
    theme: "light",
    layout: "medium",
    accent: "#9687cf",
  });

const ALLOWED = Object.freeze({
  theme: new Set(["light", "dark", "midnight", "frost"]),
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

  const normalizeAccent = (hex) => {
    if (typeof hex !== "string") return null;
    const v = hex.trim();
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v : null;
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

    const storedTheme = read(KEYS.theme);
    const storedLayout = read(KEYS.layout);
    const storedAccent = read(KEYS.accent);

    const theme =
      (isValid("theme", storedTheme) && storedTheme) ||
      (isValid("theme", body.getAttribute("data-theme")) && body.getAttribute("data-theme")) ||
      DEFAULTS.theme;

    const layout =
      (isValid("layout", storedLayout) && storedLayout) ||
      (isValid("layout", body.getAttribute("data-layout")) && body.getAttribute("data-layout")) ||
      DEFAULTS.layout;

    const accent = normalizeAccent(storedAccent) || DEFAULTS.accent;

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
      }
    }

    // keep any controls on the page in sync
    syncControls({
      theme: body.getAttribute("data-theme") || DEFAULTS.theme,
      layout: body.getAttribute("data-layout") || DEFAULTS.layout,
      accent: normalizeAccent(read(KEYS.accent)) || DEFAULTS.accent,
    });
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

  document.addEventListener("DOMContentLoaded", apply);
})();

