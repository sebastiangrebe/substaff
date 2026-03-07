import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyDataDirOverride } from "../config/data-dir.js";

const ORIGINAL_ENV = { ...process.env };

describe("applyDataDirOverride", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.SUBSTAFF_HOME;
    delete process.env.SUBSTAFF_CONFIG;
    delete process.env.SUBSTAFF_CONTEXT;
    delete process.env.SUBSTAFF_INSTANCE_ID;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("sets SUBSTAFF_HOME and isolated default config/context paths", () => {
    const home = applyDataDirOverride({
      dataDir: "~/substaff-data",
      config: undefined,
      context: undefined,
    }, { hasConfigOption: true, hasContextOption: true });

    const expectedHome = path.resolve(os.homedir(), "substaff-data");
    expect(home).toBe(expectedHome);
    expect(process.env.SUBSTAFF_HOME).toBe(expectedHome);
    expect(process.env.SUBSTAFF_CONFIG).toBe(
      path.resolve(expectedHome, "instances", "default", "config.json"),
    );
    expect(process.env.SUBSTAFF_CONTEXT).toBe(path.resolve(expectedHome, "context.json"));
    expect(process.env.SUBSTAFF_INSTANCE_ID).toBe("default");
  });

  it("uses the provided instance id when deriving default config path", () => {
    const home = applyDataDirOverride({
      dataDir: "/tmp/substaff-alt",
      instance: "dev_1",
      config: undefined,
      context: undefined,
    }, { hasConfigOption: true, hasContextOption: true });

    expect(home).toBe(path.resolve("/tmp/substaff-alt"));
    expect(process.env.SUBSTAFF_INSTANCE_ID).toBe("dev_1");
    expect(process.env.SUBSTAFF_CONFIG).toBe(
      path.resolve("/tmp/substaff-alt", "instances", "dev_1", "config.json"),
    );
  });

  it("does not override explicit config/context settings", () => {
    process.env.SUBSTAFF_CONFIG = "/env/config.json";
    process.env.SUBSTAFF_CONTEXT = "/env/context.json";

    applyDataDirOverride({
      dataDir: "/tmp/substaff-alt",
      config: "/flag/config.json",
      context: "/flag/context.json",
    }, { hasConfigOption: true, hasContextOption: true });

    expect(process.env.SUBSTAFF_CONFIG).toBe("/env/config.json");
    expect(process.env.SUBSTAFF_CONTEXT).toBe("/env/context.json");
  });

  it("only applies defaults for options supported by the command", () => {
    applyDataDirOverride(
      {
        dataDir: "/tmp/substaff-alt",
      },
      { hasConfigOption: false, hasContextOption: false },
    );

    expect(process.env.SUBSTAFF_HOME).toBe(path.resolve("/tmp/substaff-alt"));
    expect(process.env.SUBSTAFF_CONFIG).toBeUndefined();
    expect(process.env.SUBSTAFF_CONTEXT).toBeUndefined();
  });
});
