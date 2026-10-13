import test from 'node:test';
import { withCarnet } from '../lib/webview.mjs';

test('Checklist: phases, checkboxes, steps generated from the catalogue', async (t) => {
  const checks = await withCarnet(async ({ evaluate, check, reload }) => {
    await evaluate(
      "state=defaults();state.targets=[389,398,130,229,448,445].map(dex=>({dex,obtained:false}));state.team.torterra={stage:1,level:8};catalogLegacy=false;questMode='roadmap';tab='now';render()",
    );
    await check(
      "roadmapPlan().length===6 && roadmapPlan().flatMap(p=>p.tasks).length===19 && document.querySelector('[data-road-task=legacy-starter]').checked",
    );
    await check(
      "document.querySelector('.road-next').textContent.includes('Capturer Étourmi') && document.querySelectorAll('.road-phase').length===6",
    );
    await evaluate(
      "{const box=document.querySelector('[data-road-task=legacy-starly]');box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}))}",
    );
    await check(
      "state.team.staraptor.stage===1 && !state.targets.find(t=>t.dex===398).obtained && document.querySelector('[data-road-task=legacy-starly]').checked",
    );
    await evaluate(
      "{const box=document.querySelector('[data-road-task=legacy-evo-star]');box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}))}",
    );
    await check('state.targets.find(t=>t.dex===398).obtained && state.team.staraptor.stage===3');
    await evaluate(
      "{const box=document.querySelector('[data-road-task=legacy-rod]');box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}))}",
    );
    await check(
      "state.flags.rod && available(cfg().tasks.find(t=>t.id==='karp')) && JSON.parse(localStorage.getItem(KEY)).flags.rod",
    );
    await evaluate(
      "document.querySelector('[data-road-phase=fish]').open=true;{const box=document.querySelector('[data-road-task=legacy-rod]');box.checked=false;box.dispatchEvent(new Event('change',{bubbles:true}))}",
    );
    await check("document.querySelector('[data-road-phase=fish]').open");
    await evaluate("state.flags.rod=true;save();document.querySelector('[data-quest-mode=pokemon]').click()");
    await check("document.querySelectorAll('.obtain-goal').length===6 && !document.querySelector('.road-phase')");
    await evaluate(
      "document.querySelector('[data-quest-mode=roadmap]').click();document.querySelector('[data-open-progress]').click()",
    );
    await check("document.getElementById('progress').open");
    await evaluate(
      "document.getElementById('progress').close();document.querySelector('.road-links [data-obtain-detail]').click()",
    );
    await check("document.getElementById('obtainDetail').open");
    await evaluate(
      "document.querySelector('[data-close-obtain]').click();document.querySelector('.road-links [data-obtain-map]').click()",
    );
    await check("tab==='map' && document.querySelector('.acquisition-map')!==null");
    await reload();
    await check("questMode==='here' && state.team.staraptor.stage===3 && state.flags.rod && state.targets.length===6");
    await evaluate("questMode='roadmap';state.targets=[{dex:65,obtained:false}];tab='now';render()");
    await check(
      "roadmapPlan().some(p=>p.id==='target-65') && document.querySelector('[data-road-task=dex-65-start-63]')!==null && document.querySelector('[data-road-task=dex-65-step-64]')!==null && document.querySelector('[data-road-task=dex-65-step-65]')!==null",
    );
    await evaluate(
      "for(const box of [...document.querySelectorAll('[data-road-task^=dex-65-]')])handleRoadmapChange({dataset:{roadTask:box.dataset.roadTask},checked:true})",
    );
    await check(
      "state.targets[0].obtained && state.roadmapDone['dex-65-step-65'] && JSON.parse(localStorage.getItem(KEY)).roadmapDone['dex-65-step-65']",
    );
    await check("(()=>{try{validate({...state,roadmapDone:{bad:'yes'}});return false}catch{return true}})()");
    await check("roadmapPlan().length===1 && roadmapPlan()[0].id==='target-65'");
    await check('document.body.scrollWidth<=innerWidth');
  });
  t.diagnostic(`${checks} checks`);
});
