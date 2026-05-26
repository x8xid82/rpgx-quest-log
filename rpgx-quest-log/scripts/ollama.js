/**
 * RPGX Quest Log — Ollama AI Service
 * scripts/ollama.js
 * ─────────────────────────────────────────────────────────────────────────────
 * All AI generation routes through RPGX Proton.
 * Proton proxies the request to Ollama server-side — no CORS issues,
 * works whether Foundry is remote, local, or on the same machine.
 *
 * Proton must be running for AI generation to work.
 * Premium features (including AI) require an active Patreon subscription.
 *
 * GENERATION PIPELINE (in order):
 *   1. _fetchWorldContext()  — fast RAG /search call (embedding + BM25 + RRF, no LLM)
 *                              pulls relevant world lore for the characters involved
 *   2. _buildPrompt()        — assembles the full prompt with character context,
 *                              world lore, alignment rules, and user theme
 *   3. _generateViaProton()  — POSTs to Proton /ollama/generate (the LLM call)
 *   4. _readNDJSON()         — assembles the NDJSON chunks into one string
 *   5. _parseJSON()          — extracts and sanitises the JSON quest object
 *
 * Security:
 * Every fetch to Proton includes an Authorization: Bearer header.
 * The token is read from rpgx-ai module settings first (shared Proton instance),
 * falling back to this module's own protonToken setting if rpgx-ai is not installed.
 */

const MODULE_ID = 'rpgx-quest-log';

export class OllamaService {

  get ragBase()     { return (game.settings.get(MODULE_ID, 'ragBase') || 'http://127.0.0.1:3033').replace(/\/$/, ''); }
  get model()       { return game.settings.get(MODULE_ID, 'ollamaModel') || 'qwen2.5:7b'; }
  get timeout()     { return (game.settings.get(MODULE_ID, 'aiTimeout') || 60) * 1000; }
  get temperature() { return game.settings.get(MODULE_ID, 'aiTemperature') || 0.8; }

  /**
   * Auth token for RPGX Proton.
   * Reads rpgx-ai's token first — both modules talk to the same Proton instance,
   * so there is only ever one token to configure.
   * Falls back to this module's own protonToken setting if rpgx-ai is not installed.
   */
  get token() {
    try {
      const shared = game.settings.get('rpgx-ai', 'protonToken');
      if (shared) return shared;
    } catch { /* rpgx-ai not installed — fall through */ }
    return game.settings.get(MODULE_ID, 'protonToken') || '';
  }

  // Read game system from AI Assistant module settings (cross-module access)
  get gameSystem() {
    try {
      return game.settings.get('rpgx-ai', 'gameSystem') || 'D&D 5.5E (2024)';
    } catch {
      return 'D&D 5.5E (2024)'; // Fallback if AI Assistant not installed
    }
  }

  // ─── PUBLIC: GENERATE QUEST ───────────────────────────────────────────────

  /**
   * @param {string}   prompt     - Optional GM theme/premise
   * @param {object}   context    - Character context { assigners, assignees }
   * @param {function} onProgress - Optional callback(stageLabel) for UI progress updates
   */
  async generateQuest(prompt = '', context = {}, onProgress = null) {
    return this._generateViaProton(prompt, context, onProgress);
  }

  // ─── VIA PROTON ───────────────────────────────────────────────────────────

  async _generateViaProton(prompt = '', context = {}, onProgress = null) {

    // ── Step 1: Fetch world lore from RAG (fast — no LLM involved) ────────
    // Gives the AI real campaign facts to ground the quest.
    // Fails silently if RAG is empty or unavailable.
    onProgress?.('Searching world lore...');
    const worldContext = await this._fetchWorldContext(context, prompt);

    // ── Step 2: Run LLM quest generation ──────────────────────────────────
    onProgress?.('Generating quest...');

    const url       = `${this.ragBase}/ollama/generate`;
    const timeoutMs = this.timeout;

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model:   this.model,
          prompt:  this._buildPrompt(prompt, context, worldContext),
          stream:  false,
          options: { temperature: this.temperature, top_p: 0.95 },
        }),
      });
    } catch(e) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        throw new Error(
          `AI generation timed out after ${timeoutMs / 1000} seconds. ` +
          `Try a smaller model tier, or increase the timeout in Quest Log settings.`
        );
      }
      throw new Error(
        `Cannot reach RPGX Proton at ${url}. ` +
        `Make sure Proton is running on your computer. ` +
        `Download RPGX Proton free at rpgxstudios.com. (${e.message})`
      );
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `RPGX Proton error ${response.status}. ` +
        `Is Ollama running inside Proton? Details: ${text}`
      );
    }

    const rawText = await response.text();
    const content = this._readNDJSON(rawText);
    return this._parseJSON(content);
  }

  // ─── WORLD CONTEXT FETCH ──────────────────────────────────────────────────
  /**
   * Queries the RAG /search endpoint for lore relevant to the quest characters.
   *
   * This is a FAST call — it runs the hybrid search pipeline (embedding + BM25 + RRF)
   * but skips the LLM reranker and answer-generation steps entirely.
   * A typical call completes in 1-3 seconds depending on corpus size.
   *
   * Returns a formatted lore string for injection into the prompt, or '' if
   * the RAG is empty, unavailable, or returns nothing relevant.
   */
  async _fetchWorldContext(context = {}, userPrompt = '') {
    try {
      const worldId = game.world?.id;
      if (!worldId) return '';

      // Build a search query from character names and the user's theme
      const names = [
        ...(context.assigners || []).map(a => a.name),
        ...(context.assignees || []).map(a => a.name),
      ].filter(Boolean);

      if (!names.length && !userPrompt) return '';

      const queryParts = [];
      if (names.length) queryParts.push(`Lore about: ${names.join(', ')}`);
      if (userPrompt)   queryParts.push(`Quest theme: ${userPrompt}`);
      queryParts.push('World history, factions, locations, current events');

      const res = await fetch(`${this.ragBase}/search`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
        signal: AbortSignal.timeout(12000), // 12s max — never let this block generation
        body: JSON.stringify({ query: queryParts.join('. '), worldId, topK: 5 }),
      });

      if (!res.ok) return '';
      const data = await res.json();
      if (!data.chunks?.length || data.no_context) return '';

      // Format chunks into a readable lore block
      const loreLines = data.chunks.map(c => {
        const header = [c.docTitle, c.section].filter(Boolean).join(' > ');
        return `[${header}]\n${c.text}`;
      });

      console.log(`RPGX Quest Log | World context: ${data.chunks.length} lore chunk(s) injected.`);
      return loreLines.join('\n\n');

    } catch(e) {
      // RAG unavailable, world has no documents, or timed out — fail silently
      console.log(`RPGX Quest Log | World context skipped: ${e.message}`);
      return '';
    }
  }

  // ─── PROMPT BUILDER ───────────────────────────────────────────────────────
  /**
   * @param {string} userPrompt  - GM's theme/premise (may be empty)
   * @param {object} context     - { assigners[], assignees[] } pre-flattened from quest sheet
   * @param {string} worldContext - Lore chunks from RAG (may be empty string)
   */
  _buildPrompt(userPrompt = '', context = {}, worldContext = '') {
    const system = `You are a creative Game Master for tabletop RPGs running the ${this.gameSystem} system.

GENRE AND TONE:
  All quests must feel native to ${this.gameSystem}. Match the genre completely — fantasy settings get swords, magic, and political intrigue; sci-fi gets technology, corporations, and cyber-threats; horror gets dread and the unknown; modern gets realistic stakes and social dynamics. Never break genre.

Generate a quest and respond ONLY with a valid JSON object using this exact structure:
{
  "title": "Quest title (short, evocative, 3-7 words)",
  "description": "Player-facing quest briefing. 4-8 atmospheric paragraphs. Written as if the quest-giver is speaking, or the party has just received a briefing. Apply the ALIGNMENT RULES below to determine what is revealed or concealed.",
  "gmNotes": "GM-only section. Always include: (1) the true plot behind the quest, (2) the quest-giver's real motivation, (3) a surprising twist the players won't see coming, (4) 2-3 suggested encounters or skill challenges, (5) hidden connections to broader campaign events, (6) consequences of both success and failure."
}

ALIGNMENT RULES — follow these in order:
  STEP 1 — Determine the quest-giver's alignment:
    If alignment is explicitly stated, use it.
    If alignment is NOT stated, INFER it from their biography, backstory, ideals, bonds, and flaws. Sinister biographies imply evil. Noble ideals imply good. Ambiguous data implies neutral. Do NOT default to good when evidence is thin — lean neutral instead.

  STEP 2 — Write the description based on alignment:
    EVIL giver:    The description MUST ACTIVELY DECEIVE the players. Make the quest sound benign, heroic, urgent, or profitable. Never hint at the true purpose. The gmNotes must explicitly state: (a) what lie is being told in the description, (b) the true sinister goal, (c) what actually happens to the players or world if they succeed.
    NEUTRAL giver: The description is honest but self-serving. The giver reveals what benefits them and omits uncomfortable details. GM notes may include hidden costs, complications, or competing interests the giver didn't mention.
    GOOD giver:    The description is earnest and transparent. The giver genuinely wants the party to understand what is at stake. GM notes may include hardships, tragedy, or moral complexity — but the giver is not manipulating the party.

PERSONALIZATION — always apply when characters are provided:
  Actively look for connections between the quest-giver and the recipients. Consider: shared background or race, overlapping ideals or bonds, past history that links them, personal stakes, or tensions that could complicate the mission. A quest tailored to these specific people is always better than a generic one. Use the provided character details — do not ignore them.

Respond with valid JSON only. No markdown fences. No explanation. No text outside the JSON object. Only the three keys listed above — do not add extra fields. Inside the description and gmNotes values, never use double quotation marks; use single quotes if you need to quote something.`;

    // ── Character context block ────────────────────────────────────────────
    const contextLines = [];

    if (context.assigners?.length) {
      const giverDetails = context.assigners
        .map(a => this._formatCharacterContext(a, true))
        .filter(Boolean)
        .join('; ');
      if (giverDetails) contextLines.push(`Quest-giver(s): ${giverDetails}`);
    }

    if (context.assignees?.length) {
      const recipientDetails = context.assignees
        .map(a => this._formatCharacterContext(a, false))
        .filter(Boolean)
        .join(', ');
      if (recipientDetails) contextLines.push(`Quest recipient(s): ${recipientDetails}`);
    }

    const characterBlock = contextLines.length
      ? `\n\nCHARACTER DATA (use this to personalise the quest — if alignment is absent, infer it from biography and personality fields; if data is thin, invent around what is there):\n${contextLines.join('\n')}`
      : '';

    // ── World lore block (injected from RAG) ──────────────────────────────
    // Only present when the RAG returned relevant chunks.
    // The AI is instructed to treat this as authoritative fact, not suggestion.
    const worldBlock = worldContext
      ? `\n\nWORLD LORE (authoritative facts from this campaign's knowledge base — reference specific names, places, factions, and events from this section to ground the quest in the actual world. Do not contradict these facts):\n${worldContext}`
      : '';

    // ── User theme / premise ───────────────────────────────────────────────
    const user = userPrompt
      ? `Create a mission with this theme or premise: ${userPrompt}`
      : `Create an original, compelling mission for a ${this.gameSystem} campaign.`;

    return `${system}${characterBlock}${worldBlock}\n\nUSER: ${user}\nASSISTANT:`;
  }

  // ─── CHARACTER CONTEXT FORMATTER ──────────────────────────────────────────

  _formatCharacterContext(char, includeAlignment = true) {
    if (!char?.name) return null;

    const parts   = [char.name];
    const details = [];

    if (includeAlignment && char.alignment) details.push(`Alignment: ${char.alignment}`);
    if (char.creatureType) details.push(`Race/Type: ${char.creatureType}`);
    if (char.class)        details.push(`Class: ${char.class}`);
    if (char.background)   details.push(`Background: ${char.background}`);
    if (char.ideals)       details.push(`Ideals: ${char.ideals}`);
    if (char.bonds)        details.push(`Bonds: ${char.bonds}`);
    if (char.flaws)        details.push(`Flaws: ${char.flaws}`);
    if (char.traits)       details.push(`Traits: ${char.traits}`);

    if (char.biography) {
      const bio = char.biography.length > 500 ? char.biography.substring(0, 500) + '...' : char.biography;
      details.push(`Backstory: ${bio}`);
    }

    return parts.concat(details.length ? `(${details.join(', ')})` : '').join(' ');
  }

  // ─── NDJSON READER ────────────────────────────────────────────────────────

  _readNDJSON(text) {
    if (!text?.trim()) throw new Error('Empty response from AI.');

    const lines = text.trim().split('\n');
    let content = '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.response)              content += parsed.response;
        else if (parsed.message?.content) content += parsed.message.content;
      } catch {
        console.warn('RPGX Quest Log | Could not parse NDJSON line:', line);
      }
    }

    if (!content.trim()) {
      throw new Error('AI returned no content. The model may have timed out — try again.');
    }

    return content.trim();
  }

  // ─── JSON PARSER ──────────────────────────────────────────────────────────
  /**
   * Extracts and parses the quest JSON from the raw model output.
   *
   * Some models (particularly qwen2.5) emit chain-of-thought text — sometimes
   * in Chinese — before, after, or even INSIDE the JSON they generate. This
   * causes a single greedy regex to capture corrupted content.
   *
   * Strategy: extract ALL balanced top-level JSON objects from the text using
   * a brace-depth walker (which correctly ignores braces inside strings), then
   * try each candidate from LAST to FIRST. The model's clean final attempt is
   * almost always the last complete object in the output.
   */
  _parseJSON(text) {
    if (!text?.trim()) throw new Error('Empty response from AI.');

    // Strip markdown fences if present
    let raw = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();

    // ── Unicode normalisation ──────────────────────────────────────────────
    const normalise = (s) => s
      .replace(/[\u201C\u201D]/g, '"')   // Smart double quotes → "
      .replace(/[\u2018\u2019]/g, "'")   // Smart single quotes → '
      .replace(/[\u2013\u2014]/g, '-')   // En/em-dash → -
      .replace(/\u2026/g, '...');         // Ellipsis → ...

    // ── Escape literal control characters inside string values ─────────────
    // The regex matches each JSON string value (including those with actual
    // newlines inside them) and escapes any literal control chars found.
    // Structural JSON newlines between keys are NOT matched and are left
    // as valid whitespace. Global replace would break those structural newlines.
    const escapeControls = (s) => s.replace(
      /"(?:[^"\\]|\\.)*"/gs,
      m => m.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
    );

    // ── Balanced-brace extractor ───────────────────────────────────────────
    // Walks the string character-by-character, tracking brace depth and
    // whether we're inside a quoted string. Each time depth returns to 0 we
    // have a complete top-level JSON object candidate.
    const extractCandidates = (src) => {
      const candidates = [];
      for (let i = 0; i < src.length; i++) {
        if (src[i] !== '{') continue;
        let depth = 0, inStr = false, escaped = false;
        for (let j = i; j < src.length; j++) {
          const ch = src[j];
          if (escaped)                    { escaped = false; continue; }
          if (ch === '\\' && inStr)       { escaped = true;  continue; }
          if (ch === '"')                 { inStr = !inStr;  continue; }
          if (!inStr && ch === '{')       { depth++;          continue; }
          if (!inStr && ch === '}') {
            depth--;
            if (depth === 0) { candidates.push(src.slice(i, j + 1)); break; }
          }
        }
      }
      return candidates;
    };

    // ── Try each candidate, last-to-first ─────────────────────────────────
    // The model's clean output is almost always the LAST complete object.
    const candidates = extractCandidates(normalise(raw));
    const errors     = [];

    for (const candidate of [...candidates].reverse()) {
      try {
        const cleaned = escapeControls(candidate);
        const parsed  = JSON.parse(cleaned);
        if (parsed.title && parsed.description) {
          // Success — log if we had to skip earlier candidates
          if (candidates.indexOf(candidate) < candidates.length - 1) {
            console.log(`RPGX Quest Log | _parseJSON: skipped ${candidates.length - 1 - candidates.indexOf(candidate)} corrupted candidate(s) — used last clean object.`);
          }
          return parsed;
        }
      } catch(e) {
        errors.push(e.message);
      }
    }

    // All candidates failed — log everything for debugging
    console.error('RPGX Quest Log | _parseJSON failed. Raw output:', text);
    console.error('RPGX Quest Log | Candidates tried:', candidates.length);
    errors.forEach((e, i) => console.error(`  Candidate ${i + 1} error:`, e));

    throw new Error(
      `Could not parse the AI response after trying ${candidates.length || 0} JSON candidate(s). ` +
      `Try a different model tier or simplify your prompt. Last error: ${errors.at(-1) ?? 'no valid JSON found'}`
    );
  }

  // ─── CONNECTION CHECK ─────────────────────────────────────────────────────

  async checkConnection() {
    try {
      const res = await fetch(`${this.ragBase}/ping`, {
        signal:  AbortSignal.timeout(5000),
        headers: { 'Authorization': `Bearer ${this.token}` },
      });
      return res.ok;
    } catch { return false; }
  }

  async listModels() {
    try {
      const res = await fetch(`${this.ragBase}/ollama/tags`, {
        headers: { 'Authorization': `Bearer ${this.token}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.models || []).map(m => m.name || m);
    } catch { return []; }
  }
}
