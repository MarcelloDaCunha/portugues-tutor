// Tutor de Português — all state is local (localStorage). The only network call is to Gemini, one per learner turn.
const TURNS = 6;            // learner turns per ~5 min lesson => 6 API calls per lesson
const HISTORY_SENT = 6;     // only the last N messages are sent, to keep tokens tiny
const $app = document.getElementById('app');
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
};
const cfg = () => ({ key: '', model: 'gemini-flash-lite-latest', budget: 400, ...store.get('cfg', {}) });
const progress = () => store.get('progress', { done: [], notes: [] });
// Gemini free-tier quotas reset at midnight Pacific time, so count days that way
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
const usage = () => { const u = store.get('usage', {}); return u.d === today() ? u.n : 0; };
const bump = () => store.set('usage', { d: today(), n: usage() + 1 });
// calls left today (counted on this phone; Google resets the free quota at midnight Pacific)
const callsLeft = () => Math.max(0, cfg().budget - usage());
const usageHtml = () => { const b = cfg().budget, u = usage(), left = callsLeft();
  return `<div class="card"><div style="display:flex;justify-content:space-between"><b>Uso hoje</b><span class="small">${u} / ${b} chamadas</span></div>
  <div class="prog" style="margin:8px 0"><i style="width:${Math.min(100, u / b * 100)}%;background:${left < b * 0.15 ? '#dc2626' : '#16a34a'}"></i></div>
  <div class="small">${left} restantes ≈ <b>${Math.floor(left / TURNS)} lições</b> (${TURNS} chamadas cada) · reinicia à meia-noite do Pacífico</div></div>`; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- speech ----------
let ptVoice = null;
// prefer the best installed pt-BR voice: Premium > Enhanced > known good names > anything; or the one chosen in Settings
function pickVoice() {
  const vs = speechSynthesis.getVoices().filter(v => v.lang.replace('_', '-') === 'pt-BR');
  const chosen = store.get('cfg', {}).voice;
  const score = v => (/premium/i.test(v.name) ? 3 : /enhanced/i.test(v.name) ? 2 : /luciana|felipe|fernanda/i.test(v.name) ? 1 : 0);
  ptVoice = vs.find(v => v.name === chosen) || [...vs].sort((a, b) => score(b) - score(a))[0] || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text, rate = 0.9) {
  if (!('speechSynthesis' in window)) return;
  if (!ptVoice) pickVoice();
  if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
  speechSynthesis.resume();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'pt-BR'; u.rate = rate; u.volume = 1; if (ptVoice) u.voice = ptVoice;
  u.onerror = e => { if (e.error !== 'canceled' && e.error !== 'interrupted') window.__ttsErr = e.error; };
  speechSynthesis.speak(u);
}
// Make voices play even with the iPhone's silent switch on: ask iOS for a "playback" audio session
// and keep a silent looping clip going (web speech otherwise follows the ringer switch).
try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
function keepAudioAlive() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
  if (window.__silent) { window.__silent.play().catch(() => {}); return; }
  const n = 800, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true); // n samples of silence
  const a = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })));
  a.loop = true; a.setAttribute('playsinline', ''); a.play().catch(() => {}); window.__silent = a;
}
// iOS only allows speech after one utterance started from a tap; call this inside tap handlers.
function unlockAudio() {
  keepAudioAlive();
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u);
}
const IOS_STANDALONE = navigator.standalone === true;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

// ---------- home ----------
let currentLevel = null; // null = main screen, otherwise the level whose lessons are shown
const LEVEL_NAMES = { A1: 'Iniciante', A2: 'Básico', B1: 'Intermediário', B2: 'Intermediário avançado', C1: 'Avançado' };
// a lesson opens once the one before it is completed (or you've already started it)
function unlocked(l, p) {
  const i = LESSONS.indexOf(l), chats = store.get('chats', {}), act = store.get('active', null);
  return i === 0 || p.done.includes(LESSONS[i - 1].id) || p.done.includes(l.id) || !!chats[l.id] || (act && act.id === l.id);
}
function home() {
  const p = progress(), c = cfg();
  if (currentLevel) return levelScreen(currentLevel, p);
  const act = store.get('active', null);
  const next = (act && LESSONS.find(l => l.id === act.id)) || LESSONS.find(l => !p.done.includes(l.id)) || LESSONS[LESSONS.length - 1];
  const levels = Object.keys(LEVELS);
  $app.innerHTML = `
  <header><h1>🇧🇷 Português</h1><button class="ghost" id="gear">⚙️</button></header>
  <div class="prog"><i style="width:${p.done.length / LESSONS.length * 100}%"></i></div>
  <div class="pad">
    <div class="card"><div class="small">${act ? 'Em andamento' : 'Próxima lição'} · ${next.level}</div><h2 style="margin:4px 0">${esc(next.title)}</h2>
      <div class="small">${esc(next.scenario)}</div><br><button class="primary" id="go">${act ? `Continuar (${act.turn}/${TURNS})` : 'Começar (~5 min)'}</button>${act ? ' <button id="restart">Recomeçar</button>' : ''}</div>
    ${usageHtml()}
    ${!c.key ? '<div class="card">⚠️ Add your free Gemini API key in ⚙️ first.</div>' : ''}
    <h2>Níveis</h2>
    ${levels.map(lv => {
      const ls = LESSONS.filter(l => l.level === lv), done = ls.filter(l => p.done.includes(l.id)).length, open = unlocked(ls[0], p);
      return `<div class="lesson level ${open ? '' : 'locked'}" data-level="${lv}"><span>${open ? '' : '🔒 '}<b>${lv}</b> · ${LEVEL_NAMES[lv]}</span><span class="small">${done}/${ls.length}</span></div>`;
    }).join('')}
    <h2>Flashcards</h2><div class="lesson" id="cards"><span>🃏 Revisar palavras novas</span><span class="small">${store.get('cards', []).length} · ✓${store.get('cardStats', { right: 0 }).right} ✗${store.get('cardStats', { wrong: 0 }).wrong}</span></div>
  </div>`;
  document.getElementById('go').onclick = () => { unlockAudio(); currentLevel = next.level; lesson(next); };
  document.getElementById('restart')?.addEventListener('click', () => { localStorage.removeItem('active'); unlockAudio(); currentLevel = next.level; lesson(next, true); });
  document.getElementById('gear').onclick = settings;
  document.getElementById('cards').onclick = () => { unlockAudio(); flashcards(); };
  document.querySelectorAll('.level:not(.locked)').forEach(el => el.onclick = () => { currentLevel = el.dataset.level; home(); });
}
function levelScreen(lv, p) {
  const chats = store.get('chats', {});
  $app.innerHTML = `<header><button class="ghost" id="back">←</button><h1>${lv} · ${LEVEL_NAMES[lv]}</h1><span></span></header>
  <div class="pad">${LESSONS.filter(l => l.level === lv).map(l => {
    const open = unlocked(l, p);
    return `<div class="lesson ${open ? '' : 'locked'} ${p.done.includes(l.id) ? 'done' : ''}" data-id="${l.id}"><span>${!open ? '🔒' : p.done.includes(l.id) ? '✅' : '▶️'} ${chats[l.id] ? '💬 ' : ''}${esc(l.title)}</span></div>`;
  }).join('')}</div>`;
  document.getElementById('back').onclick = () => { currentLevel = null; home(); };
  document.querySelectorAll('.lesson:not(.locked)').forEach(el => el.onclick = () => { unlockAudio(); lesson(LESSONS.find(l => l.id == el.dataset.id)); });
}

function settings() {
  const c = cfg();
  $app.innerHTML = `<header><h1>Settings</h1><button class="ghost" id="back">✕</button></header><div class="pad">
    <p class="small">Free key: aistudio.google.com/apikey (stored only on this phone).</p>
    <p>Gemini API key</p><input id="key" type="password" value="${esc(c.key)}" autocomplete="off">
    <p>Model <span class="small">(Flash-Lite has the biggest free daily allowance)</span></p><input id="model" value="${esc(c.model)}">
    <p>Daily call budget <span class="small">(app stops before your free limit; check your limit at aistudio.google.com)</span></p><input id="budget" type="number" value="${c.budget}">
    <br><br><button class="primary" id="save">Save</button> <button id="reset">Reset progress</button></div>`;
  document.getElementById('back').onclick = home;
  document.getElementById('save').onclick = () => {
    store.set('cfg', { key: key.value.trim(), model: model.value.trim() || 'gemini-flash-lite-latest', budget: +budget.value || 400 }); home();
  };
  document.getElementById('reset').onclick = () => { if (confirm('Reset all progress?')) { store.set('progress', { done: [], notes: [] }); store.set('chats', {}); localStorage.removeItem('active'); home(); } };
}

// ---------- Gemini ----------
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' }, hint_en: { type: 'STRING' },
    corrections: { type: 'ARRAY', items: { type: 'OBJECT', properties: { said: { type: 'STRING' }, better: { type: 'STRING' }, why: { type: 'STRING' } }, required: ['said', 'better', 'why'] } },
    pronunciation: { type: 'STRING' },
    summary: { type: 'STRING' },
    words: { type: 'ARRAY', items: { type: 'OBJECT', properties: { pt: { type: 'STRING' }, en: { type: 'STRING' } }, required: ['pt', 'en'] } }
  },
  required: ['reply', 'hint_en', 'corrections']
};

function systemPrompt(l, turn) {
  return `You are a warm, patient Brazilian Portuguese (pt-BR, never European) speaking tutor for an English speaker.
Learner level: ${l.level} — ${LEVELS[l.level]}.
Lesson: "${l.title}". Role-play: ${l.scenario} Target phrases: ${l.phrases.join(' | ') || 'free'}. Grammar focus: ${l.grammar}.
Each turn: (1) "reply": 1–2 short pt-BR sentences in character, at the learner's level, ending with a question or prompt that makes them speak; weave in a target phrase. (2) "hint_en": English translation, under 15 words. (3) "corrections": 0–2 of the learner's most important errors in their LAST message (grammar, wrong word, unnatural phrasing); each "why" under 15 words, English. Empty array if fine. The input is a speech-to-text transcript: ignore punctuation, capitalization and accents. (4) "pronunciation": only if the transcript suggests a mispronounced word (recognizer wrote a different word than the likely intended one) or a classic pt-BR pitfall in what they said (nasal vowels ão/ãe, r/rr as h, d/t before i = dj/tch, lh, final l = w); one tip under 20 words; else omit.
This is learner turn ${turn} of ${TURNS}.${turn >= TURNS ? ' FINAL turn: say a brief goodbye in "reply" and fill "summary": one English line with what they did well and the top 2 things to practice; and fill "words": 4 useful new Portuguese words or short phrases from this lesson (dictionary form, e.g. infinitive for verbs) with short English meanings.' : ''}`;
}

async function callGemini(l, turn, msgs, withThinking = true) {
  const c = cfg();
  if (usage() >= c.budget) throw new Error('Daily budget reached. Come back tomorrow or raise it in ⚙️.');
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt(l, turn) }] },
    contents: msgs.slice(-HISTORY_SENT).map(m => ({ role: m.role === 'ai' ? 'model' : 'user', parts: [{ text: m.text }] })),
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.7, maxOutputTokens: 700,
      ...(withThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}) }
  };
  let r;
  for (let attempt = 0; attempt < 4; attempt++) { // 503/500/504 = Google temporarily overloaded: retry quietly
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.key }, body: JSON.stringify(body)
    });
    if (![500, 503, 504].includes(r.status)) break;
    await new Promise(res => setTimeout(res, 1500 * (attempt + 1)));
  }
  if ([500, 503, 504].includes(r.status)) throw new Error('Google\'s server is busy right now. Your message is kept — tap ➤ to try again.');
  if (r.status === 429) throw new Error('Free-tier limit hit (429). Try again later or tomorrow.');
  if (r.status === 400 && withThinking) return callGemini(l, turn, msgs, false);
  if (!r.ok) throw new Error(`API error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  bump();
  const j = await r.json();
  return JSON.parse(j.candidates[0].content.parts.map(p => p.text || '').join(''));
}

// ---------- lesson ----------
// every word is tappable for a definition
const wordsHtml = t => String(t ?? '').split(/([\p{L}\p{M}'-]+)/u).map((p, i) => i % 2 ? `<span class="w">${esc(p)}</span>` : esc(p)).join('');
function entryHtml(e, showHint = false) {
  if (e.k === 'ai') return `<div class="msg ai"><span class="pt">${wordsHtml(e.text)}</span> <button class="ghost" data-s="${esc(e.text)}">🔊</button><button class="ghost" data-slow="${esc(e.text)}">🐢</button><div class="en" style="display:${showHint ? 'block' : 'none'}">${esc(e.hint)}</div></div>`;
  if (e.k === 'me') return `<div class="msg me">${wordsHtml(e.text)}</div>`;
  if (e.k === 'fix') return `<div class="fix"><b>✏️ ${esc(e.said)}</b> → ${esc(e.better)}<br><span class="small">${esc(e.why)}</span></div>`;
  if (e.k === 'sep') return `<div class="small" style="text-align:center;margin:16px 0">── Nova sessão · ${esc(e.text)} ──</div>`;
  if (e.k === 'sum') return `<div class="card"><b>📘 Resumo</b><br><span class="small">${esc(e.text)}</span></div>`;
  if (e.k === 'tip') return `<div class="fix tip">🗣️ ${esc(e.text)}</div>`;
  return '';
}
// ---------- dictionary (Wiktionary, free, no AI quota; falls back to one optional AI call) ----------
const strip = h => h.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
async function lookup(word) {
  const w = word.toLowerCase(), cache = store.get('dict', {});
  if (cache[w]) return cache[w];
  const r = await fetch('https://en.wiktionary.org/api/rest_v1/page/definition/' + encodeURIComponent(w));
  if (!r.ok) return null;
  const pt = (await r.json()).pt;
  if (!pt) return null;
  const out = pt.slice(0, 3).map(s => ({ pos: s.partOfSpeech, defs: s.definitions.map(d => strip(d.definition)).filter(Boolean).slice(0, 3) }));
  cache[w] = out; store.set('dict', cache);
  return out;
}
async function aiDefine(word, sentence) {
  const c = cfg();
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.model)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': c.key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: `Brazilian Portuguese word "${word}" in the sentence: "${sentence}". Give the English meaning and, if it is a verb form, the infinitive. Max 20 words.` }] }], generationConfig: { maxOutputTokens: 80 } })
  });
  if (!r.ok) throw new Error('AI error ' + r.status);
  bump();
  return (await r.json()).candidates[0].content.parts.map(p => p.text || '').join('');
}
async function showDef(word, sentence) {
  $app.querySelector('.dict')?.remove();
  $app.insertAdjacentHTML('beforeend', `<div class="dict"><div><b>${esc(word)}</b> <button class="ghost" data-s="${esc(word)}">🔊</button><button class="ghost" id="dx" style="float:right">✕</button></div><div id="dbody" class="small">…</div></div>`);
  const box = $app.querySelector('.dict'), body = box.querySelector('#dbody');
  box.querySelector('#dx').onclick = () => box.remove();
  box.querySelector('[data-s]').onclick = () => speak(word, 0.7);
  speak(word, 0.7);
  let defs = null;
  try { defs = await lookup(word); } catch {}
  if (defs?.length) body.innerHTML = defs.map(s => `<i>${esc(s.pos)}</i><ul>${s.defs.map(d => `<li>${esc(d)}</li>`).join('')}</ul>`).join('');
  else {
    body.innerHTML = `No dictionary entry. <button id="ask">Ask AI (1 call)</button>`;
    box.querySelector('#ask').onclick = async () => { body.textContent = '…'; try { body.textContent = await aiDefine(word, sentence); } catch (e) { body.textContent = e.message; } };
  }
}

function wireChat(chat) {
  chat.onclick = e => {
    const w = e.target.closest('.w');
    if (w) return showDef(w.textContent, w.closest('.msg').textContent);
    const b = e.target.closest('button');
    if (b?.dataset.s) return speak(b.dataset.s);
    if (b?.dataset.slow) return speak(b.dataset.slow, 0.55);
    const m = e.target.closest('.ai'); if (m) { const en = m.querySelector('.en'); en.style.display = en.style.display === 'none' ? 'block' : 'none'; }
  };
}
// Each lesson owns one continuous chat. Redoing a lesson appends a new session to the same chat.
function lesson(l, auto) {
  const c = cfg();
  if (!c.key) return settings();
  const opener = l.phrases[0] ? `Oi! Vamos praticar: "${l.phrases[0]}"` : 'Oi! Sobre o que você quer conversar hoje?';
  const log = (store.get('chats', {})[l.id] || {}).log || [];
  const save = () => { const all = store.get('chats', {}); all[l.id] = { log }; store.set('chats', all); };
  let act = store.get('active', null);
  if (act && act.id === l.id && act.turn >= TURNS) { localStorage.removeItem('active'); act = null; }
  const resumed = act && act.id === l.id ? act : null; // an unfinished session is restored exactly where you left it
  let msgs = resumed ? resumed.msgs : [], turn = resumed ? resumed.turn : 0, live = !!resumed, busy = false, rec = null;
  const persistAll = () => { save(); if (live) store.set('active', { id: l.id, msgs, turn }); };
  $app.innerHTML = `<header><button class="ghost" id="quit">←</button><div><b>${esc(l.title)}</b> <span class="small" id="tn"></span></div><span></span></header>
    <div class="chat" id="chat">${log.map(e => entryHtml(e)).join('')}</div>
    <div class="bar" id="bar"${live ? '' : ' hidden'}><input id="txt" placeholder="Digite ou fale…" autocomplete="off"><button id="send">➤</button>${SR && !IOS_STANDALONE ? '<button class="mic" id="mic">🎤</button>' : ''}</div>`;
  const chat = document.getElementById('chat'), txt = document.getElementById('txt'), bar = document.getElementById('bar');
  const add = html => { chat.insertAdjacentHTML('beforeend', html); chat.scrollTop = chat.scrollHeight; };
  const addEntry = e => { log.push(e); add(entryHtml(e)); };
  const aiBubble = m => addEntry({ k: 'ai', text: m.text, hint: m.hint });
  const tn = () => document.getElementById('tn').textContent = live ? `${turn}/${TURNS} · ${callsLeft()} restantes` : '';
  wireChat(chat);
  // whenever the chat area changes size (keyboard opening/closing), keep the newest message in view
  if (window.ResizeObserver) new ResizeObserver(() => { if (document.activeElement === txt) chat.scrollTop = chat.scrollHeight; }).observe(chat);
  document.getElementById('quit').onclick = () => { speechSynthesis.cancel(); rec?.abort?.(); home(); };

  function startSession() {
    msgs = [{ role: 'ai', text: opener, hint: l.title + ' — ' + l.scenario }]; turn = 0; live = true;
    if (log.length) addEntry({ k: 'sep', text: new Date().toLocaleDateString() });
    aiBubble(msgs[0]); speak(opener); // runs inside a tap, which unlocks iOS audio
    bar.hidden = false; tn(); persistAll();
  }
  tn(); chat.scrollTop = chat.scrollHeight;
  if (!live) {
    if (!log.length || auto) startSession();
    else {
      add(`<div class="card" id="againbox"><button class="primary" id="again">Praticar de novo</button><div class="small">Adds a new session to this chat.</div></div>`);
      document.getElementById('again').onclick = () => { document.getElementById('againbox').remove(); unlockAudio(); startSession(); };
    }
  }
  if (live && IOS_STANDALONE) add(`<div class="small">🎤 To speak: tap the text box, then the microphone key on your keyboard (set to Portuguese). If you hear nothing, check the ringer switch and volume.</div>`);
  setTimeout(() => { if (window.__ttsErr) add(`<div class="small">🔇 Voice error: ${esc(window.__ttsErr)}</div>`); }, 1500);

  async function submit(said) {
    said = said.trim(); if (!said || busy || !live || turn >= TURNS) return;
    busy = true; txt.value = '';
    msgs.push({ role: 'user', text: said }); turn++; tn();
    const meEntry = { k: 'me', text: said }; addEntry(meEntry);
    add(`<div class="small" id="wait">…</div>`);
    try {
      const r = await callGemini(l, turn, msgs.map(m => ({ role: m.role, text: m.text })));
      document.getElementById('wait')?.remove();
      (r.corrections || []).forEach(x => addEntry({ k: 'fix', said: x.said, better: x.better, why: x.why }));
      if (r.pronunciation) addEntry({ k: 'tip', text: r.pronunciation });
      const m = { role: 'ai', text: r.reply, hint: r.hint_en }; msgs.push(m); aiBubble(m); speak(r.reply);
      persistAll(); tn();
      if (turn >= TURNS) finish(r.summary, r.words);
    } catch (e) {
      document.getElementById('wait')?.remove(); turn--; msgs.pop(); tn();
      log.splice(log.indexOf(meEntry), 1); // the failed message goes back into the box
      [...chat.querySelectorAll('.msg.me')].pop()?.remove();
      add(`<div class="fix">⚠️ ${esc(e.message)}</div>`); txt.value = said; persistAll();
    }
    busy = false;
  }
  function finish(summary, words) {
    const p = progress(); if (!p.done.includes(l.id)) p.done.push(l.id);
    addCards(words, l.title);
    store.set('progress', p);
    live = false; localStorage.removeItem('active'); bar.hidden = true; tn();
    addEntry({ k: 'sum', text: summary || 'Lição completa!' }); save();
    add(`<div class="card"><button class="primary" id="fin">Concluir</button></div>`);
    document.getElementById('fin').onclick = home;
  }
  document.getElementById('send').onclick = () => submit(txt.value);
  txt.onkeydown = e => { if (e.key === 'Enter') submit(txt.value); };
  const mic = document.getElementById('mic');
  if (mic) mic.onclick = () => {
    if (rec) { rec.stop(); return; }
    speechSynthesis.cancel();
    rec = new SR(); rec.lang = 'pt-BR'; rec.interimResults = false; rec.maxAlternatives = 1;
    mic.classList.add('rec');
    rec.onresult = e => submit(e.results[0][0].transcript);
    rec.onerror = e => { add(`<div class="small">Mic: ${esc(e.error)} — use the keyboard's 🎤 dictation key instead.</div>`); };
    rec.onend = () => { mic.classList.remove('rec'); rec = null; };
    rec.start();
  };
}

// ---------- flashcards (new words from finished lessons) ----------
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function addCards(words, lesson) {
  if (!Array.isArray(words)) return;
  const cards = store.get('cards', []);
  for (const w of words) {
    if (!w?.pt || !w?.en || cards.some(c => norm(c.pt) === norm(w.pt))) continue;
    cards.push({ pt: String(w.pt).trim(), en: String(w.en).trim(), lesson });
  }
  store.set('cards', cards);
}
// English answers: accept any of the listed meanings ("to speak; to talk" -> "speak", "talk"), ignoring "to/a/the"
const enAnswers = en => [en, ...String(en).replace(/\([^)]*\)/g, ' ').split(/[,;\/]|\bor\b/)]
  .map(s => norm(s).replace(/^(to|a|an|the) /, '')).filter(Boolean);
const isMatch = (said, en) => {
  const a = norm(said).replace(/^(to|a|an|the) /, '');
  return !!a && enAnswers(en).some(b => a === b || a.split(' ').includes(b) || (b.length >= 5 && lev(a, b) <= 1));
};
function flashcards() {
  const cards = store.get('cards', []);
  $app.innerHTML = `<header><button class="ghost" id="back">←</button><h1>🃏 Flashcards</h1><span class="small" id="fcn"></span></header>
    <div class="small" id="fcstats" style="text-align:center;padding:0 16px 6px"></div>
    <div class="chat" id="fcarea"></div>
    <div class="bar" id="fcbar"><input id="fcin" placeholder="Say or type the English meaning…" autocomplete="off" autocapitalize="off"><button id="fcsend">➤</button><button id="fcskip">?</button>${SR && !IOS_STANDALONE ? '<button class="mic" id="fcmic">🎤</button>' : ''}</div>`;
  document.getElementById('back').onclick = () => { speechSynthesis.cancel(); home(); };
  const stats = () => store.get('cardStats', { right: 0, wrong: 0 });
  const bumpStat = k => store.set('cardStats', { ...stats(), [k]: stats()[k] + 1 });
  const showStats = () => { const s = stats(), t = s.right + s.wrong; document.getElementById('fcstats').innerHTML = `Total: <b style="color:#4ade80">✓ ${s.right}</b> · <b style="color:#f87171">✗ ${s.wrong}</b>${t ? ` · ${Math.round(s.right / t * 100)}%` : ''}`; };
  showStats();
  const area = document.getElementById('fcarea'), inp = document.getElementById('fcin'), bar = document.getElementById('fcbar');
  if (!cards.length) { bar.hidden = true; area.innerHTML = '<div class="card">No cards yet. Finish a lesson and its new words show up here.</div>'; return; }
  // cards are never removed; each session picks the 15 you know least (new and often-missed first)
  const weak = i => (cards[i].ok || 0) - 2 * (cards[i].miss || 0) + Math.random() * 1.5;
  const queue = cards.map((_, i) => i).sort((a, b) => weak(a) - weak(b)).slice(0, 15).sort(() => Math.random() - 0.5);
  let pos = 0, right = 0, total = 0, locked = false, retried = new Set(), rec = null;
  const show = () => {
    locked = false; inp.value = ''; bar.hidden = false;
    if (pos >= queue.length) {
      bar.hidden = true;
      area.innerHTML = `<div class="fc"><div class="fcw">🎉</div><div class="small">${right} / ${total} certas</div><br><button class="primary" id="again">Praticar de novo</button></div>`;
      document.getElementById('again').onclick = flashcards; return;
    }
    const c = cards[queue[pos]];
    document.getElementById('fcn').textContent = `${Math.min(pos + 1, queue.length)}/${queue.length}`;
    area.innerHTML = `<div class="fc flipin"><div class="small">What does it mean? Say it in English<br>← → swipe to skip · ↑ ↓ swipe if you don't know</div><div class="fcw">${esc(c.pt)}</div><div class="small">This card: ✓ ${c.ok || 0} · ✗ ${c.miss || 0}</div><button class="ghost" id="fcspeak">🔊</button>${IOS_STANDALONE ? '<div class="small">Tap the box and use the keyboard microphone key (English).</div>' : ''}</div>`;
    document.getElementById('fcspeak').onclick = () => speak(c.pt, 0.7);
    speak(c.pt, 0.8);
  };
  const next = () => { pos++; show(); };
  function answer(said, skipped) {
    if (locked) return; if (!skipped && !said.trim()) return;
    locked = true; total++;
    const idx = queue[pos], c = cards[idx], ok = !skipped && isMatch(said, c.en), el = area.querySelector('.fc');
    if (ok) {
      right++; c.ok = (c.ok || 0) + 1; store.set('cards', cards); bumpStat('right'); showStats(); el.className = 'fc ok'; el.innerHTML = `<div class="fcw">✓ ${esc(c.pt)}</div><div class="small">${esc(c.en)}</div>`;
      setTimeout(next, 1100);
    } else {
      el.className = 'fc bad flipin';
      el.innerHTML = `<div class="small">${esc(c.pt)} 🔊</div><div class="fcw">${esc(c.en)}</div>${said ? `<div class="small">Heard: ${esc(said)}</div>` : ''}<br><button class="primary" id="fcnext">Próxima ➜</button>`;
      speak(c.pt, 0.7);
      c.miss = (c.miss || 0) + 1; store.set('cards', cards); bumpStat('wrong'); showStats();
      if (!retried.has(idx)) { retried.add(idx); queue.splice(Math.min(pos + 4, queue.length), 0, idx); } // see it again soon
      document.getElementById('fcnext').onclick = next;
    }
  }
  document.getElementById('fcsend').onclick = () => answer(inp.value);
  inp.onkeydown = e => { if (e.key === 'Enter') answer(inp.value); };
  document.getElementById('fcskip').onclick = () => answer('', true);
  // swipe the card left or right to skip it: no score change, it comes back a few cards later
  function skipCard() {
    const idx = queue[pos]; queue.splice(pos, 1); queue.splice(Math.min(pos + 4, queue.length), 0, idx); show();
  }
  // swipe sideways = skip (requeue, no score); swipe up/down = mark wrong and reveal the translation
  let sx = 0, sy = 0, dx = 0, dy = 0, dragging = false;
  area.addEventListener('touchstart', e => { const el = area.querySelector('.fc'); if (!el || e.target.closest('button')) return; sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = dy = 0; dragging = true; el.style.transition = 'none'; }, { passive: true });
  area.addEventListener('touchmove', e => {
    if (!dragging) return; const el = area.querySelector('.fc'); if (!el) return;
    dx = e.touches[0].clientX - sx; dy = e.touches[0].clientY - sy;
    const vertical = Math.abs(dy) > Math.abs(dx);
    const answered = el.classList.contains('bad') || el.classList.contains('ok');
    if (vertical && answered) return;
    el.style.transform = vertical ? `translateY(${dy}px)` : `translateX(${dx}px) rotate(${dx / 25}deg)`;
    el.style.opacity = String(1 - Math.min(Math.abs(vertical ? dy : dx) / 300, 0.6));
  }, { passive: true });
  area.addEventListener('touchend', () => {
    if (!dragging) return; dragging = false; const el = area.querySelector('.fc'); if (!el || el.classList.contains('ok')) return;
    const vertical = Math.abs(dy) > Math.abs(dx), answered = el.classList.contains('bad');
    const reset = () => { el.style.transition = 'transform .2s, opacity .2s'; el.style.transform = ''; el.style.opacity = ''; };
    if (vertical && Math.abs(dy) > 90 && !answered) { // "I don't know it": counts as wrong, flips to the English
      el.style.transition = 'transform .15s, opacity .15s'; el.style.opacity = '0';
      setTimeout(() => { el.style.cssText = ''; answer('', true); }, 150);
    } else if (!vertical && Math.abs(dx) > 90) {
      el.style.transition = 'transform .2s, opacity .2s'; el.style.transform = `translateX(${dx > 0 ? 500 : -500}px)`; el.style.opacity = '0';
      setTimeout(() => answered ? next() : skipCard(), 180);
    } else reset();
  });
  const mic = document.getElementById('fcmic');
  if (mic) mic.onclick = () => {
    if (rec) { rec.stop(); return; }
    speechSynthesis.cancel();
    rec = new SR(); rec.lang = 'en-US'; rec.maxAlternatives = 3;
    mic.classList.add('rec');
    rec.onresult = e => { const alts = [...e.results[0]].map(a => a.transcript); const c = cards[queue[pos]]; answer(alts.find(a => isMatch(a, c.en)) || alts[0]); };
    rec.onerror = () => { inp.placeholder = 'Mic unavailable — use the keyboard'; };
    rec.onend = () => { mic.classList.remove('rec'); rec = null; };
    rec.start();
  };
  show();
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
(function migrate() { // old "history" list -> keep only the most recent chat, stored inside its lesson; drop the rest
  const h = store.get('history', null);
  if (!h) return;
  const last = h[h.length - 1], chats = store.get('chats', {});
  if (last && !chats[last.id]) { chats[last.id] = { log: last.log.concat(last.summary ? [{ k: 'sum', text: last.summary }] : []) }; store.set('chats', chats); }
  const act = store.get('active', null);
  if (act) { if (last && act.sid === last.sid) store.set('active', { id: act.id, msgs: act.msgs, turn: act.turn }); else localStorage.removeItem('active'); }
  localStorage.removeItem('history');
})();
(function migrateCards() { // old "Para revisar" notes are dropped; vocab from earlier lesson summaries ("word=meaning") becomes flashcards
  if (store.get('cardsMigrated', false)) return;
  const chats = store.get('chats', {});
  for (const id in chats) for (const e of chats[id].log || []) {
    if (e.k !== 'sum') continue;
    const words = [...String(e.text).matchAll(/([\p{L}][\p{L}' -]{0,30}?)\s*=\s*([^,;)=\n]{2,40})/gu)].map(m => ({ pt: m[1].trim(), en: m[2].trim() })).filter(w => w.pt.split(' ').length <= 3);
    const l = LESSONS.find(x => x.id == id); addCards(words, l ? l.title : '');
  }
  const p = progress(); delete p.notes; p.notes = []; store.set('progress', p);
  store.set('cardsMigrated', true);
})();
{ // reopening the app drops you back into an unfinished lesson
  const act = store.get('active', null), l = act && LESSONS.find(x => x.id === act.id);
  if (l && cfg().key) { currentLevel = l.level; lesson(l); } else home();
}

// keep the input bar pinned above the iOS keyboard
function fitViewport() {
  const vv = window.visualViewport, s = document.documentElement.style;
  s.setProperty('--vh', (vv?.height || innerHeight) + 'px');
  s.setProperty('--vt', (vv?.offsetTop || 0) + 'px');
  scrollChat();
}
// when the keyboard opens, jump to the newest message
function scrollChat() {
  const chat = document.getElementById('chat');
  if (chat) requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; chat.lastElementChild?.scrollIntoView({ block: 'end' }); });
}
document.addEventListener('focusin', e => { if (e.target.id === 'txt') { scrollChat(); setTimeout(scrollChat, 150); setTimeout(scrollChat, 400); } });
if (window.visualViewport) { visualViewport.addEventListener('resize', fitViewport); visualViewport.addEventListener('scroll', fitViewport); }
fitViewport();

// start the silent session on the very first tap anywhere, and restart it when the app returns from the background
document.addEventListener('pointerdown', () => keepAudioAlive(), { once: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden && window.__silent) window.__silent.play().catch(() => {}); });
