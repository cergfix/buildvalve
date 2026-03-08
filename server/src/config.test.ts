import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadConfig } from "./config.js";
import { readFileSync } from "node:fs";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

const validYaml = `
gitlab:
  url: https://gitlab.example.com
  service_account_token: tok123
auth:
  providers:
    - type: mock
      enabled: true
      label: Mock
      mock_user:
        email: test@test.com
        username: tester
session:
  secret: longenoughsecret
  max_age: 3600
projects:
  - id: 1
    name: My Project
    pipelines:
      - name: deploy
        ref: main
        variables:
          - key: ENV
            value: staging
            locked: false
permissions:
  - users:
      - test@test.com
    projects:
      - 1
`;

describe("loadConfig", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses valid YAML config", () => {
    vi.mocked(readFileSync).mockReturnValue(validYaml);
    const config = loadConfig("/fake/path.yml");
    expect(config.gitlab.url).toBe("https://gitlab.example.com");
    expect(config.projects).toHaveLength(1);
    expect(config.permissions).toHaveLength(1);
  });

  it("throws on missing file", () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });
    expect(() => loadConfig("/missing.yml")).toThrow("Cannot read config file");
  });

  it("throws on invalid schema - missing required fields", () => {
    vi.mocked(readFileSync).mockReturnValue("gitlab:\n  url: test\n");
    expect(() => loadConfig("/bad.yml")).toThrow("Invalid config");
  });

  it("throws on invalid session secret (too short)", () => {
    const yaml = validYaml.replace("longenoughsecret", "short");
    vi.mocked(readFileSync).mockReturnValue(yaml);
    expect(() => loadConfig("/bad.yml")).toThrow("Invalid config");
  });

  it("throws on invalid auth provider type", () => {
    const yaml = validYaml.replace("type: mock", "type: invalid");
    vi.mocked(readFileSync).mockReturnValue(yaml);
    expect(() => loadConfig("/bad.yml")).toThrow("Invalid config");
  });
});
