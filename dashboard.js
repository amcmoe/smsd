(() => {
  "use strict";

  const K = {
    theme: "smsd-theme-v5",
    accent: "smsd-accent-v5",
    layout: "smsd-layout-v5",
  };

  function setAccent(hex) {
    if (!hex) return;
    document.documentElement.style.setProperty("--accent", hex);
  }

  function pickDefaultLayoutIfUnset() {
    if (localStorage.getItem(K.layout)) return;
    const isMobile = window.matchMedia("(max-width: 720px)").matches;
    localStorage.setItem(K.layout, isMobile ? "compact" : "medium");
  }

  function applyPrefsToPage() {
    pickDefaultLayoutIfUnset();

    const theme = localStorage.getItem(K.theme) || document.body.getAttribute("data-theme") || "light";
    const layout = localStorage.getItem(K.layout) || document.body.getAttribute("data-layout") || "medium";
    const accent = localStorage.getItem(K.accent) || "#9687cf";

    document.body.setAttribute("data-theme", theme);
    document.body.setAttribute("data-layout", layout);
    setAccent(accent);

    // If this page has the picker controls, keep them synced too.
    const themeSelect = document.getElementById("themeSelect");
    const layoutSelect = document.getElementById("layoutSelect");
    const accentPicker = document.getElementById("accentPicker");

    if (themeSelect) themeSelect.value = theme;
    if (layoutSelect) layoutSelect.value = layout;
    if (accentPicker) accentPicker.value = accent;
  }

  // Expose a tiny helper in case you want it elsewhere
  window.SMSD_PREFS = {
    apply: applyPrefsToPage,
    setTheme(theme) {
      document.body.setAttribute("data-theme", theme);
      localStorage.setItem(K.theme, theme);
    },
    setLayout(layout) {
      document.body.setAttribute("data-layout", layout);
      localStorage.setItem(K.layout, layout);
    },
    setAccent(hex) {
      setAccent(hex);
      localStorage.setItem(K.accent, hex);
    },
    keys: K,
  };

  // Apply on load
  document.addEventListener("DOMContentLoaded", applyPrefsToPage);
})();
