/**
 * RPGX Quest Log — Quest Log Application v3
 * scripts/quest-log-app.js
 *
 * CHANGELOG v3:
 *  - _onRowStatusClick: clicking the status stripe opens a "Change Quest Status" dialog
 *  - Row assigner display updated to use `assigners` array (shows first assigner portrait)
 */

const MODULE_ID = 'rpgx-quest-log';

export class QuestLogApp extends Application {

  static _instance = null;

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id:          'rpgx-quest-log-window',
      title:       'RPGX Quest Log',
      template:    `modules/${MODULE_ID}/templates/quest-log.hbs`,
      width:       650,   // Increased from 460 - shows full quest titles + assignees
      height:      720,   // Increased from 580 - shows more quests without scrolling
      resizable:   true,
      minimizable: true,
      classes:     ['rpgx-app', 'rpgx-quest-log'],
      tabs: [{ navSelector: '.rpgx-tabs', contentSelector: '.rpgx-tab-body', initial: 'jobboard' }]  // Opens to Job Board by default
    });
  }

  get _SheetApp() { return game.rpgxQuestLog?.QuestSheetApp; }

  static openOrFocus() {
    if (QuestLogApp._instance?.rendered) {
      QuestLogApp._instance.bringToTop();
    } else {
      QuestLogApp._instance = new QuestLogApp();
      QuestLogApp._instance.render(true);
    }
    return QuestLogApp._instance;
  }

  getData() {
    const store     = game.rpgxQuestLog.store;
    const allQuests = store.getAll();
    const isGM      = game.user.isGM;
    const isPaidTier = store.isPaidTier;

    const filterForViewer = (quests) => {
      if (isGM) return quests;
      return quests.filter(q => q.assignees.some(a => game.actors.get(a.actorId)?.isOwner));
    };

    // Job Board special filter: ALL players can see job board quests
    const filterJobBoard = (quests) => {
      return quests; // Everyone sees job board, no filtering
    };

    const tabs = [
      { id: 'jobboard',  label: 'Job Board',  icon: 'fa-clipboard-list', quests: filterJobBoard(allQuests.filter(q => q.status === 'jobboard'))  },
      { id: 'active',    label: 'Active',     icon: 'fa-circle-play',    quests: filterForViewer(allQuests.filter(q => q.status === 'active'))    },
      { id: 'completed', label: 'Completed',  icon: 'fa-circle-check',   quests: filterForViewer(allQuests.filter(q => q.status === 'completed')) },
      { id: 'failed',    label: 'Failed',     icon: 'fa-circle-xmark',   quests: filterForViewer(allQuests.filter(q => q.status === 'failed'))    },
      { id: 'abandoned', label: 'Abandoned',  icon: 'fa-circle-minus',   quests: filterForViewer(allQuests.filter(q => q.status === 'abandoned')) },
    ];

    return {
      isGM,
      isPaidTier,
      protonDetected: store.protonDetected,
      tabs,
      questCount:  allQuests.length,
      maxQuests:   isPaidTier ? '∞' : store.maxQuests,
      activeCount: tabs[1].quests.length,  // Active is now index 1 (job board is 0)
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find('.rpgx-quest-row').click(this._onQuestRowClick.bind(this));
    html.find('.btn-new-quest').click(this._onNewQuest.bind(this));
    html.find('.btn-row-delete').click(this._onRowDelete.bind(this));

    if (game.user.isGM) {
      // Clickable status stripe — opens the "Change Quest Status" dialog
      html.find('.btn-row-status').click(this._onRowStatusClick.bind(this));

      // Right-click context menu (kept as an alternate / power-user option)
      this._buildContextMenu(html);
    }
  }

  // ─── STATUS CLICK DIALOG ──────────────────────────────────────────────────

  /**
   * Clicking the coloured status icon in a quest row opens a small dialog
   * with buttons for the 3 other possible statuses. Selecting one updates
   * the quest immediately without opening the full sheet.
   */
  async _onRowStatusClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const questId = event.currentTarget.dataset.questId;
    const quest   = game.rpgxQuestLog.store.getById(questId);
    if (!quest) return;

    // Build statuses that aren't the current one (including job board for GMs)
    const allStatuses = [
      { value: 'jobboard',  label: 'Job Board',  icon: 'fa-clipboard-list', color: '#ffa500' },
      { value: 'active',    label: 'Active',     icon: 'fa-circle-play',    color: '#3dba5a' },
      { value: 'completed', label: 'Completed',  icon: 'fa-circle-check',   color: '#4a9eff' },
      { value: 'failed',    label: 'Failed',     icon: 'fa-circle-xmark',   color: '#e84040' },
      { value: 'abandoned', label: 'Abandoned',  icon: 'fa-circle-minus',   color: '#ff8c00' },
    ];
    const choices = allStatuses.filter(s => s.value !== quest.status);

    // One button per available status
    const buttons = {};
    for (const s of choices) {
      buttons[s.value] = {
        icon:     `<i class="fas ${s.icon}" style="color:${s.color};"></i>`,
        label:    s.label,
        callback: async () => {
          await game.rpgxQuestLog.store.setStatus(questId, s.value);
          this.render(false);
        }
      };
    }

    new Dialog({
      title:   'Change Quest Status',
      content: `<p style="margin:0 0 10px;">Change status of <strong>"${quest.title}"</strong>:</p>`,
      buttons,
      default: choices[0]?.value,
    }).render(true);
  }

  // ─── RIGHT-CLICK CONTEXT MENU (alternate access) ──────────────────────────

  _buildContextMenu(html) {
    const getQuestId = (el) => {
      if (el?.dataset?.questId) return el.dataset.questId;
      if (typeof el?.data === 'function') return el.data('questId');
      return null;
    };

    const entries = [
      { name: 'Set Job Board',  icon: '<i class="fas fa-clipboard-list" style="color:#ffa500;"></i>', callback: el => { const id = getQuestId(el); if (id) this._setStatus(id, 'jobboard');  } },
      { name: 'Set Active',     icon: '<i class="fas fa-circle-play"     style="color:#3dba5a;"></i>', callback: el => { const id = getQuestId(el); if (id) this._setStatus(id, 'active');    } },
      { name: 'Set Completed',  icon: '<i class="fas fa-circle-check"    style="color:#4a9eff;"></i>', callback: el => { const id = getQuestId(el); if (id) this._setStatus(id, 'completed'); } },
      { name: 'Set Failed',     icon: '<i class="fas fa-circle-xmark"    style="color:#e84040;"></i>', callback: el => { const id = getQuestId(el); if (id) this._setStatus(id, 'failed');    } },
      { name: 'Set Abandoned',  icon: '<i class="fas fa-circle-minus"    style="color:#ff8c00;"></i>', callback: el => { const id = getQuestId(el); if (id) this._setStatus(id, 'abandoned'); } },
    ];

    const CM = foundry?.applications?.ux?.ContextMenu ?? ContextMenu;
    try {
      new CM(html[0], '.rpgx-quest-row', entries, { jQuery: false });
    } catch(e) {
      try { new ContextMenu(html, '.rpgx-quest-row', entries); }
      catch(e2) { console.warn('RPGX Quest Log | ContextMenu could not initialize:', e2); }
    }
  }

  async _setStatus(questId, status) {
    await game.rpgxQuestLog.store.setStatus(questId, status);
    this.render(false);
  }

  // ─── OTHER HANDLERS ───────────────────────────────────────────────────────

  async _onNewQuest(event) {
    event.preventDefault();
    const SheetApp = this._SheetApp;
    if (SheetApp) await SheetApp.createNew();
  }

  _onQuestRowClick(event) {
    // Don't open the sheet if the user clicked an action button or status stripe
    if (event.target.closest('.btn-row-delete') || event.target.closest('.btn-row-status')) return;
    const questId  = event.currentTarget.dataset.questId;
    const SheetApp = this._SheetApp;
    if (questId && SheetApp) SheetApp.openQuest(questId);
  }

  async _onRowDelete(event) {
    event.preventDefault();
    event.stopPropagation();
    const questId = event.currentTarget.closest('.rpgx-quest-row').dataset.questId;
    const quest   = game.rpgxQuestLog.store.getById(questId);
    if (!quest) return;

    const confirmed = await Dialog.confirm({
      title:   'Delete Quest',
      content: `<p>Permanently delete <strong>"${quest.title}"</strong>?<br>This cannot be undone.</p>`,
    });
    if (confirmed) {
      await game.rpgxQuestLog.store.delete(questId);
      this.render(false);
    }
  }

  onDataChanged() {
    if (this.rendered) this.render(false);
  }
}
