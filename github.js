// Lecture et écriture de recipes.json dans le dépôt GitHub, avec une clé d'accès personnelle
// (fine-grained token, droit « Contents : Read and write » sur ce seul dépôt).
// La clé reste dans le navigateur de chaque téléphone ; elle n'est jamais écrite dans le dépôt.

export const REPO = "Lemoa869121/Courses";
const FILE = "recipes.json";
const API = `https://api.github.com/repos/${REPO}/contents/${FILE}`;

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(String(b64).replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

export class GitHubError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

async function call(token, url, opts = {}) {
  let res;
  try {
    res = await fetch(url, {
      ...opts,
      cache: "no-store",
      headers: { "Accept": "application/vnd.github+json", "Authorization": `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", ...(opts.headers || {}) }
    });
  } catch (e) { throw new GitHubError("network", "Pas de connexion à GitHub"); }
  if (res.status === 401) throw new GitHubError("auth", "Clé GitHub refusée (invalide ou expirée)");
  if (res.status === 403 || res.status === 404) throw new GitHubError("forbidden", "La clé n'a pas le droit d'écrire dans le dépôt " + REPO);
  if (res.status === 409 || res.status === 422) throw new GitHubError("conflict", "Le fichier a changé entre-temps");
  if (!res.ok) throw new GitHubError("http", "Erreur GitHub " + res.status);
  return res.json();
}

// Lit les recettes du dépôt (version la plus récente, sans attendre la mise à jour du site).
export async function readRecipes(token) {
  const data = await call(token, API + "?ref=main&t=" + Date.now());
  const list = JSON.parse(b64decode(data.content || "") || "[]");
  return { recipes: Array.isArray(list) ? list : [], sha: data.sha };
}

// Applique une modification à la liste et l'enregistre (un commit). Réessaie si quelqu'un a écrit en même temps.
export async function updateRecipes(token, change, message) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { recipes, sha } = await readRecipes(token);
    const next = change(recipes.slice());
    const body = JSON.stringify({ message, content: b64encode(JSON.stringify(next, null, 2) + "\n"), sha, branch: "main" });
    try {
      await call(token, API, { method: "PUT", body, headers: { "Content-Type": "application/json" } });
      return next;
    } catch (e) {
      if (e.code !== "conflict" || attempt === 2) throw e;
    }
  }
}

// Vérifie que la clé peut écrire dans le dépôt.
export async function checkToken(token) {
  const repo = await call(token, `https://api.github.com/repos/${REPO}`);
  if (repo.permissions && !repo.permissions.push) throw new GitHubError("forbidden", "Cette clé peut lire le dépôt mais pas y écrire");
  return true;
}
