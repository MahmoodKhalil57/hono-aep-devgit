// Any-file editor. The page editor freezes the DOM because HTML is what the
// browser renders; stylesheets and scripts are just text, so they get a
// textarea — with live preview for CSS (the <link> is muted and a <style>
// mirror tracks every keystroke) — then the same diff → commit → deploy loop.
// readFile/writeFile are also exposed on window.devgit so a browser agent
// can update ANY repo file the token reaches, no UI required.
// (css/app.css pulls the other sheets in via @import, so only app.css edits
// preview live; add more via the `extraFiles` config array.)
import { changedCount, diffLines, renderDiff } from "./devgit-diff.js";
import { getFile, loadConfig, putFile, targets } from "./devgit-github.js";

const cfg = loadConfig();

// Repo-relative assets this page references — offered as suggestions.
export function localAssets() {
  const refs = [...document.querySelectorAll("link[rel='stylesheet'][href], script[src]")]
    .map((el) => el.getAttribute("href") ?? el.getAttribute("src"))
    .filter((url) => url && !/^(https?:)?\/\//.test(url))
    .map((url) => url.replace(/^\.\//, "").split("?")[0]);
  // the @import'd sheets are just as editable — surface them too
  return [...new Set([...refs, ...(loadConfig()?.extraFiles ?? [])])];
}

export async function readFile(path) {
  const files = await Promise.all(targets(cfg, path).map((t) => getFile(cfg, t.branch, t.path).catch(() => null)));
  if (!files[0]) throw new Error(`${targets(cfg, path)[0].label} not found in repo`);
  return { files, text: files[0].text };
}

export async function writeFile(path, text, message = `devgit: edit ${path} in the browser`, files) {
  files ??= (await readFile(path).catch(() => ({ files: [] }))).files;
  const links = [];
  for (const [index, target] of targets(cfg, path).entries()) {
    const commit = await putFile(cfg, target.branch, target.path, text, message, files?.[index]?.sha);
    links.push({ label: target.label, url: commit.html_url });
  }
  return links;
}

function livePreview(path, text) {
  const link = [...document.querySelectorAll("link[rel='stylesheet']")].find(
    (el) => (el.getAttribute("href") ?? "").replace(/^\.\//, "").split("?")[0] === path,
  );
  if (!link) return null;
  const mirror = document.createElement("style");
  mirror.setAttribute("data-devgit", "");
  mirror.textContent = text;
  link.after(mirror);
  link.disabled = true;
  return {
    update: (value) => {
      mirror.textContent = value;
    },
    stop: () => {
      mirror.remove();
      link.disabled = false;
    },
  };
}

// ui = { paint, status, panel, back } supplied by devgit.js.
export function paintFiles(ui) {
  const assets = localAssets();
  ui.paint(`<p class="dg-muted">Any file the token can reach — stylesheets preview live as you type.</p>
    <div class="dg-row"><input class="dg-input" style="flex:1;width:auto" list="devgit-files" data-path placeholder="css/site.css" value="${assets.find((p) => p.endsWith(".css")) ?? ""}"><datalist id="devgit-files">${assets.map((p) => `<option value="${p}">`).join("")}</datalist><button class="dg-btn dg-btn-warn" data-open>Open</button></div>
    <div data-status></div><button class="dg-btn-link" data-back>&larr; back</button>`);
  ui.panel.querySelector("[data-back]").addEventListener("click", ui.back);
  ui.panel.querySelector("[data-open]").addEventListener("click", () =>
    openEditor(
      ui,
      ui.panel
        .querySelector("[data-path]")
        .value.trim()
        .replace(/^\.?\//, ""),
    ).catch((error) => ui.status(error.message, false)),
  );
}

async function openEditor(ui, path) {
  ui.status(`fetching ${path}…`);
  const { files, text } = await readFile(path);
  const preview = path.endsWith(".css") ? livePreview(path, text) : null;
  ui.paint(`<p class="dg-muted"><code>${path}</code>${preview ? " — previewing live on this page" : ""}</p>
    <textarea class="dg-input" data-text rows="12" spellcheck="false"></textarea>
    <div data-diff></div><input class="dg-input" data-message placeholder="commit message"><div data-status></div>
    <div class="dg-row"><button class="dg-btn" data-review>Review diff</button><button class="dg-btn dg-btn-primary" data-push>Commit &amp; push</button><button class="dg-btn dg-btn-danger dg-end" data-discard>Discard</button></div>`);
  const area = ui.panel.querySelector("[data-text]");
  area.value = text;
  area.addEventListener("input", () => preview?.update(area.value));
  ui.panel.querySelector("[data-review]").addEventListener("click", () => {
    const ops = diffLines(text, area.value);
    ui.panel.querySelector("[data-diff]").replaceChildren(renderDiff(ops));
    const count = changedCount(ops);
    ui.status(count ? `${count} changed line${count === 1 ? "" : "s"}` : "no changes yet");
  });
  ui.panel.querySelector("[data-push]").addEventListener("click", async () => {
    try {
      if (area.value === text) return ui.status("no changes to commit");
      const message = ui.panel.querySelector("[data-message]").value || undefined;
      const links = await writeFile(path, area.value, message, files);
      preview?.stop();
      ui.status(
        `committed → ${links.map((l) => `<a href="${l.url}" target="_blank" rel="noreferrer">${l.label}</a>`).join(" · ")} — <a href="#" onclick="location.reload();return false">reload</a>`,
      );
    } catch (error) {
      ui.status(error.message, false);
    }
  });
  ui.panel.querySelector("[data-discard]").addEventListener("click", () => {
    preview?.stop();
    paintFiles(ui);
  });
}
