# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in BuildValve, please report it responsibly. **Do not open a public GitHub issue.**

Instead, please email **cergfix@gmail.com** with:

- A description of the vulnerability
- Steps to reproduce (if applicable)
- The potential impact

You should receive an acknowledgment within **48 hours**. We will work with you to understand the issue, confirm the fix, and coordinate disclosure.

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest release | Yes |
| Older releases | No |

We recommend always running the latest version.

## Security Considerations

BuildValve handles sensitive data including GitLab API tokens and SAML authentication. When deploying:

- **Never expose `config/config.yml`** — it contains your GitLab service account token and session secrets.
- **Use HTTPS in production** — set `NODE_ENV=production` to enforce secure session cookies.
- **Rotate your session secret** periodically.
- **Use a dedicated GitLab service account** with the minimum required permissions (Developer access to specific projects only).
- **Review `locked` variables** — ensure sensitive CI variables are marked `locked: true` so they are never sent to the browser.
