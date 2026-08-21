import { h, clear, fmtDate } from '../dom.js';
import { api } from '../api.js';
import { lineChart, radarChart, barChart, seriesColor } from '../components/charts.js';
import { radarAxes, radarValues } from '../evalCriteria.js';

const STROKE_KEYS = [['forehand', 'Forehand'], ['backhand', 'Backhand'], ['serve', 'Saque']];

export async function renderReports(main, ctx) {
  const athletes = await api.get('/api/athletes');
  clear(main);

  main.appendChild(h('div', { class: 'page-header' }, [
    h('div', {}, [h('h1', {}, ['Relatórios e evolução']), h('p', {}, ['Acompanhamento de desempenho ao longo do tempo.'])]),
  ]));

  if (!athletes.length) {
    main.appendChild(h('div', { class: 'card' }, [h('div', { class: 'empty-state' }, ['Cadastre um atleta primeiro.'])]));
    return;
  }

  const select = h('select', { class: 'athlete-select' }, athletes.map((a) => h('option', { value: a.id }, [a.name])));
  main.appendChild(h('div', { class: 'form-field' }, [h('label', {}, ['Atleta']), select]));

  const body = h('div');
  main.appendChild(body);

  async function load() {
    const athleteId = select.value;
    const [evaluations, matches, videos] = await Promise.all([
      api.get(`/api/evaluations?athleteId=${athleteId}`),
      api.get(`/api/matches?athleteId=${athleteId}`),
      api.get(`/api/video-analyses?athleteId=${athleteId}`),
    ]);
    clear(body);

    if (!evaluations.length && !matches.length && !videos.length) {
      body.appendChild(h('div', { class: 'card' }, [h('div', { class: 'empty-state' }, ['Sem dados suficientes para gerar relatórios deste atleta ainda.'])]));
      return;
    }

    if (evaluations.length) {
      const grid = h('div', { class: 'grid grid-2' });

      const evolCard = h('div', { class: 'card' }, [h('h3', {}, ['Evolução por critério']), h('p', {}, ['Notas de 0 a 10 ao longo das avaliações.'])]);
      const evolWrap = h('div');
      evolCard.appendChild(evolWrap);
      const criteria = [
        ['forehand', 'Forehand'], ['backhand', 'Backhand'], ['serve', 'Saque'], ['physical_fitness', 'Resistência'],
      ];
      lineChart(evolWrap, {
        categories: evaluations.map((e) => fmtDate(e.date)),
        series: criteria.map(([key, label], i) => ({ label, color: seriesColor(i), data: evaluations.map((e) => e[key]) })),
      });
      grid.appendChild(evolCard);

      const radarCard = h('div', { class: 'card' }, [h('h3', {}, ['Comparativo: primeira x última avaliação'])]);
      const radarWrap = h('div');
      radarCard.appendChild(radarWrap);
      const first = evaluations[0], last = evaluations[evaluations.length - 1];
      radarChart(radarWrap, {
        axes: radarAxes(),
        series: [
          { label: `Primeira (${fmtDate(first.date)})`, color: seriesColor(2), values: radarValues(first) },
          { label: `Última (${fmtDate(last.date)})`, color: seriesColor(0), values: radarValues(last) },
        ],
      });
      grid.appendChild(radarCard);
      body.appendChild(grid);
    }

    if (matches.length) {
      const grid2 = h('div', { class: 'grid grid-2' });

      const errCard = h('div', { class: 'card' }, [h('h3', {}, ['Erros não forçados por partida'])]);
      const errWrap = h('div');
      errCard.appendChild(errWrap);
      barChart(errWrap, {
        categories: matches.map((m) => fmtDate(m.date)),
        series: [{ label: 'Erros não forçados', color: seriesColor(7), data: matches.map((m) => m.unforced_errors) }],
      });
      grid2.appendChild(errCard);

      const serveCard = h('div', { class: 'card' }, [h('h3', {}, ['1º saque (%) por partida'])]);
      const serveWrap = h('div');
      serveCard.appendChild(serveWrap);
      lineChart(serveWrap, {
        categories: matches.map((m) => fmtDate(m.date)),
        series: [{ label: '1º saque %', color: seriesColor(0), data: matches.map((m) => m.first_serve_pct) }],
        yMax: 100, valueSuffix: '%',
      });
      grid2.appendChild(serveCard);
      body.appendChild(grid2);

      const wins = matches.filter((m) => m.result === 'vitoria').length;
      const losses = matches.filter((m) => m.result === 'derrota').length;
      const winCard = h('div', { class: 'card' }, [
        h('h3', {}, ['Aproveitamento geral']),
        h('div', { class: 'grid grid-3', style: 'margin-top:10px' }, [
          statBlock('Vitórias', wins), statBlock('Derrotas', losses),
          statBlock('Aproveitamento', matches.length ? `${Math.round((wins / matches.length) * 100)}%` : '-'),
        ]),
      ]);
      body.appendChild(winCard);
    }

    if (videos.length) {
      const videoCard = h('div', { class: 'card' }, [h('h3', {}, ['Evolução da análise de vídeo (notas gerais por golpe)'])]);
      const videoWrap = h('div');
      videoCard.appendChild(videoWrap);
      const byStroke = {};
      videos.forEach((v) => { byStroke[v.stroke_type] = byStroke[v.stroke_type] || []; byStroke[v.stroke_type].push(v); });
      const allDates = Array.from(new Set(videos.map((v) => v.date))).sort();
      const series = Object.entries(byStroke).map(([stroke, items], i) => {
        const byDate = Object.fromEntries(items.map((v) => [v.date, v.overall_score]));
        return { label: STROKE_KEYS.find(([k]) => k === stroke)?.[1] || stroke, color: seriesColor(i), data: allDates.map((d) => byDate[d] ?? null) };
      });
      lineChart(videoWrap, { categories: allDates.map(fmtDate), series });
      body.appendChild(videoCard);
    }
  }

  select.addEventListener('change', load);
  await load();
}

function statBlock(label, value) {
  return h('div', { class: 'stat-tile' }, [
    h('div', { class: 'label' }, [label]),
    h('div', { class: 'value' }, [String(value)]),
  ]);
}
