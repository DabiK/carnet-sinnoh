'use strict';
/* Beginner reading of a Pokémon's stats and IVs. Editorial hints, not competitive advice. */
const guideStats = [
  {
    key: 'hp',
    label: 'PV',
    short: 'PV',
    meaning:
      'Les points de vie : combien de dégâts il peut encaisser. Les PV restants diminuent pendant le combat ; le maximum décrit sa réserve de vie.',
  },
  {
    key: 'attack',
    label: 'Attaque',
    short: 'Attaque',
    meaning: 'La force des attaques physiques. Leur catégorie physique compte, pas seulement leur type.',
  },
  {
    key: 'defense',
    label: 'Défense',
    short: 'Défense',
    meaning: 'La résistance aux attaques physiques : plus elle est élevée, moins ces attaques font de dégâts.',
  },
  {
    key: 'special-attack',
    label: 'Atq. Spé.',
    short: 'Atq. Spé.',
    meaning: 'La force des attaques spéciales. Une attaque spéciale utilise cette stat plutôt que l’Attaque.',
  },
  {
    key: 'special-defense',
    label: 'Déf. Spé.',
    short: 'Déf. Spé.',
    meaning: 'La résistance aux attaques spéciales. Elle protège contre cette catégorie de dégâts.',
  },
  {
    key: 'speed',
    label: 'Vitesse',
    short: 'Vitesse',
    meaning: 'Aide à agir avant l’adversaire. La priorité de certaines attaques peut changer cet ordre.',
  },
];
const guideRoles = {
  physical: 'Tendance physique',
  special: 'Tendance spéciale',
  mixed: 'Tendance mixte',
  defensive: 'Tendance défensive',
  particular: 'Profil particulier',
};
function guideIVLabel(value) {
  return value === 31 ? 'Parfait' : value >= 25 ? 'Élevé' : value >= 16 ? 'Moyen' : 'Faible';
}
function guideIVs(mon) {
  return [mon.ivs[0], mon.ivs[1], mon.ivs[2], mon.ivs[4], mon.ivs[5], mon.ivs[3]];
}
function guideAssessment(mon) {
  const profile = BATTLE_GUIDE.profiles[mon.dex],
    ivs = guideIVs(mon);
  if (!profile || !profile.priorities.length)
    return { profile, verdict: 'À regarder au cas par cas', quality: 'neutral', ivs };
  const important = profile.priorities.map((k) => ivs[guideStats.findIndex((s) => s.key === k)]),
    low = Math.min(...important);
  return {
    profile,
    ivs,
    verdict:
      low >= 25
        ? 'Bons IV utiles'
        : low >= 16
          ? 'IV utiles corrects'
          : Math.max(...important) >= 25
            ? 'Potentiel contrasté'
            : 'IV utiles modestes',
    quality: low >= 25 ? 'good' : low >= 16 ? 'fair' : 'neutral',
  };
}
function battleAdvice(mon) {
  const a = guideAssessment(mon),
    p = a.profile;
  return html`
    <aside class="capture-advice" data-quality="${a.quality}" aria-label="Lecture du potentiel">
      <span class="advice-verdict">${a.verdict}</span>
      <span class="advice-role">${p ? guideRoles[p.role] : 'Profil à compléter'}</span>
      <div class="advice-priorities">
        ${
          (p?.priorities || [])
            .map((k) => {
              const i = guideStats.findIndex((s) => s.key === k);
              return html`
                <span>
                  <b>★ ${guideStats[i].short}</b>
                  <em>${a.ivs[i]} / 31 · ${guideIVLabel(a.ivs[i])}</em>
                </span>
              `;
            })
            .join('') || '<span>Le talent et les attaques comptent beaucoup.</span>'
        }
      </div>
      <button data-battle-guide>Comprendre ${icon('book')}</button>
    </aside>
  `;
}
function openBattleGuide(statKey) {
  const mon =
    (battleSnapshot.opponents || []).find((m) => m.battleId === battleSelectedId) || battleSnapshot.opponents?.[0];
  if (!mon) return;
  const a = guideAssessment(mon),
    p = a.profile,
    priorities = p?.priorities || [],
    dialog = document.getElementById('battleHelp');
  dialog.innerHTML = html`
    <div class="guide-dialog-top">
      <div>
        <span class="label">REPÈRES POUR L’AVENTURE</span>
        <h2>Comprendre ${esc(BATTLE_DEX[mon.dex]?.name || 'ce Pokémon')}</h2>
      </div>
      <button data-close-battle-guide aria-label="Fermer">${icon('close')}</button>
    </div>
    <p>
      <b>${a.verdict}.</b> ${priorities.length ? 'Regarde surtout ' + priorities.map((k) => guideStats.find((s) => s.key === k).label).join(' et ') + '.' : 'Son fonctionnement demande de regarder aussi ses attaques et son talent.'} Ce conseil évalue les IV utiles ; tu peux réussir l’aventure sans IV parfaits.
    </p>
    ${
      p
        ? html`
          <p class="muted">
            ${guideRoles[p.role]}. Repère calculé depuis les stats de base de ${p.referenceDex.map((d) => esc(BATTLE_DEX[d]?.name || 'Pokémon')).join(', ')}
            ${p.branched ? ' (moyenne des branches ; le choix de l’évolution peut changer les priorités)' : ''}. Les attaques choisies, le talent et la nature peuvent changer son rôle.
          </p>
        `
        : ''
    }
    <section class="guide-basics">
      <h3>Valeur et IV : deux choses différentes</h3>
      <p>
        <b>Valeur</b> : sa stat à son niveau actuel, avant les variations temporaires du combat. Elle dépend aussi de l’espèce, de la nature, des IV et de l’entraînement (EV). Compare des Pokémon au même niveau.
      </p>
      <p>
        <b>IV / 31</b> : son potentiel naturel. Plus il est élevé, plus cette stat pourra être élevée à conditions égales. La barre montre ce potentiel, pas sa force actuelle.
      </p>
      <p>
        <b>Nos repères</b> : 0–15 faible · 16–24 moyen · 25–30 élevé · 31 parfait. Ce sont des étiquettes d’aide, pas des seuils officiels.
      </p>
      <p>Le total sur 186 ne suffit pas : un IV bas dans une stat peu utile peut être acceptable. Les PV restants influencent la capture, pas le potentiel.</p>
    </section>
    <section class="guide-basics">
      <h3>Lire les attaques</h3>
      <p>
        <b>Phys.</b> : utilise l’Attaque et la Défense adverse. <b>Spé.</b> : utilise l’Atq. Spé. et la Déf. Spé. adverse. <b>Statut</b> : produit un effet plutôt que des dégâts directs. Certaines capacités ont des règles particulières.
      </p>
      <p>
        <b>P</b> = puissance de l’attaque ; <b>Pr</b> = précision. « — » signifie qu’aucune valeur fixe n’est renseignée.
      </p>
    </section>
    <div class="guide-stat-list">
      ${guideStats
        .map(
          (s, i) => html`
            <section id="guide-${s.key}" class="${priorities.includes(s.key) ? 'guide-priority' : ''}">
              <h3>
                ${priorities.includes(s.key) ? '★ ' : ''}
                ${s.label}
                <span>IV ${a.ivs[i]} / 31 · ${guideIVLabel(a.ivs[i])}</span>
              </h3>
              <p>${s.meaning}</p>
              ${priorities.includes(s.key) ? '<small>À privilégier pour cette tendance.</small>' : ''}
            </section>
          `,
        )
        .join('')}
    </div>
    <p class="muted">Repères indicatifs, sans calcul de dégâts ni garantie de capture. Formes par défaut des espèces. <a href="https://www.pokepedia.fr/IV">Comprendre les IV ↗</a> · <a href="https://pokeapi.co/docs/v2#pokemon">Stats de base : PokeAPI ↗</a>
    </p>
  `;
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('[data-close-battle-guide]').onclick = () => dialog.close();
  if (statKey) dialog.querySelector('#guide-' + statKey)?.scrollIntoView({ block: 'start' });
  else dialog.scrollTop = 0;
}
