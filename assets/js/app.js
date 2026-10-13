'use strict';
/* Notebook state, validation and storage, the configurable legacy views, and all event wiring.
   Loaded last: it renders the first view. */
const KEY = 'sinnoh-v1',
  clone = (x) => JSON.parse(JSON.stringify(x)),
  str = (x, n = 1500) => String(x ?? '').slice(0, n),
  idOK = (x) => typeof x === 'string' && /^[a-z0-9_-]{1,60}$/.test(x),
  url = (x) => (typeof x === 'string' && /^https:\/\//.test(x) ? x : '');
const esc = (x) =>
  String(x ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
function validateConfig(raw) {
  if (!raw || raw.version !== 1) throw Error('Configuration incompatible');
  const c = {
    version: 1,
    title: str(raw.title, 60) || 'Mon carnet',
    game: str(raw.game, 80),
    flags: [],
    team: [],
    phases: [],
    tasks: [],
    map: {},
  };
  for (const [key, max] of [
    ['flags', 30],
    ['team', 30],
    ['phases', 50],
    ['tasks', 200],
  ]) {
    if (!Array.isArray(raw[key]) || raw[key].length > max) throw Error('Liste ' + key + ' invalide');
    const ids = new Set();
    for (const i of raw[key]) {
      if (!i || !idOK(i.id) || ids.has(i.id)) throw Error('Identifiant invalide');
      ids.add(i.id);
    }
  }
  const gate = (x) => {
    if (x === undefined) return 0;
    if (!Number.isInteger(x) || x < 0 || x > 8) throw Error('Badges : entier de 0 à 8');
    return x;
  };
  c.flags = raw.flags.map((f) => ({ id: f.id, label: str(f.label, 150) }));
  const flag = (x) => (c.flags.some((f) => f.id === x) ? x : undefined);
  c.team = raw.team.map((m) => {
    if (!Array.isArray(m.forms) || m.forms.length < 2 || m.forms.length > 10) throw Error('Il faut 2 à 10 formes');
    const image = str(m.sprite ?? DEFAULT_CONFIG.team.find((d) => d.id === m.id && d.dex === m.dex)?.sprite, 2800000);
    return {
      id: m.id,
      name: str(m.name, 100),
      dex: Number.isInteger(m.dex) && m.dex > 0 && m.dex < 2000 ? m.dex : 0,
      types: str(m.types, 100),
      forms: m.forms.map((x) => str(x, 100)),
      evolution: str(m.evolution),
      place: str(m.place),
      tip: str(m.tip),
      source: url(m.source),
      sprite: /^(sprites\/[0-9]+\.png|data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$/.test(image) ? image : '',
      temporary: m.temporary === true,
    };
  });
  c.phases = raw.phases.map((p) => ({
    id: p.id,
    title: str(p.title, 150),
    where: str(p.where),
    intro: str(p.intro),
    gate: gate(p.gate),
    flag: flag(p.flag),
  }));
  const mon = (x) => (c.team.some((m) => m.id === x) ? x : undefined);
  c.tasks = raw.tasks.map((t) => {
    if (!c.phases.some((p) => p.id === t.phase)) throw Error('Étape inconnue');
    return {
      id: t.id,
      phase: t.phase,
      title: str(t.title, 300),
      place: str(t.place),
      desc: str(t.desc),
      capture: mon(t.capture),
      evolve: mon(t.evolve),
      unlock: flag(t.unlock),
      requires: flag(t.requires),
      bypassPhase: t.bypassPhase === true,
      gate: gate(t.gate),
    };
  });
  const map = raw.map || {},
    image = str(map.image, 2800000);
  c.map = {
    image: /^(sinnoh(?:-2d)?\.png|data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$/.test(image)
      ? image
      : 'sinnoh-2d.png',
    credit: str(map.credit, 500),
    source: url(map.source),
    points: [],
  };
  if (!Array.isArray(map.points) || map.points.length > 100) throw Error('Repères invalides');
  const ids = new Set();
  c.map.points = map.points.map((p) => {
    if (
      !idOK(p.id) ||
      ids.has(p.id) ||
      !mon(p.mon) ||
      !Number.isFinite(p.x) ||
      p.x < 0 ||
      p.x > 100 ||
      !Number.isFinite(p.y) ||
      p.y < 0 ||
      p.y > 100
    )
      throw Error('Repère invalide');
    ids.add(p.id);
    return {
      id: p.id,
      mon: p.mon,
      x: p.x,
      y: p.y,
      title: str(p.title, 150),
      description: str(p.description),
      gate: gate(p.gate),
      flag: flag(p.flag),
    };
  });
  return c;
}
const defaults = () => ({
  version: 1,
  config: clone(DEFAULT_CONFIG),
  badges: 0,
  location: 'Début de l’aventure',
  flags: {},
  done: {},
  team: {},
  custom: [],
  targets: [],
  roadmapDone: {},
  board: { done: {}, visited: [] },
  notes: '',
});
function validate(raw) {
  if (!raw || raw.version !== 1 || !Number.isInteger(raw.badges) || raw.badges < 0 || raw.badges > 8)
    throw Error('Carnet invalide');
  const n = defaults();
  n.board = validateBoard(raw.board);
  n.config = validateConfig(raw.config || DEFAULT_CONFIG);
  n.badges = raw.badges;
  n.location = str(raw.location, 100);
  n.notes = str(raw.notes, 20000);
  if (raw.roadmapDone !== undefined) {
    if (
      !raw.roadmapDone ||
      typeof raw.roadmapDone !== 'object' ||
      Array.isArray(raw.roadmapDone) ||
      Object.keys(raw.roadmapDone).length > 5000
    )
      throw Error('Checklist invalide');
    for (const [key, value] of Object.entries(raw.roadmapDone)) {
      if (!/^(dex-[0-9]{1,3}-(start-[0-9]{1,3}|step-[0-9]{1,3}|obtain))$/.test(key) || typeof value !== 'boolean')
        throw Error('Étape de checklist invalide');
      n.roadmapDone[key] = value;
    }
  }
  if (raw.targets !== undefined) {
    if (!Array.isArray(raw.targets) || raw.targets.length > 493) throw Error('Objectifs Pokémon invalides');
    const ids = new Set();
    n.targets = raw.targets.map((t) => {
      if (!t || !Number.isInteger(t.dex) || !acquisitionByDex.has(t.dex) || ids.has(t.dex))
        throw Error('Objectif Pokémon invalide');
      ids.add(t.dex);
      return { dex: t.dex, obtained: t.obtained === true };
    });
  }
  for (const f of n.config.flags) n.flags[f.id] = raw.flags?.[f.id] === true;
  for (const t of n.config.tasks) n.done[t.id] = raw.done?.[t.id] === true;
  for (const m of n.config.team) {
    const v = raw.team?.[m.id] || {};
    n.team[m.id] = {
      stage: Number.isInteger(v.stage) && v.stage >= 0 && v.stage < m.forms.length ? v.stage : 0,
      level: Number.isInteger(v.level) && v.level >= 1 && v.level <= 100 ? v.level : null,
    };
  }
  if (Array.isArray(raw.custom))
    n.custom = raw.custom
      .slice(0, 100)
      .filter((x) => x && typeof x.title === 'string' && x.title.trim())
      .map((x, i) => ({ id: 'custom-' + i, title: str(x.title, 300), done: x.done === true }));
  return n;
}
let state = defaults(),
  tab = 'now',
  configure = false,
  selectedPoint = null,
  editing = null,
  storageError = false,
  mapZoom = 1,
  placingPoint = null,
  detailMon = null;
try {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed.config?.map?.image === 'sinnoh.png') {
      parsed.config.map.image = DEFAULT_CONFIG.map.image;
      parsed.config.map.credit = DEFAULT_CONFIG.map.credit;
      parsed.config.map.source = DEFAULT_CONFIG.map.source;
      for (const p of parsed.config.map.points) {
        const next = DEFAULT_CONFIG.map.points.find((d) => d.id === p.id && d.mon === p.mon);
        if (next) {
          p.x = next.x;
          p.y = next.y;
        }
      }
    }
    state = validate(parsed);
  }
} catch {
  storageError = true;
}
const cfg = () => state.config,
  teamState = (id) => state.team[id] || { stage: 0, level: null },
  flagLabel = (id) => cfg().flags.find((f) => f.id === id)?.label || id;
function isDone(t) {
  if (t.unlock) return !!state.flags[t.unlock];
  if (t.capture) return teamState(t.capture).stage > 0;
  if (t.evolve) {
    const m = cfg().team.find((m) => m.id === t.evolve);
    return teamState(m.id).stage === m.forms.length - 1;
  }
  return !!state.done[t.id];
}
function available(t) {
  const p = cfg().phases.find((p) => p.id === t.phase);
  if (t.evolve) return teamState(t.evolve).stage > 0;
  return (
    state.badges >= (t.gate || 0) &&
    (!t.requires || state.flags[t.requires]) &&
    (t.bypassPhase || (state.badges >= p.gate && (!p.flag || state.flags[p.flag])))
  );
}
function blocked(p) {
  return [state.badges < p.gate ? `${p.gate} badges` : null, p.flag && !state.flags[p.flag] ? flagLabel(p.flag) : null]
    .filter(Boolean)
    .join(' + ');
}
let toastTimer;
function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.style.display = 'none'), 3000);
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    storageError = false;
    return true;
  } catch {
    storageError = true;
    toast('Stockage indisponible : exporte ton carnet.');
    return false;
  }
}
function taskCard(t) {
  const m = cfg().team.find((m) => m.id === (t.capture || t.evolve));
  return html`
    <label class="task ${isDone(t) ? 'done' : ''}" data-tone="${tone(m)}">
      <input type="checkbox" data-task="${t.id}" ${isDone(t) ? 'checked' : ''} aria-label="${esc(t.title)}">
      ${m ? `<div class="task-sprite">${pokemonArt(m, t.evolve ? 'goal' : 'capture')}</div>` : `<div class="task-symbol">${icon(t.unlock ? 'star' : 'route')}</div>`}
      <div class="body">
        <h3>${esc(t.title)}</h3>
        <span class="place">${esc(t.place)}</span>
        <details class="task-help"><summary>Le conseil</summary><p>${esc(t.desc)}</p></details>
      </div>
    </label>
  `;
}
function customCards(all = true) {
  return state.custom
    .map((g, i) =>
      !all && g.done
        ? ''
        : html`
          <div class="task">
            <input type="checkbox" data-custom="${i}" ${g.done ? 'checked' : ''} aria-label="${esc(g.title)}">
            <div class="body"><p>${esc(g.title)}</p></div>
            ${all ? `<button data-delete="${i}" aria-label="Supprimer cet objectif">×</button>` : ''}
          </div>
        `,
    )
    .join('');
}
function legacyNowView() {
  const order = new Map(cfg().phases.map((p, i) => [p.id, i]));
  const all = cfg()
      .tasks.filter((t) => available(t) && !isDone(t))
      .sort((a, b) => order.get(a.phase) - order.get(b.phase)),
    goals = all.filter((t) => !t.evolve),
    training = all.filter((t) => t.evolve),
    next = goals[0];
  const target = next && cfg().team.find((m) => m.id === next.capture);
  const m = target ? { ...target, types: speciesArt(target, 'capture').types } : null;
  return html`
    ${storageError ? '<p class="warning">Stockage indisponible : exporte ton carnet.</p>' : ''}
    <div class="view-heading">
      <div><span class="label">L’AVENTURE CONTINUE</span><h2>On part à la chasse ?</h2></div>
      <span class="location-pill">${icon('pin')}${esc(state.location || 'Sinnoh')}</span>
    </div>
    <section class="hero quest-hero" data-tone="${tone(m)}">
      <div class="pokeball-watermark"></div>
      <div class="quest-copy">
        <span class="quest-tag">${icon('star')} PROCHAIN OBJECTIF</span>
        <h2>
          ${m ? esc(speciesArt(m, 'capture').name) : next ? esc(next.title) : 'Bien joué !'}
        </h2>
        <p class="quest-place">
          ${icon('pin')}
          ${next ? esc(next.place) : 'Ton carnet est à jour'}
        </p>
        ${m ? `<div class="types">${typePills(m)}</div>` : ''}
        ${
          next
            ? html`
              <label class="quest-check">
                <input type="checkbox" data-task="${next.id}" aria-label="${esc(next.title)}">
                <span>${m ? 'Je l’ai obtenu !' : 'Marquer comme fait'}</span>
                ${icon('check')}
              </label>
            `
            : '<p>Actualise ta progression pour la suite.</p>'
        }
      </div>
      ${
        m
          ? html`
            <button class="quest-art" data-detail="${m.id}" aria-label="Voir la fiche de ${esc(m.name)}">
              ${pokemonArt(m, 'capture')}
            </button>
          `
          : `<div class="quest-art empty-art">${icon('ball')}</div>`
      }
    </section>
    <div class="section-title">
      <h3>Ton équipe de rêve</h3>
      <button class="text-button" data-open-team>Voir tout ${icon('arrow')}</button>
    </div>
    ${teamRibbon()}
    ${
      goals.length > 1
        ? html`
          <div class="section-title">
            <h3>Et sur le chemin…</h3>
            <span class="count">${goals.length - 1} objectifs</span>
          </div>
          ${goals.slice(1).map(taskCard).join('')}
        `
        : ''
    }
    ${training.length ? '<div class="section-title"><h3>On s’entraîne !</h3></div>' + training.map(taskCard).join('') : ''}
    ${state.custom.some((g) => !g.done) ? '<div class="section-title"><h3>Mes petites missions</h3></div>' + customCards(false) : ''}
  `;
}
function routeView() {
  return html`
    <span class="label">CAPTURER AU BON MOMENT</span>
    <h2>Mon parcours</h2>
    <p class="muted">Ordre conseillé, configurable. Pas de calcul automatique du chemin le plus court.</p>
    ${
      cfg()
        .phases.map((p, i) => {
          const tasks = cfg().tasks.filter((t) => t.phase === p.id && !t.evolve),
            lock = blocked(p);
          return html`
            <details ${i === 0 ? 'open' : ''}>
              <summary>
                ${esc(p.title)} <span class="count">${tasks.filter(isDone).length}/${tasks.length}</span>
              </summary>
              <div class="inner">
                <p class="place">${esc(p.where)}</p>
                <p class="muted">${esc(p.intro)}</p>
                ${lock ? `<p class="warning">À préparer · ${esc(lock)}</p>` : ''}
                ${tasks
                  .map((t) =>
                    available(t) || isDone(t)
                      ? taskCard(t)
                      : html`
                        <div class="task locked">
                          <div>
                            <h3>${esc(t.title)}</h3>
                            <p>${esc(t.place)}</p>
                            <small>
                              ${esc(t.requires ? flagLabel(t.requires) : lock || `${t.gate} badges requis`)}
                            </small>
                          </div>
                        </div>
                      `,
                  )
                  .join('')}
              </div>
            </details>
          `;
        })
        .join('') || '<p class="empty">Crée une étape dans Journal → Configurer.</p>'
    }
  `;
}
function sprite(m) {
  return pokemonArt(m, 'goal');
}
function monCard(m) {
  const v = teamState(m.id),
    complete = v.stage === m.forms.length - 1;
  return html`
    <button class="dex-card ${m.temporary ? 'temp' : ''}" data-detail="${m.id}" data-tone="${tone(m)}">
      <div class="dex-card-top">
        <span class="dex-id">N° ${String(m.dex).padStart(3, '0')}</span>
        <span class="capture-state ${v.stage ? 'caught' : ''}" aria-label="${v.stage ? 'Obtenu' : 'À capturer'}">
          ${icon(v.stage ? 'check' : 'ball')}
        </span>
      </div>
      <div class="card-specimen">
        <div class="pokeball-watermark"></div>
        ${pokemonArt(m, 'goal')}
      </div>
      <h3>${esc(m.name)}</h3>
      <div class="types">${typePills(m)}</div>
      <span class="dex-status">
        ${m.temporary ? 'Ton équipier relais' : complete ? 'Objectif atteint !' : v.stage ? esc(m.forms[v.stage]) + (v.level ? ' · Niv. ' + v.level : '') : 'À ajouter à ton équipe'}
      </span>
    </button>
  `;
}
function legacyTeamView() {
  const final = cfg().team.filter((m) => !m.temporary),
    count = final.filter((m) => teamState(m.id).stage === m.forms.length - 1).length;
  return html`
    <div class="view-heading">
      <div><span class="label">POKÉDEX PERSONNEL</span><h2>Ta dream team</h2></div>
      <span class="completion-pill">${icon('ball')} ${count} / ${final.length}</span>
    </div>
    <div class="team-grid">${final.map(monCard).join('')}</div>
    ${
      cfg().team.some((m) => m.temporary)
        ? '<div class="section-title"><h3>Les copains de passage</h3><span class="count">RELAIS</span></div><div class="team-grid">' +
          cfg()
            .team.filter((m) => m.temporary)
            .map(monCard)
            .join('') +
          '</div>'
        : ''
    }
    <button class="add-pokemon wide" data-edit="team">
      ${icon('plus')} Ajouter un Pokémon
    </button>
  `;
}
function legacyMapView() {
  const points = cfg().map.points;
  if (!points.some((p) => p.id === selectedPoint)) selectedPoint = points[0]?.id;
  const p = points.find((p) => p.id === selectedPoint),
    m = p && cfg().team.find((m) => m.id === p.mon);
  return html`
    <span class="label">TOUCHE UN REPÈRE</span>
    <div class="section-title">
      <h2>Carte des objectifs</h2>
      <button data-edit="points">+ Repère</button>
    </div>
    <div class="map-scroll">
      <div class="map-canvas">
        <img class="map-image" src="${esc(cfg().map.image)}" alt="Carte de la région">
        <div class="map-pins">
          ${points
            .map(
              (p, i) => html`
                <button class="pin ${p.id === selectedPoint ? 'selected' : ''} ${blocked(p) ? 'pin-locked' : ''}" data-point="${p.id}" data-x="${p.x}" data-y="${p.y}" aria-label="${esc(p.title)}">
                  ${i + 1}
                </button>
              `,
            )
            .join('')}
        </div>
      </div>
    </div>
    <p class="muted">Repères régionaux approximatifs, pas des positions exactes de cases ou d’entrées. Pince pour zoomer.</p>
    ${
      p
        ? html`
          <div class="hero">
            ${sprite(m)}
            <span class="label">
              ${esc(m.name)} · ${blocked(p) ? 'À DÉBLOQUER' : 'ACCESSIBLE SELON TON SUIVI'}
            </span>
            <h2>${esc(p.title)}</h2>
            <p>${esc(p.description)}</p>
            ${blocked(p) ? `<p class="warning">Requis : ${esc(blocked(p))}</p>` : ''}
            <button data-edit="points" data-id="${p.id}">Modifier ce repère</button>
          </div>
        `
        : '<p class="empty">Ajoute un repère.</p>'
    }
    <div class="point-list">
      ${points
        .map(
          (p, i) => html`
            <button data-point="${p.id}" class="${p.id === selectedPoint ? 'primary' : ''}">
              ${i + 1} · ${esc(cfg().team.find((m) => m.id === p.mon).name)}
            </button>
          `,
        )
        .join('')}
    </div>
    <p class="muted">
      ${esc(cfg().map.credit)}
      ${cfg().map.source ? ` · <a href="${esc(cfg().map.source)}">Source ↗</a>` : ''}
    </p>
  `;
}
const typeLabels = [
  ['team', 'Pokémon'],
  ['phases', 'Étapes du parcours'],
  ['tasks', 'Objectifs guidés'],
  ['flags', 'Déblocages'],
  ['points', 'Repères de carte'],
];
function configurationView() {
  return html`
    <div class="section-title">
      <h2>Configurer le carnet</h2>
      <button id="closeConfig">Retour</button>
    </div>
    <p class="muted">Équipe, étapes, objectifs et carte : le modèle initial est entièrement modifiable.</p>
    <button data-edit="header">Titre / jeu / carte</button>
    ${typeLabels
      .map(([key, label]) => {
        const list = key === 'points' ? cfg().map.points : cfg()[key];
        return html`
          <details>
            <summary>${label} · ${list.length}</summary>
            <div class="inner">
              ${list
                .map(
                  (i, index) => html`
                    <div class="config-row">
                      <span>${esc(i.name || i.title || i.label)}</span>
                      <button data-edit="${key}" data-id="${i.id}" aria-label="Modifier">✎</button>
                      ${
                        key === 'phases'
                          ? html`
                            <button data-move="${i.id}" data-dir="-1" ${index === 0 ? 'disabled' : ''} aria-label="Monter">↑</button>
                            <button data-move="${i.id}" data-dir="1" ${index === list.length - 1 ? 'disabled' : ''} aria-label="Descendre">↓</button>
                          `
                          : ''
                      }
                      <button data-remove="${key}" data-id="${i.id}" aria-label="Retirer">×</button>
                    </div>
                  `,
                )
                .join('')}
              <button class="primary wide" data-edit="${key}">+ Ajouter</button>
            </div>
          </details>
        `;
      })
      .join('')}
    <details>
      <summary>Configuration avancée · JSON</summary>
      <div class="inner">
        <p class="muted">Tous les champs, y compris le fond de carte. image : sinnoh-2d.png, sinnoh.png ou data URL PNG/JPEG/WebP (~2 Mo max). Importer conserve les progrès des identifiants inchangés.</p>
        <textarea id="configJson" aria-label="Configuration JSON"></textarea>
        <div class="actions">
          <button id="exportConfig">Générer</button>
          <button id="importConfig">Appliquer</button>
        </div>
      </div>
    </details>
  `;
}
function journalView() {
  if (configure) return configurationView();
  return html`
    <span class="label">TON CARNET, TES OBJECTIFS</span>
    <div class="section-title">
      <h2>Journal de bord</h2>
      <button id="openConfig">Configurer</button>
    </div>
    <form id="addGoal">
      <label class="field">Ajouter un objectif
        <input id="goalTitle" maxlength="300" required placeholder="Ex. prévoir 10 Poké Balls">
      </label>
      <button class="primary" type="submit">+ Ajouter à ma checklist</button>
    </form>
    ${customCards()}
    <label class="field">Notes / plan personnel
      <textarea id="notes" maxlength="20000" placeholder="Colle ton plan ou note ton prochain arrêt…">
        ${esc(state.notes)}
      </textarea>
    </label>
    <p class="muted">Notes conservées automatiquement. Le texte collé n’est pas interprété en objectifs.</p>
    <details>
      <summary>Sauvegarder / restaurer tout le carnet</summary>
      <div class="inner">
        <p class="muted">Configuration + progression. Copie l’export ailleurs pour le conserver. Restaurer remplace le carnet, jamais la sauvegarde du jeu.</p>
        <textarea id="backup" aria-label="Sauvegarde JSON"></textarea>
        <div class="actions">
          <button id="export">Générer</button>
          <button id="import">Restaurer</button>
        </div>
      </div>
    </details>
    <button data-open-progress>Badges et progression</button>
    <button id="legacyCarnet">Afficher le carnet précédent</button>
    <details>
      <summary>Sources et confidentialité</summary>
      <div class="inner">
        <p class="muted">Compagnon hors ligne indépendant. Bridge mémoire local facultatif pour Eden, en lecture seule. Aucun accès au compte. Pokémon appartient à ses ayants droit. Sprites pixel-art : Poképédia et PokeAPI (Diamant / Perle). Données espèces et attaques : PokeAPI. Modèle BDSP vérifié le 05/10/2026. Tes ajouts ne sont pas vérifiés automatiquement.</p>
        ${cfg()
          .team.filter((m) => m.source)
          .map((m) => `<p><a href="${esc(m.source)}">${esc(m.name)} · source ↗</a></p>`)
          .join('')}
        <p>
          <a href="https://www.serebii.net/brilliantdiamondshiningpearl/pokemonhideaways.shtml">Apparitions des Souterrains ↗</a>
        </p>
      </div>
    </details>
  `;
}
function render() {
  document.body.dataset.view = tab;
  document.getElementById('gameLabel').textContent = cfg().game;
  document.getElementById('appTitle').textContent = cfg().title;
  document.getElementById('progressButton').innerHTML = `${icon('star')}<span>${state.badges}<small>/ 8</small></span>`;
  const nav = {
    now: ['ball', 'Quêtes'],
    route: ['route', 'Parcours'],
    map: ['map', 'Carte'],
    team: ['search', 'Pokédex'],
    journal: ['book', 'Carnet'],
    battle: ['ball', 'Combat'],
  };
  document.querySelectorAll('nav button').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
    b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false');
    b.innerHTML = icon(nav[b.dataset.tab][0]) + `<span>${nav[b.dataset.tab][1]}</span>`;
  });
  document.getElementById('content').innerHTML = {
    now: nowView,
    route: routeView,
    map: mapView,
    team: teamView,
    journal: journalView,
    battle: battleView,
  }[tab]();
  document.querySelectorAll('.pin[data-point]').forEach((el) => {
    el.style.left = el.dataset.x + '%';
    el.style.top = el.dataset.y + '%';
    const point = cfg().map.points.find((p) => p.id === el.dataset.point);
    const m = cfg().team.find((m) => m.id === point.mon);
    el.innerHTML = pokemonArt(m, 'capture') + `<small>${cfg().map.points.indexOf(point) + 1}</small>`;
  });
  if (tab === 'map' && catalogLegacy) {
    const canvas = document.querySelector('.map-canvas');
    canvas.style.width = 100 * mapZoom + '%';
    const controls = document.createElement('div');
    controls.className = 'map-controls';
    controls.innerHTML =
      '<button data-zoom="-1" aria-label="Dézoomer">−</button><button data-zoom="1" aria-label="Zoomer">+</button>';
    document.querySelector('.section-title').append(controls);
    if (selectedPoint) {
      const button = document.createElement('button');
      button.dataset.place = selectedPoint;
      button.textContent = 'Déplacer le repère';
      document.querySelector('.hero')?.append(button);
    }
  }
  renderAcquisitionExtras();
  if (detailMon) {
    const m = cfg().team.find((m) => m.id === detailMon);
    if (m) {
      document.getElementById('content').insertAdjacentHTML('beforeend', speciesDetail(m));
      const modal = document.getElementById('monDetail');
      modal.addEventListener('cancel', () => {
        detailMon = null;
      });
      modal.showModal();
    } else detailMon = null;
  }
}
function applyConfig(config) {
  state = validate({ ...state, config });
  selectedPoint = null;
  save();
  render();
}
function options(list, selected, empty = true) {
  return (
    (empty ? '<option value="">Aucun</option>' : '') +
    list
      .map(
        (i) =>
          html`
            <option value="${i.id}" ${i.id === selected ? 'selected' : ''}>
              ${esc(i.name || i.title || i.label)}
            </option>
          `,
      )
      .join('')
  );
}
function field(name, label, value = '', type = 'text', required = false) {
  return html`
    <label class="field">
      ${label}
      ${
        type === 'textarea'
          ? `<textarea name="${name}">${esc(value)}</textarea>`
          : html`
            <input name="${name}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''} ${type === 'number' ? 'step="any"' : ''}>
          `
      }
    </label>
  `;
}
function select(name, label, html) {
  return `<label class="field">${label}<select name="${name}">${html}</select></label>`;
}
function openEditor(type, id) {
  detailMon = null;
  document.getElementById('monDetail')?.close();
  const list = type === 'points' ? cfg().map.points : cfg()[type],
    i = id && list ? list.find((x) => x.id === id) : {};
  if (id && !i) return;
  editing = { type, id };
  let h = '<h2>' + (id ? 'Modifier' : 'Ajouter') + '</h2>';
  if (type === 'header')
    h =
      '<h2>Mon carnet</h2>' +
      field('title', 'Titre', cfg().title) +
      field('game', 'Jeu / version', cfg().game) +
      field('credit', 'Crédit du fond de carte', cfg().map.credit) +
      field('source', 'Source du fond de carte', cfg().map.source, 'url');
  if (type === 'team')
    h +=
      field('name', 'Nom', i.name, 'text', true) +
      field('dex', 'Numéro Pokédex (facultatif)', i.dex || '', 'number') +
      field('types', 'Types', i.types) +
      field('forms', 'Formes, séparées par une virgule', i.forms?.join(', ') || 'Absent, Capturé', 'text', true) +
      field('evolution', 'Conditions d’évolution', i.evolution, 'textarea') +
      field('place', 'Lieu / méthode', i.place) +
      field('tip', 'Conseil', i.tip, 'textarea') +
      field('source', 'Source HTTPS', i.source, 'url') +
      html`
        <label>
          <input type="checkbox" name="temporary" ${i.temporary ? 'checked' : ''}> Pokémon temporaire / relais
        </label>
        <p class="muted">Image personnalisée possible via le champ sprite dans l’export de configuration (data URL).</p>
      `;
  if (type === 'phases')
    h +=
      field('title', 'Nom de l’étape', i.title, 'text', true) +
      field('where', 'Trajet / lieux', i.where) +
      field('intro', 'Description', i.intro, 'textarea') +
      field('gate', 'Badges requis (0–8)', i.gate || 0, 'number') +
      select('flag', 'Déblocage requis', options(cfg().flags, i.flag));
  if (type === 'flags') h += field('label', 'Nom du déblocage', i.label, 'text', true);
  if (type === 'points')
    h +=
      field('title', 'Lieu / repère', i.title, 'text', true) +
      select('mon', 'Pokémon visé', options(cfg().team, i.mon, false)) +
      field('description', 'Indications', i.description, 'textarea') +
      field('x', 'Horizontal, % (0–100)', i.x ?? 50, 'number') +
      field('y', 'Vertical, % (0–100)', i.y ?? 50, 'number') +
      field('gate', 'Badges requis (0–8)', i.gate || 0, 'number') +
      select('flag', 'Déblocage requis', options(cfg().flags, i.flag)) +
      '<p class="muted">0,0 = coin supérieur gauche. Repère régional, pas position exacte.</p>';
  if (type === 'tasks')
    h +=
      field('title', 'Objectif', i.title, 'text', true) +
      field('place', 'Lieu', i.place) +
      field('desc', 'Indications', i.desc, 'textarea') +
      select('phase', 'Étape', options(cfg().phases, i.phase, false)) +
      field('gate', 'Badges supplémentaires requis (0–8)', i.gate || 0, 'number') +
      select('requires', 'Déblocage requis', options(cfg().flags, i.requires)) +
      select(
        'kind',
        'Effet quand je coche',
        options(
          [
            { id: 'none', name: 'Simple checklist' },
            { id: 'capture', name: 'Pokémon obtenu' },
            { id: 'evolve', name: 'Forme finale obtenue' },
            { id: 'unlock', name: 'Déblocage obtenu' },
          ],
          i.capture ? 'capture' : i.evolve ? 'evolve' : i.unlock ? 'unlock' : 'none',
          false,
        ),
      ) +
      select('mon', 'Pokémon concerné', options(cfg().team, i.capture || i.evolve)) +
      select('unlock', 'Déblocage à valider', options(cfg().flags, i.unlock)) +
      html`
        <label>
          <input type="checkbox" name="bypassPhase" ${i.bypassPhase ? 'checked' : ''}> Ignorer le prérequis de l’étape
        </label>
        <p class="muted">Ex. récupérer l’Explorakit dans une étape qui demande justement l’Explorakit.</p>
      `;
  document.getElementById('editorBody').innerHTML = h;
  document.getElementById('editor').showModal();
}
document.getElementById('editorForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const f = new FormData(event.target),
    v = (k) => str(f.get(k)),
    n = (k) => Number(f.get(k)),
    next = clone(cfg()),
    { type, id } = editing;
  let i = { id: id || 'id-' + Date.now() };
  try {
    if (type === 'header') {
      next.title = v('title');
      next.game = v('game');
      next.map.credit = v('credit');
      next.map.source = v('source');
    } else {
      if (type === 'team')
        i = {
          ...i,
          name: v('name'),
          dex: n('dex'),
          types: v('types'),
          forms: v('forms')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          evolution: v('evolution'),
          place: v('place'),
          tip: v('tip'),
          source: v('source'),
          sprite: id ? cfg().team.find((m) => m.id === id).sprite : '',
          temporary: f.has('temporary'),
        };
      if (type === 'phases')
        i = { ...i, title: v('title'), where: v('where'), intro: v('intro'), gate: n('gate'), flag: v('flag') };
      if (type === 'flags') i = { ...i, label: v('label') };
      if (type === 'points')
        i = {
          ...i,
          title: v('title'),
          mon: v('mon'),
          description: v('description'),
          x: n('x'),
          y: n('y'),
          gate: n('gate'),
          flag: v('flag'),
        };
      if (type === 'tasks') {
        i = {
          ...i,
          title: v('title'),
          place: v('place'),
          desc: v('desc'),
          phase: v('phase'),
          gate: n('gate'),
          requires: v('requires'),
          bypassPhase: f.has('bypassPhase'),
        };
        const kind = v('kind');
        if (kind === 'capture' || kind === 'evolve') {
          if (!v('mon')) throw Error('Choisis un Pokémon');
          i[kind] = v('mon');
        }
        if (kind === 'unlock') {
          if (!v('unlock')) throw Error('Choisis un déblocage');
          i.unlock = v('unlock');
        }
      }
      const list = type === 'points' ? next.map.points : next[type],
        index = list.findIndex((x) => x.id === id);
      if (index >= 0) list[index] = i;
      else list.push(i);
    }
    applyConfig(validateConfig(next));
    document.getElementById('editor').close();
    toast('Configuration enregistrée');
  } catch (error) {
    toast(error.message);
  }
});
document.getElementById('cancelEdit').addEventListener('click', () => document.getElementById('editor').close());
function removeItem(type, id) {
  if (
    !confirm(
      'Retirer cet élément et ses liens ? Les objectifs et repères liés à un Pokémon, ou objectifs d’une étape, seront aussi retirés.',
    )
  )
    return;
  const c = clone(cfg());
  if (type === 'team') {
    c.team = c.team.filter((m) => m.id !== id);
    c.tasks = c.tasks.filter((t) => t.capture !== id && t.evolve !== id);
    c.map.points = c.map.points.filter((p) => p.mon !== id);
  } else if (type === 'phases') {
    c.phases = c.phases.filter((p) => p.id !== id);
    c.tasks = c.tasks.filter((t) => t.phase !== id);
  } else if (type === 'flags') {
    c.flags = c.flags.filter((f) => f.id !== id);
    c.tasks = c.tasks.filter((t) => t.unlock !== id);
    for (const t of c.tasks) if (t.requires === id) delete t.requires;
    for (const p of [...c.phases, ...c.map.points]) if (p.flag === id) delete p.flag;
  } else if (type === 'points') c.map.points = c.map.points.filter((p) => p.id !== id);
  else c.tasks = c.tasks.filter((t) => t.id !== id);
  applyConfig(validateConfig(c));
}
document.querySelector('nav').addEventListener('click', (event) => {
  const b = event.target.closest('[data-tab]');
  if (b) {
    detailMon = null;
    catalogSelectedDex = null;
    tab = b.dataset.tab;
    if (tab === 'map' && !catalogLegacy) {
      nearbyMapActive = true;
      contextMapActive = false;
    }
    render();
    window.scrollTo(0, 0);
  }
});
window.goHome = () => {
  if (catalogSelectedDex) {
    catalogSelectedDex = null;
    document.getElementById('obtainDetail')?.close();
    return;
  }
  if (detailMon) {
    detailMon = null;
    document.getElementById('monDetail')?.close();
    return;
  }
  for (const id of ['editor', 'progress'])
    if (document.getElementById(id).open) {
      document.getElementById(id).close();
      return;
    }
  tab = 'now';
  configure = false;
  render();
  window.scrollTo(0, 0);
};
const content = document.getElementById('content');
content.addEventListener('pointerdown', (event) => {
  if (!placingPoint) return;
  const canvas = event.target.closest('.map-canvas');
  if (!canvas) return;
  event.preventDefault();
  const rect = canvas.getBoundingClientRect(),
    c = clone(cfg()),
    p = c.map.points.find((p) => p.id === placingPoint);
  if (!p) return;
  p.x = Math.max(0, Math.min(100, Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10));
  p.y = Math.max(0, Math.min(100, Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10));
  const id = p.id;
  placingPoint = null;
  applyConfig(c);
  selectedPoint = id;
  render();
  toast('Repère déplacé et enregistré');
});
content.addEventListener('change', (event) => {
  const el = event.target;
  if (handleHereChange(el) || handleRoadmapChange(el)) return;
  if (el.id === 'catalogMapTarget') {
    catalogMapDex = Number(el.value);
    catalogMapPlace = null;
    render();
    return;
  }
  if (el.dataset.task) {
    const t = cfg().tasks.find((t) => t.id === el.dataset.task);
    if (t.unlock) state.flags[t.unlock] = el.checked;
    else if (t.capture) {
      const val = teamState(t.capture);
      state.team[t.capture] = { ...val, stage: el.checked ? Math.max(1, val.stage) : 0 };
    } else if (t.evolve) {
      const m = cfg().team.find((m) => m.id === t.evolve);
      state.team[m.id] = {
        ...teamState(m.id),
        stage: el.checked ? m.forms.length - 1 : Math.max(1, m.forms.length - 2),
      };
    } else state.done[t.id] = el.checked;
    save();
    render();
  } else if (el.dataset.mon) {
    state.team[el.dataset.mon] = { ...teamState(el.dataset.mon), stage: Number(el.value) };
    save();
    render();
  } else if (el.dataset.level) {
    const value = Number(el.value);
    if (el.value && (!Number.isInteger(value) || value < 1 || value > 100)) {
      el.setCustomValidity('Niveau de 1 à 100');
      el.reportValidity();
      return;
    }
    el.setCustomValidity('');
    state.team[el.dataset.level] = { ...teamState(el.dataset.level), level: el.value ? value : null };
    save();
  } else if (el.dataset.custom) {
    state.custom[Number(el.dataset.custom)].done = el.checked;
    save();
  }
});
content.addEventListener('input', (event) => {
  if (event.target.id === 'catalogSearch') {
    catalogQuery = event.target.value;
    catalogLimit = 24;
    document.getElementById('catalogResults').innerHTML = catalogCards();
    return;
  }
  if (event.target.id === 'notes') {
    state.notes = event.target.value;
    save();
  }
});
content.addEventListener('submit', (event) => {
  if (event.target.id === 'addGoal') {
    event.preventDefault();
    const title = document.getElementById('goalTitle').value.trim();
    if (!title) return;
    if (state.custom.length >= 100) return toast('Maximum 100 objectifs');
    state.custom.push({ id: 'custom-' + Date.now(), title, done: false });
    save();
    render();
    toast('Objectif ajouté');
  }
});
content.addEventListener('click', (event) => {
  const el = event.target.closest('button');
  if (!el) return;
  if (el.dataset.questMode) {
    questMode = el.dataset.questMode;
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (el.hasAttribute('data-battle-guide') || el.hasAttribute('data-stat-guide')) {
    openBattleGuide(el.dataset.statGuide);
    return;
  }
  if (el.hasAttribute('data-battle-select')) {
    document.getElementById('battleHelp').close();
    battleSelectedId = Number(el.dataset.battleSelect);
    render();
    return;
  }
  if (el.hasAttribute('data-open-progress')) {
    document.getElementById('progressButton').click();
    return;
  }
  if (handleHereClick(el)) return;
  if (handleAcquisitionClick(el)) return;
  if (el.hasAttribute('data-edit')) return openEditor(el.dataset.edit, el.dataset.id);
  if (el.dataset.remove) return removeItem(el.dataset.remove, el.dataset.id);
  if (el.dataset.detail) {
    detailMon = el.dataset.detail;
    render();
    return;
  }
  if (el.hasAttribute('data-close-detail')) {
    detailMon = null;
    document.getElementById('monDetail')?.close();
    return;
  }
  if (el.hasAttribute('data-open-team')) {
    tab = 'team';
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (el.dataset.place) {
    placingPoint = el.dataset.place;
    document.querySelector('.map-scroll').scrollIntoView({ block: 'center' });
    toast('Touche la carte pour placer ce repère');
    return;
  }
  if (el.dataset.zoom) {
    mapZoom = Math.max(1, Math.min(4, mapZoom + Number(el.dataset.zoom) * 0.5));
    render();
    return;
  }
  if (el.dataset.move) {
    const c = clone(cfg()),
      i = c.phases.findIndex((p) => p.id === el.dataset.move),
      j = i + Number(el.dataset.dir);
    if (j >= 0 && j < c.phases.length) {
      [c.phases[i], c.phases[j]] = [c.phases[j], c.phases[i]];
      applyConfig(c);
    }
    return;
  }
  if (el.dataset.point) {
    selectedPoint = el.dataset.point;
    render();
    return;
  }
  if (el.dataset.showMon) {
    const p = cfg().map.points.find((p) => p.mon === el.dataset.showMon);
    if (!p) return toast('Ajoute un repère pour ce Pokémon');
    detailMon = null;
    selectedPoint = p.id;
    tab = 'map';
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (el.hasAttribute('data-delete')) {
    if (confirm('Supprimer cet objectif personnel ?')) {
      state.custom.splice(Number(el.dataset.delete), 1);
      save();
      render();
    }
    return;
  }
  if (el.id === 'openConfig' || el.id === 'closeConfig') {
    configure = el.id === 'openConfig';
    render();
    return;
  }
  if (el.id === 'export' || el.id === 'exportConfig') {
    const box = document.getElementById(el.id === 'export' ? 'backup' : 'configJson');
    box.value = JSON.stringify(el.id === 'export' ? state : cfg(), null, 2);
    box.focus();
    box.select();
    toast('Export prêt à copier');
    return;
  }
  if (el.id === 'import' || el.id === 'importConfig') {
    try {
      const raw = document.getElementById(el.id === 'import' ? 'backup' : 'configJson').value;
      if (raw.length > 3500000) throw Error('Export trop volumineux');
      const next = el.id === 'import' ? validate(JSON.parse(raw)) : validateConfig(JSON.parse(raw));
      if (confirm(el.id === 'import' ? 'Remplacer tout le carnet ?' : 'Appliquer la configuration ?')) {
        if (el.id === 'import') {
          state = next;
          save();
          render();
        } else applyConfig(next);
        toast('Carnet mis à jour');
      }
    } catch (error) {
      toast('Import refusé : ' + error.message);
    }
    return;
  }
});
const progress = document.getElementById('progress');
document.getElementById('badges').innerHTML = Array.from(
  { length: 9 },
  (_, i) => `<option value="${i}">${i} badge${i > 1 ? 's' : ''}</option>`,
).join('');
document.getElementById('progressButton').addEventListener('click', () => {
  document.getElementById('badges').value = state.badges;
  document.getElementById('location').value = state.location;
  document.getElementById('flags').innerHTML =
    '<legend>Déblocages configurés</legend>' +
    cfg()
      .flags.map(
        (f) =>
          html`
            <label>
              <input type="checkbox" data-flag="${f.id}" ${state.flags[f.id] ? 'checked' : ''}> ${esc(f.label)}
            </label>
          `,
      )
      .join('');
  progress.showModal();
});
document.getElementById('saveProgress').addEventListener('click', () => {
  state.badges = Number(document.getElementById('badges').value);
  state.location = document.getElementById('location').value.trim();
  document.querySelectorAll('[data-flag]').forEach((el) => (state.flags[el.dataset.flag] = el.checked));
  save();
  render();
});
render();
