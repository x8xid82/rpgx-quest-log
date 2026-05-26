/**
 * RPGX Quest Log — Module Entry Point v3
 * scripts/main.js
 * Updated with tier-based model selection (Lite/Standard/Performance/Ultra)
 * Security: protonToken setting added for Proton auth (shared with rpgx-ai if installed)
 */

import { QuestStore }    from './quest-store.js';
import { QuestLogApp }   from './quest-log-app.js';
import { QuestSheetApp } from './quest-sheet-app.js';
import { OllamaService } from './ollama.js';
import { ProtonBridge }  from './proton-bridge.js';

const MODULE_ID = 'rpgx-quest-log';

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

Hooks.once('init', () => {

  console.log(`RPGX Quest Log | Initializing...`);

  // ── Hidden quest data store ────────────────────────────────────────────────
  game.settings.register(MODULE_ID, 'quests', {
    scope:   'world',
    config:  false,
    type:    Array,
    default: [],
  });

  // ── Version display ────────────────────────────────────────────────────────
  game.settings.register(MODULE_ID, '_moduleInfo', {
    name:    `RPGX Quest Log — v${game.modules.get(MODULE_ID)?.version ?? '?'}`,
    hint:    'GM quest tracking with AI generation and reward distribution. rpgxstudios.com',
    scope:   'world',
    config:  true,
    type:    String,
    default: '',
    onChange: () => {},
  });

  // ── RPGX Proton connection ─────────────────────────────────────────────────
  // All premium features — unlimited quests, AI generation — require RPGX Proton
  // to be running with an active Patreon subscription.
  // Download RPGX Proton free at rpgxstudios.com.
  game.settings.register(MODULE_ID, 'ragBase', {
    name:    'RPGX Proton URL',
    hint:    'Local address of the RPGX Proton desktop app. Default is http://127.0.0.1:3033 — ' +
             'only change this if you have configured Proton to use a different port. ' +
             'Download RPGX Proton free at rpgxstudios.com.',
    scope:   'world',
    config:  true,
    type:    String,
    default: 'http://127.0.0.1:3033',
  });

  // ── Proton Auth Token ──────────────────────────────────────────────────────
  // Shared with rpgx-ai module if installed (same Proton instance).
  // Only needed if rpgx-ai is NOT installed — Quest Log reads rpgx-ai's token first.
  game.settings.register(MODULE_ID, 'protonToken', {
    name:    'RPGX Proton Auth Token',
    hint:    'Authentication token for RPGX Proton. Must match the token shown in the Proton app settings. ' +
             'If the RPGX AI Assistant module is also installed, its token is used automatically — ' +
             'you only need to set this if Quest Log is your only RPGX module.',
    scope:   'world',
    config:  true,
    type:    String,
    default: '',
  });

  // ── AI Model ──────────────────────────────────────────────────────────────
  game.settings.register(MODULE_ID, 'ollamaModel', {
    name:    'AI Model Tier',
    hint:    'Select performance tier based on your PC specs. Models must be installed via RPGX Proton. ' +
             'Lite (3b) = 4-6GB RAM | Standard (7b) = 8GB+ RAM | Performance (14b) = 16GB+ RAM | Ultra (30b) = 32GB+ RAM',
    scope:   'world',
    config:  true,
    type:    String,
    default: 'qwen2.5:7b',  // Standard tier is now default
  });

  // ── AI Generation Timeout ─────────────────────────────────────────────────
  game.settings.register(MODULE_ID, 'aiTimeout', {
    name:    'AI Generation Timeout',
    hint:    'Maximum time to wait for AI quest generation. Increase for larger models (Performance/Ultra tiers). ' +
             '30s = fast models | 60s = most models | 120s+ = Ultra tier or complex prompts',
    scope:   'world',
    config:  true,
    type:    Number,
    range:   { min: 30, max: 600, step: 30 },
    default: 60,  // 60 seconds default
  });

  // ── AI Temperature (Creativity) ───────────────────────────────────────────
  game.settings.register(MODULE_ID, 'aiTemperature', {
    name:    'AI Creativity',
    hint:    'Controls randomness in quest generation. Lower = more structured and predictable | Higher = more creative and varied. ' +
             '0.5 = Structured | 0.8 = Balanced | 1.2 = Creative | 1.5 = Wild',
    scope:   'world',
    config:  true,
    type:    Number,
    range:   { min: 0.5, max: 1.5, step: 0.1 },
    default: 0.8,
  });

  // ── Handlebars Helpers ────────────────────────────────────────────────────
  Handlebars.registerHelper('rpgx-gt',  (a, b) => a > b);
  Handlebars.registerHelper('rpgx-eq',  (a, b) => a === b);
  Handlebars.registerHelper('rpgx-gte', (a, b) => a >= b);
  Handlebars.registerHelper('or',       (a, b) => a || b);

  Handlebars.registerHelper('rpgx-status-class', (status) => {
    const map = { 
      active: 'status-active', 
      completed: 'status-completed', 
      failed: 'status-failed', 
      abandoned: 'status-abandoned',
      jobboard: 'status-jobboard'
    };
    return map[status] ?? 'status-active';
  });

  Handlebars.registerHelper('rpgx-status-icon', (status) => {
    const map = { 
      active: 'fa-circle-play', 
      completed: 'fa-circle-check', 
      failed: 'fa-circle-xmark', 
      abandoned: 'fa-circle-minus',
      jobboard: 'fa-clipboard-list'
    };
    return map[status] ?? 'fa-circle-play';
  });

  Handlebars.registerHelper('rpgx-first', (arr) => (arr && arr.length > 0) ? arr[0] : null);
});

// ─── GLOBAL NAMESPACE + SOCKET ────────────────────────────────────────────────

Hooks.once('ready', async () => {

  const store  = new QuestStore();
  const ollama = new OllamaService();

  game.rpgxQuestLog = {
    store,
    ollama,
    QuestLogApp,
    QuestSheetApp,
  };

  // ── Proton Bridge (handles Proton ↔ Foundry socket messages) ──────────────
  const bridge = new ProtonBridge(store);
  bridge.initialize();
  game.rpgxQuestLog.protonBridge = bridge;

  // ── Proton / Subscription validation ─────────────────────────────────────
  // Pings Proton at /api/subscription to verify Patreon status.
  // Proton is the sole validator — no license keys.
  // If Proton isn't running this silently fails and applies free tier limits.
  // Re-runs every 30 min so a subscription change is picked up without reloading.
  const runValidation = async () => {
    await store.validateSubscription();
    // Re-render Quest Log header so Pro badge / Proton status updates
    QuestLogApp._instance?.render(false);
  };

  runValidation();
  setInterval(runValidation, 30 * 60 * 1000); // every 30 minutes

  // ── Socket handler ────────────────────────────────────────────────────────
  game.socket.on(`module.${MODULE_ID}`, (data) => {
    const { type, payload } = data;

    if (QuestLogApp._instance?.rendered) {
      QuestLogApp._instance.render(false);
    }

    if (type === 'QUEST_UPDATED' && payload?.id) {
      const openSheet = Object.values(ui.windows).find(
        w => w instanceof QuestSheetApp && w.questId === payload.id
      );
      if (openSheet?.rendered) openSheet.render(false);
    }

    if (type === 'QUEST_DELETED' && payload?.id) {
      const openSheet = Object.values(ui.windows).find(
        w => w instanceof QuestSheetApp && w.questId === payload.id
      );
      if (openSheet?.rendered) openSheet.close();
    }

    // ── Player Claim Quest ──────────────────────────────────────────────
    // When a player drops their character on a job board quest, process it
    // Only GMs can actually update quest data, so they handle the claim
    if (type === 'PLAYER_CLAIM_QUEST' && game.user.isGM && payload) {
      const { questId, actorId, actorName, actorImg, playerName } = payload;
      
      // Call claimQuest which handles the transition and chat card
      store.claimQuest(questId, [actorId]).then(() => {
        console.log(`RPGX Quest Log | ${playerName} claimed quest ${questId} with ${actorName}`);
      }).catch(err => {
        console.error(`RPGX Quest Log | Failed to claim quest:`, err);
        ui.notifications.error(`Failed to claim quest: ${err.message}`);
      });
    }
  });

  const tier = store.isPaidTier ? 'Pro ✓' : `Free (max ${store.maxQuests} quests)`;
  console.log(`RPGX Quest Log | Ready. Tier: ${tier} | Proton: ${store.protonDetected ? 'detected' : 'not detected'}`);
});

// ─── FLOATING TOOLBAR BUTTON ──────────────────────────────────────────────────

Hooks.once('ready', () => {
  const btn     = document.createElement('div');
  btn.id        = 'rpgx-quest-log-toolbar-btn';
  btn.innerHTML = `<i class="fas fa-scroll"></i>`;
  btn.title     = 'RPGX Quest Log';
  document.body.appendChild(btn);
  btn.addEventListener('click', () => QuestLogApp.openOrFocus());
});

// ─── CHAT COMMAND ─────────────────────────────────────────────────────────────

Hooks.on('chatMessage', (chatLog, message) => {
  const cmd = message.trim().toLowerCase();
  if (cmd === '/quest' || cmd === '/questlog' || cmd === '/ql') {
    QuestLogApp.openOrFocus();
    return false;
  }
});

// ─── MODEL TIER DROPDOWN ENHANCEMENT ──────────────────────────────────────────
// Transforms the text input into a tier-based dropdown with custom option

const MODEL_TIERS = [
  { label: 'Lite (qwen2.5:3b)', value: 'qwen2.5:3b' },
  { label: 'Standard (qwen2.5:7b) ⭐', value: 'qwen2.5:7b' },
  { label: 'Performance (qwen2.5:14b)', value: 'qwen2.5:14b' },
  { label: 'Ultra (qwen3:30b)', value: 'qwen3:30b' },
];

function enhanceModelInput(input) {
  if (!input || input.dataset.rpgxEnhanced) return;
  input.dataset.rpgxEnhanced = "true";

  const currentVal = input.value || "qwen2.5:7b";
  const isCustom = !MODEL_TIERS.some(t => t.value === currentVal);

  const wrapper = document.createElement("div");
  wrapper.className = "rpgx-model-combo";

  const select = document.createElement("select");
  select.className = "rpgx-model-select";

  for (const tier of MODEL_TIERS) {
    const opt = document.createElement("option");
    opt.value = tier.value;
    opt.textContent = tier.label;
    if (tier.value === currentVal) opt.selected = true;
    select.appendChild(opt);
  }

  const customOpt = document.createElement("option");
  customOpt.value = "__custom__";
  customOpt.textContent = "Custom...";
  if (isCustom) customOpt.selected = true;
  select.appendChild(customOpt);

  const custom = document.createElement("input");
  custom.type = "text";
  custom.className = "rpgx-model-custom";
  custom.placeholder = "Enter model name (e.g. llama3, mistral:7b)";
  custom.value = isCustom ? currentVal : "";
  custom.style.display = isCustom ? "block" : "none";

  wrapper.appendChild(select);
  wrapper.appendChild(custom);
  input.style.display = "none";
  input.parentNode.insertBefore(wrapper, input.nextSibling);

  select.addEventListener("change", () => {
    if (select.value === "__custom__") {
      custom.style.display = "block";
      custom.focus();
      input.value = custom.value;
    } else {
      custom.style.display = "none";
      input.value = select.value;
    }
    input.dispatchEvent(new Event("change"));
  });

  custom.addEventListener("input", () => {
    input.value = custom.value;
    input.dispatchEvent(new Event("change"));
  });
}

for (const hookName of ["renderSettingsConfig", "renderPackageConfiguration", "renderSettings", "renderApplicationV2"]) {
  Hooks.on(hookName, (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;
    const input = root.querySelector(`[name="${MODULE_ID}.ollamaModel"]`);
    if (input) enhanceModelInput(input);
  });
}

Hooks.once("ready", () => {
  const observer = new MutationObserver(() => {
    const input = document.querySelector(`[name="${MODULE_ID}.ollamaModel"]`);
    if (input && !input.dataset.rpgxEnhanced) enhanceModelInput(input);
  });
  observer.observe(document.body, { childList: true, subtree: true });
});
