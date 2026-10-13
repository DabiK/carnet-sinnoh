'use strict';
/* Map tab: every documented encounter of the current zone, whatever the chosen goals. */
let nearbyMapActive = true;
const nearbyIndex = new Map();
for (const mon of ACQUISITION_CATALOG.species)
  for (const e of mon.encounters) {
    if (!e.versions.includes('brilliant-diamond') || !['wild', 'fishing', 'surfing', 'static'].includes(e.kind))
      continue;
    if (!nearbyIndex.has(e.placeId)) nearbyIndex.set(e.placeId, []);
    nearbyIndex.get(e.placeId).push({ mon, e });
  }
function nearbyPlaces(ctx) {
  if (!ctx.zone?.regionKey) return [];
  let places = Object.values(ACQUISITION_CATALOG.places).filter(
    (p) => nameKey(p.name) === ctx.zone.regionKey && nearbyIndex.has(p.id),
  );
  // These two entrances lead to different encounters; a regional pin isn't enough.
  if (ctx.live && ctx.zone.code === 'D21R0101') places = places.filter((p) => p.subarea === 'entrée principale');
  if (ctx.live && ctx.zone.code === 'D21R0102') places = places.filter((p) => p.subarea === 'entrée secrète');
  return places;
}
function nearbyStatus(e, p, ctx) {
  const missing = e.requirements.filter((r) => !hereRequirement(r, ctx)).map((r) => r.label);
  if (e.method === 'Essaim') missing.push('Essaim du jour à confirmer');
  else if (e.method.includes('Arbre à Miel')) missing.push('Arbre préparé et apparition à vérifier');
  else if (e.method === 'Poké Radar' && !missing.includes('Poké Radar')) missing.push('Chaîne Poké Radar à confirmer');
  else if (!hereEncounterAccessible(e, ctx) && !missing.length) missing.push('Condition de rencontre à vérifier');
  if (p.subarea && !(ctx.live && /^D21R010[12]$/.test(ctx.zone.code || '')))
    missing.push('Accès à ' + p.subarea + ' à vérifier');
  return { available: !missing.length, missing: [...new Set(missing)] };
}
function nearbyGroups(ctx = hereContext()) {
  const groups = new Map();
  for (const p of nearbyPlaces(ctx))
    for (const { mon, e } of nearbyIndex.get(p.id) || []) {
      if (!groups.has(mon.dex)) groups.set(mon.dex, { mon, rows: [] });
      const status = nearbyStatus(e, p, ctx);
      groups.get(mon.dex).rows.push({ p, e, ...status });
    }
  return [...groups.values()]
    .map((g) => ({ ...g, available: g.rows.some((r) => r.available) }))
    .sort((a, b) => Number(b.available) - Number(a.available) || a.mon.dex - b.mon.dex);
}
function nearbyRate(e) {
  const rates = e.ratesByVersion?.['brilliant-diamond'] || e.rates || {};
  if (!Object.keys(rates).length) return '<span class="nearby-rate-unknown">Taux non documenté</span>';
  return Object.entries(rates)
    .map(([period, value]) => {
      const numeric = /^\d+(\.\d+)?$/.test(value),
        label = { all: 'Tout horaire', matin: 'Matin', jour: 'Jour', nuit: 'Nuit' }[period] || period;
      return html`
        <span class="nearby-rate">
          <small>${esc(label)}</small>
          <b>${esc(value)}${numeric ? ' %' : ''}</b>
        </span>
      `;
    })
    .join('');
}
function nearbyMonCard(group) {
  const { mon, rows } = group,
    wanted = state.targets.some((t) => acquisitionChain(t.dex).some((m) => m.dex === mon.dex)),
    unique = [];
  for (const row of rows) {
    const signature = JSON.stringify([
      row.p.id,
      row.e.method,
      row.e.levelLabel,
      row.e.ratesByVersion?.['brilliant-diamond'] || row.e.rates,
      row.missing,
    ]);
    if (!unique.some((r) => r.signature === signature)) unique.push({ ...row, signature });
  }
  return html`
    <article class="nearby-mon" data-nearby-mon="${mon.dex}">
      <div class="nearby-mon-top">
        <img class="pixel-mon" src="sprites/${mon.dex}.png" alt="">
        <div>
          <span class="label">N° ${String(mon.dex).padStart(3, '0')}
            ${wanted ? ' · TON OBJECTIF' : ''}
          </span>
          <h3>${esc(mon.name)}</h3>
          <span class="nearby-types">${esc(mon.types.join(' · '))}</span>
        </div>
        <button data-obtain-detail="${mon.dex}">Fiche</button>
      </div>
      ${unique
        .map(
          ({ p, e, available, missing }) => html`
            <div class="nearby-method ${available ? '' : 'conditional'}">
              <div class="nearby-method-heading">
                <b>${esc(p.subarea || e.method)}</b>
                <span>Niv. ${esc(e.levelLabel || '?')}</span>
              </div>
              ${p.subarea ? `<p>${esc(e.method)}</p>` : ''}
              <div class="nearby-rates">${nearbyRate(e)}</div>
              ${missing.length ? `<p class="nearby-condition">${esc(missing.join(' · '))}</p>` : ''}
              <a href="${esc(e.source || p.source)}">Emplacement et détails ↗</a>
            </div>
          `,
        )
        .join('')}
    </article>
  `;
}
function nearbyMapView() {
  const ctx = hereContext(),
    places = nearbyPlaces(ctx),
    groups = nearbyGroups(ctx),
    available = groups.filter((g) => g.available),
    conditional = groups.filter((g) => !g.available),
    anchor = places.flatMap((p) => p.map?.anchors || [])[0];
  const liveCode = ctx.live && ctx.zone?.code,
    subarea = liveCode === 'D21R0101' ? 'entrée principale' : liveCode === 'D21R0102' ? 'entrée secrète' : null;
  return html`
    <div class="nearby-heading">
      <div>
        <span class="label">
          ${ctx.live ? '● TA ZONE EN DIRECT' : 'ZONE DU CARNET · MANUELLE'}
        </span>
        <h2>${esc(ctx.zone?.name || 'Où es-tu ?')}</h2>
        ${subarea || ctx.zone?.detail ? `<small>${esc(subarea || ctx.zone.detail)}</small>` : ''}
      </div>
      ${bridgeToggle()}
    </div>
    ${!ctx.live ? '<p class="nearby-notice">Connecte le bridge pour suivre ta position, ou renseigne ta zone dans le carnet.</p><button class="nearby-manual" data-open-progress>Renseigner ma zone</button>' : ''}
    ${
      anchor
        ? html`
          <div class="nearby-map">
            <div class="map-canvas acquisition-map nearby-map-canvas" data-nearby-x="${anchor.x}" data-nearby-y="${anchor.y}">
              <img class="map-image" src="sinnoh-2d.png" alt="Repère régional de ${esc(ctx.zone.name)}">
              <div class="map-pins">
                <span class="nearby-position" data-nearby-pin data-x="${anchor.x}" data-y="${anchor.y}">
                  ${icon('pin')}
                </span>
              </div>
            </div>
            <span class="nearby-map-label">${esc(ctx.zone.name)} · repère approximatif</span>
          </div>
        `
        : ''
    }
    <div class="nearby-count">
      <h3>À rencontrer ici</h3>
      <span>${available.length} espèce${available.length > 1 ? 's' : ''}</span>
    </div>
    <p class="nearby-legend">Pour Diamant Étincelant. Les pourcentages sont les taux de rencontre, pas les chances de réussite d’une Poké Ball. Les horaires sont indiqués quand ils changent le taux.</p>
    ${ctx.zone?.detail ? '<p class="nearby-legend">Les rencontres concernent les environs de ce bâtiment, à l’extérieur.</p>' : ''}
    <div class="nearby-list">${available.map(nearbyMonCard).join('')}</div>
    ${
      !available.length
        ? html`
          <p class="nearby-empty">
            ${ctx.zone?.regionKey === 'grandssouterrains' ? 'Le biome précis n’est pas encore identifié par le bridge. Les rencontres d’autres grottes ne sont pas mélangées ici.' : ctx.zone ? 'Aucune rencontre accessible confirmée dans cette zone avec les données disponibles.' : 'Ta position est nécessaire pour afficher les rencontres.'}
          </p>
        `
        : ''
    }
    ${
      conditional.length
        ? html`
          <details class="nearby-conditional" data-here-details="nearby-conditions">
            <summary>Autres rencontres ici · conditions à vérifier (${conditional.length})</summary>
            <div class="nearby-list">${conditional.map(nearbyMonCard).join('')}</div>
          </details>
        `
        : ''
    }
    <p class="nearby-legend">Données : Poképédia et ses contributeurs. Les taux inconnus restent indiqués comme tels.</p>
    <button data-here-return>Retour à Ici</button>
  `;
}
function renderNearbyMap() {
  const canvas = document.querySelector('.nearby-map-canvas');
  if (!canvas) return;
  canvas.style.transform = `translate(-${canvas.dataset.nearbyX}%,-${canvas.dataset.nearbyY}%)`;
  const pin = document.querySelector('[data-nearby-pin]');
  pin.style.left = pin.dataset.x + '%';
  pin.style.top = pin.dataset.y + '%';
}
