# Duddy

A tiny friend that lives at the top of your Windows screen, like a Dynamic Island. Hover over it and it opens: chat with an AI, check your laptop's health, control Spotify, and approve Claude Code permission requests without leaving what you're doing.

Duddy is a small robot with big eyes. The eyes follow your cursor, he gets annoyed when you poke him, and you can dress him up (right-click him).

## What it does

| | |
|---|---|
| **Chat** | Ask anything. Free with Gemini, or through your Claude Pro/Max plan. Drop files onto the island (text, images, PDFs). |
| **Laptop tools** | Health (CPU, RAM, battery, disks, top processes), disk usage, top processes, clean old temp files (asks first), open PowerShell. The Gemini chat can use these too: "how's my disk?" |
| **Music** | Mini player for Spotify, YouTube in a browser, or any player Windows can see: album art, play/pause, next, previous, and click or drag the bar to jump anywhere in the track. |
| **Claude Code alerts** | When Claude Code asks permission to run a command or edit a file, the island opens with **Allow / Deny**. Also tells you when Claude finishes. |
| **Background app** | Runs as a normal `Duddy.exe`, starts with Windows if you want, uses no node or npm once built. |

Shortcuts: `Ctrl+Alt+Space` opens the chat from any app, `Ctrl+Alt+D` opens or closes the island, `Esc` closes it.

## Install

You need **Windows 10/11** and **[Node.js](https://nodejs.org)** (only to build the app once).

```powershell
git clone https://github.com/ismail-werner/duddy.git
cd duddy
npm.cmd install
```

If `npm install` finished but Electron says it isn't installed, run this once:

```powershell
node node_modules/electron/install.js
```

### 1. Get a free Gemini key

Create one at <https://aistudio.google.com/apikey> (no credit card), then copy `.env.example` to `.env` and paste the key:

```
GEMINI_API_KEY=your-key-here
```

### 2. Build and install the app

```powershell
npm.cmd run build:install
```

This creates `Duddy.exe`, copies it to `%LOCALAPPDATA%\Programs\Duddy`, adds a **Start Menu shortcut**, and copies your `.env` to `%APPDATA%\Duddy\.env` (that's where the installed app reads your key; edit that file to change it later).

Press the Windows key, type **Duddy**, press Enter. Move your cursor to the top-center of the screen.

To start with Windows, open the island, go to Settings (sliders icon) and turn on **Launch at login**.

> Prefer not to install? `npm.cmd start` runs it straight from the source folder.

### Use your Claude Pro plan instead of Gemini (optional)

If you have Claude Pro or Max and [Claude Code](https://claude.com/claude-code) installed and logged in, open Settings and switch **Brain** to **Claude · Pro**. No API key, no API bill, but the first words take a few seconds and the laptop tools are Gemini-only. Default model is Haiku; set `CLAUDE_MODEL=sonnet` in `.env` for smarter, slower answers.

### See Claude Code permission requests in the island (optional)

Open Settings and turn on **Claude Code alerts**. Duddy shows exactly what it will add to `~/.claude/settings.json` (3 hook entries), saves a backup next to it, and only writes after you click **Connect**. Then start a new Claude Code session.

- Nothing is ever allowed without your click. If you don't click, or Duddy is closed, Claude asks in its terminal as usual.
- Turn the switch off to remove Duddy's entries; other hooks are left alone.
- Connect from the **installed** app so the hook points at `Duddy.exe`. If you move or reinstall Duddy somewhere else, switch it off and on once.

## Updating

Pull the latest code and run `npm.cmd run build:install` again. Your settings and key are kept.

## Troubleshooting

- **"running scripts is disabled" when using `npm`:** use `npm.cmd` instead of `npm`, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.
- **"Every model is busy":** Gemini's free tier is sometimes overloaded. Duddy already retries and falls back to other models; try again in a minute.
- **Chat says to set the key:** check that `%APPDATA%\Duddy\.env` contains `GEMINI_API_KEY=...`, then restart Duddy (the × in the island, then reopen from the Start Menu).
- **Music tab says nothing is playing:** start playback in Spotify or your browser first. Windows must show the media controls for it.
- **Quit Duddy:** the × in the island, or end `Duddy.exe` in Task Manager.

## Under the hood

Electron, plain HTML/CSS/JS, no frameworks. The window is a fixed panel glued to the top edge; `setShape` makes everything outside the island click-through. Music uses Windows' media session through a small PowerShell script (`media.ps1`), the laptop tools use PowerShell, and Claude Code alerts use a localhost-only server with a random per-launch key plus a tiny relay script (`duddy-relay.js`). `node test-hooks.js` checks the hook server and relay.

The island layout is inspired by [Coucou](https://github.com/Louis-CFM/coucou). Duddy's code, character and name are original.

## Privacy

Your messages go to Google (Gemini) or Anthropic (Claude), depending on the Brain you pick. Nothing else leaves your laptop. Your `.env` is never committed (it's in `.gitignore`).
