import { h, clear, fmtDate } from '../dom.js';
import { api } from '../api.js';
import { radarChart, lineChart } from '../components/charts.js';
import { radarAxes, radarValues } from '../evalCriteria.js';
import { CATEGORY_OPTS, GENDER_OPTS, GENDER_LABEL } from '../athleteCategories.js';

export async function renderAthletes(main, ctx) {
  const athletes = await api.get('/api/athletes');
  clear(main);

  const canEdit = ctx.user.role === 'head_coach';

  main.appendChild(h('div', { class: 'page-header' }, [
    h('div', {}, [h('h1', {}, ['Atletas']), h('p', {}, ['Elenco de atletas sob sua orientação.'])]),
    canEdit ? h('button', { class: 'btn btn-primary', onClick: () => openAthleteModal(async () => renderAthletes(main, ctx)) }, ['+ Novo atleta']) : null,
  ]));

  if (!athletes.length) {
    main.appendChild(h('div', { class: 'card' }, [h('div', { class: 'empty-state' }, ['Nenhum atleta cadastrado ainda.'])]));
    return;
  }

  const grid = h('div', { class: 'grid grid-3' });
  athletes.forEach((a) => {
    const card = h('a', { class: 'card', href: `#/athletes/${a.id}`, style: 'display:block;text-decoration:none;cursor:pointer' }, [
      h('h3', {}, [a.name]),
      h('p', {}, [`${a.category || 'Sem categoria'}${a.gender ? ' · ' + GENDER_LABEL[a.gender] : ''} · ${a.dominant_hand || 'Sem info'}`]),
      a.ranking_position ? h('p', {}, [`Ranking: #${a.ranking_position}`]) : null,
      a.club ? h('p', {}, [a.club]) : null,
    ]);
    grid.appendChild(card);
  });
  main.appendChild(grid);
}

function openAthleteModal(onDone) {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const name = h('input', { required: true, placeholder: 'Nome completo' });
  const birth = h('input', { type: 'date' });
  const category = h('select', {}, [h('option', { value: '' }, ['Categoria']), ...CATEGORY_OPTS.map((c) => h('option', { value: c }, [c]))]);
  const gender = h('select', {}, [h('option', { value: '' }, ['Sexo']), ...GENDER_OPTS.map(([v, l]) => h('option', { value: v }, [l]))]);
  const hand = h('select', {}, [h('option', { value: '' }, ['Mão dominante']), h('option', { value: 'Destro(a)' }, ['Destro(a)']), h('option', { value: 'Canhoto(a)' }, ['Canhoto(a)'])]);
  const ranking = h('input', { type: 'number', placeholder: 'Posição no ranking' });
  const club = h('input', { placeholder: 'Clube' });
  const notes = h('textarea', { placeholder: 'Observações' });
  const errorBox = h('div', { class: 'error-msg' });

  const form = h('form', {
    onSubmit: async (e) => {
      e.preventDefault();
      try {
        await api.post('/api/athletes', {
          name: name.value, birthDate: birth.value || null, category: category.value || null,
          gender: gender.value || null, dominantHand: hand.value || null, rankingPosition: ranking.value ? Number(ranking.value) : null,
          club: club.value || null, notes: notes.value || null,
        });
        backdrop.remove();
        onDone();
      } catch (err) { errorBox.textContent = err.message; }
    },
  }, [
    h('h2', {}, ['Novo atleta']),
    h('div', { class: 'form-grid', style: 'margin-top:14px' }, [
      h('div', { class: 'form-field span-2' }, [h('label', {}, ['Nome']), name]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Nascimento']), birth]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Categoria']), category]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Sexo']), gender]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Mão dominante']), hand]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Ranking']), ranking]),
      h('div', { class: 'form-field span-2' }, [h('label', {}, ['Clube']), club]),
      h('div', { class: 'form-field span-2' }, [h('label', {}, ['Observações']), notes]),
    ]),
    errorBox,
    h('div', { class: 'form-actions' }, [
      h('button', { class: 'btn', type: 'button', onClick: () => backdrop.remove() }, ['Cancelar']),
      h('button', { class: 'btn btn-primary', type: 'submit' }, ['Salvar']),
    ]),
  ]);

  backdrop.appendChild(h('div', { class: 'modal-box' }, [form]));
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  document.body.appendChild(backdrop);
}

export async function renderAthleteDetail(main, ctx) {
  const id = Number(ctx.params[0]);
  const [athlete, evaluations, matches, videos] = await Promise.all([
    api.get(`/api/athletes/${id}`),
    ctx.user.role !== 'treinador' ? api.get(`/api/evaluations?athleteId=${id}`) : Promise.resolve([]),
    ctx.user.role !== 'treinador' ? api.get(`/api/matches?athleteId=${id}`) : Promise.resolve([]),
    ctx.user.role === 'head_coach' ? api.get(`/api/video-analyses?athleteId=${id}`) : Promise.resolve([]),
  ]);
  clear(main);

  main.appendChild(h('a', { href: '#/athletes', style: 'font-size:13px;color:var(--text-secondary);text-decoration:none' }, ['← Voltar para atletas']));
  main.appendChild(h('div', { class: 'page-header', style: 'margin-top:8px' }, [
    h('div', {}, [
      h('h1', {}, [athlete.name]),
      h('p', {}, [`${athlete.category || 'Sem categoria'} · ${athlete.dominant_hand || ''} ${athlete.club ? '· ' + athlete.club : ''}`]),
    ]),
  ]));

  if (evaluations.length) {
    const grid = h('div', { class: 'grid grid-2' });

    const radarCard = h('div', { class: 'card' }, [h('h3', {}, ['Foto atual de habilidades'])]);
    const radarWrap = h('div');
    radarCard.appendChild(radarWrap);
    const latest = evaluations[evaluations.length - 1];
    radarChart(radarWrap, {
      axes: radarAxes(),
      series: [{ label: `Avaliação de ${fmtDate(latest.date)}`, values: radarValues(latest) }],
    });
    grid.appendChild(radarCard);

    const lineCard = h('div', { class: 'card' }, [h('h3', {}, ['Evolução da nota geral'])]);
    const lineWrap = h('div');
    lineCard.appendChild(lineWrap);
    lineChart(lineWrap, {
      categories: evaluations.map((e) => fmtDate(e.date)),
      series: [{ label: 'Nota geral', data: evaluations.map((e) => e.overall) }],
    });
    grid.appendChild(lineCard);

    main.appendChild(grid);
  } else if (ctx.user.role !== 'treinador') {
    main.appendChild(h('div', { class: 'card' }, [h('div', { class: 'empty-state' }, ['Ainda sem avaliações registradas para gerar gráficos.'])]));
  }

  if (matches.length) {
    const card = h('div', { class: 'card' }, [h('h3', {}, ['Jogos recentes'])]);
    const table = h('table', {}, [
      h('thead', {}, [h('tr', {}, [h('th', {}, ['Data']), h('th', {}, ['Tipo']), h('th', {}, ['Adversário']), h('th', {}, ['Resultado']), h('th', {}, ['Placar'])])]),
      h('tbody', {}, matches.slice(-8).reverse().map((m) => h('tr', {}, [
        h('td', {}, [fmtDate(m.date)]),
        h('td', {}, [h('span', { class: `badge badge-${m.match_type}` }, [m.match_type])]),
        h('td', {}, [m.opponent_name || '-']),
        h('td', {}, [h('span', { class: `badge ${m.result === 'vitoria' ? 'badge-win' : 'badge-loss'}` }, [m.result || '-'])]),
        h('td', {}, [m.sets_score || '-']),
      ]))),
    ]);
    card.appendChild(table);
    main.appendChild(card);
  }

  if (ctx.user.role === 'head_coach' && videos.length) {
    const card = h('div', { class: 'card' }, [h('h3', {}, ['Análises de vídeo recentes'])]);
    card.appendChild(h('ul', {}, videos.slice(-5).reverse().map((v) => h('li', {}, [
      `${fmtDate(v.date)} — ${v.stroke_type} — nota geral ${v.overall_score}/10`,
    ]))));
    main.appendChild(card);
  }
}
