import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadConfig } from "./config.js";
import { readFileSync } from "node:fs";

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

const validYaml = `
ci_providers:
  - name: default
    type: gitlab
    url: https://gitlab.example.com
    token: tok123
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
    provider: default
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

const multiProviderYaml = `
ci_providers:
  - name: gitlab-corp
    type: gitlab
    url: https://gitlab.example.com
    token: tok123
  - name: github-oss
    type: github-actions
    github_token: ghp-test
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
  - id: "42"
    name: GitLab Project
    provider: gitlab-corp
    external_id: "42"
    pipelines:
      - name: deploy
        ref: main
        variables: []
  - id: my-frontend
    name: GitHub Project
    provider: github-oss
    external_id: myorg/frontend
    pipelines:
      - name: build
        ref: main
        workflow_id: ci.yml
        variables: []
permissions:
  - users:
      - test@test.com
    projects:
      - "42"
      - my-frontend
`;

describe("loadConfig", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses valid YAML config with ci_providers", () => {
    vi.mocked(readFileSync).mockReturnValue(validYaml);
    const config = loadConfig("/fake/path.yml");
    expect(config.ci_providers).toHaveLength(1);
    expect(config.ci_providers[0].name).toBe("default");
    expect(config.ci_providers[0].type).toBe("gitlab");
    // Numeric IDs normalized to strings
    expect(config.projects[0].id).toBe("1");
    expect(config.projects[0].provider).toBe("default");
    expect(config.projects[0].external_id).toBe("1");
    expect(config.permissions[0].projects[0]).toBe("1");
  });

  it("rejects config without ci_providers", () => {
    const yaml = `
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
  - id: "1"
    name: P
    provider: default
    pipelines:
      - name: d
        ref: main
        variables: []
permissions:
  - users: [test@test.com]
    projects: ["1"]
`;
    vi.mocked(readFileSync).mockReturnValue(yaml);
    expect(() => loadConfig("/bad.yml")).toThrow("Invalid config");
  });

  it("rejects project without provider field", () => {
    const yaml = `
ci_providers:
  - name: default
    type: gitlab
    url: https://gitlab.example.com
    token: tok123
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
  - id: "1"
    name: P
    pipelines:
      - name: d
        ref: main
        variables: []
permissions:
  - users: [test@test.com]
    projects: ["1"]
`;
    vi.mocked(readFileSync).mockReturnValue(yaml);
    expect(() => loadConfig("/bad.yml")).toThrow("Invalid config");
  });

  it("parses multi-provider config", () => {
    vi.mocked(readFileSync).mockReturnValue(multiProviderYaml);
    const config = loadConfig("/fake/path.yml");
    expect(config.ci_providers).toHaveLength(2);
    expect(config.projects).toHaveLength(2);
    expect(config.projects[0].provider).toBe("gitlab-corp");
    expect(config.projects[1].provider).toBe("github-oss");
    expect(config.projects[1].pipelines[0].workflow_id).toBe("ci.yml");
  });

  it("throws when project references unknown provider", () => {
    const yaml = multiProviderYaml.replace("provider: github-oss", "provider: nonexistent");
    vi.mocked(readFileSync).mockReturnValue(yaml);
    expect(() => loadConfig("/bad.yml")).toThrow('unknown CI provider "nonexistent"');
  });

  it("throws on missing file", () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });
    expect(() => loadConfig("/missing.yml")).toThrow("Cannot read config file");
  });

  it("throws on invalid schema - missing required fields", () => {
    vi.mocked(readFileSync).mockReturnValue("session:\n  secret: test\n");
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

  it("accepts all valid auth provider types", () => {
    for (const type of ["saml", "github", "google", "gitlab", "local", "mock"]) {
      const yaml = validYaml.replace("type: mock", `type: ${type}`);
      vi.mocked(readFileSync).mockReturnValue(yaml);
      const config = loadConfig("/fake.yml");
      expect(config.auth.providers[0].type).toBe(type);
    }
  });

  it("parses config with local provider and users", () => {
    const yaml = `
ci_providers:
  - name: default
    type: gitlab
    url: https://gitlab.example.com
    token: tok123
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
    provider: default
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
ci_providers:
  - name: default
    type: gitlab
    url: https://gitlab.example.com
    token: tok123
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
    provider: default
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
