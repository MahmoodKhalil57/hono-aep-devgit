// Plain LCS line diff — pages here are ~50 lines, a DP table costs nothing.
export function diffLines(beforeText, afterText) {
  const a = beforeText.split("\n"),
    b = afterText.split("\n");
  const dp = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = []; // [type, line, aIndex, bIndex]
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      ops.push([" ", a[i], i, j]);
      i++;
      j++;
    } else if (j >= b.length || (i < a.length && dp[i + 1][j] >= dp[i][j + 1])) {
      ops.push(["-", a[i], i, -1]);
      i++;
    } else {
      ops.push(["+", b[j], -1, j]);
      j++;
    }
  }
  return ops;
}

// Serializing the DOM normalizes what the parser threw away (inter-tag
// whitespace, `disabled` → `disabled=""`, `</body>\n</html>` → one line).
// Re-anchor each serialized line to the span of source lines it stands for,
// so regions the edit never touched commit byte-identical to the file and
// the diff is only the real change.
export function mergeToSource(source, baseline, edited) {
  const src = source.split("\n");
  const spans = new Map(); // baseline line index → source lines it represents
  let pending = [];
  for (const [type, , ai, bi] of diffLines(source, baseline)) {
    if (type === "-") pending.push(src[ai]);
    else if (type === " ") {
      spans.set(bi, [...pending, src[ai]]);
      pending = [];
    }
    // a rewritten line (e.g. disabled → disabled="") owns its source original
    else spans.set(bi, pending.length ? [pending.shift()] : []);
  }
  const out = [];
  for (const [type, line, ai] of diffLines(baseline, edited)) {
    if (type === "+") out.push(line);
    else if (type === " ") out.push(...(spans.get(ai) ?? [line]));
  }
  return [...out, ...pending].join("\n");
}

export const changedCount = (ops) => ops.filter(([type]) => type !== " ").length;

// Unified-style render with long unchanged runs folded away.
export function renderDiff(ops, context = 2) {
  const pre = document.createElement("pre");
  pre.className = "devgit-diff";
  const keep = new Set();
  ops.forEach(([type], index) => {
    if (type === " ") return;
    for (let k = index - context; k <= index + context; k++) keep.add(k);
  });
  let folded = 0;
  const flush = () => {
    if (folded) pre.append(span("fold", `⋯ ${folded} unchanged line${folded === 1 ? "" : "s"}\n`));
    folded = 0;
  };
  ops.forEach(([type, line], index) => {
    if (type === " " && !keep.has(index)) {
      folded++;
      return;
    }
    flush();
    pre.append(span(type === "+" ? "add" : type === "-" ? "del" : "ctx", `${type} ${line}\n`));
  });
  flush();
  return pre;
}

const span = (kind, text) => {
  const el = document.createElement("span");
  el.className = `devgit-${kind}`;
  el.textContent = text;
  return el;
};
