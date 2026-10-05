/**
 * Les prises de vue de l'application (jeu fictif). Chaque prise : une adresse, une condition « prête », une mise en
 * place hors caméra, puis `frames` images à 30 i/s pendant lesquelles `at(f)` joue les gestes (souris, clavier, défilement).
 */
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** Déplacement de souris fluide entre deux points, de l'image f0 à l'image f1. */
async function glide(ctx, f, f0, f1, [x0, y0], [x1, y1]) {
  if (f < f0 || f > f1) return;
  const k = ease((f - f0) / Math.max(1, f1 - f0));
  await ctx.mouse.move(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k);
}
/** Défilement fluide de `dy` pixels entre f0 et f1. */
async function scroll(ctx, f, f0, f1, y0, y1) {
  if (f < f0 || f > f1) return;
  const k = ease((f - f0) / Math.max(1, f1 - f0));
  await ctx.page.evaluate((y) => window.scrollTo(0, y), y0 + (y1 - y0) * k);
}
const has = (sel) => `!!document.querySelector(${JSON.stringify(sel)})`;
async function scrollToSel(page, sel, offset = 0) {
  await page.evaluate(([s, o]) => { const el = document.querySelector(s); if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + o); }, [sel, offset]);
}
async function typeAt(ctx, f, f0, text, every = 3) {
  const i = (f - f0) / every;
  if (f >= f0 && Number.isInteger(i) && i < text.length) await ctx.keyboard.type(text[i]);
}

export const FUND = "155e77ed-09bd-519f-b072-47124ec183bc";

export const TAKES = {
  // L'accueil : la cité des revenus, ouverture cinématographique de l'application
  home: {
    url: "/", ready: has(".rv__scene canvas"), frames: 330,
    at: async (f, c) => { await glide(c, f, 0, 1, [1900, 1060], [1900, 1060]); },
  },
  // La ville des encours (Encours, partie I)
  ville: {
    cursor: true,
    url: "/encours", ready: has(".ecity__canvas canvas"), frames: 270,
    at: async (f, c) => { await glide(c, f, 120, 260, [1500, 700], [1150, 560]); },
  },
  // La courbe 3D des encours : granularité, fenêtre, lecture au curseur
  courbe: {
    cursor: true,
    url: "/encours", ready: has(".aum3d__canvas canvas"),
    setup: async ({ page }) => { await scrollToSel(page, ".aumc", -110); },
    frames: 390,
    at: async (f, c) => {
      if (f === 110) await c.page.getByRole("radio", { name: "3 ans" }).first().click();
      if (f === 170) await c.page.getByRole("radio", { name: "Par famille" }).first().click();
      if (f === 250) await c.page.getByRole("radio", { name: "Jour" }).first().click();
      await glide(c, f, 280, 385, [700, 760], [1500, 700]);
    },
  },
  // Distribution : le globe des autorisations, puis le Sankey des parcours
  globe: {
    cursor: true,
    url: "/distribution", ready: has(".globe__canvas canvas"),
    setup: async ({ page }) => { await scrollToSel(page, ".globe", -90); },
    frames: 240,
    at: async (f, c) => { await glide(c, f, 60, 230, [1200, 600], [980, 520]); },
  },
  sankey: {
    cursor: true,
    url: "/distribution", ready: has(".flow__canvas canvas"), warmClock: true,
    setup: async ({ page }) => { await scrollToSel(page, ".flow", -60); },
    frames: 240,
    at: async (f, c) => { await glide(c, f, 80, 230, [500, 640], [900, 600]); },
  },
  // Passif : les tours de porteurs par segment
  passif: {
    url: "/passif", ready: has(".pa-seg canvas"), warmClock: true,
    setup: async ({ page }) => { await scrollToSel(page, ".pa-seg", -140); },
    frames: 270,
  },
  // Comparateur : les trajectoires base 100 en relief, puis de face
  comparateur: {
    cursor: true,
    url: "/comparateur", ready: has(".cmp3d__canvas canvas"),
    setup: async ({ page }) => { await scrollToSel(page, ".cmp3d", -170); },
    frames: 330,
    at: async (f, c) => {
      await glide(c, f, 120, 210, [700, 650], [1300, 640]);
      if (f === 230) await c.page.getByRole("button", { name: "Vue de face" }).first().click();
    },
  },
  // La recherche : la palette (« / ») sur la fiche d'un fonds, puis une question à la fiche
  recherche: {
    cursor: true,
    url: `/fonds/${FUND}`, ready: has(".fund__ask input"), warmClock: true,
    frames: 360,
    at: async (f, c) => {
      if (f === 20) await c.keyboard.press("/");
      await typeAt(c, f, 34, "actions europe", 3);
      if (f === 150) await c.keyboard.press("Escape");
      if (f === 170) await c.page.locator(".fund__ask input").first().click();
      await typeAt(c, f, 182, "frais de gestion", 3);
    },
  },
  // La fiche fonds : descente rapide dans les sections
  fiche: {
    url: `/fonds/${FUND}`, ready: has(".fund__ask input"), warmClock: true,
    frames: 240,
    at: async (f, c) => { await scroll(c, f, 30, 230, 0, 5200); },
  },
};
