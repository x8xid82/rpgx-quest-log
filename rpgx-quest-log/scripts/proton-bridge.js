/**
 * RPGX Quest Log — Proton Bridge
 * ─────────────────────────────────────────────────────────────────────────────
 * This bridge is how the Foundry module "talks" to the RPG Proton app.
 *
 * HOW THE CONNECTION WORKS (all 3 server scenarios):
 * ┌─────────────────────────────────────────────────────┐
 * │  Scenario A: Remote server                          │
 * │  Proton App → Internet → Foundry Server             │
 * │                                                     │
 * │  Scenario B: Local network (LAN)                    │
 * │  Proton App → LAN → Foundry on host PC              │
 * │                                                     │
 * │  Scenario C: Same machine (GM's computer)           │
 * │  Proton App → localhost → Foundry (also running)    │
 * └─────────────────────────────────────────────────────┘
 *
 * In ALL cases: Proton connects to Foundry's existing WebSocket server
 * (the same one all the players use). It authenticates as a Foundry user
 * and sends socket messages with the `module.rpgx-quest-log` event name.
 *
 * This module-side code listens for those messages and responds.
 *
 * MESSAGE PROTOCOL (what Proton sends → what this sends back):
 *
 * Proton sends:   { type: 'PROTON_GET_QUESTS', requestId: 'uuid' }
 * Module replies: { type: 'PROTON_QUESTS_RESPONSE', payload: [...quests], requestId: 'uuid' }
 *
 * Proton sends:   { type: 'PROTON_GET_QUEST', payload: { id: 'questId' }, requestId: 'uuid' }
 * Module replies: { type: 'PROTON_QUEST_RESPONSE', payload: quest, requestId: 'uuid' }
 *
 * Proton sends:   { type: 'PROTON_UPDATE_STATUS', payload: { id, status } }
 * Module replies: (broadcasts the normal QUEST_UPDATED event to all clients)
 *
 * The `requestId` is a UUID that Proton generates per request so it can
 * match responses to the requests that triggered them.
 */

const MODULE_ID = 'rpgx-quest-log';

export class ProtonBridge {

  constructor(store) {
    this.store = store;
  }

  initialize() {
    console.log('RPGX Quest Log | Proton Bridge active. Listening for Proton connections.');

    // Listen for messages from Proton (and also from players requesting data)
    game.socket.on(`module.${MODULE_ID}`, (message) => this._handleMessage(message));

    // Also expose a direct JavaScript API so Proton can use it if running
    // in the same browser context (Scenario C: same machine, embedded panel)
    game.rpgxQuestLog.protonAPI = {
      getQuests:          ()         => this._serializeQuests(this.store.getAll()),
      getQuest:           (id)       => this._serializeQuest(this.store.getById(id)),
      updateQuestStatus:  (id, status) => this.store.setStatus(id, status),
      subscribeToUpdates: (callback) => this._addSubscriber(callback),
    };

    // Track subscribers for real-time push updates
    this._subscribers = [];
  }

  // ─── MESSAGE HANDLING ─────────────────────────────────────────────────────

  async _handleMessage(message) {
    // Validation: ignore messages without a type
    if (!message?.type) return;

    // Security: Only the GM can respond to data requests.
    // Players could also receive these messages, but only the GM acts on them.
    if (!game.user.isGM) {
      // Non-GM clients: only handle push notifications (re-render UI)
      this._notifySubscribers(message);
      return;
    }

    const { type, payload, requestId } = message;

    switch (type) {

      // ── GET ALL QUESTS ──────────────────────────────────────────────────
      case 'PROTON_GET_QUESTS': {
        const quests = this._serializeQuests(this.store.getAll());
        game.socket.emit(`module.${MODULE_ID}`, {
          type:      'PROTON_QUESTS_RESPONSE',
          payload:   quests,
          requestId: requestId,
        });
        break;
      }

      // ── GET SINGLE QUEST ────────────────────────────────────────────────
      case 'PROTON_GET_QUEST': {
        const quest = this.store.getById(payload?.id);
        game.socket.emit(`module.${MODULE_ID}`, {
          type:      'PROTON_QUEST_RESPONSE',
          payload:   quest ? this._serializeQuest(quest) : null,
          requestId: requestId,
        });
        break;
      }

      // ── UPDATE QUEST STATUS ─────────────────────────────────────────────
      case 'PROTON_UPDATE_STATUS': {
        if (!payload?.id || !payload?.status) break;
        await this.store.setStatus(payload.id, payload.status);
        // The store's _broadcast() will notify all clients including Proton
        break;
      }

      // ── PROTON PING (connection test) ───────────────────────────────────
      case 'PROTON_PING': {
        game.socket.emit(`module.${MODULE_ID}`, {
          type:      'PROTON_PONG',
          payload:   {
            moduleVersion: game.modules.get(MODULE_ID)?.version ?? 'unknown',
            worldName:     game.world?.title ?? 'Unknown World',
            isPaidTier:    this.store.isPaidTier,
            questCount:    this.store.getAll().length,
          },
          requestId: requestId,
        });
        break;
      }

      // ── DATA CHANGE NOTIFICATIONS ───────────────────────────────────────
      // These come from the QuestStore._broadcast() calls, not from Proton
      case 'QUEST_CREATED':
      case 'QUEST_UPDATED':
      case 'QUEST_DELETED':
        this._notifySubscribers(message);
        break;
    }
  }

  // ─── SERIALIZATION ────────────────────────────────────────────────────────

  /**
   * Converts quest data to a clean format safe to send over the network.
   * (This is a good place to strip sensitive data or add computed fields.)
   */
  _serializeQuests(quests) {
    return quests.map(q => this._serializeQuest(q));
  }

  _serializeQuest(quest) {
    if (!quest) return null;
    return {
      id:          quest.id,
      title:       quest.title,
      description: quest.description,
      gmNotes:     quest.gmNotes,   // Proton is a GM tool, so GM notes are included
      status:      quest.status,
      assigner:    quest.assigner,
      assignees:   quest.assignees,
      rewards:     quest.rewards,
      createdAt:   quest.createdAt,
      updatedAt:   quest.updatedAt,
    };
  }

  // ─── SUBSCRIBER SYSTEM ────────────────────────────────────────────────────

  /** Register a callback to be called whenever quest data changes */
  _addSubscriber(callback) {
    this._subscribers.push(callback);
    // Return an unsubscribe function
    return () => {
      this._subscribers = this._subscribers.filter(s => s !== callback);
    };
  }

  _notifySubscribers(message) {
    for (const sub of this._subscribers) {
      try { sub(message); } catch(e) { console.warn('RPGX | Subscriber error:', e); }
    }
  }
}
