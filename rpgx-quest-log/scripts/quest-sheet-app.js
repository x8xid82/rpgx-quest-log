/**
 * RPGX Quest Log — Quest Sheet Application v3
 * scripts/quest-sheet-app.js
 *
 * CHANGELOG v3:
 *  - assigners (array) replaces assigner (single) — full multi-quest-giver support
 *  - getData() now passes isPaidTier to the template
 *  - _onGenerateQuest() guards against free-tier AI access server-side
 *    (template also hides the UI, this is the belt-and-suspenders check)
 *  - _extractActorTraits() — system-agnostic scraper for biography, personality
 *    traits, ideals, bonds, and flaws. Tries common field paths, strips HTML,
 *    and silently returns nothing when fields don't exist.
 *  - _buildQuestContext() — assembles full context from live actor sheets
 *    right before AI generation so the prompt is always current.
 */

const MODULE_ID = 'rpgx-quest-log';

export class QuestSheetApp extends FormApplication {

  constructor(questId, options = {}) {
    super({}, options);
    this.questId = questId;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id:             'rpgx-quest-sheet',
      title:          'Quest Manager',
      template:       `modules/${MODULE_ID}/templates/quest-sheet.hbs`,
      width:          600,
      height:         720,
      resizable:      true,
      minimizable:    true,
      closeOnSubmit:  false,
      submitOnChange: false,
      classes:        ['rpgx-app', 'rpgx-quest-sheet'],
      tabs: [{ navSelector: '.rpgx-sheet-tabs', contentSelector: '.rpgx-sheet-body', initial: 'details' }]
    });
  }

  get title() { return 'Quest Manager'; }
  get _LogApp() { return game.rpgxQuestLog?.QuestLogApp; }

  static openQuest(questId) {
    const existing = Object.values(ui.windows).find(
      w => w instanceof QuestSheetApp && w.questId === questId
    );
    if (existing) { existing.bringToTop(); return existing; }
    const app = new QuestSheetApp(questId);
    app.render(true);
    return app;
  }

  static async createNew() {
    const quest = await game.rpgxQuestLog.store.create({ title: 'New Quest' });
    if (!quest) return null;   // store already showed the free-tier warning
    const app = new QuestSheetApp(quest.id);
    app.render(true);
    game.rpgxQuestLog.QuestLogApp?._instance?.render(false);
    return app;
  }

  get quest() { return game.rpgxQuestLog.store.getById(this.questId); }

  getData() {
    const quest = this.quest;
    if (!quest) { ui.notifications.error('Quest not found.'); this.close(); return {}; }

    const isPaidTier = game.rpgxQuestLog.store.isPaidTier;

    const milestones = (quest.milestones || []).map(m => ({
      ...m,
      isCompleted: m.status === 'completed',
      isFailed:    m.status === 'failed',
    }));

    const assignees = quest.assignees || [];
    const items = (quest.rewards.items || []).map((item, idx) => ({
      ...item,
      index:     idx,
      assignees: assignees.map(a => ({
        ...a,
        selected: a.actorId === item.assignedTo,
      })),
    }));

    return {
      quest: { ...quest, rewards: { ...quest.rewards, items } },
      isGM:               game.user.isGM,
      isPaidTier,
      protonDetected:     game.rpgxQuestLog.store.protonDetected,
      canDistribute:      assignees.length > 0,
      isJobBoard:         quest.status === 'jobboard',  // Players can claim job board quests
      hasRewards:         quest.rewards.xp > 0 || quest.rewards.gp > 0 || quest.rewards.sp > 0 ||
                          quest.rewards.cp > 0 || quest.rewards.items.length > 0 || quest.rewards.customCurrency,
      hasMilestones:      milestones.length > 0,
      milestones,
      milestonesRevealed:  quest.milestonesRevealed || false,
      hiddenMilestones:    quest.hiddenMilestones    || '',
      statuses: [
        { value: 'jobboard',  label: 'Job Board',  icon: 'fa-clipboard-list', class: 'status-jobboard'  },
        { value: 'active',    label: 'Active',     icon: 'fa-circle-play',    class: 'status-active'    },
        { value: 'completed', label: 'Completed',  icon: 'fa-circle-check',   class: 'status-completed' },
        { value: 'failed',    label: 'Failed',     icon: 'fa-circle-xmark',   class: 'status-failed'    },
        { value: 'abandoned', label: 'Abandoned',  icon: 'fa-circle-minus',   class: 'status-abandoned' },
      ],
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Auto-save text areas on keystroke (debounced 800ms)
    const autoSave = foundry.utils.debounce(async () => {
      const desc    = html.find('[name="description"]').val()     ?? '';
      const notes   = html.find('[name="gmNotes"]').val()         ?? '';
      const hidden  = html.find('[name="hiddenMilestones"]').val() ?? '';
      await game.rpgxQuestLog.store.update(this.questId, {
        description: desc, gmNotes: notes, hiddenMilestones: hidden
      });
    }, 800);
    html.find('[name="description"], [name="gmNotes"], [name="hiddenMilestones"]').on('input', autoSave);

    // Click portrait to open actor/item sheet (GM + players)
    html.find('.rpgx-actor-portrait').click(this._onActorClick.bind(this));
    html.find('.rpgx-item-name-link').click(this._onItemClick.bind(this));

    // ── Job Board: Players can claim quests by dropping their characters ──
    const quest = this.quest;
    if (!game.user.isGM && quest?.status === 'jobboard') {
      this._setupDropZone(html, '.drop-assignees', this._onPlayerClaimQuest.bind(this));
    }

    if (game.user.isGM) {
      // ── Drop zones ──────────────────────────────────────────────────────────
      // Note: assigners zone uses .drop-assigners (plural) — multiple quest givers
      this._setupDropZone(html, '.drop-assigners', this._onDropAssigner.bind(this));
      this._setupDropZone(html, '.drop-assignees', this._onDropAssignee.bind(this));
      this._setupDropZone(html, '.drop-items',     this._onDropItem.bind(this));

      // ── Remove buttons ──────────────────────────────────────────────────────
      // btn-remove-assigner now requires data-actor-id (same as assignees)
      html.find('.btn-remove-assigner').click(this._onRemoveAssigner.bind(this));
      html.find('.btn-remove-assignee').click(this._onRemoveAssignee.bind(this));
      html.find('.btn-remove-item').click(this._onRemoveItem.bind(this));

      // ── Status / rewards ────────────────────────────────────────────────────
      html.find('.rpgx-status-btn').click(this._onStatusChange.bind(this));
      html.find('.btn-reveal-rewards').click(this._onRevealRewards.bind(this));
      html.find('.btn-distribute-xp').click(this._onDistributeXP.bind(this));
      html.find('.btn-distribute-currency').click(this._onDistributeCurrency.bind(this));
      html.find('.rpgx-item-assign').on('change', this._onItemAssign.bind(this));
      html.find('.btn-award-loot').click(this._onAwardLoot.bind(this));

      // ── Milestones ──────────────────────────────────────────────────────────
      html.find('.btn-add-milestone').click(this._onAddMilestone.bind(this));
      html.find('.btn-milestone-complete').click(this._onMilestoneComplete.bind(this));
      html.find('.btn-milestone-fail').click(this._onMilestoneFail.bind(this));
      html.find('.btn-remove-milestone').click(this._onRemoveMilestone.bind(this));
      html.find('.rpgx-milestone-text').on('change', this._onMilestoneTextChange.bind(this));
      html.find('.btn-reveal-milestones').click(this._onRevealMilestones.bind(this));

      // ── AI ──────────────────────────────────────────────────────────────────
      html.find('.btn-generate-quest').click(this._onGenerateQuest.bind(this));

      // ── Delete ──────────────────────────────────────────────────────────────
      html.find('.btn-delete-quest').click(this._onDeleteQuest.bind(this));
    }
  }

  _setupDropZone(html, selector, handler) {
    const el = html.find(selector)[0];
    if (!el) return;
    el.addEventListener('dragover',  e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; el.classList.add('drag-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', async e => { e.preventDefault(); el.classList.remove('drag-over'); await handler(e); });
  }

  // ─── DROP HANDLERS ────────────────────────────────────────────────────────

  /**
   * Drop onto the quest givers zone — adds to the `assigners` array.
   * Duplicate actors are rejected with a warning.
   */
  async _onDropAssigner(event) {
    const actor = await this._getActorFromDrop(event);
    if (!actor) return;

    const quest = this.quest;
    const assigners = quest.assigners || [];

    if (assigners.some(a => a.actorId === actor.id)) {
      ui.notifications.warn(`${actor.name} is already listed as a quest giver.`);
      return;
    }

    await this._savePartial({
      assigners: [...assigners, { actorId: actor.id, name: actor.name, img: actor.img }]
    });
    this.render(false);
  }

  /**
   * Player-specific handler for claiming job board quests.
   * Sends a socket message to GM instead of directly updating settings.
   */
  async _onPlayerClaimQuest(event) {
    const actor = await this._getActorFromDrop(event);
    if (!actor) return;
    
    const quest = this.quest;
    if (quest.assignees.some(a => a.actorId === actor.id)) {
      ui.notifications.warn(`${actor.name} is already assigned.`);
      return;
    }

    // Send socket message to GM to claim the quest
    game.socket.emit(`module.${MODULE_ID}`, {
      type: 'PLAYER_CLAIM_QUEST',
      payload: {
        questId: this.questId,
        actorId: actor.id,
        actorName: actor.name,
        actorImg: actor.img,
        playerName: game.user.name
      }
    });

    ui.notifications.info(`Claiming quest with ${actor.name}...`);
    this.close();
  }

  async _onDropAssignee(event) {
    const actor = await this._getActorFromDrop(event);
    if (!actor) return;
    if (this.quest.assignees.some(a => a.actorId === actor.id)) {
      ui.notifications.warn(`${actor.name} is already assigned.`); return;
    }
    await this._savePartial({ assignees: [...this.quest.assignees, { actorId: actor.id, name: actor.name, img: actor.img }] });
    this.render(false);
  }

  async _onDropItem(event) {
    let data;
    try { data = JSON.parse(event.dataTransfer.getData('text/plain')); } catch { return; }
    if (data.type !== 'Item') { ui.notifications.warn('Only items can be dropped here.'); return; }
    let item = null;
    try { item = data.uuid ? await fromUuid(data.uuid) : game.items.get(data.id); } catch {}
    if (!item) { ui.notifications.warn('Could not find that item.'); return; }
    const newItems = [...this.quest.rewards.items, {
      itemId: item.id, uuid: item.uuid || null, name: item.name,
      img: item.img, quantity: 1, assignedTo: null,
    }];
    await this._savePartial({ 'rewards.items': newItems });
    this.render(false);
  }

  async _getActorFromDrop(event) {
    let data;
    try { data = JSON.parse(event.dataTransfer.getData('text/plain')); } catch {
      ui.notifications.warn('Could not read drop data.'); return null;
    }
    let actor = null;
    if (data.type === 'Actor')      actor = data.uuid ? await fromUuid(data.uuid) : game.actors.get(data.id);
    else if (data.type === 'Token') actor = canvas.tokens?.get(data.tokenId)?.actor ?? null;
    if (!actor) ui.notifications.warn('Only actors can be dropped here.');
    return actor;
  }

  // ─── REMOVE HANDLERS ──────────────────────────────────────────────────────

  /**
   * Removes a specific assigner by actorId from the assigners array.
   * Requires data-actor-id on the button (same pattern as assignees).
   */
  async _onRemoveAssigner(event) {
    event.preventDefault();
    const actorId  = event.currentTarget.dataset.actorId;
    const assigners = (this.quest.assigners || []).filter(a => a.actorId !== actorId);
    await this._savePartial({ assigners });
    this.render(false);
  }

  async _onRemoveAssignee(event) {
    event.preventDefault();
    const actorId = event.currentTarget.dataset.actorId;
    await this._savePartial({ assignees: this.quest.assignees.filter(a => a.actorId !== actorId) });
    this.render(false);
  }

  async _onRemoveItem(event) {
    event.preventDefault();
    const idx = parseInt(event.currentTarget.dataset.index);
    await this._savePartial({ 'rewards.items': this.quest.rewards.items.filter((_, i) => i !== idx) });
    this.render(false);
  }

  // ─── STATUS / REWARDS ─────────────────────────────────────────────────────

  async _onStatusChange(event) {
    event.preventDefault();
    await this._savePartial({ status: event.currentTarget.dataset.status });
    this.element.find('.rpgx-status-btn').removeClass('is-active');
    event.currentTarget.classList.add('is-active');
    game.rpgxQuestLog.QuestLogApp?._instance?.render(false);
  }

  async _onRevealRewards(event) {
    event.preventDefault();
    await game.rpgxQuestLog.store.toggleRevealRewards(this.questId);
    this.render(false);
  }

  async _onDistributeXP(event) {
    event.preventDefault();
    await this._saveFormData();
    await game.rpgxQuestLog.store.distributeXP(this.questId);
    this.element.find('[name="rewards.xp"]').val(0);
  }

  async _onDistributeCurrency(event) {
    event.preventDefault();
    await this._saveFormData();
    await game.rpgxQuestLog.store.distributeCurrency(this.questId);
    this.element.find('[name="rewards.gp"],[name="rewards.sp"],[name="rewards.cp"],[name="rewards.pp"]').val(0);
  }

  async _onItemAssign(event) {
    const idx     = parseInt(event.currentTarget.dataset.index);
    const actorId = event.currentTarget.value || null;
    const items   = foundry.utils.deepClone(this.quest.rewards.items);
    if (items[idx]) items[idx].assignedTo = actorId;
    await this._savePartial({ 'rewards.items': items });
  }

  async _onAwardLoot(event) {
    event.preventDefault();
    await game.rpgxQuestLog.store.awardLoot(this.questId);
    this.render(false);
  }

  // ─── MILESTONES ───────────────────────────────────────────────────────────

  async _onItemClick(event) {
    const itemUuid = event.currentTarget.dataset.itemUuid;
    const itemId   = event.currentTarget.dataset.itemId;
    try {
      const item = itemUuid ? await fromUuid(itemUuid) : game.items.get(itemId);
      if (item) item.sheet.render(true);
      else ui.notifications.warn('Item not found in this world.');
    } catch { ui.notifications.warn('Could not open item sheet.'); }
  }

  async _onAddMilestone(event) {
    event.preventDefault();
    await game.rpgxQuestLog.store.addMilestone(this.questId);
    this.render(false);
  }

  async _onMilestoneComplete(event) {
    event.preventDefault();
    const id = event.currentTarget.dataset.milestoneId;
    const ms = (this.quest.milestones || []).find(m => m.id === id);
    if (!ms) return;
    await game.rpgxQuestLog.store.updateMilestone(this.questId, id, { status: ms.status === 'completed' ? 'pending' : 'completed' });
    this.render(false);
  }

  async _onMilestoneFail(event) {
    event.preventDefault();
    const id = event.currentTarget.dataset.milestoneId;
    const ms = (this.quest.milestones || []).find(m => m.id === id);
    if (!ms) return;
    await game.rpgxQuestLog.store.updateMilestone(this.questId, id, { status: ms.status === 'failed' ? 'pending' : 'failed' });
    this.render(false);
  }

  async _onMilestoneTextChange(event) {
    const id   = event.currentTarget.dataset.milestoneId;
    const text = event.currentTarget.value || '';
    await game.rpgxQuestLog.store.updateMilestone(this.questId, id, { text });
  }

  async _onRemoveMilestone(event) {
    event.preventDefault();
    const id = event.currentTarget.dataset.milestoneId;
    await game.rpgxQuestLog.store.removeMilestone(this.questId, id);
    this.render(false);
  }

  async _onRevealMilestones(event) {
    event.preventDefault();
    await game.rpgxQuestLog.store.toggleRevealMilestones(this.questId);
    this.render(false);
  }

  // ─── AI CONTEXT BUILDING ──────────────────────────────────────────────────

  /**
   * System-agnostic trait extractor.
   *
   * Tries the most common field paths used by D&D 5e, PF2e, and generic
   * systems. Any field that doesn't exist, is empty, or throws simply
   * returns nothing for that field — it never errors out.
   *
   * HTML is stripped (Foundry's rich-text editor stores biography as HTML).
   * Fields are capped at sensible character limits to keep prompts lean.
   *
   * @param {Actor} actor - A Foundry Actor document
   * @returns {object} Flat object with only the fields that had content
   */
  _extractActorTraits(actor) {
    if (!actor) return {};

    // Strip HTML tags and collapse whitespace
    const stripHTML = (str) => {
      if (!str || typeof str !== 'string') return '';
      return str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    };

    // Safely walk a dot-path on an object — never throws
    const get = (obj, path) => {
      try {
        return path.split('.').reduce((o, k) => (o != null && o[k] !== undefined ? o[k] : null), obj) ?? null;
      } catch { return null; }
    };

    const sys = actor.system || {};

    // ── Biography ────────────────────────────────────────────────────────────
    // NPC sheets in dnd5e have two biography sections:
    //   biography.public  → the "Public" block (visible to players, great for voice/personality)
    //   biography.value   → the "Details" block (GM-facing backstory)
    // PC sheets typically only use biography.value.
    // PF2e uses biography.backstory.
    // We grab both NPC sections and combine them — Public first for voice priority.
    const bioPublic = stripHTML(get(sys, 'details.biography.public') || '');
    const bioDetail = stripHTML(
      get(sys, 'details.biography.value') ||
      get(sys, 'details.biography.backstory') ||
      get(sys, 'biography.value') ||
      (typeof get(sys, 'details.biography') === 'string' ? get(sys, 'details.biography') : '') ||
      ''
    );
    // Join with a separator only if both exist; otherwise just use whichever is present
    const biography = [bioPublic, bioDetail].filter(Boolean).join(' | ');

    // ── Creature Type ─────────────────────────────────────────────────────────
    // 5e: system.details.type is an object { value, subtype, swarm, custom }
    //     'custom' overrides 'value' when set (e.g. "Ancient Vampire Lord")
    // PF2e: system.details.creatureType (plain string)
    // Fallback: system.details.race (some older/generic systems)
    let creatureType = '';
    const typeObj = get(sys, 'details.type');
    if (typeObj && typeof typeObj === 'object') {
      // Use custom label if the GM filled it in, otherwise use the type value
      const base    = stripHTML(typeObj.custom || typeObj.value || '');
      const subtype = stripHTML(typeObj.subtype || '');
      creatureType  = subtype ? `${base} (${subtype})` : base;
    } else {
      creatureType = stripHTML(
        (typeof typeObj === 'string' ? typeObj : '') ||
        get(sys, 'details.creatureType') ||
        get(sys, 'details.race') ||
        ''
      );
    }

    // ── Alignment ─────────────────────────────────────────────────────────────
    // 5e: system.details.alignment (plain string, e.g. "Chaotic Evil")
    // PF2e: system.details.alignment.value
    const alignment = stripHTML(
      get(sys, 'details.alignment.value') ||
      (typeof get(sys, 'details.alignment') === 'string' ? get(sys, 'details.alignment') : '') ||
      ''
    );

    // ── Personality Traits ────────────────────────────────────────────────────
    // 5e: system.details.trait (plain string)
    // Some systems: system.details.traits / system.details.personality
    const traits = stripHTML(
      get(sys, 'details.trait') ||
      get(sys, 'details.traits.value') ||
      get(sys, 'details.personality') ||
      ''
    );

    // ── Ideals ────────────────────────────────────────────────────────────────
    const ideals = stripHTML(
      get(sys, 'details.ideal') ||
      get(sys, 'details.ideals') ||
      ''
    );

    // ── Bonds ─────────────────────────────────────────────────────────────────
    const bonds = stripHTML(
      get(sys, 'details.bond') ||
      get(sys, 'details.bonds') ||
      ''
    );

    // ── Flaws ─────────────────────────────────────────────────────────────────
    const flaws = stripHTML(
      get(sys, 'details.flaw') ||
      get(sys, 'details.flaws') ||
      ''
    );

    // Return only populated fields, capped to prevent prompt bloat.
    // Biography gets a higher cap (800) because NPC sheets can have two rich sections.
    const result = {};
    if (biography)    result.biography    = biography.slice(0, 800);
    if (creatureType) result.creatureType = creatureType.slice(0, 100);
    if (alignment)    result.alignment    = alignment.slice(0, 100);
    if (traits)       result.traits       = traits.slice(0, 250);
    if (ideals)       result.ideals       = ideals.slice(0, 250);
    if (bonds)        result.bonds        = bonds.slice(0, 250);
    if (flaws)        result.flaws        = flaws.slice(0, 250);

    return result;
  }

  /**
   * Assembles the full AI context object from the quest's current assigners
   * and assignees by looking up their live actor sheets.
   *
   * Called immediately before AI generation so the data is always fresh —
   * if a GM updated a character sheet since loading this form, the new
   * data is used.
   *
   * Actors that cannot be found (deleted, from a different world, etc.)
   * are silently skipped.
   *
   * @returns {{ assigners: object[], assignees: object[] }}
   */
  _buildQuestContext() {
    const quest = this.quest;

    const buildEntry = ({ actorId, name }) => {
      const actor  = game.actors.get(actorId);
      const traits = this._extractActorTraits(actor);
      return { name, ...traits };
    };

    const assigners = (quest.assigners || [])
      .map(a => buildEntry(a))
      .filter(a => a.name);   // skip any entry without a name

    const assignees = (quest.assignees || [])
      .map(a => buildEntry(a))
      .filter(a => a.name);

    return { assigners, assignees };
  }

  // ─── AI GENERATION ────────────────────────────────────────────────────────

  async _onGenerateQuest(event) {
    event.preventDefault();

    // Belt-and-suspenders: block free users even if template is somehow bypassed
    if (!game.rpgxQuestLog.store.isPaidTier) {
      ui.notifications.warn(
        'AI Quest Generation requires an RPGX Pro subscription. ' +
        'Subscribe at patreon.com/c/rpgxstudios or enter your license key in Module Settings.'
      );
      return;
    }

    const prompt  = this.element.find('.ollama-prompt').val()?.trim() || '';
    const context = this._buildQuestContext();

    const btn = $(event.currentTarget);
    btn.prop('disabled', true).html('<i class="fas fa-spinner fa-spin"></i> Searching world lore...');

    // Progress callback — keeps the button label in sync with what's actually happening
    const onProgress = (stage) => {
      btn.html(`<i class="fas fa-spinner fa-spin"></i> ${stage}`);
    };

    try {
      const result = await game.rpgxQuestLog.ollama.generateQuest(prompt, context, onProgress);
      if (!result) return;
      this.element.find('[name="title"]').val(result.title || '');
      this.element.find('[name="description"]').val(result.description || '');
      this.element.find('[name="gmNotes"]').val(result.gmNotes || '');
      await this._savePartial({ title: result.title || '', description: result.description || '', gmNotes: result.gmNotes || '' });
      ui.notifications.info('✨ Quest generated! Review and click Save Quest when ready.');
    } catch(e) {
      ui.notifications.error(`AI generation failed: ${e.message}`);
      console.error('RPGX Quest Log | Ollama error:', e);
    } finally {
      btn.prop('disabled', false).html('<i class="fas fa-wand-magic-sparkles"></i> Generate Quest');
    }
  }

  // ─── DELETE ───────────────────────────────────────────────────────────────

  async _onDeleteQuest(event) {
    event.preventDefault();
    const quest     = this.quest;
    const confirmed = await Dialog.confirm({
      title:   'Delete Quest',
      content: `<p>Permanently delete <strong>"${quest.title}"</strong>?<br>This cannot be undone.</p>`,
    });
    if (confirmed) {
      await game.rpgxQuestLog.store.delete(this.questId);
      this.close();
      game.rpgxQuestLog.QuestLogApp?._instance?.render(false);
    }
  }

  _onActorClick(event) {
    const actor = game.actors.get(event.currentTarget.dataset.actorId);
    if (actor) actor.sheet.render(true);
    else ui.notifications.warn('Character not found in this world.');
  }

  // ─── SAVING ───────────────────────────────────────────────────────────────

  async _updateObject(event, formData) {
    const quest = game.rpgxQuestLog.store.getById(this.questId);
    
    // Job Board → Active auto-transition:
    // If this is a job board quest and assignees were just added, claim it
    if (quest?.status === 'jobboard' && formData.assignees?.length > 0) {
      // Extract newly added actor IDs
      const existingIds = quest.assignees.map(a => a.actorId);
      const newActorIds = formData.assignees
        .map(a => a.actorId)
        .filter(id => !existingIds.includes(id));
      
      if (newActorIds.length > 0) {
        // Use claimQuest which handles status change + chat card
        await game.rpgxQuestLog.store.claimQuest(this.questId, newActorIds);
        ui.notifications.info('Quest claimed!');
        game.rpgxQuestLog.QuestLogApp?._instance?.render(false);
        this.close();
        return;
      }
    }
    
    // Normal save for all other cases
    await game.rpgxQuestLog.store.update(this.questId, formData);
    ui.notifications.info('Quest saved!');
    game.rpgxQuestLog.QuestLogApp?._instance?.render(false);
    this.close();
  }

  async _savePartial(changes) {
    return game.rpgxQuestLog.store.update(this.questId, changes);
  }

  async _saveFormData() {
    const form = this.element.find('form')[0] ?? this.element[0];
    if (form) {
      const fd = new FormDataExtended(form);
      await game.rpgxQuestLog.store.update(this.questId, fd.object);
    }
  }
}
