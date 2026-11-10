# Security policy

## Supported versions

Security fixes are applied to the current `0.1.x` line and the `main` branch.

## How the API key is stored

Maktabati is a bring-your-own-key browser application. The key you enter in
**Profile → AI** is stored as plain text in the current browser origin:

```text
localStorage["maktabati:ai"]
```

The value is JSON containing `base`, `model`, and `key`. It is:

- **not** sent to a Maktabati server (there is no server in this repository);
- **not** included in library exports;
- **not** encrypted at rest;
- readable by any JavaScript that runs on the same origin, by browser
  extensions with permission for that origin, and by anyone using the same
  browser profile.

The `SECURITY` implications are described in the README. Use a dedicated key
with a spending limit, and rotate it if you suspect exposure. This is a
client-side application; `localStorage` is not a secret store.

## Recommended key handling

- Create a separate key for Maktabati, not a key shared with other tools.
- Set a spending limit and, where the provider supports it, a per-key budget.
- Do not use a key with account-level admin rights.
- Prefer a dedicated origin (for example a custom domain) over a shared
  GitHub Pages `username.github.io` origin, because other projects on the same
  origin can read `localStorage`.
- If you open the app on a shared device, use **Clear key** when finished.
- Treat exported JSON as private: exports contain books, highlights, notes,
  quotes, and chats, and are not encrypted.

## Reporting a vulnerability

Please **do not open a public issue** for a vulnerability that could expose
keys, books, or user data.

After the repository is public, use GitHub's **Security → Report a
vulnerability** (private security advisory) for this repository. Before the
repository is public, contact the maintainer through the private channel used
to share this release.

Include:

- the affected commit or version;
- browser and operating system;
- a minimal reproduction (no real API key and no real book);
- the impact you believe it has.

Never paste a real API key, a real book, or a full library export into a
report. If a key may have been exposed, revoke it with the provider
immediately; rotating the key is more important than deleting the report.

## Scope

In scope:

- XSS or sanitizer/CSP bypasses in the reader, chat, Markdown, HTML, or quote
  card;
- import/export parsing bugs that can execute code or read unrelated data;
- leaks of `maktabati:ai` or IndexedDB contents;
- remote-image or prompt-injection paths that exfiltrate book text;
- dependency vulnerabilities that affect the shipped browser build.

Out of scope:

- the absence of a server-side proxy or accounts (documented limitations);
- a user sharing their own key or export;
- browser extensions or malware on the user's device;
- issues that require the user to paste attacker-controlled JavaScript into
  DevTools.
