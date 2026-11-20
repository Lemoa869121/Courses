// Lecture d'une recette depuis un PDF (format des exports WeChef, et PDF simples du même genre).
// Aucune dépendance au DOM : testable dans Node.

const UNIT_MAP = [
  [/^(g|gr|grs|gramme?s?)$/i, "g"],
  [/^(kg|kilos?|kilogramme?s?)$/i, "kg"],
  [/^(ml|millilitre?s?)$/i, "ml"],
  [/^(cl|centilitre?s?)$/i, "cl"],
  [/^(l|litre?s?)$/i, "l"],
  [/^(cs|c\.?s\.?|c\.? ?à ?s\.?|cuill[eè]res? à soupe|cuil\.? à soupe)$/i, "c. à s."],
  [/^(cc|c\.?c\.?|c\.? ?à ?c\.?|cuill[eè]res? à caf[ée]|cuil\.? à caf[ée])$/i, "c. à c."],
  [/^pinc[ée]es?$/i, "pincée"],
  [/^gousses?$/i, "gousse"],
  [/^tranches?$/i, "tranche"],
  [/^bottes?$/i, "botte"],
  [/^sachets?$/i, "sachet"],
  [/^bo[iî]tes?$/i, "boîte"],
  [/^pots?$/i, "pot"],
  [/^paquets?$/i, "paquet"],
  [/^pi[eè]ces?$/i, "pièce"],
];
// Unités vagues : on garde l'ingrédient sans quantité (« selon besoin »).
const VAGUE = /^(sprays?|filets?|traits?|brins?|poign[ée]es?|noix|noisettes?|zestes?|feuilles?|morceaux?|tiges?|branches?|bouquets?|verres?|tasses?|bols?|louches?)$/i;
const FRACTIONS = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };

function toNumber(s) {
  s = s.trim();
  if (FRACTIONS[s] !== undefined) return FRACTIONS[s];
  let m = s.match(/^(\d+)\s*([½¼¾⅓⅔])$/);
  if (m) return +m[1] + FRACTIONS[m[2]];
  m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m) return +m[1] / +m[2];
  m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (m) return +m[1] + +m[2] / +m[3];
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? null : n;
}

const clean = s => s.replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();
const stripDe = s => s.replace(/^(de la |de l'|des |du |de |d')/i, "").trim();

export function parseIngredient(raw) {
  let s = clean(raw).replace(/^[-•·*]\s*/, "");
  if (!s) return null;
  const QTY = "(\\d+(?:[.,]\\d+)?(?:\\s*\\/\\s*\\d+)?(?:\\s*[½¼¾⅓⅔])?|[½¼¾⅓⅔])";
  let m = s.match(new RegExp("^" + QTY + "\\s*(.*)$"));
  if (!m) return { name: stripDe(s), qty: null, unit: "" };
  let qty = toNumber(m[1]);
  let rest = m[2].trim();
  // Unité : 1 à 4 mots (« c. à s. », « cuillère à soupe »…), collée ou non (« 100g »)
  const words = rest.split(" ");
  for (let n = Math.min(4, words.length - 1); n >= 1; n--) {
    const cand = words.slice(0, n).join(" ");
    const hit = UNIT_MAP.find(([re]) => re.test(cand));
    if (hit) return { name: stripDe(words.slice(n).join(" ")) || cand, qty, unit: hit[1] };
    if (n === 1 && VAGUE.test(cand)) return { name: stripDe(words.slice(1).join(" ")), qty: null, unit: "" };
  }
  return { name: stripDe(rest), qty, unit: "" };
}

// Regroupe les morceaux de texte d'une page en lignes (même hauteur), triées de haut en bas.
function toLines(items) {
  const lines = [];
  for (const it of items) {
    const line = lines.find(l => Math.abs(l.y - it.y) < 2.5);
    if (line) line.items.push(it); else lines.push({ y: it.y, items: [it] });
  }
  lines.sort((a, b) => b.y - a.y);
  for (const l of lines) l.items.sort((a, b) => a.x - b.x);
  return lines;
}

const SECTION = {
  ingredients: /^ingr[ée]dients?\s*:?$/i,
  steps: /^(instructions?|pr[ée]paration|[ée]tapes?|recette)\s*:?$/i,
  notes: /^(notes?|astuces?|conseils?)\s*:?$/i,
};

export async function extractItems(pdfjs, data) {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const pages = [];
  for (let p = 1; p <= Math.min(doc.numPages, 10); p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    pages.push(tc.items.filter(i => i.str && i.str.trim()).map(i => ({
      str: i.str, x: i.transform[4], y: i.transform[5], h: i.height || Math.abs(i.transform[3])
    })));
  }
  return pages;
}

export function parseRecipeItems(pages) {
  const recipe = { name: "", servings: null, prepTime: null, ingredients: [], steps: [], notes: "" };
  const all = pages.flat();
  if (!all.length) throw new Error("vide");
  // Titre : le plus grand texte de la première page
  const first = pages[0];
  const maxH = Math.max(...first.map(i => i.h));
  recipe.name = clean(first.filter(i => i.h >= maxH - 0.5).sort((a, b) => b.y - a.y || a.x - b.x).map(i => i.str).join(" "));

  // En-tête (PRÉPARATION / CUISSON / PORTIONS) : la valeur est juste en dessous de l'étiquette
  const below = lab => first.filter(i => Math.abs(i.x - lab.x) < 6 && i.y < lab.y && lab.y - i.y < 30).sort((a, b) => b.y - a.y)[0];
  const minutes = s => { if (!s) return 0; const h = s.match(/(\d+)\s*h/i), m = s.match(/(\d+)\s*min/i);
    return (h ? +h[1] * 60 : 0) + (m ? +m[1] : (!h && /^\d+$/.test(s.trim()) ? +s : 0)); };
  let total = 0;
  for (const lab of first) {
    const t = norm(lab.str);
    const v = below(lab);
    if (!v) continue;
    if (/^(preparation|cuisson|repos|temps total)$/.test(t)) total += minutes(v.str);
    if (/^(portions?|personnes?|parts?)$/.test(t)) recipe.servings = parseInt(v.str) || null;
  }
  if (total) recipe.prepTime = total;

  // Sections, page par page
  let section = null, step = null;
  const ingLines = [], noteLines = [];
  for (const page of pages) {
    for (const line of toLines(page)) {
      const text = clean(line.items.map(i => i.str).join(" "));
      const key = Object.keys(SECTION).find(k => SECTION[k].test(text));
      if (key) { section = key; continue; }
      if (section === "ingredients") {
        // Colonnes : chaque morceau éloigné horizontalement est un ingrédient distinct
        let cur = null;
        for (const it of line.items) {
          if (cur && it.x - cur.end < 25) { cur.str += " " + it.str; cur.end = it.x + it.str.length * 5; }
          else { cur = { str: it.str, x: it.x, end: it.x + it.str.length * 5 }; ingLines.push(cur); }
        }
      } else if (section === "steps") {
        const m = text.match(/^(\d+)\s*[.)-]\s*(.*)$/);
        if (m) { step = m[2]; recipe.steps.push(step); }
        else if (recipe.steps.length) recipe.steps[recipe.steps.length - 1] += " " + text;
        else recipe.steps.push(text);
      } else if (section === "notes") noteLines.push(text);
      else if (!recipe.servings) {
        const m = text.match(/pour\s+(\d+)\s+(personnes?|parts?|portions?)/i);
        if (m) recipe.servings = +m[1];
      }
    }
  }
  // Ordre de lecture : colonne de gauche puis colonne de droite ? WeChef remplit ligne par ligne,
  // on garde donc l'ordre ligne par ligne.
  recipe.ingredients = ingLines.map(l => parseIngredient(l.str)).filter(i => i && i.name);
  recipe.steps = recipe.steps.map(clean).filter(Boolean);
  recipe.notes = noteLines.join("\n");
  if (!recipe.servings) recipe.servings = 4;
  return recipe;
}

function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim(); }
