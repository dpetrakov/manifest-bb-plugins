// Declared icons (bb 0.46 rail shows icons only): every "manifest/<name>" used by
// the app or the server is declared in package.json, and each SVG follows bb's
// rules — name [a-z0-9-], ≤ 32 KiB, no script/style/image/foreignObject, no on*
// attributes or external references, colour from currentColor.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  bb: { branding: { experimental_icons?: Record<string, string> } };
};
const declared = pkg.bb.branding.experimental_icons ?? {};

describe("declared icons", () => {
  it("covers every manifest/<name> in the code", () => {
    const used = new Set<string>();
    for (const f of ["app.tsx", "server.ts"]) {
      for (const m of readFileSync(join(root, f), "utf8").matchAll(/"manifest\/([a-z0-9-]+)"/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(0);
    for (const name of used) expect(declared, name).toHaveProperty(name);
  });

  it("are valid for bb", () => {
    for (const [name, file] of Object.entries(declared)) {
      expect(name).toMatch(/^[a-z0-9-]+$/);
      const svg = readFileSync(join(root, file), "utf8");
      expect(svg.length).toBeLessThanOrEqual(32 * 1024);
      expect(svg).toMatch(/^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      expect(svg).toContain('stroke="currentColor"');
      expect(svg).not.toMatch(/<(script|style|image|foreignObject)\b|\son[a-z]+=|href=|url\(/i);
    }
  });
});
