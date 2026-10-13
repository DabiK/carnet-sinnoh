'use strict';
/* Battle tab: the opponent's sheet built from the snapshots pushed by the native memory bridge. */

/** A snapshot older than this no longer describes what is on screen. */
const SNAPSHOT_STALE_MS = 10000;
let battleSnapshot = { status: 'off', message: 'Active le bridge pour suivre le combat.' },
  battleSelectedId = null;
const battleTypes = [
  'Normal',
  'Combat',
  'Vol',
  'Poison',
  'Sol',
  'Roche',
  'Insecte',
  'Spectre',
  'Acier',
  'Feu',
  'Eau',
  'Plante',
  'Électrik',
  'Psy',
  'Glace',
  'Dragon',
  'Ténèbres',
  'Fée',
];
window.receiveBattleSnapshot = (value) => {
  battleSnapshot = value;
  window.receiveWorldSnapshot?.(value.world);
  if (value.status !== 'battle') document.getElementById('battleHelp')?.close();
  if (tab === 'battle') render();
};
function battleMon(mon) {
  const species = BATTLE_DEX[mon.dex] || { name: 'Pokémon', types: [] },
    types = [...new Set((mon.typeIds || []).map((i) => battleTypes[i]).filter(Boolean))],
    gender = ['♂', '♀', ''][mon.gender] || '';
  const weaknesses = battleTypes
    .map((type) => ({ type, factor: types.reduce((v, t) => v * (BATTLE_TYPE_CHART[type + '>' + t] ?? 1), 1) }))
    .filter((x) => x.factor > 1);
  const advice = guideAssessment(mon),
    priorityKeys = advice.profile?.priorities || [];
  const values = [mon.maxHp, mon.stats[0], mon.stats[1], mon.stats[3], mon.stats[4], mon.stats[2]],
    ivs = [mon.ivs[0], mon.ivs[1], mon.ivs[2], mon.ivs[4], mon.ivs[5], mon.ivs[3]],
    total = mon.ivs.reduce((a, b) => a + b, 0);
  return html`
    <section class="battle-mon capture-board" data-tone="${tone({ types: types.join('/') })}">
      <div class="capture-hero">
        <img class="pixel-mon" src="sprites/${mon.dex}.png" alt="${esc(species.name)}">
        <div class="capture-identity">
          <span class="label">EN FACE · N° ${String(mon.dex).padStart(3, '0')}</span>
          <h2>${esc(species.name)} <small>${gender}</small></h2>
          <div class="capture-meta">
            <b>Niv. ${mon.level}</b>
            ${types.map((t) => `<span class="type-pill">${esc(t)}</span>`).join('')}
          </div>
          <div class="battle-health">
            <span>PV <b>${mon.hp} / ${mon.maxHp}</b></span>
            <progress class="${mon.hp / mon.maxHp < 0.25 ? 'low' : mon.hp / mon.maxHp < 0.5 ? 'medium' : ''}" max="${mon.maxHp}" value="${mon.hp}" aria-label="PV de ${esc(species.name)}"></progress>
          </div>
        </div>
      </div>
      <div class="capture-body">
        <div class="capture-reading">
          <div class="capture-numbers">
            <div class="capture-stat-heading">
              <span>Statistiques</span>
              <span>Valeur</span>
              <span>IV / 31</span>
            </div>
            <div class="capture-stats">
              ${['PV', 'Attaque', 'Défense', 'Atq. Spé.', 'Déf. Spé.', 'Vitesse']
                .map(
                  (label, i) => html`
                    <div class="capture-stat">
                      <button class="stat-explain" data-stat-guide="${guideStats[i].key}" aria-label="Comprendre ${label}">
                        ${priorityKeys.includes(guideStats[i].key) ? '★ ' : ''}
                        ${label}
                      </button>
                      <b>${values[i]}</b>
                      <div class="capture-iv ${ivs[i] === 31 ? 'perfect' : ''}">
                        <progress value="${ivs[i]}" max="31" aria-label="IV ${label}"></progress>
                        <b>${ivs[i]}</b>
                      </div>
                    </div>
                  `,
                )
                .join('')}
            </div>
            <div class="capture-potential">
              <span>Potentiel IV <b>${total} / 186</b></span>
              <span>
                ${mon.ivs.filter((v) => v === 31).length} parfait${mon.ivs.filter((v) => v === 31).length > 1 ? 's' : ''}
              </span>
            </div>
          </div>
          ${battleAdvice(mon)}
        </div>
        <div class="capture-moves">
          ${mon.moves
            .filter(Boolean)
            .map((id) => {
              const move = BATTLE_MOVES[id];
              return html`
                <article data-tone="${tone({ types: move?.type || '' })}">
                  <b>${esc(move?.name || 'Attaque ' + id)}</b>
                  <span>
                    ${esc(move?.type || '—')} · ${{ physical: 'Phys.', special: 'Spé.', status: 'Statut' }[BATTLE_GUIDE.moveCategories[id]] || '—'} · P ${move?.power || '—'} · Pr ${move?.accuracy ? move.accuracy + ' %' : '—'}
                  </span>
                </article>
              `;
            })
            .join('')}
        </div>
        <div class="capture-weak">
          <span>Faiblesses</span>
          <div>
            ${weaknesses.map((w) => `<span class="type-pill">${esc(w.type)} ×${w.factor}</span>`).join('') || 'Aucune'}
          </div>
        </div>
        ${
          mon.ranks?.some(Boolean)
            ? html`
              <p class="capture-ranks">Variations · ${mon.ranks
                .map((v, i) =>
                  v ? ['Att.', 'Déf.', 'AS', 'DS', 'Vit.', 'Préc.', 'Esquive'][i] + ' ' + (v > 0 ? '+' : '') + v : null,
                )
                .filter(Boolean)
                .join(' · ')}
              </p>
            `
            : ''
        }
      </div>
    </section>
  `;
}
/** Link handled natively by MainActivity: it starts or stops the memory reader. */
function bridgeToggle() {
  const enabled = battleSnapshot.status !== 'off';
  return html`
    <a class="bridge-toggle" href="https://sinnoh.local/bridge/${enabled ? 'disconnect' : 'connect'}">
      ${enabled ? 'Déconnecter' : 'Connecter'}
    </a>
  `;
}
function battleView() {
  const s = battleSnapshot,
    opponents = s.opponents || [],
    selected = opponents.find((m) => m.battleId === battleSelectedId) || opponents[0];
  return html`
    <div class="combat-toolbar">
      <span role="status">
        ${s.status === 'battle' ? '● Combat en direct' : esc(s.message || 'Connexion en cours…')}
      </span>
      ${
        opponents.length > 1
          ? html`
            <div class="combat-selector">
              ${opponents
                .map(
                  (m) => html`
                    <button data-battle-select="${m.battleId}" aria-pressed="${selected === m}">
                      ${esc(BATTLE_DEX[m.dex]?.name || 'Pokémon')}
                    </button>
                  `,
                )
                .join('')}
            </div>
          `
          : ''
      }
      ${bridgeToggle()}
    </div>
    ${
      s.status === 'battle' && selected
        ? battleMon(selected)
        : html`
          <section class="hero bridge-empty">
            ${icon('ball')}
            <h2>
              ${s.status === 'idle' ? 'Prêt pour la prochaine rencontre' : s.status === 'error' ? 'Eden est-il ouvert ?' : 'Qui vas-tu capturer ?'}
            </h2>
            <p>PV, statistiques, IV et attaques apparaissent ici pendant le combat.</p>
          </section>
        `
    }
    ${
      s.status === 'battle'
        ? html`
          <div class="combat-party">
            ${(s.player || [])
              .map(
                (m) => html`
                  <div>
                    <img class="pixel-mon" src="sprites/${m.dex}.png" alt="">
                    <b>${esc(m.nickname || BATTLE_DEX[m.dex]?.name || 'Pokémon')}</b>
                    <span>Niv. ${m.level}</span>
                    <span class="party-hp">${m.hp} / ${m.maxHp} PV</span>
                  </div>
                `,
              )
              .join('')}
          </div>
        `
        : ''
    }
  `;
}
setInterval(() => {
  if (battleSnapshot.status === 'battle' && Date.now() - battleSnapshot.timestamp > SNAPSHOT_STALE_MS) {
    battleSnapshot = { status: 'error', message: 'Lecture interrompue · reconnexion en cours' };
    if (tab === 'battle') render();
  }
}, 2000);
