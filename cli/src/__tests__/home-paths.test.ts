import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  describeLocalInstancePaths,
  expandHomePrefix,
  resolveSubstaffHomeDir,
  resolveSubstaffInstanceId,
} from "../config/home.js";

const ORIGINAL_ENV = { ...process.env };

describe("home path resolution", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("defaults to ~/.substaff and default instance", () => {
    delete process.env.SUBSTAFF_HOME;
    delete process.env.SUBSTAFF_INSTANCE_ID;

    const paths = describeLocalInstancePaths();
    expect(paths.homeDir).toBe(path.resolve(os.homedir(), ".substaff"));
    expect(paths.instanceId).toBe("default");
    expect(paths.configPath).toBe(path.resolve(os.homedir(), ".substaff", "instances", "default", "config.json"));
  });

  it("supports SUBSTAFF_HOME and explicit instance ids", () => {
    process.env.SUBSTAFF_HOME = "~/substaff-home";

    const home = resolveSubstaffHomeDir();
    expect(home).toBe(path.resolve(os.homedir(), "substaff-home"));
    expect(resolveSubstaffInstanceId("dev_1")).toBe("dev_1");
  });

  it("rejects invalid instance ids", () => {
    expect(() => resolveSubstaffInstanceId("bad/id")).toThrow(/Invalid instance id/);
  });

  it("expands ~ prefixes", () => {
    expect(expandHomePrefix("~")).toBe(os.homedir());
    expect(expandHomePrefix("~/x/y")).toBe(path.resolve(os.homedir(), "x/y"));
  });
});
