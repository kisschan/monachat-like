import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("CI workflow", () => {
  it("runs the frontend test:ci script with CI enabled", async () => {
    expect.assertions(3);
    const workflowPath = path.resolve(__dirname, "../../../.github/workflows/ci.yml");
    const workflow = await readFile(workflowPath, "utf8");

    expect(workflow).toContain("name: Node.js CI");
    expect(workflow).toContain("test:ci");
    expect(workflow).toContain("CI: true");
  });
});
