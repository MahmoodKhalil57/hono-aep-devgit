# devgit — edit a deployed static site from its own browser tab

If a site has **no build step, the deployed file IS the source** — so the
browser can be the editor. devgit stores a fine-grained GitHub token in
`localStorage`, gives every page a `</>` button, and commits your edits
straight to the GitHub Contents API. No server anywhere in the loop; the
push is the deploy.

Works on any static site hosted from a GitHub repo. Nothing here is
specific to a framework, a CSS library, or a backend.

## Use it (no build)

```html
<script type="importmap">
  { "imports": { "devgit/": "https://cdn.jsdelivr.net/gh/MahmoodKhalil57/hono-aep-devgit@v0.1.0/src/" } }
</script>
<script type="module">
  // Visitors never pay for it: only load when a developer has configured it here.
  if (localStorage.getItem("devgit:config")) import("devgit/devgit.js");
</script>
```

Then write a small setup page that saves the config:

```js
import { saveConfig, repoInfo } from "devgit/devgit-github.js";

await repoInfo(cfg); // verifies the token + push permission first
saveConfig({
  token: "github_pat_…", // fine-grained: ONE repo, Contents: read/write
  owner: "you",
  repo: "your-site",
  branch: "main",
  sourceDir: "docs", // where the site lives in the repo ("" for root)
  deployBranch: "", // optional second commit, e.g. "gh-pages"
  setupUrl: "./dev.html", // link shown in the panel
  extraFiles: ["css/site.css"], // extra suggestions in the file picker
});
```

## The two loops

**Edit this page** — devgit re-renders the pristine repo file with scripts
inert. At that point **the DOM is the file**: type into it, use DevTools,
or let a browser agent rewrite it. Review the line diff, commit.

**Edit any file** — open any path the token can reach as text.
Stylesheets preview live on the page as you type.

Serialization is diff-safe: regions you never touched are re-anchored to
the file's original bytes, so the commit contains your edit and not the
parser's whitespace normalization.

## Agent hooks

```js
await devgit.enterEdit(); // freeze page to repo source
// …mutate the DOM…
await devgit.push("commit message");

const { text } = await devgit.readFile("css/site.css");
await devgit.writeFile("css/site.css", text + "\n/* hi */", "tweak");
```

## Clean URLs

Sites that serve `/products` for `products.html` (GitHub Pages does this
by default) never show the file name in the address bar. devgit maps back
to the file it must commit: an extensionless path becomes `<name>.html`,
a trailing slash becomes `index.html`.

## Security

The token lives in **this browser's** localStorage and is sent only to
`api.github.com`. Anyone with the browser profile — or an XSS on the
origin — can use it. That is precisely why it must be a fine-grained PAT
scoped to **one repository**, `Contents: read/write`, with the shortest
expiry you can live with. Never use a classic token.

## Theming

Four optional custom properties: `--devgit-surface`, `--devgit-ink`,
`--devgit-line`, `--devgit-accent` (+ `--devgit-accent-contrast`). The
panel is otherwise self-contained — it must survive on a frozen page
where no framework is awake.
