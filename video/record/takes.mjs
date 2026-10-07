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

/** Frappe naturelle : un caractère toutes les 3 à 7 images (déterministe), une petite pause après les espaces. */
function naturalSchedule(f0, text, seed = 7) {
  const out = []; let t = f0, x = seed;
  for (const ch of text) { out.push(t); x = (x * 9301 + 49297) % 233280; t += 3 + Math.floor((x / 233280) * 5) + (ch === " " ? 3 : 0); }
  return out;
}
async function typeNatural(ctx, f, sched, text) { const i = sched.indexOf(f); if (i >= 0) await ctx.keyboard.type(text[i]); }

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
  // ---------------------------------------------------------------- film « Jasmine »
  // L'ouverture de l'accueil : le logo Jasmine se déplie, le mot s'écrit
  jhome: {
    url: "/", ready: has(".nx__mark svg"), frames: 210,
  },
  // Rubrique Fonds : un nom, puis une question directe → la fiche répond (frais de gestion)
  jcherche: {
    cursor: true,
    url: "/fonds", ready: has(".kbd__stage canvas"), warmClock: true,
    frames: 390,
    at: async (f, c) => {
      await glide(c, f, 0, 1, [1500, 820], [1500, 820]);
      if (f === 6) await c.page.locator(".kbd__bar input").focus();
      await typeAt(c, f, 16, "europe valeur", 3);
      if (f === 108) await c.keyboard.press("Escape");
      await typeAt(c, f, 122, "frais de gestion europe valeur", 2);
      await glide(c, f, 196, 236, [1500, 820], [1180, 330]);
      if (f === 246) await c.keyboard.press("Enter");
      await glide(c, f, 290, 340, [1180, 330], [1240, 760]);   // la souris s'écarte : la réponse reste dégagée
    },
  },
  // La fiche répond à tout : une question par mesure de musique (61,5 images)
  jfiche: {
    cursor: true,
    url: `/fonds/${FUND}`, ready: has(".fund__ask input"), warmClock: true,
    frames: 330,
    at: async (f, c) => {
      const ask = async (t0, q) => {
        if (f === t0) { await c.page.locator(".fund__ask input").first().focus(); await c.keyboard.press("Control+A"); await c.keyboard.press("Backspace"); }
        await typeAt(c, f, t0 + 2, q, 2);
      };
      await glide(c, f, 0, 1, [1000, 800], [1000, 800]);
      const Q = ["isin", "cut-off", "sfdr", "dépositaire", "gérant"];
      for (let i = 0; i < Q.length; i++) await ask(6 + Math.round(i * 61.538), Q[i]);
    },
  },
  // Export : Fonds · Product Info, packs de champs, style, téléchargement Excel — chaque clic sur un temps (15,385 images)
  jexport: {
    cursor: true,
    url: "/export", ready: has(".xpk__b"), warmClock: true,
    frames: 600,
    at: async (f, c) => {
      const T = (n) => Math.round(n * 15.385);
      const hop = async (n0, n1, p0, p1) => { await glide(c, f, T(n0), T(n1) - 4, p0, p1); if (f === T(n1)) await c.mouse.click(p1[0], p1[1]); };
      await hop(2, 5, [1500, 700], [400, 500]);
      await scroll(c, f, T(6), T(9), 0, 640);
      await hop(10, 13, [400, 500], [526, 122]);
      await hop(14, 17, [526, 122], [330, 214]);
      await hop(18, 20, [330, 214], [326, 311]);
      await hop(21, 23, [326, 311], [470, 354]);
      await hop(25, 28, [470, 354], [758, 882]);
      await hop(30, 33, [758, 882], [1544, 960]);
    },
  },
  // ---------------------------------------------------------------- film « Le matin » : cas pratique
  // Article 8, commercialisés en Italie, architecture ouverte, puis un gérant → la sélection
  msfdr: {
    cursor: true,
    url: "/fonds", ready: has(".kbd__stage canvas"), warmClock: true,
    frames: 330,
    at: async (f, c) => {
      await glide(c, f, 0, 1, [1500, 860], [1500, 860]);
      if (f === 4) await c.page.locator(".kbd__bar input").focus();
      await typeAt(c, f, 10, "article 8 italie architecture ouverte", 2);
      await typeAt(c, f, 124, " thomas delorme", 2);
      await glide(c, f, 160, 196, [1500, 860], [1180, 300]);
      if (f === 204) await c.keyboard.press("Enter");
      await glide(c, f, 230, 300, [1180, 300], [1700, 900]);
    },
  },
  // Les fonds qui rapportent le plus (accueil, section des revenus)
  mrank: {
    url: "/", ready: has(".nx__mark svg"), warmClock: true,
    setup: async ({ page, step }) => {
      for (let y = 0; y <= 10400; y += 400) { await page.evaluate((v) => window.scrollTo(0, v), y); await step(40); await page.waitForTimeout(30); }
      await scrollToSel(page, "#h-rank", -120);
      for (let i = 0; i < 6; i++) { await step(0); await page.waitForTimeout(80); }
    },
    frames: 180,
  },
  // Qui est investi dans Europe Valeur (passif nominatif, clients synthétiques)
  mcarnet: {
    cursor: true,
    url: "/passif", ready: has("#h-carnet"), warmClock: true,
    frames: 240,
    at: async (f, c) => {
      await glide(c, f, 0, 30, [1500, 700], [700, 338]);
      if (f === 34) await c.page.locator("input[placeholder^='Client']").first().click();
      await typeAt(c, f, 40, "europe valeur", 2);
      await glide(c, f, 90, 130, [700, 338], [600, 465]);
      if (f === 136) await c.mouse.click(600, 465);
      await glide(c, f, 150, 230, [600, 465], [1500, 900]);
    },
  },
  // Ce que rapporte le fonds (fiche Europe Valeur, en-tête)
  mrapporte: {
    cursor: true,
    url: `/fonds/${FUND}`, ready: has(".fund__ask input"), warmClock: true,
    frames: 150,
    at: async (f, c) => { await glide(c, f, 20, 110, [1700, 900], [1232, 470]); },
  },
  // ---------------------------------------------------------------- film « Le matin » : les plus beaux plans 3D
  mhome: { url: "/", ready: has(".nx__mark svg"), frames: 150 },
  mcity: {
    cursor: true,
    url: "/", ready: has(".nx__mark svg"), warmClock: true,
    setup: async ({ page, step }) => {
      await scrollToSel(page, ".c3__scene", -40);
      for (let i = 0; i < 200; i++) { await step(33); await page.waitForTimeout(40); if (await page.evaluate(() => !!document.querySelector(".c3__scene canvas"))) break; }
      for (let i = 0; i < 30; i++) { await step(33); await page.waitForTimeout(20); }
    },
    frames: 150,
    at: async (f, c) => { await glide(c, f, 0, 148, [700, 600], [1300, 520]); },
  },
  mville: {
    cursor: true,
    url: "/encours", ready: has(".ecity__canvas canvas"), warmClock: true, frames: 120,
    at: async (f, c) => { await glide(c, f, 0, 118, [1500, 720], [1050, 540]); },
  },
  mcourbe: {
    cursor: true,
    url: "/encours", ready: has(".aum3d__canvas canvas"), warmClock: true,
    setup: async ({ page }) => { await scrollToSel(page, ".aumc", -110); },
    frames: 120,
    at: async (f, c) => { await glide(c, f, 0, 118, [600, 760], [1500, 680]); },
  },
  mglobe: {
    cursor: true,
    url: "/distribution", ready: has(".globe__canvas canvas"), warmClock: true,
    setup: async ({ page }) => { await scrollToSel(page, ".globe", -90); },
    frames: 120,
    at: async (f, c) => { await glide(c, f, 0, 118, [1250, 620], [960, 500]); },
  },
  mpassif: {
    url: "/passif", ready: has(".pa-seg canvas"), warmClock: true,
    setup: async ({ page }) => { await scrollToSel(page, ".pa-seg", -140); },
    frames: 120,
  },
  mcomp: {
    cursor: true,
    url: "/comparateur", ready: has(".cmp3d__canvas canvas"), warmClock: true,
    setup: async ({ page }) => { await scrollToSel(page, ".cmp3d", -170); },
    frames: 120,
    at: async (f, c) => { await glide(c, f, 0, 118, [700, 650], [1300, 640]); },
  },
  mclavier: {
    url: "/fonds", ready: has(".kbd__stage canvas"), warmClock: true, frames: 90,
    at: async (f, c) => { if (f === 2) await c.page.locator(".kbd__bar input").focus(); await typeAt(c, f, 6, "jasmine", 3); },
  },
  // ---------------------------------------------------------------- « Le matin », version institutionnelle : frappe naturelle
  nfrais: {
    cursor: true,
    url: "/fonds", ready: has(".kbd__stage canvas"), warmClock: true,
    frames: 270,
    at: async (f, c) => {
      const q = "frais de gestion europe valeur", sc = naturalSchedule(18, q, 11);
      await glide(c, f, 0, 1, [1500, 860], [1500, 860]);
      if (f === 6) await c.page.locator(".kbd__bar input").focus();
      await typeNatural(c, f, sc, q);
      await glide(c, f, 168, 196, [1500, 860], [1180, 330]);
      if (f === 204) await c.keyboard.press("Enter");
      await glide(c, f, 220, 260, [1180, 330], [1300, 800]);
    },
  },
  ncutoff: {
    cursor: true,
    url: `/fonds/${FUND}`, ready: has(".fund__ask input"), warmClock: true,
    frames: 140,
    at: async (f, c) => {
      const q = "cut-off", sc = naturalSchedule(22, q, 5);
      await glide(c, f, 0, 16, [1300, 900], [560, 541]);
      if (f === 18) await c.page.locator(".fund__ask input").first().click();
      await typeNatural(c, f, sc, q);
      await glide(c, f, 80, 130, [560, 541], [1100, 800]);
    },
  },
  ncarnet: {
    cursor: true,
    url: "/passif", ready: has("#h-carnet"), warmClock: true,
    frames: 150,
    at: async (f, c) => {
      const q = "europe valeur", sc = naturalSchedule(16, q, 3);
      await glide(c, f, 0, 10, [1500, 700], [700, 338]);
      if (f === 12) await c.page.locator("input[placeholder^='Client']").first().click();
      await typeNatural(c, f, sc, q);
      await glide(c, f, 100, 140, [700, 338], [1500, 900]);
    },
  },
};
