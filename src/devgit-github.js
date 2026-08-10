// GitHub Contents API straight from the browser — no server, no build step.
// The developer's fine-grained PAT (ONE repo, Contents: read/write, short
// expiry) lives in this browser's localStorage; api.github.com allows CORS,
// so a commit is a single authenticated PUT. Set it up on dev.html.
const KEY = "devgit:config";

export const loadConfig = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
};
export const saveConfig = (cfg) => localStorage.setItem(KEY, JSON.stringify(cfg));
export const clearConfig = () => localStorage.removeItem(KEY);

async function api(cfg, path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${data.message ?? res.statusText}`);
  return data;
}

// Validates the token; also tells us the default branch + push permission.
export const repoInfo = (cfg) => api(cfg, `/repos/${cfg.owner}/${cfg.repo}`);

export async function getFile(cfg, branch, path) {
  const data = await api(
    cfg,
    `/repos/${cfg.owner}/${cfg.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`,
  );
  return { sha: data.sha, text: fromBase64(data.content) };
}

export async function putFile(cfg, branch, path, text, message, sha) {
  const body = { message, branch, content: toBase64(text), ...(sha ? { sha } : {}) };
  const data = await api(cfg, `/repos/${cfg.owner}/${cfg.repo}/contents/${encodePath(path)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return data.commit; // { sha, html_url }
}

const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");
const toBase64 = (text) => {
  let bin = "";
  for (const byte of new TextEncoder().encode(text)) bin += String.fromCharCode(byte);
  return btoa(bin);
};
const fromBase64 = (b64) =>
  new TextDecoder().decode(Uint8Array.from(atob(b64.replaceAll("\n", "")), (c) => c.charCodeAt(0)));

// The site is flat, so this page's file is the last path segment.
// Clean URLs (/products serving products.html) are the norm on GitHub
// Pages, so the address bar rarely carries the file name. Map back to the
// file we must commit to: no extension means <name>.html, and a trailing
// slash means index.html.
export const pageFile = () => {
  const last = decodeURIComponent(location.pathname.split("/").pop() ?? "");
  if (!last) return "index.html";
  return last.includes(".") ? last : `${last}.html`;
};

// Where an edit lands: the source branch (under sourceDir/) and — when
// configured — the deploy branch, whose root IS the GitHub Pages site root,
// so that second commit is the deploy. `file` is any site-relative path
// (defaults to the current page): "css/site.css", "js/store.js", …
export function targets(cfg, file = pageFile()) {
  const list = [{ branch: cfg.branch, path: cfg.sourceDir ? `${cfg.sourceDir}/${file}` : file }];
  if (cfg.deployBranch && cfg.deployBranch !== cfg.branch) list.push({ branch: cfg.deployBranch, path: file });
  return list.map((t) => ({ ...t, label: `${t.branch}:${t.path}` }));
}
