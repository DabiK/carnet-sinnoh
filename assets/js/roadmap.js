'use strict';
/* Checklist: the steps towards the chosen Pokémon, from the notebook's plan or the catalogue. */
let questMode = 'here';
function questTabs() {
  return html`
    <div class="quest-tabs" role="group" aria-label="Affichage des quêtes">
      <button data-quest-mode="here" aria-pressed="${questMode === 'here'}">
        ${icon('pin')} Ici
      </button>
      <button data-quest-mode="roadmap" aria-pressed="${questMode === 'roadmap'}">
        ${icon('route')} Checklist
      </button>
      <button data-quest-mode="pokemon" aria-pressed="${questMode === 'pokemon'}">
        ${icon('ball')} Mes Pokémon
      </button>
    </div>
  `;
}
function roadmapPlan() {
  const wanted = new Set(state.targets.map((t) => t.dex)),
    team = cfg().team,
    hasPlannedTeam = team.some((m) => !m.temporary && wanted.has(m.dex)),
    selected = new Set(team.filter((m) => wanted.has(m.dex) || (m.temporary && hasPlannedTeam)).map((m) => m.id));
  const phaseIds = new Set(
    cfg()
      .tasks.filter((t) => selected.has(t.capture || t.evolve))
      .map((t) => t.phase),
  );
  if (hasPlannedTeam) phaseIds.add('finish');
  const phases = cfg()
    .phases.filter((p) => phaseIds.has(p.id))
    .map((p) => ({
      ...p,
      tasks: cfg()
        .tasks.filter((t) => t.phase === p.id && (!(t.capture || t.evolve) || selected.has(t.capture || t.evolve)))
        .map((t) => ({
          ...t,
          key: 'legacy-' + t.id,
          desc:
            t.id === 'league'
              ? 'Vérifie tes Pokémon cibles : ' +
                state.targets.map((t) => BATTLE_DEX[t.dex]?.name).join(' · ') +
                '. Soigne l’équipe et prévois des objets.'
              : t.desc,
          legacy: true,
          dex: team.find((m) => m.id === (t.capture || t.evolve))?.dex,
        })),
    }));
  for (const target of state.targets.filter((t) => !team.some((m) => m.dex === t.dex))) {
    const mon = acquisitionByDex.get(target.dex),
      option = acquisitionOptions(target.dex)[0],
      tasks = [];
    if (option) {
      const e = option.encounters[0],
        place = e && ACQUISITION_CATALOG.places[e.placeId];
      tasks.push({
        key: `dex-${target.dex}-start-${option.start.dex}`,
        title: `Obtenir ${option.start.name}`,
        place: place?.name || 'Échange / méthode indirecte',
        desc: option.externalVersion
          ? 'À obtenir depuis Perle Scintillante par échange ou transfert externe.'
          : e
            ? [e.method, e.levelLabel ? e.levelLabel + ' niv.' : '', acquisitionRate(e)].filter(Boolean).join(' · ')
            : option.start.notes.join(' · '),
        dex: target.dex,
      });
      for (const { mon: next, edge } of option.steps)
        tasks.push({
          key: `dex-${target.dex}-step-${next.dex}`,
          title: `${edge?.kind === 'breeding' ? 'Obtenir' : 'Faire évoluer en'} ${next.name}`,
          place: edge?.kind === 'breeding' ? 'Garderie de Bonville' : 'Entraînement / évolution',
          desc: (edge?.condition || 'Condition à vérifier') + (edge?.needsReview ? ' · à confirmer pour BDSP' : ''),
          dex: target.dex,
        });
    } else
      tasks.push({
        key: `dex-${target.dex}-obtain`,
        title: `Obtenir ${mon.name}`,
        place: 'Méthode indirecte',
        desc: mon.notes.join(' · ') || 'Consulter la fiche pour confirmer la méthode.',
        dex: target.dex,
      });
    phases.push({
      id: 'target-' + target.dex,
      title: mon.name,
      where: 'À planifier selon les lieux de sa fiche',
      intro: 'Une possibilité d’obtention est proposée. La fiche et la carte donnent les alternatives.',
      tasks,
    });
  }
  return phases.filter((p) => p.tasks.length);
}
function roadmapDone(task) {
  const target = state.targets.find((t) => t.dex === task.dex);
  if (target?.obtained) return true;
  return task.legacy ? isDone(task) : !!state.roadmapDone[task.key];
}
function roadmapRow(t) {
  const done = roadmapDone(t),
    later = t.legacy && !done && !available(t),
    phase = t.legacy && cfg().phases.find((p) => p.id === t.phase),
    requirements = later
      ? [
          Math.max(t.gate || 0, phase?.gate || 0) > state.badges
            ? Math.max(t.gate || 0, phase?.gate || 0) + ' badge(s)'
            : null,
          t.requires && !state.flags[t.requires] ? flagLabel(t.requires) : null,
          !t.bypassPhase && phase?.flag && !state.flags[phase.flag] ? flagLabel(phase.flag) : null,
          t.evolve && teamState(t.evolve).stage === 0 ? 'Capturer le Pokémon d’abord' : null,
        ].filter(Boolean)
      : [],
    m = t.dex && BATTLE_DEX[t.dex];
  return html`
    <article class="road-task ${done ? 'done' : ''}">
      <label>
        <input type="checkbox" data-road-task="${t.key}" ${done ? 'checked' : ''} aria-label="${esc(t.title)}">
        <span class="road-task-copy"><b>${esc(t.title)}</b><span>${esc(t.place)}</span></span>
      </label>
      ${
        later
          ? html`
            <span class="road-later">À préparer · ${esc(requirements.join(' + ') || 'Suite de l’aventure')}
            </span>
          `
          : ''
      }
      <p>${esc(t.desc)}</p>
      ${
        m
          ? html`
            <div class="road-links">
              <button data-obtain-detail="${t.dex}">Fiche ${esc(m.name)}</button>
              <button data-obtain-map="${t.dex}">${icon('map')} Carte</button>
            </div>
          `
          : ''
      }
    </article>
  `;
}
function roadmapView() {
  const phases = roadmapPlan(),
    tasks = phases.flatMap((p) => p.tasks),
    done = tasks.filter(roadmapDone).length,
    next = tasks.find((t) => !roadmapDone(t) && (!t.legacy || available(t))),
    first = phases.find((p) => p.tasks.some((t) => !roadmapDone(t)))?.id;
  return html`
    ${questTabs()}
    <div class="view-heading">
      <div><span class="label">POUR TON ÉQUIPE CIBLE</span><h2>Ma checklist</h2></div>
      <button class="road-progress-button" data-open-progress>
        ${state.badges} / 8 badges
      </button>
    </div>
    ${
      !tasks.length
        ? '<section class="hero obtain-empty"><h3>Choisis tes Pokémon</h3><p>Leurs étapes d’obtention apparaîtront ici.</p><button data-open-catalog class="primary">Ouvrir le Pokédex</button></section>'
        : html`
          <div class="road-progress">
            <span>${done} / ${tasks.length} choses faites</span>
            <progress value="${done}" max="${tasks.length}" aria-label="Progression de la checklist"></progress>
          </div>
          ${
            next
              ? html`
                <section class="road-next">
                  <span class="label">PROCHAINE CHOSE À PENSER</span>
                  <h3>${esc(next.title)}</h3>
                  <p>${esc(next.place)}</p>
                </section>
              `
              : '<p class="road-complete">✓ Ta checklist est terminée !</p>'
          }
          ${phases
            .map(
              (p, i) => html`
                <details class="road-phase" data-road-phase="${p.id}" ${p.id === first ? 'open' : ''}>
                  <summary>
                    <span class="road-number">${String(i + 1).padStart(2, '0')}</span>
                    <span>
                      ${esc(p.title.replace(/^\d+\s*·\s*/, ''))}
                      <small>
                        ${p.tasks.filter(roadmapDone).length} / ${p.tasks.length} fait${p.tasks.filter(roadmapDone).length > 1 ? 's' : ''}
                      </small>
                    </span>
                  </summary>
                  <div class="road-phase-body">
                    <p class="road-where">${esc(p.where)}</p>
                    <p class="muted">${esc(p.intro)}</p>
                    ${
                      p.gate && state.badges < p.gate
                        ? html`
                          <p class="road-prerequisite">À préparer · ${p.gate} badges${p.flag ? ' + ' + esc(flagLabel(p.flag)) : ''}
                          </p>
                        `
                        : ''
                    }
                    ${p.tasks.map(roadmapRow).join('')}
                  </div>
                </details>
              `,
            )
            .join('')}
          <p class="muted">Coche ce que tu as réellement fait. Le suivi est manuel. L’ordre de ton parcours est conservé ; les nouveaux Pokémon reçoivent leurs étapes depuis le catalogue.</p>
        `
    }
  `;
}
function handleRoadmapChange(el) {
  if (!el.dataset.roadTask) return false;
  const task = roadmapPlan()
    .flatMap((p) => p.tasks)
    .find((t) => t.key === el.dataset.roadTask);
  if (!task) return true;
  const openPhases = [...document.querySelectorAll('[data-road-phase][open]')].map((el) => el.dataset.roadPhase),
    position = scrollY;
  const checked = el.checked,
    target = state.targets.find((t) => t.dex === task.dex);
  if (task.legacy) {
    if (task.unlock) state.flags[task.unlock] = checked;
    else if (task.capture) {
      const v = teamState(task.capture);
      state.team[task.capture] = { ...v, stage: checked ? Math.max(1, v.stage) : 0 };
      const m = cfg().team.find((m) => m.id === task.capture);
      if (target) target.obtained = checked && state.team[m.id].stage === m.forms.length - 1;
    } else if (task.evolve) {
      const m = cfg().team.find((m) => m.id === task.evolve);
      state.team[m.id] = { ...teamState(m.id), stage: checked ? m.forms.length - 1 : Math.max(1, m.forms.length - 2) };
      if (target) target.obtained = checked;
    } else state.done[task.id] = checked;
  } else {
    state.roadmapDone[task.key] = checked;
    const siblings = roadmapPlan()
      .flatMap((p) => p.tasks)
      .filter((t) => t.dex === task.dex && !t.legacy);
    if (target) target.obtained = siblings.every((t) => state.roadmapDone[t.key]);
  }
  save();
  render();
  for (const phase of document.querySelectorAll('[data-road-phase]'))
    phase.open = openPhases.includes(phase.dataset.roadPhase);
  window.scrollTo({ top: position, left: 0, behavior: 'instant' });
  return true;
}
