/* Presentation helpers. Species artwork is a replaceable offline catalogue. */
function icon(name) {
  const paths = {
    ball: '<circle cx="12" cy="12" r="9"/><path d="M3 12h6m6 0h6"/><circle cx="12" cy="12" r="3"/>',
    route:
      '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M8 5h7a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8h7"/>',
    map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"/>',
    book: '<path d="M5 3h14v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM7 3v18M11 8h4M11 12h4"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
    star: '<path d="m12 3 3 6 6 1-4 5 1 6-6-3-6 3 1-6-4-5 6-1z"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  };
  return html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      ${paths[name] || paths.ball}
    </svg>
  `;
}
function tone(m) {
  const type = (m?.types || '').split(/[\/·]/)[0].trim().toLowerCase();
  return (
    {
      plante: 'grass',
      eau: 'water',
      feu: 'fire',
      ténèbres: 'dark',
      combat: 'fighting',
      dragon: 'dragon',
      électrik: 'electric',
      normal: 'normal',
      vol: 'normal',
      acier: 'steel',
      psy: 'psychic',
    }[type] || 'neutral'
  );
}
/** Accent-, case- and punctuation-insensitive form of a name, used to match names across data sets. */
const nameKey = (name) =>
  String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
function speciesArt(m, mode = 'goal') {
  const catalogue = typeof SPRITE_CATALOG === 'undefined' ? [] : SPRITE_CATALOG;
  const stage = teamState(m.id).stage;
  const name =
    mode === 'goal' ? m.name.split('·')[0].trim() : mode === 'capture' ? m.forms[1] : m.forms[stage > 0 ? stage : 1];
  const entry = catalogue.find((p) => nameKey(p.name) === nameKey(name));
  const custom = m.sprite?.startsWith('data:') || (m.sprite && m.sprite !== `sprites/${m.dex}.png`);
  return {
    name: name || m.name,
    dex: entry?.dex || m.dex,
    image: custom ? m.sprite : entry?.file || m.sprite,
    types: mode === 'goal' ? m.types : entry?.types || m.types,
  };
}
function pokemonArt(m, mode = 'goal', className = '') {
  const art = speciesArt(m, mode);
  return art.image
    ? html`
      <img class="pixel-mon ${className}" src="${esc(art.image)}" alt="${esc(art.name)}" draggable="false">
    `
    : `<span class="monogram ${className}">${esc(art.name.slice(0, 2))}</span>`;
}
function typePills(m) {
  return m.types
    .split('/')
    .map((t) => `<span class="type-pill">${esc(t.trim())}</span>`)
    .join('');
}
function teamRibbon() {
  return html`
    <div class="party-strip" aria-label="Mon équipe cible">
      ${cfg()
        .team.filter((m) => !m.temporary)
        .map(
          (m) =>
            html`
              <button data-detail="${m.id}" data-tone="${tone(m)}" aria-label="Voir ${esc(m.name)}">
                ${pokemonArt(m, 'current')}
                <span>${esc(speciesArt(m, 'current').name)}</span>
                <i class="party-dot ${teamState(m.id).stage ? 'caught' : ''}"></i>
              </button>
            `,
        )
        .join('')}
    </div>
  `;
}
function speciesDetail(m) {
  const v = teamState(m.id),
    art = speciesArt(m, 'current');
  m = { ...m, types: art.types };
  const forms = m.forms.slice(1).filter((name) => name !== 'Retiré de l’équipe');
  return html`
    <dialog id="monDetail" class="species-sheet" data-tone="${tone(m)}">
      <div class="sheet-top">
        <span class="dex-id">N° ${String(art.dex).padStart(3, '0')}</span>
        <button data-close-detail aria-label="Fermer la fiche">${icon('close')}</button>
      </div>
      <div class="specimen">
        <div class="pokeball-watermark"></div>
        ${pokemonArt(m, 'current')}
      </div>
      <div class="species-title">
        <h2>${esc(art.name)}</h2>
        <div class="types">${typePills(m)}</div>
        <p>
          ${v.stage ? 'Dans ton équipe' : 'À rencontrer'}
          ${v.level ? ' · Niveau ' + v.level : ''} ${m.temporary ? '· Pokémon relais' : ''}
        </p>
      </div>
      <div class="sheet-content">
        <div class="sheet-section-title">
          <h3>Ma progression</h3>
          <span class="count">${esc(m.name)}</span>
        </div>
        <div class="progress-fields">
          <label>Forme actuelle
            <select data-mon="${m.id}">
              ${m.forms.map((name, i) => `<option value="${i}" ${v.stage === i ? 'selected' : ''}>${esc(name)}</option>`).join('')}
            </select>
          </label>
          <label>Niveau
            <input data-level="${m.id}" type="number" min="1" max="100" value="${v.level || ''}" placeholder="—" aria-label="Niveau de ${esc(art.name)}">
          </label>
        </div>
        <h3>Sa famille</h3>
        <div class="evolution-strip">
          ${forms
            .map((name, index) => {
              const temp = { ...m, forms: ['Absent', name] },
                entry = speciesArt(temp, 'capture');
              return html`
                <div class="evolution-node ${name === art.name ? 'selected' : ''}">
                  ${entry.image ? `<img src="${esc(entry.image)}" alt="${esc(name)}" class="pixel-mon">` : icon('ball')}
                  <span>${esc(name)}</span>
                </div>
                ${index < forms.length - 1 ? '<b class="evolution-arrow">›</b>' : ''}
              `;
            })
            .join('')}
        </div>
        <p class="muted">${esc(m.evolution)}</p>
        <div class="location-note">
          ${icon('pin')}
          <div><h3>Où le trouver</h3><p>${esc(m.place)}</p></div>
        </div>
        <p class="muted">${esc(m.tip)}</p>
        <button class="primary wide" data-show-mon="${m.id}">
          ${icon('map')} Voir sur la carte
        </button>
        <div class="actions">
          <button data-edit="team" data-id="${m.id}">Modifier la fiche</button>
          ${m.source ? `<a class="source-link" href="${esc(m.source)}">Source ↗</a>` : ''}
        </div>
      </div>
    </dialog>
  `;
}
