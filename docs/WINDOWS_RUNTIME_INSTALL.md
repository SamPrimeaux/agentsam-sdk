# Windows — agentsamd install (Operator / PowerShell)

## Why `Unknown command: runtime` happens

You are on an **old published CLI** (e.g. Agent Sam **v2.6.3**). That build lists `runtime` as a help *topic* but does **not** register the `agentsam runtime` command.

Sam’s Mac works because the global `agentsam` is **`npm link`’d** to the local `agentsam-sdk` checkout (has `runtime` + Windows Scheduled Task).

## Fix (PowerShell)

```powershell
npm install -g @inneranimalmedia/agentsam-sdk@latest
agentsam --version
# need 2.6.5+ (or whatever release includes `runtime`)

agentsam runtime install --yes
agentsam runtime probe
# expect healthy on http://127.0.0.1:18765/health
```

Installs:

- `%USERPROFILE%\.agentsam\bin\agentsamd.exe`
- Scheduled Task `InnerAnimalMedia\agentsamd` (logon)

Requires **Go** on PATH to build the daemon (`go version`).

## Do not use hosted Studio as the “install”

The Local Studio **desktop app** must load the **bundled** `apps/local-studio` UI from inside the `.app` / `.msi` — not redirect to https://agentsam.inneranimalmedia.com/agentsam. That URL is the cloud Worker surface; the download exists so the product runs offline with agentsamd.
