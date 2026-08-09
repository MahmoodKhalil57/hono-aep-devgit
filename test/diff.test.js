import { expect, test } from "bun:test";
import { changedCount, diffLines, mergeToSource } from "../src/devgit-diff.js";

test("diffLines marks insertions, deletions and context", () => {
  const ops = diffLines("a\nb\nc", "a\nB\nc");
  expect(ops.filter(([t]) => t === "-").map(([, line]) => line)).toEqual(["b"]);
  expect(ops.filter(([t]) => t === "+").map(([, line]) => line)).toEqual(["B"]);
  expect(changedCount(ops)).toBe(2);
});

test("identical input has no changes", () => {
  expect(changedCount(diffLines("x\ny", "x\ny"))).toBe(0);
});

// The point of mergeToSource: the browser's serialization of an untouched
// file differs cosmetically from the bytes on disk (attribute quoting,
// inter-tag whitespace). Regions the edit never touched must commit
// byte-identical, so the diff shows the edit and nothing else.
test("untouched regions keep their ORIGINAL bytes, not the serialized form", () => {
  const source = '<p class=greeting>hello</p>\n<p>keep</p>\n';
  const baseline = '<p class="greeting">hello</p>\n<p>keep</p>\n'; // parser-normalized
  const edited = '<p class="greeting">HELLO</p>\n<p>keep</p>\n'; // the real edit
  const merged = mergeToSource(source, baseline, edited);
  expect(merged).toContain("HELLO"); // the edit survives
  expect(merged).toContain("<p>keep</p>"); // untouched line unchanged
});

test("an edit-free round trip reproduces the source exactly", () => {
  const source = "<h1>title</h1>\n<p>body</p>\n";
  expect(mergeToSource(source, source, source)).toBe(source);
});
