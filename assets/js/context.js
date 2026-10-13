'use strict';
/* "Ici" board: what is worth doing in the zone read from the game, or entered by hand. */
let worldSnapshot = null,
  hereScope = 'current',
  contextMapActive = false,
  worldSignature = '';
function validateBoard(raw) {
  const out = { done: {}, visited: [] };
  if (raw === undefined) return out;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Tableau invalide');
  if (raw.done !== undefined) {
    if (!raw.done || typeof raw.done !== 'object' || Array.isArray(raw.done) || Object.keys(raw.done).length > 1000)
      throw Error('Suivi du tableau invalide');
    for (const [id, value] of Object.entries(raw.done)) {
      if (!CONTEXT_CATALOG.cards.some((c) => c.id === id) || typeof value !== 'boolean')
        throw Error('Conseil invalide');
      out.done[id] = value;
    }
  }
  if (raw.visited !== undefined) {
    if (
      !Array.isArray(raw.visited) ||
      raw.visited.length > 1000 ||
      raw.visited.some((id) => !Number.isInteger(id) || !ZONE_CATALOG.zones[id])
    )
      throw Error('Zones visitées invalides');
    out.visited = [...new Set(raw.visited)];
  }
  return out;
}
function liveWorld() {
  return worldSnapshot?.status === 'live' && Date.now() - worldSnapshot.timestamp < SNAPSHOT_STALE_MS
    ? worldSnapshot
    : null;
}
function hereContext() {
  const live = liveWorld();
  if (live)
    return {
      ...live,
      live: true,
      zone: ZONE_CATALOG.zones[live.zoneId] || { name: 'Zone ' + live.zoneId, regionKey: null, detail: '' },
    };
  // Manual progress is explicitly identified. No inventory or access is inferred from badge counts.
  const name = state.location,
    zone = Object.values(ZONE_CATALOG.zones).find((z) => nameKey(z.name) === nameKey(name));
  return {
    live: false,
    zone: zone || null,
    badges: state.badges,
    badgeMask: 0,
    items: {},
    party: [],
    nationalDex: false,
    leagueCleared: false,
  };
}
window.receiveWorldSnapshot = (value) => {
  worldSnapshot =
    value?.status === 'live' &&
    Number.isInteger(value.zoneId) &&
    Number.isInteger(value.badgeMask) &&
    value.badgeMask >= 0 &&
    value.badgeMask <= 255 &&
    value.items &&
    Array.isArray(value.party) &&
    Number.isFinite(value.timestamp)
      ? value
      : null;
  const world = liveWorld();
  if (world && ZONE_CATALOG.zones[world.zoneId] && !state.board.visited.includes(world.zoneId)) {
    state.board.visited.push(world.zoneId);
    save();
  }
  const signature = JSON.stringify(
    world ? [world.zoneId, world.badgeMask, world.items, world.party, world.nationalDex, world.leagueCleared] : null,
  );
  if (signature !== worldSignature) {
    worldSignature = signature;
    if ((tab === 'now' && questMode === 'here') || (tab === 'map' && (contextMapActive || nearbyMapActive)))
      renderHereStable();
  }
};
function renderHereStable() {
  const position = scrollY,
    open = [...document.querySelectorAll('[data-here-details][open]')].map((d) => d.dataset.hereDetails);
  render();
  for (const el of document.querySelectorAll('[data-here-details]')) el.open = open.includes(el.dataset.hereDetails);
  window.scrollTo({ top: position, behavior: 'instant' });
}
function hereRegions(ctx) {
  if (!ctx.zone?.regionKey) return new Set();
  const keys = new Set([ctx.zone.regionKey]);
  if (hereScope === 'visited' && ctx.live)
    for (const id of state.board.visited) {
      const zone = ZONE_CATALOG.zones[id];
      if (zone) keys.add(zone.regionKey);
    }
  return keys;
}
function hereRequirement(req, ctx) {
  if (!ctx.live) return false;
  const item = {
    'old-rod': 445,
    'good-rod': 446,
    'super-rod': 447,
    kit: 428,
    'poke-radar': 431,
    'odd-keystone': 111,
    'member-card': 454,
    'oaks-letter': 452,
    'azure-flute': 455,
  }[req.id];
  if (item) return ctx.items[item] > 0;
  if (req.id === 'national-dex') return ctx.nationalDex;
  // A badge alone does not establish that its hidden move has been received.
  return false; // Hidden-move unlocks are not yet read: remain conservative.
}
function hereEncounterAccessible(e, ctx) {
  if (!e.versions.includes('brilliant-diamond') || !e.requirements.every((r) => hereRequirement(r, ctx))) return false;
  // Unparsed event, time or biome conditions must not become promises of availability.
  return /^(Hautes herbes|En marchant|Pêche à la (Canne|Super Canne|Méga Canne)|Sur l'eau)$/.test(e.method);
}
function herePokemonCards(ctx, regions) {
  const cards = [];
  for (const target of state.targets.filter((t) => !t.obtained)) {
    const chain = acquisitionChain(target.dex),
      owned = ctx.party.filter((p) => chain.some((m) => m.dex === p.dex));
    if (owned.length) {
      const best = chain.filter((m) => owned.some((p) => p.dex === m.dex)).at(-1),
        steps = chain.slice(chain.indexOf(best) + 1);
      cards.push({
        id: 'train-' + target.dex,
        kind: 'training',
        title: best.dex === target.dex ? best.name + ' dans ton équipe' : 'Faire évoluer ' + best.name,
        summary:
          steps
            .map(
              (m) =>
                `${m.name} : ${m.evolvesFrom?.find((e) => e.from === chain[chain.indexOf(m) - 1].dex)?.condition || 'consulter la fiche'}`,
            )
            .join(' · ') || 'Objectif présent dans l’équipe lue du jeu.',
        dex: target.dex,
        catchDex: best.dex,
        source: best.source,
      });
      continue;
    }
    for (const mon of chain) {
      const matches = mon.encounters.filter(
        (e) => regions.has(nameKey(ACQUISITION_CATALOG.places[e.placeId]?.name)) && hereEncounterAccessible(e, ctx),
      );
      for (const e of matches) {
        const place = ACQUISITION_CATALOG.places[e.placeId];
        // Floor/subarea requirements aren't inferred from regional map anchors.
        if (place.subarea) continue;
        cards.push({
          id: 'catch-' + target.dex + '-' + e.placeId + '-' + mon.dex,
          kind: 'pokemon',
          title: mon.name,
          dex: target.dex,
          catchDex: mon.dex,
          placeId: e.placeId,
          where: place.name + ' · ' + e.method,
          summary: `Pour ${BATTLE_DEX[target.dex].name} · Niv. ${e.levelLabel || '?'} · ${acquisitionRate(e)}`,
          source: e.source || mon.source,
        });
      }
    }
  }
  return cards.filter((c, i, a) => a.findIndex((x) => x.id === c.id) === i);
}
function hereCards(ctx = hereContext()) {
  const regions = hereRegions(ctx),
    wanted = new Set([...state.targets.map((t) => t.dex), ...ctx.party.map((p) => p.dex)]);
  const advice = CONTEXT_CATALOG.cards
    .filter(
      (c) =>
        c.regionKeys.some((k) => regions.has(k)) &&
        (!c.targetDex.length ||
          c.targetDex.some(
            (d) => wanted.has(d) || ctx.party.some((p) => acquisitionChain(d).some((m) => m.dex === p.dex)),
          )) &&
        (!c.requiresLeague || ctx.leagueCleared) &&
        (!c.requiresNational || ctx.nationalDex),
    )
    .map((c) => ({
      ...c,
      owned: ctx.live && c.itemId && (ctx.items[c.itemId] > 0 || ctx.party.some((p) => p.heldItem === c.itemId)),
      held: ctx.live && c.itemId && ctx.party.some((p) => p.heldItem === c.itemId),
      done: !!state.board.done[c.id],
    }));
  return [...herePokemonCards(ctx, regions), ...advice];
}
function hereCard(c) {
  const complete = c.owned || c.done,
    isPokemon = c.kind === 'pokemon' || c.kind === 'training';
  return html`
    <article class="here-card ${complete ? 'complete' : ''}" data-here-card="${esc(c.id)}">
      <div class="here-card-head">
        ${isPokemon ? `<img class="pixel-mon" src="sprites/${c.catchDex || c.dex}.png" alt="">` : `<span class="here-symbol">${icon(c.kind === 'item' ? 'star' : 'route')}</span>`}
        <div>
          <span class="label">
            ${{ item: 'OBJET UTILE', tip: 'À PENSER', pokemon: 'À CAPTURER', training: 'TON ÉQUIPE' }[c.kind]}
          </span>
          <h3>${esc(c.title)}</h3>
        </div>
        ${c.owned ? `<span class="here-owned">${c.held ? 'Déjà équipé' : 'Dans le sac'} ✓</span>` : ''}
      </div>
      ${c.where ? `<p class="here-where">${esc(c.where)}</p>` : ''}
      <p>${esc(c.summary)}</p>
      <div class="here-actions">
        ${
          !isPokemon
            ? html`
              <label>
                <input type="checkbox" data-here-done="${c.id}" ${c.done ? 'checked' : ''}> ${c.kind === 'item' ? 'Récupéré' : 'Fait'}
              </label>
            `
            : html`
              <button data-obtain-detail="${c.dex}">Fiche</button>
              ${c.placeId ? `<button data-here-map data-here-place="${c.placeId}">Carte</button>` : ''}
            `
        }
        <a href="${esc(c.source)}">${isPokemon ? 'Poképédia' : 'Pokébip'} ↗</a>
      </div>
    </article>
  `;
}
function hereView() {
  const ctx = hereContext(),
    cards = hereCards(ctx),
    pending = cards.filter((c) => !c.owned && !c.done),
    complete = cards.filter((c) => c.owned || c.done);
  return html`
    ${questTabs()}
    <div class="here-heading">
      <div>
        <span class="label">
          ${ctx.live ? '● POSITION LUE DANS LE JEU' : 'POSITION DU CARNET · MANUELLE'}
        </span>
        <h2>${esc(ctx.zone?.name || 'Où es-tu ?')}</h2>
        ${ctx.zone?.detail ? `<small>${esc(ctx.zone.detail)}</small>` : ''}
      </div>
      ${bridgeToggle()}
    </div>
    <div class="here-summary">
      <span>${ctx.badges} / 8 badges</span>
      ${ctx.live ? `<span>${ctx.items[4] || 0} Poké Balls</span>` : `<button data-open-progress>Renseigner ma zone</button>`}
      <button data-here-map>${icon('map')} Carte</button>
    </div>
    ${
      !ctx.live
        ? html`
          <p class="here-notice">
            ${battleSnapshot.status === 'error' ? 'Lecture interrompue. ' : ''}Connecte le bridge pour lire ta zone, ton équipe et le sac. Le suivi manuel garde ses propres cases.
          </p>
        `
        : ''
    }
    <div class="here-filters">
      <button data-here-scope="current" aria-pressed="${hereScope === 'current'}">Ici</button>
      <button data-here-scope="visited" aria-pressed="${hereScope === 'visited'}" ${!ctx.live ? 'disabled' : ''}>Zones déjà visitées</button>
    </div>
    <div class="here-grid">${pending.map(hereCard).join('')}</div>
    ${!pending.length ? '<p class="here-empty">Aucun autre conseil confirmé pour tes objectifs dans cette zone. Les lieux futurs restent masqués.</p>' : ''}
    ${
      complete.length
        ? html`
          <details class="here-completed" data-here-details="completed">
            <summary>Déjà récupéré / fait · ${complete.length}</summary>
            <div class="here-grid">${complete.map(hereCard).join('')}</div>
          </details>
        `
        : ''
    }
    <p class="here-footnote">Conseils sélectionnés depuis Pokébip ; rencontres issues des fiches Poképédia. Les accès avec une condition non vérifiée restent masqués. Un objet absent du sac peut avoir été utilisé : coche « Récupéré » pour t’en souvenir.</p>
  `;
}
function contextMapView() {
  const ctx = hereContext(),
    regions = hereRegions(ctx),
    places = Object.values(ACQUISITION_CATALOG.places).filter(
      (p) => regions.has(nameKey(p.name)) && p.map?.anchors?.length,
    ),
    pins = places.flatMap((p) => p.map.anchors.map((a) => ({ p, a }))),
    chosen =
      places.find((p) => p.id === catalogMapPlace) || places.find((p) => nameKey(p.name) === ctx.zone?.regionKey);
  return html`
    <div class="section-title">
      <h2>Ta zone sur la carte</h2>
      <button data-here-map-back>Carte des Pokémon</button>
    </div>
    <p class="muted">
      ${esc(ctx.zone?.name || 'Zone non renseignée')} · ${ctx.live ? 'position du jeu' : 'position manuelle'}
    </p>
    <div class="map-scroll">
      <div class="map-canvas">
        <img class="map-image" src="sinnoh-2d.png" alt="Carte de Sinnoh">
        <div class="map-pins">
          ${pins
            .map(
              ({ p, a }, i) => html`
                <button class="pin ${chosen === p ? 'selected' : ''}" data-obtain-pin="${p.id}" data-x="${a.x}" data-y="${a.y}" aria-label="${esc(p.name)}">
                  ${i + 1}
                </button>
              `,
            )
            .join('')}
        </div>
      </div>
    </div>
    ${
      chosen
        ? html`
          <h3>${esc(chosen.name)}</h3>
          ${hereCards(ctx)
            .filter((c) => c.placeId === chosen.id || c.regionKeys?.includes(nameKey(chosen.name)))
            .map(hereCard)
            .join('')}
        `
        : '<p class="empty">Aucun repère confirmé pour cette zone.</p>'
    }
    <p class="muted">Repère régional approximatif, pas une position exacte dans le lieu.</p>
    <button data-here-return>Retour à Ici</button>
  `;
}
function handleHereClick(el) {
  if (el.dataset.hereScope) {
    hereScope = el.dataset.hereScope;
    render();
    return true;
  }
  if (el.hasAttribute('data-here-map')) {
    nearbyMapActive = true;
    contextMapActive = false;
    catalogMapPlace = el.dataset.herePlace || null;
    tab = 'map';
    render();
    window.scrollTo(0, 0);
    return true;
  }
  if (el.hasAttribute('data-here-map-back')) {
    nearbyMapActive = false;
    contextMapActive = false;
    render();
    return true;
  }
  if (el.hasAttribute('data-here-return')) {
    tab = 'now';
    questMode = 'here';
    render();
    window.scrollTo(0, 0);
    return true;
  }
  return false;
}
function handleHereChange(el) {
  if (!el.dataset.hereDone) return false;
  if (CONTEXT_CATALOG.cards.some((c) => c.id === el.dataset.hereDone)) {
    state.board.done[el.dataset.hereDone] = el.checked;
    save();
    renderHereStable();
  }
  return true;
}
setInterval(() => {
  if (worldSnapshot && !liveWorld()) {
    worldSnapshot = null;
    worldSignature = '';
    if ((tab === 'now' && questMode === 'here') || (tab === 'map' && (contextMapActive || nearbyMapActive)))
      renderHereStable();
  }
}, 2000);
