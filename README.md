# RPGX Quest Log

**by Ashton Rogers / RPGX / X8 Studios**
[rpgxstudios.com](https://www.rpgxstudios.com) · [Discord](https://discord.gg/2xYN3FF4U) · [Patreon](https://www.patreon.com/c/rpgxstudios) · [Facebook](https://www.facebook.com/p/RPGX-Game-Studios-100063706171843/)

---

## What Is RPGX Quest Log?

RPGX Quest Log is a comprehensive quest tracking system for Foundry VTT, designed for Game Masters who want more than a notepad. It gives you a living, player-facing quest board with full GM control — from posting jobs, tracking active missions, and managing rewards, all the way to generating entirely new quests using local AI that understands your actual campaign world.

It is built to work in all three Foundry deployment scenarios: remote hosted servers, local network setups, and single-machine GM stations.

---

## Compatibility

| | |
|---|---|
| **Foundry VTT** | v10 minimum · v14 verified |
| **Game Systems** | System-agnostic (D&D 5e, PF2e, and others) |
| **RPGX Proton** | Required for Pro features |
| **RPGX AI Assistant** | Optional — shares token and system settings automatically |

---

## Free Tier Features

Everything below is available to all users with no subscription required.

### Quest Tracking
- **Quest Log window** — a resizable, minimizable panel accessible from the floating toolbar button or chat commands `/quest`
- **Five quest statuses** — Job Board, Active, Completed, Failed, and Abandoned, each with its own tab
- **Up to 10 quests per world** — create and manage up to ten quests without any subscription
- **One-click status changes** — click the coloured status stripe on any quest row to instantly change its status without opening the full sheet
- **Right-click context menu** — alternate power-user access to status changes directly from the quest list

### Quest Sheet
- **Quest title, player-facing description, and GM-only notes** — all stored separately so players only ever see what you want them to see
- **Auto-save** — description, GM notes, and hidden milestone text save automatically as you type, debounced so nothing is lost
- **Quest status selector** — change status directly from within the sheet

### Job Board
- **Player-visible job board** — all users can see Job Board quests, even without being assigned
- **Player quest claiming** — players can drag and drop their own characters onto a Job Board quest to claim it; the GM's client processes the claim and posts a chat card announcing who accepted
- **Automatic status transition** — claimed quests move from Job Board to Active automatically

### Drag-and-Drop
- **Quest givers** — drag any actor onto the quest giver zone; supports multiple quest givers per quest
- **Quest recipients** — drag actors onto the recipient zone to assign them
- **Reward items** — drag any item from the world or compendium directly onto the rewards panel

### Reward Distribution
- **XP auto-split** — distributes total XP evenly across all assigned characters and updates their sheets directly
- **Currency auto-split** — splits GP, SP, and CP evenly with remainder going to the first character; PP supported
- **Custom currency field** — free-text field for non-standard currencies or special rewards
- **Loot assignment and transfer** — assign individual reward items to specific characters, then transfer them all to inventory in one click
- **Reveal rewards toggle** — GM controls when reward details become visible to players

### Milestones
- **Add, complete, fail, and remove milestones** — track quest objectives individually
- **Hidden milestones** — a GM-only text field for secret objectives players haven't discovered yet
- **Reveal milestones toggle** — make milestones visible to players when the time is right

### Multi-Player Sync
- **Real-time socket updates** — all connected clients (GM and players) see quest changes immediately without refreshing
- **Role-based access** — players only see quests they are assigned to; Job Board quests are visible to everyone
- **Click-through portraits** — players can click quest giver and recipient portraits to open their character sheets

---

## Pro Features — Unlocked via RPGX Proton

Pro features require the **RPGX Proton** desktop application to be running on the GM's computer with an active Patreon subscription. Proton is the sole validator — no license keys, no cloud accounts. Subscription status is verified silently on load and re-checked every 30 minutes.

[**Download RPGX Proton Free**](https://rpgxstudios.com) · [**Subscribe on Patreon**](https://www.patreon.com/c/rpgxstudios)

### Unlimited Quests
Free tier allows up to 10 quests per world. Pro removes that cap entirely — no limit on how many quests your world can hold.

### AI Quest Generation
The flagship Pro feature. Open any quest sheet, navigate to the **AI Generate** tab, optionally enter a theme or premise, and click Generate. The AI writes a complete quest tailored to your campaign — title, player-facing description, and full GM notes including the real plot, villain motivation, a twist, encounter suggestions, and campaign hooks.

**How generation works:**

1. **World lore search** — before calling the AI, the system queries your RPGX RAG knowledge base for lore relevant to the characters involved. Journal entries, actor biographies, session notes, and any ingested documents are searched using hybrid semantic and keyword retrieval. Relevant chunks are injected into the prompt as authoritative campaign facts.

2. **Character context** — the quest giver's and recipients' full character sheet data is read live at generation time: alignment, race, class, background, ideals, bonds, flaws, traits, and biography (including NPC public and detail biography blocks). This data is used to personalise the quest and find narrative threads connecting the characters involved.

3. **Alignment-driven storytelling** — the AI applies different rules based on the quest giver's alignment:
   - **Evil givers** deceive the players in the description. The quest is made to sound benign, heroic, or profitable. The GM notes expose the true sinister goal, the exact lie being told, and what actually happens if the party succeeds.
   - **Neutral givers** are self-interested — honest about what benefits them, quiet about what doesn't.
   - **Good givers** are transparent and earnest. GM notes may still include hardship or moral complexity, but there is no manipulation.
   - If alignment is not set on the sheet, the AI infers it from biography, ideals, bonds, and flaws.

4. **Genre matching** — quests are written to fit the game system set in RPGX AI Assistant settings. D&D gets fantasy and political intrigue. Cyberpunk gets corporate espionage and street-level danger. Star Wars gets galactic stakes. The tone is always native to the system.

5. **Robust output parsing** — the AI response is processed through a multi-strategy parser that handles chain-of-thought bleed, model reasoning text, extra fields, and malformed JSON gracefully. If the model produces multiple attempts, the cleanest one is used automatically.

**AI Model Tiers** — select based on your hardware:

| Tier | Model | RAM Required |
|---|---|---|
| Lite | qwen2.5:3b | 4–6 GB |
| Standard ⭐ | qwen2.5:7b | 8 GB+ |
| Performance | qwen2.5:14b | 16 GB+ |
| Ultra | qwen3:30b | 32 GB+ |

Custom model names are also supported for advanced users.

Additional AI settings: generation timeout (30–600 seconds), and creativity/temperature (0.5 Structured → 1.5 Wild).

---

## Integration with RPGX AI Assistant

If the **RPGX AI Assistant** module is also installed, Quest Log integrates with it automatically:

- **Shared auth token** — Quest Log reads the AI Assistant's Proton token automatically. No duplicate configuration needed.
- **Shared game system** — the system set in AI Assistant settings (D&D 5e, Pathfinder, Cyberpunk, etc.) is used by Quest Log's AI generation for genre-accurate quests.
- **Shared RAG knowledge base** — the same world documents, actor biographies, and journal entries ingested by AI Assistant power Quest Log's world lore context injection.

If Quest Log is installed standalone without AI Assistant, both the token and game system are configured independently in Quest Log's own module settings.

---

## Integration with RPGX Proton

RPGX Proton is the GM's local AI companion desktop application. It manages Ollama (the local AI engine), the RAG knowledge base server, and subscription validation — all running privately on your own machine. No data leaves your computer.

Quest Log connects to Proton in three ways:

**HTTP (AI generation and subscription)** — the module makes authenticated fetch requests to Proton's local server for AI generation (`/ollama/generate`), world lore search (`/search`), and subscription validation (`/api/subscription`). All requests carry a Bearer token validated server-side.

**Foundry WebSocket (Proton Bridge)** — Proton connects to Foundry's existing WebSocket as a client and exchanges quest data in real time. Proton can read all quests, receive live updates when quests change, and push status changes back to the world — without any polling or separate connection infrastructure.

**Proton Quest Panel** — the Proton desktop app includes a dedicated quest view that mirrors the Foundry Quest Log, letting the GM manage quests from the companion app without switching to the browser.

---

## Security — Upgraded from Beta

The v1.0.0 release includes a complete security overhaul compared to the beta builds:

- **Bearer token authentication** — every HTTP request from the Foundry module to the Proton RAG server carries an `Authorization: Bearer` header. Requests without a valid token are rejected with a 401 before any processing occurs.
- **CORS origin allowlisting** — the RAG server only accepts browser requests from the GM's configured Foundry URL. No other webpage can reach the server.
- **Private Network Access headers** — the server sends PNA headers to prevent rogue HTTPS pages from exploiting the local server.
- **Timing-safe token comparison** — the server uses `timingSafeEqual` from Node's `crypto` module to compare tokens, preventing timing-based token guessing attacks.
- **Cross-module token sharing** — when both RPGX AI Assistant and Quest Log are installed, they share one token automatically. Changing the token in one place updates both.
- **GM-only data writes** — only the GM client processes socket messages that modify quest data. Player clients are structurally excluded from write operations regardless of what socket messages they send.
- **Subscription validation isolation** — Proton detection and subscription status are checked in two independent steps so a subscription endpoint issue can never make Proton appear offline.

---

## Chat Commands

| Command | Action |
|---|---|
| `/quest` | Open or focus the Quest Log |
| `/questlog` | Open or focus the Quest Log |
| `/ql` | Open or focus the Quest Log |

---

## Settings Reference

| Setting | Scope | Description |
|---|---|---|
| RPGX Proton URL | World | Address of the Proton server. Default: `http://127.0.0.1:3033` |
| RPGX Proton Auth Token | World | Bearer token matching Proton's settings page. Shared automatically with AI Assistant if installed. |
| AI Model Tier | World | Model selection dropdown with Lite / Standard / Performance / Ultra tiers plus custom input |
| AI Generation Timeout | World | 30–600 seconds. Increase for larger models. |
| AI Creativity | World | Temperature 0.5–1.5. Controls how structured or wild the generated content is. |

---

## What's New in v1.0.0 vs Beta

- Full production security hardening (Bearer auth, CORS, PNA, timing-safe comparison)
- AI quest generation with world lore context injection via RAG knowledge base
- Alignment-inferred quest tone — AI reads biography and personality fields when alignment is not explicitly set
- Common thread personalisation — AI actively looks for connections between quest givers and recipients
- Genre-accurate output based on game system setting
- Robust multi-strategy JSON parser handling chain-of-thought bleed, malformed output, and extra model fields
- Two-stage generation progress indicator (Searching world lore → Generating quest)
- Proton detection split into independent ping and subscription steps
- Multiple quest givers per quest (assigners array)
- Job Board tab with player claiming via drag-and-drop
- Real-time socket sync across all connected clients
- Right-click context menu for status changes
- Inline status change dialog from the quest list

---

## Links

| | |
|---|---|
| 🌐 Website | [rpgxstudios.com](https://rpgxstudios.com) |
| 💬 Discord | [discord.gg/2xYN3FF4U](https://discord.gg/2xYN3FF4U) |
| ❤️ Patreon | [patreon.com/c/rpgxstudios](https://www.patreon.com/c/rpgxstudios) |
| 📘 Facebook | [RPGX Game Studios](https://www.facebook.com/p/RPGX-Game-Studios-100063706171843/) |

---

*RPGX Quest Log is a product of RPGX Studios / X8 Studios. © 2026 Ashton Rogers. All rights reserved.*
*RPGX Proton and RPGX AI Assistant are companion products available at rpgxstudios.com.*
