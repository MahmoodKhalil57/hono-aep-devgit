// Edit-this-page → commit. No build step means the file IS the DOM, so in
// edit mode anything that can mutate the DOM — you, DevTools, a Claude
// browser extension — is editing the source. Review the line diff, push, and
// GitHub Pages serves the new commit. Loaded by chrome.js only when a
// developer has saved a token on dev.html; visitors never fetch this file.
// The UI is SELF-CONTAINED (own dg-* classes in the injected style): it must
// survive on a frozen page where no framework is awake.
import { changedCount, diffLines, mergeToSource, renderDiff } from "./devgit-diff.js";
import { paintFiles, readFile, writeFile } from "./devgit-files.js";
import { getFile, loadConfig, putFile, targets } from "./devgit-github.js";

const cfg = loadConfig();
const MARK = "data-devgit";
const state = { editing: false, files: [] }; // files[i] matches targets(cfg)[i]

const el = (tag, className, html) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  node.setAttribute(MARK, "");
  return node;
};

const style = el(
  "style",
  "",
  `
  .devgit-fab{position:fixed;bottom:1rem;left:1rem;z-index:2000;font-family:monospace;background:#1c1917;color:#faf6f0;border:none;border-radius:.375rem;padding:.5rem .75rem;cursor:pointer;box-shadow:0 .25rem .75rem rgba(0,0,0,.3)}
  .devgit-panel{position:fixed;bottom:4rem;left:1rem;z-index:2000;width:min(34rem,calc(100vw - 2rem));max-height:70vh;overflow:auto;background:var(--devgit-surface, #fdfaf5);color:var(--devgit-ink, #1c1917);border:1px solid var(--devgit-line, #d8d0c4);border-radius:.5rem;padding:.75rem;box-shadow:0 .5rem 1.5rem rgba(0,0,0,.25);font-size:.9rem}
  .devgit-panel .dg-stack{display:flex;flex-direction:column;gap:.5rem}
  .devgit-panel .dg-row{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
  .devgit-panel .dg-end{margin-inline-start:auto}
  .devgit-panel .dg-btn{font:inherit;font-size:.85rem;border-radius:.375rem;border:1px solid var(--devgit-line, #d8d0c4);background:transparent;color:inherit;padding:.3rem .6rem;cursor:pointer}
  .devgit-panel .dg-btn-primary{background:var(--devgit-accent, #d9482b);border-color:var(--devgit-accent, #d9482b);color:var(--devgit-accent-contrast, #fff)}
  .devgit-panel .dg-btn-warn{background:#f4c542;border-color:#f4c542;color:#1c1917}
  .devgit-panel .dg-btn-warn-outline{border-color:#c99700;color:inherit}
  .devgit-panel .dg-btn-danger{border-color:#b3261e;color:#b3261e}
  .devgit-panel .dg-btn-link{border:none;background:none;color:var(--devgit-accent, #d9482b);padding:0;cursor:pointer;font-size:.85rem}
  .devgit-panel .dg-input{font:inherit;font-size:.85rem;border:1px solid var(--devgit-line, #d8d0c4);border-radius:.375rem;padding:.3rem .5rem;background:transparent;color:inherit;width:100%;box-sizing:border-box}
  .devgit-panel .dg-alert{border-radius:.375rem;padding:.3rem .6rem;font-size:.85rem;border:1px solid}
  .devgit-panel .dg-alert-info{border-color:#7aa7d9;background:color-mix(in srgb,#7aa7d9 15%,transparent)}
  .devgit-panel .dg-alert-danger{border-color:#b3261e;background:color-mix(in srgb,#b3261e 12%,transparent)}
  .devgit-panel .dg-badge{font-size:.7rem;border-radius:999px;padding:.1em .6em;background:var(--devgit-line, #d8d0c4)}
  .devgit-panel .dg-badge-warn{background:#f4c542;color:#1c1917}
  .devgit-panel .dg-muted{opacity:.75;font-size:.85rem;margin:0}
  .devgit-diff{font-size:.75rem;line-height:1.5;background:rgba(128,128,128,.12);padding:.5rem;border-radius:.375rem;max-height:14rem;overflow:auto;margin:0}
  .devgit-add{color:#276749}.devgit-del{color:#b3261e}.devgit-fold{opacity:.5}
  .devgit-panel textarea{font-family:monospace;font-size:.75rem;line-height:1.45;white-space:pre;overflow-x:auto;min-height:12rem}
  [contenteditable="true"]:focus-visible{outline:2px dashed var(--devgit-accent, #d9482b);outline-offset:2px}`,
);
const fab = el("button", "devgit-fab", "&lt;/&gt;");
const panel = el("div", "devgit-panel", "");
panel.hidden = true;
panel.setAttribute("contenteditable", "false");
fab.addEventListener("click", () => {
  panel.hidden = !panel.hidden;
});

function paint(html) {
  panel.innerHTML = `<div class="dg-stack"><div class="dg-row"><strong style="font-family:monospace">devgit</strong><span class="dg-badge ${state.editing ? "dg-badge-warn" : ""}">${state.editing ? "editing" : "live"}</span></div>${html}</div>`;
  panel.hidden = false;
}

const status = (message, ok = true) => {
  const box = panel.querySelector("[data-status]");
  if (box) box.innerHTML = `<div class="dg-alert dg-alert-${ok ? "info" : "danger"}">${message}</div>`;
};

function paintHome() {
  paint(`<p class="dg-muted">Freeze this page and edit the DOM, or open any file in the repo (by hand, DevTools, or a browser agent), then commit the diff straight to GitHub. Configure on <a href="${cfg?.setupUrl ?? "./dev.html"}">the devgit setup page</a>.</p>
    <div data-status></div><div class="dg-row"><button class="dg-btn dg-btn-warn" data-edit>Edit this page</button><button class="dg-btn dg-btn-warn-outline" data-files>Edit css / js / any file</button></div>`);
  panel
    .querySelector("[data-edit]")
    .addEventListener("click", () => enterEdit().catch((error) => status(error.message, false)));
  panel
    .querySelector("[data-files]")
    .addEventListener("click", () => paintFiles({ paint, status, panel, back: paintHome }));
}

// Swap the live DOM for the pristine repo file: scripts come in inert (they
// were parsed by DOMParser), so nothing re-injects nav/cart — DOM ≡ file.
async function enterEdit() {
  status("fetching source from GitHub…");
  state.files = await Promise.all(targets(cfg).map((t) => getFile(cfg, t.branch, t.path).catch(() => null)));
  if (!state.files[0]) throw new Error(`${targets(cfg)[0].label} not found in repo`);
  const doc = new DOMParser().parseFromString(state.files[0].text, "text/html");
  document.replaceChild(document.adoptNode(doc.documentElement), document.documentElement);
  document.body.setAttribute("contenteditable", "true");
  state.editing = true;
  document.body.append(style, fab, panel);
  paintEditing();
}

function paintEditing() {
  paint(`<p class="dg-muted">Page frozen to <code>${targets(cfg)[0].label}</code> — scripts are inert, the DOM is the file. Click into the page to type, or let an agent rewrite it.</p>
    <div data-diff></div><input class="dg-input" data-message placeholder="commit message"><div data-status></div>
    <div class="dg-row"><button class="dg-btn" data-review>Review diff</button><button class="dg-btn dg-btn-primary" data-push>Commit &amp; push</button><button class="dg-btn dg-btn-danger dg-end" data-discard>Discard</button></div>`);
  panel.querySelector("[data-review]").addEventListener("click", review);
  panel
    .querySelector("[data-push]")
    .addEventListener("click", () => push().catch((error) => status(error.message, false)));
  panel.querySelector("[data-discard]").addEventListener("click", () => location.reload());
}

// The committed text is the serialized DOM minus devgit's own UI.
export function serializePage() {
  const clone = document.documentElement.cloneNode(true);
  clone.querySelectorAll(`[${MARK}]`).forEach((node) => node.remove());
  clone.querySelector("body")?.removeAttribute("contenteditable");
  return `<!doctype html>\n${clone.outerHTML}\n`;
}

// The commit text: DOM serialization with untouched regions re-anchored to
// the file's original bytes (see mergeToSource) — the diff is only the edit.
const committedText = () => mergeToSource(state.files[0].text, serializeBaseline(), serializePage());

function review() {
  const ops = diffLines(state.files[0].text, committedText());
  const count = changedCount(ops);
  const box = panel.querySelector("[data-diff]");
  box.replaceChildren(renderDiff(ops));
  status(count ? `${count} changed line${count === 1 ? "" : "s"}` : "no changes yet");
  return count;
}

async function push(message) {
  const edited = committedText();
  if (edited === state.files[0].text) {
    status("no changes to commit");
    return;
  }
  message ||=
    panel.querySelector("[data-message]")?.value ||
    `devgit: edit ${targets(cfg)[0].path.split("/").pop()} in the browser`;
  const links = [];
  for (const [index, target] of targets(cfg).entries()) {
    status(`pushing ${target.label}…`);
    const commit = await putFile(cfg, target.branch, target.path, edited, message, state.files[index]?.sha);
    links.push(`<a href="${commit.html_url}" target="_blank" rel="noreferrer">${target.label}</a>`);
  }
  status(`committed → ${links.join(" · ")} — <a href="#" onclick="location.reload();return false">reload</a>`);
}

// What the browser makes of the untouched file — parser normalization (rare
// in this hand-written, well-formed HTML) shouldn't read as "changes".
let baseline;
function serializeBaseline() {
  if (baseline === undefined) {
    const doc = new DOMParser().parseFromString(state.files[0].text, "text/html");
    baseline = `<!doctype html>\n${doc.documentElement.outerHTML}\n`;
  }
  return baseline;
}

if (cfg?.token) {
  document.body.append(style, fab, panel);
  paintHome();
  panel.hidden = true;
  // Console/agent hooks — page loop: devgit.enterEdit() → mutate DOM →
  // devgit.push("msg"); any file: await devgit.readFile("css/site.css")
  // then devgit.writeFile("css/site.css", newText, "msg").
  window.devgit = { enterEdit, serializePage, review, push, readFile, writeFile };
}
