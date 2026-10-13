'use strict';
/* Pokédex and goals: how to obtain any species, from the generated acquisition catalogue. */
let catalogScope = 'gen4';
let catalogLegacy = false,
  catalogQuery = '',
  catalogLimit = 24,
  catalogSelectedDex = null,
  catalogMapDex = null,
  catalogMapPlace = null;
const acquisitionByDex = new Map(ACQUISITION_CATALOG.species.map((mon) => [mon.dex, mon]));
function acquisitionChain(dex) {
  const chain = [],
    seen = new Set();
  let mon = acquisitionByDex.get(dex);
  while (mon && !seen.has(mon.dex)) {
    seen.add(mon.dex);
    chain.unshift(mon);
    const parent = mon.evolvesFrom?.[0]?.from;
    mon = parent ? acquisitionByDex.get(parent) : null;
  }
  return chain;
}
function acquisitionOptions(dex) {
  const chain = acquisitionChain(dex),
    options = [];
  // Every catchable stage is a possible starting point; later evolution steps are preserved.
  for (let i = chain.length - 1; i >= 0; i--) {
    const encounters = chain[i].encounters
      .filter((e) => e.versions.includes('brilliant-diamond'))
      .sort((a, b) => (a.levels?.min ?? 999) - (b.levels?.min ?? 999));
    if (encounters.length)
      options.push({
        start: chain[i],
        encounters,
        steps: chain
          .slice(i + 1)
          .map((m) => ({ mon: m, edge: m.evolvesFrom?.find((e) => e.from === chain[chain.indexOf(m) - 1]?.dex) })),
      });
  }
  if (!options.length) {
    const target = acquisitionByDex.get(dex);
    for (const alternative of target.alternatives || [])
      if (alternative.kind === 'breeding') {
        const parent = acquisitionByDex.get(alternative.parentDex),
          encounters = parent.encounters
            .filter((e) => e.versions.includes('brilliant-diamond'))
            .sort((a, b) => (a.levels?.min ?? 999) - (b.levels?.min ?? 999));
        options.push({
          start: parent,
          encounters,
          steps: [{ mon: target, edge: alternative }],
          breeding: alternative,
          externalVersion: !encounters.length && parent.encounters.some((e) => e.versions.includes('shining-pearl')),
        });
      }
  }
  if (!options.length) {
    for (let i = chain.length - 1; i >= 0; i--) {
      if (chain[i].encounters.some((e) => e.versions.includes('shining-pearl'))) {
        options.push({
          start: chain[i],
          encounters: [],
          externalVersion: true,
          steps: chain.slice(i + 1).map((mon) => ({ mon, edge: mon.evolvesFrom?.[0] })),
        });
        break;
      }
    }
  }
  return options.sort(
    (a, b) =>
      Math.min(...a.encounters.map((e) => e.levels?.min ?? 999), 999) -
      Math.min(...b.encounters.map((e) => e.levels?.min ?? 999), 999),
  );
}
function acquisitionRate(e) {
  const rates = e.ratesByVersion?.['brilliant-diamond'] || e.rates;
  return Object.entries(rates)
    .map(
      ([time, value]) =>
        `${time === 'all' ? '' : ({ matin: 'Matin', jour: 'Jour', nuit: 'Nuit' }[time] || time) + ' : '}${/^\d+(\.\d+)?$/.test(value) ? value + ' %' : value}`,
    )
    .join(' · ');
}
function acquisitionRows(dex, max = 8) {
  const options = acquisitionOptions(dex);
  if (!options.length) {
    const mon = acquisitionByDex.get(dex);
    return html`
      <p class="empty">
        ${esc(mon.notes.filter((n) => !n.startsWith('Faire évoluer')).join(' · ') || (mon.availability === 'other-version' ? 'Les rencontres documentées sont dans Perle Scintillante. Pour Diamant Étincelant, un échange ou un transfert externe est nécessaire.' : 'Le moyen d’obtention dans Diamant Étincelant reste à compléter dans les sources.'))}
      </p>
      ${mon.alternatives?.some((a) => a.requiresOfficialGame) ? '<p class="muted">Pokémon HOME concerne les jeux officiels. Le compagnon ne fournit pas de fonction HOME sur Eden.</p>' : ''}
      <a href="${esc(mon.source)}">Vérifier la fiche Poképédia ↗</a>
    `;
  }
  return options
    .map(
      (option, i) =>
        html`
          <section class="obtain-route">
            <div class="obtain-route-heading">
              <img class="pixel-mon" src="sprites/${option.start.dex}.png" alt="">
              <h3>
                ${option.steps.length ? 'Commencer par ' + esc(option.start.name) : 'Obtenir ' + esc(option.start.name)}
              </h3>
            </div>
            ${
              option.externalVersion
                ? '<p class="muted">Les rencontres documentées sont dans Perle Scintillante. Il faut obtenir ce Pokémon par un échange ou un transfert externe pour continuer dans Diamant Étincelant.</p>'
                : !option.encounters.length
                  ? html`
                    <p class="muted">
                      ${esc(option.start.notes.join(' · ') || 'Moyen d’obtention à vérifier pour ce parent.')}
                    </p>
                  `
                  : ''
            }
            ${option.start.alternatives?.some((a) => a.requiresOfficialGame) ? '<p class="muted">Pokémon HOME concerne les jeux officiels ; le compagnon ne fournit pas de fonction HOME sur Eden.</p>' : ''}
            ${option.encounters
              .slice(0, max)
              .map((e) => {
                const place = ACQUISITION_CATALOG.places[e.placeId],
                  mapped = place.map?.anchors?.length;
                return html`
                  <article class="obtain-location">
                    <div>
                      <h4>${esc(place.name)}</h4>
                      ${place.subarea ? `<span class="obtain-subarea">${esc(place.subarea)}</span>` : ''}
                      <p>
                        ${esc(e.method || 'Méthode à vérifier')}
                        ${e.levelLabel ? ' · ' + esc(e.levelLabel) + (e.levels ? ' niv.' : '') : ''}
                      </p>
                      <span class="obtain-rate">${esc(acquisitionRate(e))}</span>
                    </div>
                    <div class="obtain-location-actions">
                      ${
                        mapped
                          ? html`
                            <button data-obtain-map="${dex}" data-obtain-place="${e.placeId}" aria-label="Voir ${esc(place.name)} sur la carte">
                              ${icon('map')}
                            </button>
                          `
                          : ''
                      }
                      <a href="${esc(e.source)}" aria-label="Fiche de ${esc(place.name)}">↗</a>
                    </div>
                  </article>
                `;
              })
              .join('')}
            ${
              option.encounters.length > max
                ? html`
                  <button class="text-button" data-obtain-map="${dex}">Voir les ${option.encounters.length} possibilités sur la carte
                  </button>
                `
                : ''
            }
            ${
              option.breeding
                ? html`
                  <button data-obtain-map="${dex}" data-obtain-place="garderiebonville">
                    ${icon('map')} Garderie de Bonville
                  </button>
                `
                : ''
            }
            ${
              option.steps.length
                ? html`
                  <div class="obtain-evolutions">
                    ${option.steps
                      .map(
                        ({ mon, edge }) => html`
                          <div>
                            <img class="pixel-mon" src="sprites/${mon.dex}.png" alt="${esc(mon.name)}">
                            <div>
                              <b>${esc(mon.name)}</b>
                              <p>
                                ${esc(edge?.condition || 'Condition à vérifier')}
                                ${edge?.kind === 'breeding' ? ' · à la Garderie de Bonville' : ''}
                                ${edge?.needsReview ? ' · à confirmer pour BDSP' : ''}
                              </p>
                              ${edge?.needsReview ? `<a href="${esc(edge.source)}">Vérifier la condition ↗</a>` : ''}
                            </div>
                          </div>
                        `,
                      )
                      .join('')}
                  </div>
                `
                : ''
            }
          </section>
        `,
    )
    .join('');
}
function acquisitionView() {
  if (catalogLegacy) return legacyNowView();
  return html`
    <div class="view-heading">
      <div><span class="label">LES POKÉMON QUE TU VEUX</span><h2>Mes objectifs</h2></div>
      <button class="primary" data-open-catalog>${icon('plus')} Choisir</button>
    </div>
    ${
      !state.targets.length
        ? html`
          <section class="hero obtain-empty">
            <div class="empty-pokemon">${icon('ball')}</div>
            <h2>Qui veux-tu rencontrer ?</h2>
            <p>Choisis un Pokémon. On te montre où l’obtenir et comment le faire évoluer.</p>
            <button class="primary" data-open-catalog>Choisir mon Pokémon</button>
          </section>
        `
        : state.targets
            .map((target) => {
              const mon = acquisitionByDex.get(target.dex),
                options = acquisitionOptions(mon.dex),
                places = new Set(options.flatMap((o) => o.encounters.map((e) => e.placeId)));
              return html`
                <section class="hero obtain-goal" data-tone="${tone({ types: mon.types.join('/') })}">
                  <div class="obtain-goal-heading">
                    <img class="pixel-mon" src="sprites/${mon.dex}.png" alt="${esc(mon.name)}">
                    <div>
                      <span class="label">
                        ${target.obtained ? 'OBTENU' : 'MON OBJECTIF'} · N° ${String(mon.dex).padStart(3, '0')}
                      </span>
                      <h2>${esc(mon.name)}</h2>
                      <div class="types">
                        ${mon.types.map((t) => `<span class="type-pill">${esc(t)}</span>`).join('')}
                      </div>
                    </div>
                    <button class="target-remove" data-remove-target="${mon.dex}" aria-label="Retirer ${esc(mon.name)}">
                      ${icon('close')}
                    </button>
                  </div>
                  <div class="obtain-goal-actions">
                    <button class="primary" data-obtain-detail="${mon.dex}">Comment l’obtenir</button>
                    <button data-obtain-map="${mon.dex}">
                      ${icon('map')} ${places.size} lieu${places.size > 1 ? 'x' : ''}
                    </button>
                    <button data-obtained="${mon.dex}" aria-pressed="${target.obtained}">
                      ${target.obtained ? '✓ Obtenu' : 'Je l’ai !'}
                    </button>
                  </div>
                </section>
              `;
            })
            .join('')
    }
    <p class="muted obtain-source">Données Poképédia et ses contributeurs · CC BY-NC-SA 3.0 · Diamant Étincelant · ${ACQUISITION_CATALOG.species.length} espèces. Certaines fiches restent incomplètes. <a href="https://www.pokepedia.fr/Module:Localisations/Données/Pokémon_Diamant_Étincelant_et_Perle_Scintillante">Source ↗</a>
    </p>
  `;
}
function catalogCards() {
  const q = nameKey(catalogQuery),
    matches = ACQUISITION_CATALOG.species.filter(
      (m) =>
        (catalogScope === 'national' || m.dex >= 387) &&
        (!q || nameKey(m.name).includes(q) || String(m.dex).includes(q)),
    );
  return html`
    <div class="catalog-result-count">${matches.length} Pokémon</div>
    <div class="catalog-grid">
      ${matches
        .slice(0, catalogLimit)
        .map(
          (m) =>
            html`
              <button class="catalog-mon" data-obtain-detail="${m.dex}" data-tone="${tone({ types: m.types.join('/') })}">
                <img class="pixel-mon" src="sprites/${m.dex}.png" alt="" loading="lazy">
                <div>
                  <span class="dex-id">N° ${String(m.dex).padStart(3, '0')}</span>
                  <b>${esc(m.name)}</b>
                  <span class="catalog-types">${esc(m.types.join(' · '))}</span>
                </div>
                ${state.targets.some((t) => t.dex === m.dex) ? '<span class="catalog-chosen">✓</span>' : ''}
              </button>
            `,
        )
        .join('')}
    </div>
    ${matches.length > catalogLimit ? '<button class="wide" data-more-catalog>Afficher la suite</button>' : ''}
  `;
}
function catalogView() {
  return html`
    <div class="view-heading">
      <div><span class="label">CHOISIS TON PROCHAIN POKÉMON</span><h2>Pokédex</h2></div>
      <span class="count">${catalogScope === 'gen4' ? 107 : 493}</span>
    </div>
    <div class="catalog-scope" role="group" aria-label="Étendue du Pokédex">
      <button data-catalog-scope="gen4" aria-pressed="${catalogScope === 'gen4'}">4G <small>107 Pokémon</small>
      </button>
      <button data-catalog-scope="national" aria-pressed="${catalogScope === 'national'}">National <small>493 Pokémon</small>
      </button>
    </div>
    <label class="catalog-search">
      ${icon('search')}
      <input id="catalogSearch" type="search" maxlength="80" placeholder="Nom ou numéro du Pokémon" aria-label="Rechercher un Pokémon" value="${esc(catalogQuery)}">
    </label>
    <div id="catalogResults">${catalogCards()}</div>
  `;
}
function obtainDetail(dex) {
  const mon = acquisitionByDex.get(dex),
    wanted = state.targets.some((t) => t.dex === dex);
  return html`
    <dialog id="obtainDetail" class="species-sheet obtain-sheet" data-tone="${tone({ types: mon.types.join('/') })}">
      <div class="sheet-top">
        <span class="dex-id">N° ${String(mon.dex).padStart(3, '0')} · DIAMANT ÉTINCELANT</span>
        <button data-close-obtain aria-label="Fermer">${icon('close')}</button>
      </div>
      <div class="obtain-sheet-title">
        <img class="pixel-mon" src="sprites/${mon.dex}.png" alt="${esc(mon.name)}">
        <div>
          <h2>${esc(mon.name)}</h2>
          <div class="types">
            ${mon.types.map((t) => `<span class="type-pill">${esc(t)}</span>`).join('')}
          </div>
        </div>
      </div>
      <div class="sheet-content">
        <button class="primary wide" data-want="${mon.dex}" ${wanted ? 'disabled' : ''}>
          ${wanted ? '✓ Dans mes objectifs' : 'Je veux ce Pokémon'}
        </button>
        <div class="section-title">
          <h3>Comment l’obtenir</h3>
          <button class="text-button" data-obtain-map="${mon.dex}">${icon('map')} Carte</button>
        </div>
        ${acquisitionRows(dex)}
        <p class="muted">Les méthodes mentionnées viennent de Poképédia. Vérifie aussi la fiche du lieu pour l’accès, les événements et les prérequis non détaillés ici.</p>
        <a href="${esc(mon.source)}">Fiche Poképédia ↗</a>
      </div>
    </dialog>
  `;
}
function acquisitionMapView() {
  if (nearbyMapActive && !catalogLegacy) return nearbyMapView();
  if (contextMapActive) return contextMapView();
  if (catalogLegacy) return legacyMapView();
  const dex = catalogMapDex || state.targets.find((t) => !t.obtained)?.dex || state.targets[0]?.dex;
  if (!dex)
    return html`
      <div class="view-heading"><h2>Carte des rencontres</h2></div>
      <section class="hero obtain-empty">
        <h3>Choisis d’abord un Pokémon</h3>
        <p>Ses lieux d’obtention apparaîtront sur la carte.</p>
        <button data-open-catalog class="primary">Ouvrir le Pokédex</button>
      </section>
    `;
  const mon = acquisitionByDex.get(dex),
    options = acquisitionOptions(dex),
    entries = options.flatMap((o) => [
      ...o.encounters.map((e) => ({ e, mon: o.start })),
      ...(o.breeding
        ? [{ mon, e: { placeId: 'garderiebonville', method: o.breeding.condition, rates: {}, levelLabel: 'Œuf' } }]
        : []),
    ]),
    places = [...new Set(entries.map((x) => x.e.placeId))].map((id) => ACQUISITION_CATALOG.places[id]);
  if (!places.some((p) => p.id === catalogMapPlace)) catalogMapPlace = places[0]?.id;
  const chosen = places.find((p) => p.id === catalogMapPlace),
    selected = entries.filter((x) => x.e.placeId === catalogMapPlace);
  return html`
    <div class="view-heading">
      <div><span class="label">OÙ COMMENCER</span><h2>${esc(mon.name)}</h2></div>
      <button data-obtain-detail="${dex}">Sa fiche</button>
    </div>
    ${
      state.targets.length > 1
        ? html`
          <label class="field">Mon objectif
            <select id="catalogMapTarget">
              ${state.targets
                .map(
                  (t) => html`
                    <option value="${t.dex}" ${t.dex === dex ? 'selected' : ''}>
                      ${esc(acquisitionByDex.get(t.dex).name)}
                    </option>
                  `,
                )
                .join('')}
            </select>
          </label>
        `
        : ''
    }
    <div class="map-controls">
      <button data-obtain-zoom="-1" aria-label="Dézoomer">−</button>
      <button data-obtain-zoom="1" aria-label="Zoomer">+</button>
    </div>
    <div class="map-scroll">
      <div class="map-canvas acquisition-map">
        <img class="map-image" src="sinnoh-2d.png" alt="Carte de Sinnoh">
        <div class="map-pins">
          ${places
            .flatMap((p, i) =>
              (p.map?.anchors || []).map(
                (anchor, j) => html`
                  <button class="pin ${catalogMapPlace === p.id ? 'selected' : ''}" data-obtain-pin="${p.id}" data-x="${anchor.x}" data-y="${anchor.y}" aria-label="${esc(p.name)}">
                    ${i + 1}
                  </button>
                `,
              ),
            )
            .join('')}
        </div>
      </div>
    </div>
    <p class="muted">Repères régionaux approximatifs. Dans les Souterrains, le repère indique un accès en surface.</p>
    ${
      chosen
        ? html`
          <section class="hero obtain-map-info">
            <span class="label">
              ${chosen.map.kind === 'underground-access' ? 'GRANDS SOUTERRAINS' : 'LIEU D’OBTENTION'}
            </span>
            <h3>${esc(chosen.name)}</h3>
            ${chosen.subarea ? `<p>${esc(chosen.subarea)}</p>` : ''}
            ${selected
              .map(
                ({ e, mon }) => html`
                  <p>
                    <b>${esc(mon.name)}</b> · ${esc(e.method)}
                    ${e.levelLabel ? ' · ' + esc(e.levelLabel) : ''}
                    <br>
                    <span class="muted">${esc(acquisitionRate(e))}</span>
                  </p>
                `,
              )
              .join('')}
            <p class="muted">${esc(chosen.map.note)}</p>
            <a href="${esc(chosen.source)}">Voir les détails du lieu ↗</a>
          </section>
        `
        : '<p class="empty">Aucun lieu confirmé dans les sources pour cet objectif.</p>'
    }
    <div class="point-list">
      ${places
        .map(
          (p, i) => html`
            <button data-obtain-pin="${p.id}" class="${catalogMapPlace === p.id ? 'primary' : ''}">
              ${i + 1} · ${esc(p.name)}
            </button>
          `,
        )
        .join('')}
    </div>
    <p class="muted">Carte de Sinnoh · <a href="${esc(ACQUISITION_CATALOG.map.source)}">Source ↗</a>
    </p>
  `;
}
function nowView() {
  return catalogLegacy
    ? legacyNowView()
    : questMode === 'here'
      ? hereView()
      : questMode === 'roadmap'
        ? roadmapView()
        : questTabs() + acquisitionView();
}
function teamView() {
  return catalogLegacy ? legacyTeamView() : catalogView();
}
function mapView() {
  return acquisitionMapView();
}
function renderAcquisitionExtras() {
  renderNearbyMap();
  if (tab === 'map' && !catalogLegacy) {
    const canvas = document.querySelector('.acquisition-map');
    if (canvas) canvas.style.width = 100 * mapZoom + '%';
    document.querySelectorAll('[data-obtain-pin].pin').forEach((el) => {
      el.style.left = el.dataset.x + '%';
      el.style.top = el.dataset.y + '%';
    });
  }
  if (catalogSelectedDex) {
    document.getElementById('content').insertAdjacentHTML('beforeend', obtainDetail(catalogSelectedDex));
    const modal = document.getElementById('obtainDetail');
    modal.addEventListener('cancel', () => {
      catalogSelectedDex = null;
    });
    modal.showModal();
  }
}
function handleAcquisitionClick(el) {
  if (el.hasAttribute('data-open-catalog')) {
    catalogLegacy = false;
    tab = 'team';
    detailMon = null;
    catalogSelectedDex = null;
    render();
    window.scrollTo({ top: 0, behavior: 'instant' });
    return true;
  }
  if (el.dataset.obtainDetail) {
    detailMon = null;
    catalogSelectedDex = Number(el.dataset.obtainDetail);
    render();
    return true;
  }
  if (el.hasAttribute('data-close-obtain')) {
    catalogSelectedDex = null;
    document.getElementById('obtainDetail')?.close();
    return true;
  }
  if (el.dataset.want) {
    const dex = Number(el.dataset.want);
    if (!state.targets.some((t) => t.dex === dex)) {
      state.targets.push({ dex, obtained: false });
      save();
    }
    render();
    toast('Ajouté à tes objectifs');
    return true;
  }
  if (el.dataset.removeTarget) {
    state.targets = state.targets.filter((t) => t.dex !== Number(el.dataset.removeTarget));
    save();
    render();
    return true;
  }
  if (el.dataset.obtained) {
    const t = state.targets.find((t) => t.dex === Number(el.dataset.obtained));
    if (t) {
      t.obtained = !t.obtained;
      save();
      render();
    }
    return true;
  }
  if (el.dataset.obtainMap) {
    nearbyMapActive = false;
    contextMapActive = false;
    catalogSelectedDex = null;
    detailMon = null;
    catalogLegacy = false;
    catalogMapDex = Number(el.dataset.obtainMap);
    catalogMapPlace = el.dataset.obtainPlace || null;
    tab = 'map';
    mapZoom = 1;
    render();
    window.scrollTo({ top: 0, behavior: 'instant' });
    return true;
  }
  if (el.dataset.obtainPin) {
    catalogMapPlace = el.dataset.obtainPin;
    render();
    return true;
  }
  if (el.dataset.obtainZoom) {
    mapZoom = Math.max(1, Math.min(4, mapZoom + Number(el.dataset.obtainZoom) * 0.5));
    render();
    return true;
  }
  if (el.dataset.catalogScope) {
    catalogScope = el.dataset.catalogScope;
    catalogLimit = 24;
    render();
    return true;
  }
  if (el.hasAttribute('data-more-catalog')) {
    catalogLimit += 24;
    document.getElementById('catalogResults').innerHTML = catalogCards();
    return true;
  }
  if (el.id === 'legacyCarnet') {
    catalogLegacy = !catalogLegacy;
    tab = 'now';
    render();
    return true;
  }
  return false;
}
