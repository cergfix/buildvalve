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

  it("throws when max_age is below minimum (60)", () => {
    const yaml = validYaml.replace("max_age: 3600", "max_age: 10");
    vi.mocked(readFileSync).mockReturnValue(yaml);
    expect(() => loadConfig("/bad.yml")).toThrow("Invalid config");
  });

  it("accepts all valid provider types", () => {
    for (const type of ["saml", "github", "google", "gitlab", "local", "mock"]) {
      const yaml = validYaml.replace("type: mock", `type: ${type}`);
      vi.mocked(readFileSync).mockReturnValue(yaml);
      const config = loadConfig("/fake.yml");
      expect(config.auth.providers[0].type).toBe(type);
    }
  });

  it("parses config with local provider and users", () => {
    const yaml = `
gitlab:
  url: https://gitlab.example.com
  service_account_token: tok123
auth:
  providers:
    - type: local
      enabled: true
      label: Local
      users:
        - email: alice@co.com
          password: secret
          groups:
            - admins
        - email: bob@co.com
          password_hash: abc123def
session:
  secret: longenoughsecret
  max_age: 3600
projects:
  - id: 1
    name: P
    pipelines:
      - name: d
        ref: main
        variables: []
permissions:
  - users:
      - alice@co.com
    projects:
      - 1
`;
    vi.mocked(readFileSync).mockReturnValue(yaml);
    const config = loadConfig("/fake.yml");
    expect(config.auth.providers[0].type).toBe("local");
  });

  it("parses config with OAuth provider", () => {
    const yaml = `
gitlab:
  url: https://gitlab.example.com
  service_account_token: tok123
auth:
  providers:
    - type: github
      enabled: true
      label: GitHub
      client_id: gh-id
      client_secret: gh-secret
      callback_url: https://app.example.com/api/auth/github/callback
      scopes: "user:email read:org"
session:
  secret: longenoughsecret
  max_age: 3600
projects:
  - id: 1
    name: P
    pipelines:
      - name: d
        ref: main
        variables: []
permissions:
  - users:
      - test@test.com
    projects:
      - 1
`;
    vi.mocked(readFileSync).mockReturnValue(yaml);
    const config = loadConfig("/fake.yml");
    expect(config.auth.providers[0].type).toBe("github");
  });

  it("parses config with external_links", () => {
    const yaml = validYaml + `
external_links:
  - label: Grafana
    url: https://grafana.example.com
  - label: Wiki
    url: https://wiki.example.com
`;
    vi.mocked(readFileSync).mockReturnValue(yaml);
    const config = loadConfig("/fake.yml");
    expect(config.external_links).toHaveLength(2);
    expect(config.external_links![0]).toEqual({ label: "Grafana", url: "https://grafana.example.com" });
  });

  it("rejects external_links with missing required fields", () => {
    const yaml = validYaml + `
external_links:
  - label: No URL
`;
    vi.mocked(readFileSync).mockReturnValue(yaml);
    expect(() => loadConfig("/bad.yml")).toThrow("Invalid config");
  });

  it("uses default path /app/config/config.yml when no path provided", () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });
    expect(() => loadConfig()).toThrow("/app/config/config.yml");
  });
});
