# rpgx-quest-log
### AI-Powered Quest Tracking for Foundry VTT
A full-featured quest tracking system for GMs and players. Supports drag-and-drop characters and items, milestone tracking, auto-split XP and currency, and loot distribution. Pairs with RPGX Proton for AI-powered quest generation using live character sheet context. Free and Pro tiers available.




**Version:** v1.0.1 
**Last Updated:** April 2026
**Compatibility:** Foundry VTT v11+ (Verified on v13)
**License:** MIT

---

> ⚠️ **Early Access** — RPGX Quest Log is currently in Gold Tier early access on [Patreon](https://www.patreon.com/c/rpgxstudios). The public release will follow after the Gold Tier testing period. Gold Tier Patrons receive the module directly and can update natively through Foundry once the public release is live.

---

## What is RPGX Quest Log?

RPGX Quest Log is a full-featured, GM and player-facing quest tracking system for Foundry VTT. It gives Game Masters a clean, powerful interface to create, manage, and distribute quests — with optional AI-powered generation that reads your actual character sheets to produce quests that feel native to your world and its people.

It is part of the **RPGX Toolbelt** — a growing ecosystem of interconnected Foundry modules and desktop tools built around local AI, privacy, and a seamless GM experience.

No cloud. No subscriptions required for core features. No data leaves your machine.

---

## Features

### Core Features — Free for Everyone

- **Quest Manager** — Create and manage quests with a dedicated sheet interface. Each quest has a player-facing description, GM-only notes, status tracking, milestones, and a full reward system.
- **Quest Log Panel** — A floating, always-accessible panel showing all quests organized by status: Active, Completed, Failed, and Abandoned.
- **Drag-and-Drop Characters** — Drop actors directly onto a quest sheet to assign quest-givers and quest recipients. Supports multiple quest-givers per quest.
- **Drag-and-Drop Items** — Drop items from your world onto the rewards section. Assign specific items to specific characters before distributing.
- **Milestone Tracking** — Add milestone objectives to any quest. Mark them complete or failed individually. Optionally reveal milestones to players or keep them hidden until the right moment.
- **Hidden GM Milestones** — A separate freeform notes field for GM-only milestone tracking that players never see.
- **Reward Distribution** — One-click XP award split evenly across all assigned characters. One-click currency distribution split evenly across all assigned characters. Per-item loot assignment lets you direct specific items to specific party members.
- **Reward Visibility Toggle** — Rewards can be hidden from players until the GM is ready to reveal them.
- **Player View** — Players can open the Quest Log and see quests they are assigned to, with the player-facing description. GM notes, hidden milestones, and hidden rewards are never exposed.
- **Quest Status System** — Active, Completed, Failed, and Abandoned statuses with clear visual indicators.
- **Chat Commands** — Open the Quest Log from Foundry chat with `/quest`, `/questlog`, or `/ql`.
- **Multiplayer Sync** — All quest changes sync to all connected players in real time via Foundry's socket system.
- **Up to 10 Quests** — Free tier supports up to 10 active quests per world.

### Pro Features — Requires RPGX Proton + Patreon Subscription

- **Unlimited Quests** — No cap on the number of quests per world.
- **AI Quest Generation** — Generate complete quests using a locally running Ollama model. The AI reads your quest sheet's assigned characters — pulling their biography, personality traits, ideals, bonds, flaws, creature type, and alignment — to write quests that feel like they belong in your world.
- **Context-Aware NPC Voice** — Quest-givers' alignment shapes the AI's portrayal of their hidden motivations. A Lawful Evil patron's quest reads very differently in GM Notes than a Neutral Good one.
- **Prompt Guidance** — Optionally provide a theme or premise to steer generation. Leave it blank for a fully original quest.

---

## The RPGX Toolbelt Ecosystem

RPGX Quest Log is one part of a larger connected system. All RPGX modules are designed to work together:

| Module / App | Role |
|---|---|
| **RPGX Quest Log** | Quest tracking, AI generation, reward distribution |
| **RPGX AI Assistant** | Chat-based AI queries from Foundry chat, RAG knowledge base |
| **RPGX Proton** | Desktop companion — Ollama management, RAG server, subscription validation |
| **RPGX Loot Crate** | Party inventory, trade, and item crafting system |
| **RPGX Character Forge** | Portrait and Token generation based on character sheet content |
| **RPGX Combatant** | AI-controlled NPC actions based on situation and improved targeting system |
| **RPGX Scrybe** | Importer for ScrybeQuill game notes |
| **RPGX Droidsheet** | Smartphone app and module for simplified table interface |

**RPGX Proton** is the connective tissue. It runs a local server on your machine that all RPGX modules communicate with. It proxies requests to Ollama (solving browser CORS restrictions), manages the RAG knowledge database, validates Patreon subscriptions, and will serve as the hub for future RPGX modules.

Download RPGX Proton free with a 14-day free trial at [rpgxstudios.com](https://www.rpgxstudios.com).

---

## How AI Quest Generation Works

When you click **Generate Quest**, the module:

1. Looks up every actor in your **Quest Givers** and **Assigned Characters** sections against live Foundry actor sheets.
2. Extracts available character data — biography (both Public and Details sections for NPC sheets), creature type, alignment, personality traits, ideals, bonds, and flaws. Any fields that don't exist for a given game system are silently skipped.
3. Sends that context to RPGX Proton, which proxies the request to your local Ollama instance.
4. The AI produces a structured quest with a player-facing description and a GM-only notes section, shaped by the characters on your sheet.
5. The result is dropped directly into the quest fields, ready for review and editing before saving.

The entire pipeline is local — Foundry → Proton → Ollama → back. No data is sent anywhere external.

### System Agnostic

The character data extraction is designed to work across game systems. It tries common field paths used by D&D 5e, Pathfinder 2e, and generic systems. If a field doesn't exist in the active system, it is skipped without error. The AI always generates something — it just generates with less context if the system stores data differently.

---

## Requirements

| Requirement | Notes |
|---|---|
| Foundry VTT v11+ | Verified on v13 |
| [RPGX Proton](https://www.rpgxstudios.com) | Required for AI generation and unlimited quests |
| [Ollama](https://ollama.com) | Required for AI generation. Managed through Proton. |
| Patreon Subscription | Required for Pro features — [patreon.com/c/rpgxstudios](https://www.patreon.com/c/rpgxstudios) |

Core quest tracking, milestone management, and reward distribution require only Foundry VTT. Proton and Ollama are only needed for AI generation and to remove the free-tier quest cap.

---

## Installation

### Via Foundry Module Manager (Recommended)

1. Open Foundry VTT
2. Go to **Settings → Install Add-on Module**
3. Paste the manifest URL:
   ```
   https://github.com/x8xid82/rpgx-quest-log/releases/latest/download/module.json
   ```
4. Click **Install**

### Manual Installation

1. Download the latest `rpgx-quest-log.zip` from the [Releases](https://github.com/x8xid82/rpgx-quest-log/releases) page
2. Extract the zip into your Foundry `Data/modules/` folder so the path reads `Data/modules/rpgx-quest-log/`
3. Restart Foundry VTT
4. Enable the module in your world under **Settings → Manage Modules**

---

## Configuration

Once the module is enabled in your world:

1. Go to **Settings → Module Settings → RPGX Quest Log**
2. Set the **RPGX Proton URL** — default is `http://127.0.0.1:3033`. Only change this if you have configured Proton to use a different port or if your Foundry server is on a different machine on your network.
3. Set the **Ollama AI Model** — the model used for quest generation. Must be installed in Ollama via Proton. Recommended: `qwen2.5:14b`, `llama3`, `mistral`, or `gemma2`.

### Deployment Scenarios

RPGX Quest Log and Proton are designed to work in all three common Foundry setups:

**Local — Foundry running on your own machine**
Proton runs alongside Foundry on the same machine. Default settings work out of the box.

**LAN — Foundry on a dedicated machine on your home network**
Proton runs on the GM's machine. Set the Proton URL in module settings to the GM machine's local IP, e.g. `http://192.168.1.50:3033`. Players connect to Foundry as normal — only the GM's machine needs Proton.

**Remote — Foundry hosted externally (e.g. The Forge, a VPS)**
Proton runs on the GM's local machine. The module in the browser-hosted Foundry communicates back to Proton over the local network or via a configured address. Proton includes the `Access-Control-Allow-Private-Network` header to satisfy Chrome's Private Network Access requirements for HTTPS-to-localhost requests.

---

## Using the Quest Log

### Opening the Quest Log

- Click the **scroll icon** in the RPGX Toolbar (bottom-left of the Foundry UI)
- Or type `/quest`, `/questlog`, or `/ql` in the Foundry chat

### Creating a Quest

1. Click **New Quest** in the Quest Log panel
2. The Quest Sheet opens with three tabs: **Details**, **Rewards**, and **AI Generate**
3. Enter a title, write the player-facing description, and add GM notes
4. Drag actors from the sidebar onto the **Quest Givers** and **Assigned Characters** drop zones
5. Click **Save Quest**

### Managing Milestones

- Click **Add Milestone** to create a new objective
- Click the checkmark to mark a milestone complete, or the X to mark it failed
- Toggle **Reveal Milestones** to make them visible to players
- Use the **Hidden GM Milestones** field for internal tracking that players never see

### Distributing Rewards

1. Switch to the **Rewards** tab
2. Set XP, currency (PP/GP/SP/CP), and optionally a custom currency
3. Drag items from the sidebar onto the **Items** drop zone
4. Assign specific items to specific characters using the dropdown per item
5. Click **Award XP**, **Distribute Currency**, or **Award Loot** individually
6. Toggle **Reveal Rewards** when you're ready for players to see what they earned

### AI Quest Generation (Pro)

1. Add at least one actor to the **Quest Givers** section for best results
2. Switch to the **AI Generate** tab
3. Optionally type a theme or premise in the prompt field, or leave it blank for a fully original quest
4. Click **Generate Quest**
5. Review the generated title, description, and GM notes
6. Edit as needed and click **Save Quest**

---

## Architecture

```
┌─────────────────────────────┐
│      Foundry VTT            │
│  (browser — local or remote)│
│                             │
│  RPGX Quest Log Module      │
│    quest-sheet-app.js       │
│    ollama.js                │
│    quest-store.js           │
│    proton-bridge.js         │
└────────────┬────────────────┘
             │ HTTP → port 3033
             ▼
┌─────────────────────────────┐
│      RPGX Proton            │
│  (GM's local machine)       │
│                             │
│  Express Server (server.cjs)│
│    /ollama/generate  proxy  │
│    /api/subscription        │
│    /ask  (RAG queries)      │
│    /ingest                  │
└────────────┬────────────────┘
             │ HTTP → port 11434
             ▼
┌─────────────────────────────┐
│      Ollama                 │
│  (GM's local machine)       │
│  qwen2.5:14b / llama3 / etc │
└─────────────────────────────┘
```

All AI inference happens locally on the GM's machine. No data is transmitted externally at any point.

---

## Free vs Pro

| Feature | Free | Pro |
|---|:---:|:---:|
| Quest tracking | ✅ | ✅ |
| Milestone tracking | ✅ | ✅ |
| Drag-and-drop characters | ✅ | ✅ |
| Reward distribution (XP, currency, loot) | ✅ | ✅ |
| Player quest view | ✅ | ✅ |
| Multiplayer sync | ✅ | ✅ |
| Chat commands | ✅ | ✅ |
| Quest limit | 10 | Unlimited |
| AI quest generation | ❌ | ✅ |
| Character sheet context in AI | ❌ | ✅ |

Pro features unlock when RPGX Proton is running with an active Patreon subscription. Proton handles all validation locally — there are no license keys, no activation servers, and no accounts to create.

---

## Changelog

### v1.0.1 — April 2026
- AI quest generation now reads quest-giver character sheets for richer, more personalized output
- Pulls NPC biography (both Public and Details sections), creature type, alignment, personality traits, ideals, bonds, and flaws
- Alignment actively shapes the quest-giver's hidden motivations in GM Notes — each alignment produces meaningfully different quest hooks
- System-agnostic character data extraction — works with any Foundry game system, silently skips missing fields
- AI responses locked to gender-neutral character language
- AI responses locked to the language of the GM's prompt — no mid-response language switching

### v1.0.0 — Early Access Release
- Initial release under Gold Tier early access
- Quest creation, editing, status management
- Drag-and-drop quest-givers (multiple supported), assignees, and items
- Milestone system with player reveal toggle
- Hidden GM milestones field
- XP distribution, currency distribution, per-item loot assignment
- Reward visibility toggle
- Player-facing quest view filtered by assigned characters
- AI quest generation via Ollama through RPGX Proton
- Optional prompt field for AI generation
- Free tier: up to 10 quests per world
- Pro tier: unlimited quests, AI generation
- Subscription validation via RPGX Proton — no license keys
- Foundry socket sync for multiplayer
- Chat commands: `/quest`, `/questlog`, `/ql`
- Proton connection status displayed in module settings

---

## Privacy

RPGX Quest Log makes zero external network calls. All data stays within your local machine or network. Quest data is stored in Foundry's own world settings. AI queries travel from your browser to Proton on your local machine, then to Ollama on your local machine, and back. Nothing leaves your network at any point.

---

## License

MIT License — Copyright © 2026 RPGX Studios | X8 Studios

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

## Credits

**Written & Designed by:** Ashton Rogers
**Studio:** RPGX Studios | X8 Studios

---

## Links

| | |
|---|---|
| 🌐 Website | [rpgxstudios.com](https://www.rpgxstudios.com) |
| 💬 Discord | [discord.gg/2xYN3FF4U](https://discord.gg/2xYN3FF4U) |
| ❤️ Patreon | [patreon.com/c/rpgxstudios](https://www.patreon.com/c/rpgxstudios) |
| 📘 Facebook | [RPGX Game Studios](https://www.facebook.com/p/RPGX-Game-Studios-100063706171843/) |
| 📦 Releases | [GitHub Releases](https://github.com/x8xid82/rpgx-quest-log/releases) |
| 🎬 YouTube | [RPGX Studios](https://www.youtube.com/@rpgxstudios) |
