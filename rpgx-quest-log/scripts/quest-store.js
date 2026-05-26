/**
 * RPGX Quest Log — Quest Store v3
 * scripts/quest-store.js
 *
 * CHANGELOG v3:
 *  - assigner (single) → assigners (array) — multiple quest givers per quest
 *  - getAll() auto-normalises old data on read (no manual migration needed)
 *  - FREE_TIER_MAX reduced to 3
 *  - isPaidTier / maxQuests restored
 *  - Free-tier quest cap check restored in create()
 *  - validateSubscription() — pings Proton /api/subscription for Patreon status
 *    TODO: once Proton Patreon files are shared, confirm the exact endpoint path
 *          and response shape, then remove the TODO comment here.
 *
 * Security:
 *  - _getToken() reads auth token from rpgx-ai settings first (shared Proton instance),
 *    falls back to this module's own protonToken setting if rpgx-ai is not installed.
 *  - validateSubscription() sends Authorization: Bearer header on every Proton fetch.
 */

const MODULE_ID   = 'rpgx-quest-log';
const FREE_TIER_MAX = 10;  // Free users: max 10 quests per world

export class QuestStore {

  constructor() {
    // Cached Proton / Patreon validation results.
    // null  = not yet checked
    // true  = confirmed
    // false = not valid / not reachable
    this._patreonValid   = null;   // subscription is active (confirmed by Proton)
    this._protonDetected = false;  // Proton is running and reachable at all
  }

  // ─── TIER CHECKING ────────────────────────────────────────────────────────

  /**
   * Returns true only if RPGX Proton is running AND the Patreon subscription
   * is active. Proton is the sole validator — no license keys.
   */
  get isPaidTier() {
    return this._patreonValid === true;
  }

  /**
   * Returns true if RPGX Proton was reachable on the last validation check,
   * regardless of subscription status. Used to show different UI messages:
   *   protonDetected=false → "Install/run Proton"
   *   protonDetected=true, isPaidTier=false → "Subscribe on Patreon"
   */
  get protonDetected() {
    return this._protonDetected === true;
  }

  get maxQuests() {
    return this.isPaidTier ? Infinity : FREE_TIER_MAX;
  }

  /**
   * Checks RPGX Proton status in two separate steps so a subscription
   * endpoint problem can never make Proton look offline.
   *
   * STEP 1 — /ping
   *   Always exists. If this throws, Proton genuinely isn't running.
   *   If this succeeds, _protonDetected = true regardless of what happens next.
   *
   * STEP 2 — /api/subscription
   *   Only reached if /ping succeeded. Sets _patreonValid based on response.
   *   If this endpoint isn't implemented yet, or returns any error, we stay
   *   on free tier but Proton is still shown as detected.
   *
   * Authorization: Bearer is sent on every request via _getToken().
   */
  async validateSubscription() {
    const protonBase = (game.settings.get(MODULE_ID, 'ragBase') || 'http://127.0.0.1:3033').replace(/\/$/, '');
    const token      = this._getToken();

    // ── STEP 1: Is Proton running at all? ─────────────────────────────────
    try {
      const pingRes = await fetch(`${protonBase}/ping`, {
        signal:  AbortSignal.timeout(5000),
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (pingRes.ok) {
        this._protonDetected = true;
        console.log('RPGX Quest Log | Proton detected via /ping.');
      } else {
        // Proton is reachable but returned an error on /ping (token issue?)
        this._protonDetected = true;
        this._patreonValid   = false;
        console.warn(`RPGX Quest Log | Proton /ping returned ${pingRes.status} — check auth token.`);
        return;
      }
    } catch (err) {
      // Proton is not running or not reachable
      this._protonDetected = false;
      this._patreonValid   = false;
      console.log(`RPGX Quest Log | RPGX Proton not detected — free tier active. (${err.message})`);
      return;
    }

    // ── STEP 2: Is the subscription active? ───────────────────────────────
    // Proton is running — now check paid tier separately.
    // If the endpoint doesn't exist yet or returns any error, stay free tier
    // but keep _protonDetected = true so the UI shows the right message.
    try {
      const subRes = await fetch(`${protonBase}/api/subscription`, {
        signal:  AbortSignal.timeout(5000),
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (subRes.ok) {
        const data         = await subRes.json();
        this._patreonValid = data.active === true;
        console.log(`RPGX Quest Log | Subscription: ${this._patreonValid ? 'Pro ✓' : 'inactive'}`);
      } else {
        // Endpoint exists but returned an error (404 = not yet implemented, etc.)
        this._patreonValid = false;
        console.warn(`RPGX Quest Log | /api/subscription returned ${subRes.status} — defaulting to free tier.`);
      }
    } catch (err) {
      // Subscription check failed but Proton IS running — stay free tier
      this._patreonValid = false;
      console.warn(`RPGX Quest Log | Subscription check failed — defaulting to free tier. (${err.message})`);
    }
  }

  // ─── READING ──────────────────────────────────────────────────────────────

  /**
   * Returns all quests, auto-normalising any v1 data that used a single
   * `assigner` object instead of the new `assigners` array.
   * This is non-destructive — it doesn't write anything back.
   */
  getAll() {
    const raw = game.settings.get(MODULE_ID, 'quests') || [];
    return raw.map(q => this._normalizeQuest(q));
  }

  getById(id)    { return this.getAll().find(q => q.id === id); }
  getByStatus(s) { return this.getAll().filter(q => q.status === s); }

  /**
   * Runtime migration: converts old single-assigner format to the new array.
   * Called on every getAll() read so the UI always works regardless of
   * whether the persisted data has been updated yet.
   *
   *   Old: { assigner: { actorId, name, img } }
   *   New: { assigners: [{ actorId, name, img }, ...] }
   */
  _normalizeQuest(q) {
    if (q.assigners !== undefined) return q;                        // already v3
    return {
      ...q,
      assigners: q.assigner ? [q.assigner] : [],
      // deliberately leave the old `assigner` key present on the runtime
      // object so any stale template code doesn't break — it won't be saved
    };
  }

  // ─── CREATING ─────────────────────────────────────────────────────────────

  /**
   * Creates a new quest after checking the free-tier cap.
   * Returns the new quest object, or null if the cap is reached.
   */
  async create(questData = {}) {
    const quests = this.getAll();

    // ── Free-tier cap check ──────────────────────────────────────────────────
    if (quests.length >= this.maxQuests) {
      ui.notifications.warn(
        `RPGX Quest Log: Free tier allows up to ${FREE_TIER_MAX} quests. ` +
        `Premium features require RPGX Proton — download free at rpgxstudios.com.`
      );
      return null;
    }

    const newQuest = {
      id:                  foundry.utils.randomID(),
      title:               questData.title               ?? 'New Quest',
      description:         questData.description         ?? '',
      gmNotes:             questData.gmNotes             ?? '',
      status:              questData.status              ?? 'active',
      assigners:           questData.assigners           ?? [],   // ← array (v3)
      assignees:           questData.assignees           ?? [],
      milestones:          questData.milestones          ?? [],
      milestonesRevealed:  questData.milestonesRevealed  ?? false,
      hiddenMilestones:    questData.hiddenMilestones    ?? '',
      rewards: {
        items:          questData.rewards?.items          ?? [],
        pp:             questData.rewards?.pp             ?? 0,
        gp:             questData.rewards?.gp             ?? 0,
        sp:             questData.rewards?.sp             ?? 0,
        cp:             questData.rewards?.cp             ?? 0,
        customCurrency: questData.rewards?.customCurrency ?? '',
        xp:             questData.rewards?.xp             ?? 0,
        revealed:       false,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Save the raw quests array (not normalized — keeps stored data clean)
    const rawQuests = game.settings.get(MODULE_ID, 'quests') || [];
    rawQuests.push(newQuest);
    await game.settings.set(MODULE_ID, 'quests', rawQuests);
    this._broadcast('QUEST_CREATED', newQuest);
    return newQuest;
  }

  // ─── UPDATING ─────────────────────────────────────────────────────────────

  async update(id, changes) {
    const rawQuests = game.settings.get(MODULE_ID, 'quests') || [];
    const idx       = rawQuests.findIndex(q => q.id === id);
    if (idx === -1) {
      console.error(`RPGX Quest Log | Cannot update: quest ${id} not found.`);
      return null;
    }

    rawQuests[idx] = foundry.utils.mergeObject(
      foundry.utils.deepClone(rawQuests[idx]),
      changes,
      { inplace: false }
    );
    rawQuests[idx].updatedAt = Date.now();

    await game.settings.set(MODULE_ID, 'quests', rawQuests);
    this._broadcast('QUEST_UPDATED', rawQuests[idx]);
    return rawQuests[idx];
  }

  // ─── DELETING ─────────────────────────────────────────────────────────────

  async delete(id) {
    const rawQuests = game.settings.get(MODULE_ID, 'quests') || [];
    const filtered  = rawQuests.filter(q => q.id !== id);
    if (filtered.length === rawQuests.length) return false;
    await game.settings.set(MODULE_ID, 'quests', filtered);
    this._broadcast('QUEST_DELETED', { id });
    return true;
  }

  // ─── CONVENIENCE ──────────────────────────────────────────────────────────

  async setStatus(id, status) { return this.update(id, { status }); }

  /**
   * Claim a job board quest by adding assignees and transitioning to active.
   * Posts a chat card announcing who accepted the quest.
   * 
   * @param {string} id - Quest ID
   * @param {Array} actorIds - Array of actor IDs claiming the quest
   */
  async claimQuest(id, actorIds) {
    const quest = this.getById(id);
    if (!quest) {
      console.error(`RPGX Quest Log | Cannot claim: quest ${id} not found.`);
      return null;
    }

    // Build assignees array from actor IDs
    const assignees = actorIds.map(actorId => {
      const actor = game.actors.get(actorId);
      return actor ? { actorId, name: actor.name, img: actor.img } : null;
    }).filter(Boolean);

    if (!assignees.length) {
      ui.notifications.warn('No valid actors to assign to this quest.');
      return null;
    }

    // Update quest: add assignees and change status to active
    const updated = await this.update(id, {
      assignees: [...(quest.assignees || []), ...assignees],
      status: 'active'
    });

    // Post chat card
    const names = assignees.map(a => a.name).join(', ');
    ChatMessage.create({
      content: `<div class="rpgx-chat-claim">
        <strong>📋 Quest Accepted!</strong><br>
        <em>${quest.title}</em><br>
        ${names} ${assignees.length === 1 ? 'has' : 'have'} accepted this quest.
      </div>`,
      whisper: []
    });

    ui.notifications.info(`Quest "${quest.title}" accepted by ${names}`);
    return updated;
  }

  async toggleRevealRewards(id) {
    const q = this.getById(id);
    if (!q) return;
    return this.update(id, { 'rewards.revealed': !q.rewards.revealed });
  }

  async toggleRevealMilestones(id) {
    const q = this.getById(id);
    if (!q) return;
    return this.update(id, { milestonesRevealed: !q.milestonesRevealed });
  }

  // ─── MILESTONES ───────────────────────────────────────────────────────────

  async addMilestone(id) {
    const quest = this.getById(id);
    if (!quest) return;
    const newMs = { id: foundry.utils.randomID(), text: '', status: 'pending' };
    return this.update(id, { milestones: [...(quest.milestones || []), newMs] });
  }

  async updateMilestone(questId, milestoneId, changes) {
    const quest = this.getById(questId);
    if (!quest) return;
    const milestones = (quest.milestones || []).map(m =>
      m.id === milestoneId ? { ...m, ...changes } : m
    );
    return this.update(questId, { milestones });
  }

  async removeMilestone(questId, milestoneId) {
    const quest = this.getById(questId);
    if (!quest) return;
    const milestones = (quest.milestones || []).filter(m => m.id !== milestoneId);
    return this.update(questId, { milestones });
  }

  // ─── XP DISTRIBUTION ──────────────────────────────────────────────────────

  async distributeXP(id) {
    const quest = this.getById(id);
    if (!quest) return;
    const { xp } = quest.rewards;
    const { assignees } = quest;

    if (!assignees.length) { ui.notifications.warn('No characters assigned to this quest!'); return; }
    if (!xp || xp <= 0)   { ui.notifications.warn('No XP set for this quest.'); return; }

    const share  = Math.floor(xp / assignees.length);
    let   awarded = 0;

    for (const assignee of assignees) {
      const actor = game.actors.get(assignee.actorId);
      if (!actor) continue;
      const currentXP = actor.system?.details?.xp?.value ?? actor.system?.attributes?.xp?.value ?? 0;
      try {
        if (actor.system?.details?.xp !== undefined) {
          await actor.update({ 'system.details.xp.value': currentXP + share });
          awarded++;
        }
      } catch(e) { console.warn(`RPGX Quest Log | XP error for ${actor.name}:`, e); }
    }

    if (awarded > 0) {
      await this.update(id, { 'rewards.xp': 0 });
      ui.notifications.info(`Awarded ${xp} XP — ${share} each to ${awarded} character(s).`);
      ChatMessage.create({
        content: `<div class="rpgx-chat-award"><strong>⭐ Quest XP Awarded!</strong><br>
          <em>${quest.title}</em><br>
          ${assignees.map(a => `<span>${a.name}</span>`).join(', ')} each received <strong>${share} XP</strong>.
        </div>`, whisper: []
      });
    }
  }

  // ─── CURRENCY DISTRIBUTION ────────────────────────────────────────────────

  async distributeCurrency(id) {
    const quest = this.getById(id);
    if (!quest) return;
    const { gp, sp, cp, customCurrency } = quest.rewards;
    const { assignees } = quest;

    if (!assignees.length) { ui.notifications.warn('No characters assigned to this quest!'); return; }
    if (!gp && !sp && !cp && !customCurrency) { ui.notifications.warn('No currency rewards set.'); return; }

    const count  = assignees.length;
    const splits = {
      gp: { share: Math.floor(gp / count), remainder: gp % count },
      sp: { share: Math.floor(sp / count), remainder: sp % count },
      cp: { share: Math.floor(cp / count), remainder: cp % count },
    };

    let awarded = 0;
    for (let i = 0; i < assignees.length; i++) {
      const actor    = game.actors.get(assignees[i].actorId);
      const currency = actor?.system?.currency;
      if (!currency) continue;
      try {
        const updates = {};
        if (gp > 0) updates['system.currency.gp'] = (currency.gp || 0) + splits.gp.share + (i === 0 ? splits.gp.remainder : 0);
        if (sp > 0) updates['system.currency.sp'] = (currency.sp || 0) + splits.sp.share + (i === 0 ? splits.sp.remainder : 0);
        if (cp > 0) updates['system.currency.cp'] = (currency.cp || 0) + splits.cp.share + (i === 0 ? splits.cp.remainder : 0);
        await actor.update(updates);
        awarded++;
      } catch(e) { console.warn(`RPGX Quest Log | Currency error for ${actor.name}:`, e); }
    }

    if (awarded > 0) {
      await this.update(id, { 'rewards.gp': 0, 'rewards.sp': 0, 'rewards.cp': 0, 'rewards.pp': 0 });
      const lines = [`<strong>💰 Quest Rewards Distributed!</strong><br><em>${quest.title}</em><br><br>`];
      if (gp > 0) lines.push(`${gp} GP → <strong>${splits.gp.share} GP each</strong>`);
      if (sp > 0) lines.push(`${sp} SP → <strong>${splits.sp.share} SP each</strong>`);
      if (cp > 0) lines.push(`${cp} CP → <strong>${splits.cp.share} CP each</strong>`);
      if (customCurrency) lines.push(`<em>Custom: ${customCurrency}</em> (award manually)`);
      ChatMessage.create({ content: `<div class="rpgx-chat-award">${lines.join('<br>')}</div>`, whisper: [] });
      ui.notifications.info(`Currency distributed to ${awarded} character(s)!`);
    }
  }

  // ─── LOOT DISTRIBUTION ────────────────────────────────────────────────────

  async awardLoot(id) {
    const quest = this.getById(id);
    if (!quest) return;

    const assigned = quest.rewards.items.filter(i => i.assignedTo);
    if (!assigned.length) {
      ui.notifications.warn('No items are assigned to characters. Use the dropdowns on each item first.');
      return;
    }

    const remaining   = [];
    const awardedList = [];

    for (const item of quest.rewards.items) {
      if (!item.assignedTo) { remaining.push(item); continue; }
      const actor = game.actors.get(item.assignedTo);
      if (!actor) { remaining.push(item); continue; }
      try {
        let itemData = null;
        if (item.uuid) {
          const src = await fromUuid(item.uuid).catch(() => null);
          if (src) itemData = src.toObject();
        }
        if (!itemData) {
          const src = game.items.get(item.itemId);
          if (src) itemData = src.toObject();
        }
        if (!itemData) {
          itemData = { name: item.name, img: item.img, type: 'loot', system: {} };
        }
        if (item.quantity > 1 && itemData.system) itemData.system.quantity = item.quantity;
        delete itemData._id;
        await Item.create(itemData, { parent: actor });
        awardedList.push({ name: item.name, actorName: actor.name });
      } catch(e) {
        console.error(`RPGX Quest Log | Could not award ${item.name}:`, e);
        remaining.push(item);
      }
    }

    if (awardedList.length > 0) {
      await this.update(id, { 'rewards.items': remaining });
      ui.notifications.info(`Transferred ${awardedList.length} item(s) to character inventories!`);
      ChatMessage.create({
        content: `<div class="rpgx-chat-award"><strong>🎒 Loot Distributed!</strong><br>
          <em>${quest.title}</em><br><br>
          ${awardedList.map(a => `${a.name} → <strong>${a.actorName}</strong>`).join('<br>')}
        </div>`, whisper: []
      });
    }
  }

  // ─── TOKEN HELPER ─────────────────────────────────────────────────────────

  /**
   * Returns the RPGX Proton auth token.
   *
   * Reads from rpgx-ai module settings first — both modules talk to the same
   * Proton instance, so there is only ever one token to configure.
   * Falls back to this module's own protonToken setting if rpgx-ai is not installed.
   */
  _getToken() {
    try {
      const shared = game.settings.get('rpgx-ai', 'protonToken');
      if (shared) return shared;
    } catch { /* rpgx-ai not installed — fall through */ }
    return game.settings.get(MODULE_ID, 'protonToken') || '';
  }

  // ─── INTERNAL ─────────────────────────────────────────────────────────────

  _broadcast(type, payload) {
    game.socket.emit(`module.${MODULE_ID}`, { type, payload });
  }
}
