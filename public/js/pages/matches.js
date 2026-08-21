import { h, clear, fmtDate, confirmModal } from '../dom.js';
import { api } from '../api.js';

const TYPES = [['torneio', 'Torneio'], ['treino', 'Jogo treino'], ['ranking', 'Ranking']];

export async function renderMatches(main, ctx) {
  const canEdit = ctx.user.role === 'head_coach';
  const athletes = await api.get('/api/athletes');
  clear(main);

  main.appendChild(h('div', { class: 'page-header' }, [
    h('div', {}, [h('h1', {}, ['Scout de jogos']), h('p', {}, ['Jogos de torneio, treino e ranking com estatísticas.'])]),
    canEdit ? h('div', {}, [
      h('button', { class: 'btn', style: 'margin-right:8px', onClick: () => renderLiveScout(main, ctx, athletes, () => renderMatches(main, ctx)) }, ['🔴 Scout ao vivo']),
      h('button', { class: 'btn btn-primary', onClick: () => openMatchModal(athletes, () => renderMatches(main, ctx)) }, ['+ Lançar jogo']),
    ]) : null,
  ]));

  const filterRow = h('div', { class: 'chip-row' });
  let activeType = null;
  const chips = [[null, 'Todos'], ...TYPES].map(([val, label]) => {
    const chip = h('button', {
      class: `chip${val === activeType ? ' active' : ''}`,
      type: 'button',
      onClick: () => { activeType = val; refreshChips(); load(); },
    }, [label]);
    chip.dataset.val = val ?? '';
    return chip;
  });
  chips.forEach((c) => filterRow.appendChild(c));
  function refreshChips() {
    chips.forEach((c) => c.classList.toggle('active', (c.dataset.val || null) === activeType));
  }
  main.appendChild(filterRow);

  const listWrap = h('div');
  main.appendChild(listWrap);

  async function load() {
    const query = activeType ? `?type=${activeType}` : '';
    const matches = await api.get(`/api/matches${query}`);
    clear(listWrap);
    if (!matches.length) {
      listWrap.appendChild(h('div', { class: 'card' }, [h('div', { class: 'empty-state' }, ['Nenhum jogo registrado ainda.'])]));
      return;
    }
    const athleteById = Object.fromEntries(athletes.map((a) => [a.id, a.name]));
    const table = h('table', {}, [
      h('thead', {}, [h('tr', {}, [
        h('th', {}, ['Data']), h('th', {}, ['Atleta']), h('th', {}, ['Tipo']), h('th', {}, ['Adversário']),
        h('th', {}, ['Resultado']), h('th', {}, ['Placar']), h('th', { class: 'num' }, ['Erros n.f.']),
        h('th', { class: 'num' }, ['1º saque %']), h('th', {}, ['']), canEdit ? h('th', {}, ['']) : null,
      ])]),
      h('tbody', {}, matches.map((m) => h('tr', {}, [
        h('td', {}, [fmtDate(m.date)]),
        h('td', {}, [athleteById[m.athlete_id] || `#${m.athlete_id}`]),
        h('td', {}, [h('span', { class: `badge badge-${m.match_type}` }, [m.match_type])]),
        h('td', {}, [m.opponent_athlete_id
          ? h('a', { href: `#/athletes/${m.opponent_athlete_id}` }, [m.opponent_name || `#${m.opponent_athlete_id}`])
          : (m.opponent_name || '-')]),
        h('td', {}, [h('span', { class: `badge ${m.result === 'vitoria' ? 'badge-win' : m.result === 'derrota' ? 'badge-loss' : 'badge-neutral'}` }, [m.result || '-'])]),
        h('td', {}, [m.sets_score || '-']),
        h('td', { class: 'num' }, [m.unforced_errors ?? '-']),
        h('td', { class: 'num' }, [m.first_serve_pct ? `${m.first_serve_pct}%` : '-']),
        h('td', {}, [canEdit ? h('button', {
          class: 'btn btn-sm', type: 'button',
          onClick: () => openMatchReportModal(m, athleteById[m.athlete_id] || `#${m.athlete_id}`),
        }, ['📝 Relatório IA']) : null]),
        canEdit ? h('td', {}, [h('button', { class: 'btn btn-sm btn-danger', onClick: () => confirmModal('Excluir jogo?', async () => { await api.del(`/api/matches/${m.id}`); load(); }) }, ['Excluir'])]) : null,
      ]))),
    ]);
    listWrap.appendChild(h('div', { class: 'card' }, [table]));
  }

  await load();
}

// ---------------------------------------------------------------------------
// Scout ao vivo -- em vez de digitar totais depois do jogo, o treinador toca
// um botao por ponto/evento durante a partida e as estatisticas (%s, totais)
// sao calculadas automaticamente a partir dos toques.
// ---------------------------------------------------------------------------

// Cada ponto e decidido por exatamente 1 toque de "resultado do ponto" (grupos
// "sacando"/"devolvendo" abaixo, ver MY_POINT_TYPES/OPP_POINT_TYPES). Os toques
// de "detalhe do ponto" (winner/erro/rede/break point) NAO contam ponto -- eles
// so descrevem o ponto que acabou de ser marcado. Essa separacao existe porque
// antes um mesmo ponto podia ser contado 2x quando o treinador tocava tanto o
// resultado do saque (ex: "1º saque: ponto ganho") quanto o tipo de golpe (ex:
// "Winner") -- os dois pareciam toques independentes mas descreviam o mesmo
// ponto. Padrao inspirado em apps de scout ao vivo (ex: Yellow Tap, Ultimate
// Tennis Statistics): resultado do ponto = 1 unica fonte de verdade do placar;
// tudo o mais e estatistica opcional.
const TAP_TYPES = {
  ace: { label: 'Ace', variant: 'positive' },
  first_won: { label: '1º saque: ponto ganho', variant: 'positive' },
  first_lost: { label: '1º saque: ponto perdido', variant: 'negative' },
  first_out: { label: '1º saque: fora', variant: 'neutral' },
  second_won: { label: '2º saque: ponto ganho', variant: 'positive' },
  second_lost: { label: '2º saque: ponto perdido', variant: 'negative' },
  double_fault: { label: 'Dupla falta (meu atleta)', variant: 'negative' },
  opp_ace: { label: 'Ace do adversário', variant: 'negative' },
  opp_double_fault: { label: 'Dupla falta do adversário', variant: 'positive' },
  return_won: { label: 'Ponto de devolução: ganho', variant: 'positive' },
  return_lost: { label: 'Ponto de devolução: perdido', variant: 'negative' },
  winner: { label: 'Winner', variant: 'positive', detail: true },
  unforced_error: { label: 'Erro não forçado', variant: 'negative', detail: true },
  forced_error: { label: 'Erro forçado (pelo adversário)', variant: 'neutral', detail: true },
  net_won: { label: 'Ponto de rede: ganho', variant: 'positive', detail: true },
  net_lost: { label: 'Ponto de rede: perdido', variant: 'negative', detail: true },
  bp_saved: { label: 'Break point: salvo', variant: 'positive', detail: true },
  bp_lost: { label: 'Break point: perdido', variant: 'negative', detail: true },
  rally_short: { label: 'Rally até 4 trocas', variant: 'neutral', detail: true },
  rally_long: { label: 'Rally acima de 4 trocas', variant: 'neutral', detail: true },
};

// ---------------------------------------------------------------------------
// Placar ao vivo -- formato de disputa escolhido antes de iniciar define quantos
// games por set e se ha super tiebreak como decisao, e a cada ponto marcado o
// placar (games/sets, com pontuacao de game 0/15/30/40 e tiebreaks) avanca sozinho.
// ---------------------------------------------------------------------------

const MATCH_FORMATS = {
  two_sets_super_tb: { label: '2 sets com super tiebreak', gamesPerSet: 6, setsToWin: 2, deciderSuperTB: true, superTbOnly: false },
  super_tb_only: { label: 'Super tiebreak (jogo único)', gamesPerSet: null, setsToWin: null, deciderSuperTB: false, superTbOnly: true },
  pro_set_8: { label: 'Set pro de 8 games', gamesPerSet: 8, setsToWin: 1, deciderSuperTB: false, superTbOnly: false },
  short_sets_4_super_tb: { label: 'Short sets (4 games) + super tiebreak', gamesPerSet: 4, setsToWin: 2, deciderSuperTB: true, superTbOnly: false },
};

const DEFAULT_CUSTOM_FORMAT = { gamesPerSet: 6, setsToWin: 2, deciderSuperTB: true, superTbOnly: false };

// Resolve o formato escolhido (um dos presets, ou 'custom' com os parametros
// definidos pelo proprio treinador) num objeto de configuracao unico usado
// pela engine de placar abaixo.
function resolveFormatConfig(matchFormat, custom) {
  if (matchFormat === 'custom') {
    return custom.superTbOnly
      ? { gamesPerSet: null, setsToWin: null, deciderSuperTB: false, superTbOnly: true }
      : { gamesPerSet: custom.gamesPerSet, setsToWin: custom.setsToWin, deciderSuperTB: custom.deciderSuperTB, superTbOnly: false };
  }
  return MATCH_FORMATS[matchFormat];
}

function formatDisputeLabel(matchFormat, custom) {
  if (matchFormat === 'custom') {
    if (custom.superTbOnly) return 'Personalizado — super tiebreak único (10 pontos)';
    return `Personalizado — sets até ${custom.gamesPerSet} games · ${custom.setsToWin} set${custom.setsToWin === 1 ? '' : 's'} para vencer${custom.deciderSuperTB ? ' · empate decidido em super tiebreak' : ''}`;
  }
  return MATCH_FORMATS[matchFormat].label;
}

function initialScore(cfg) {
  return {
    sets: [],
    games: { my: 0, opp: 0 },
    points: { my: 0, opp: 0 },
    mode: cfg.superTbOnly ? 'super_tb' : 'game',
    matchOver: false,
    winner: null,
  };
}

function otherSide(side) { return side === 'my' ? 'opp' : 'my'; }

function addPoint(score, side, cfg) {
  if (score.matchOver) return score;
  const other = otherSide(side);
  score.points[side] += 1;
  const p = score.points[side];
  const o = score.points[other];

  if (score.mode === 'game' && p >= 4 && p - o >= 2) {
    winGame(score, side, other, cfg, false);
  } else if (score.mode === 'tiebreak' && p >= 7 && p - o >= 2) {
    winGame(score, side, other, cfg, true);
  } else if (score.mode === 'super_tb' && p >= 10 && p - o >= 2) {
    score.sets.push({ my: score.points.my, opp: score.points.opp, superTb: true });
    score.points = { my: 0, opp: 0 };
    score.matchOver = true;
    score.winner = side;
  }
  return score;
}

function winGame(score, side, other, cfg, wasTiebreak) {
  score.games[side] += 1;
  score.points = { my: 0, opp: 0 };
  const g = score.games[side];
  const og = score.games[other];
  if (g >= cfg.gamesPerSet && g - og >= 2) {
    score.sets.push({ my: score.games.my, opp: score.games.opp, tiebreak: wasTiebreak });
    score.games = { my: 0, opp: 0 };
    checkMatchProgress(score, cfg);
  } else if (g === cfg.gamesPerSet && og === cfg.gamesPerSet) {
    score.mode = 'tiebreak';
  } else {
    score.mode = 'game';
  }
}

function checkMatchProgress(score, cfg) {
  const setsWon = { my: 0, opp: 0 };
  score.sets.forEach((s) => { if (s.my > s.opp) setsWon.my += 1; else setsWon.opp += 1; });
  if (setsWon.my >= cfg.setsToWin) { score.matchOver = true; score.winner = 'my'; return; }
  if (setsWon.opp >= cfg.setsToWin) { score.matchOver = true; score.winner = 'opp'; return; }
  if (cfg.deciderSuperTB && setsWon.my === 1 && setsWon.opp === 1) {
    score.mode = 'super_tb';
  } else {
    score.mode = 'game';
  }
}

const GAME_POINT_LABELS = ['0', '15', '30', '40'];

function formatGamePoints(points, myName, oppLabel) {
  const { my, opp } = points;
  if (my >= 3 && opp >= 3) {
    const diff = my - opp;
    if (diff === 0) return 'Deuce';
    return diff > 0 ? `Vantagem ${myName}` : `Vantagem ${oppLabel}`;
  }
  return `${GAME_POINT_LABELS[my]} - ${GAME_POINT_LABELS[opp]}`;
}

function formatSetsHistory(sets) {
  return sets.map((s) => `${s.my}-${s.opp}${s.superTb ? ' (STB)' : s.tiebreak ? ' (TB)' : ''}`).join('  ·  ');
}

function deriveSetsScoreText(sets) {
  return sets.map((s) => (s.superTb ? `[${s.my}-${s.opp}]` : `${s.my}-${s.opp}`)).join(', ');
}

// O placar nao tem botao proprio -- ele e derivado automaticamente dos toques de
// "resultado do ponto" (grupos "sacando"/"devolvendo" na tela ao vivo). Cada
// ponto so pode terminar de 1 jeito, entao estes dois conjuntos sao mutuamente
// exclusivos e cobrem TODOS os casos (saque do meu atleta e saque do
// adversario) -- '1º saque: fora' fica de fora pois so registra a falta, sem
// encerrar o ponto. Os toques de "detalhe do ponto" (winner/erro/rede/break
// point, ver TAP_TYPES) nao entram aqui de proposito: eles so descrevem o
// ponto que acabou de ser contado por um destes toques, e nunca somam ponto
// por conta propria.
const MY_POINT_TYPES = new Set(['ace', 'first_won', 'second_won', 'opp_double_fault', 'return_won']);
const OPP_POINT_TYPES = new Set(['first_lost', 'second_lost', 'double_fault', 'opp_ace', 'return_lost']);

function computeScore(events, cfg) {
  const score = initialScore(cfg);
  events.forEach((type) => {
    if (MY_POINT_TYPES.has(type)) addPoint(score, 'my', cfg);
    else if (OPP_POINT_TYPES.has(type)) addPoint(score, 'opp', cfg);
  });
  return score;
}

function tally(events) {
  const c = {};
  events.forEach((t) => { c[t] = (c[t] || 0) + 1; });
  return c;
}

function computeStats(events) {
  const c = tally(events);
  const firstAttempts = (c.ace || 0) + (c.first_won || 0) + (c.first_lost || 0) + (c.first_out || 0);
  const firstIn = (c.ace || 0) + (c.first_won || 0) + (c.first_lost || 0);
  const firstWonCount = (c.ace || 0) + (c.first_won || 0);
  const secondPlayed = (c.second_won || 0) + (c.second_lost || 0) + (c.double_fault || 0);
  const secondWonCount = c.second_won || 0;
  return {
    aces: c.ace || 0,
    doubleFaults: c.double_fault || 0,
    firstServePct: firstAttempts ? Math.round((firstIn / firstAttempts) * 100) : null,
    firstServePointsWonPct: firstIn ? Math.round((firstWonCount / firstIn) * 100) : null,
    secondServePointsWonPct: secondPlayed ? Math.round((secondWonCount / secondPlayed) * 100) : null,
    winners: c.winner || 0,
    unforcedErrors: c.unforced_error || 0,
    forcedErrors: c.forced_error || 0,
    breakPointsWon: c.bp_saved || 0,
    breakPointsFaced: (c.bp_saved || 0) + (c.bp_lost || 0),
    netPointsWon: c.net_won || 0,
    netPointsTotal: (c.net_won || 0) + (c.net_lost || 0),
    ralliesUpTo4: c.rally_short || 0,
    ralliesOver4: c.rally_long || 0,
    acesAgainst: c.opp_ace || 0,
    doubleFaultsAgainst: c.opp_double_fault || 0,
    returnPointsWon: c.return_won || 0,
    returnPointsTotal: (c.return_won || 0) + (c.return_lost || 0),
    totalTaps: events.length,
  };
}

function statTile(label, value) {
  return h('div', { class: 'stat-tile' }, [
    h('div', { class: 'label' }, [label]),
    h('div', { class: 'value', style: 'font-size:20px' }, [String(value)]),
  ]);
}

function renderLiveScout(main, ctx, athletes, onExit) {
  const state = {
    phase: 'setup',
    athleteId: athletes[0] ? athletes[0].id : null,
    opponentName: '',
    opponentAthleteId: null,
    matchType: 'torneio',
    matchFormat: 'two_sets_super_tb',
    customFormat: { ...DEFAULT_CUSTOM_FORMAT },
    tournamentName: '',
    date: new Date().toISOString().slice(0, 10),
    events: [],
  };

  function draw() {
    clear(main);
    if (state.phase === 'setup') drawSetup();
    else if (state.phase === 'live') drawLive();
    else drawFinish();
  }

  function drawSetup() {
    const athleteSelect = h('select', { required: true }, athletes.map((a) => h('option', { value: a.id }, [a.name])));
    athleteSelect.value = state.athleteId;
    const opponentInput = h('input', { placeholder: 'Nome do adversário', value: state.opponentName });
    opponentInput.disabled = !!state.opponentAthleteId;
    const opponentAthleteSelect = h('select', {}, [
      h('option', { value: '' }, ['— Nome livre (campo ao lado) —']),
      ...athletes.map((a) => h('option', { value: a.id, selected: state.opponentAthleteId === a.id }, [a.name])),
    ]);
    opponentAthleteSelect.value = state.opponentAthleteId || '';
    const setupErrorBox = h('div', { class: 'error-msg' });
    opponentAthleteSelect.addEventListener('change', () => {
      if (opponentAthleteSelect.value) {
        const opp = athletes.find((a) => a.id === Number(opponentAthleteSelect.value));
        opponentInput.value = opp ? opp.name : '';
        opponentInput.disabled = true;
      } else {
        opponentInput.value = '';
        opponentInput.disabled = false;
      }
    });
    const matchTypeSelect = h('select', {}, TYPES.map(([v, l]) => h('option', { value: v }, [l])));
    matchTypeSelect.value = state.matchType;
    const matchFormatSelect = h('select', {}, [
      ...Object.entries(MATCH_FORMATS).map(([v, f]) => h('option', { value: v }, [f.label])),
      h('option', { value: 'custom' }, ['Personalizado…']),
    ]);
    matchFormatSelect.value = state.matchFormat;
    const tournamentInput = h('input', { placeholder: 'Nome do torneio (opcional)', value: state.tournamentName });
    const dateInput = h('input', { type: 'date', value: state.date });

    const customGamesPerSet = h('input', { type: 'number', min: '1', max: '20', value: String(state.customFormat.gamesPerSet) });
    const customSuperTbOnly = h('input', { type: 'checkbox', checked: state.customFormat.superTbOnly });
    const customSetsToWin = h('input', { type: 'number', min: '1', max: '5', value: String(state.customFormat.setsToWin) });
    const customDeciderSuperTB = h('input', { type: 'checkbox', checked: state.customFormat.deciderSuperTB });
    const customSetsFieldsWrap = h('div', { class: 'form-grid', style: 'margin-top:0' }, [
      h('div', { class: 'form-field' }, [h('label', {}, ['Games por set']), customGamesPerSet]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Sets para vencer a partida']), customSetsToWin]),
      h('div', { class: 'form-field span-2' }, [
        h('label', { class: 'tag-checkbox' }, [customDeciderSuperTB, ' Em empate de sets, decidir com super tiebreak (em vez de outro set)']),
      ]),
    ]);
    const customFormatWrap = h('div', { class: 'card', style: 'margin-top:10px;background:var(--surface-2)' }, [
      h('div', { class: 'form-field' }, [
        h('label', { class: 'tag-checkbox' }, [customSuperTbOnly, ' Partida é só um super tiebreak (10 pontos), sem sets/games']),
      ]),
      customSetsFieldsWrap,
    ]);
    customFormatWrap.style.display = state.matchFormat === 'custom' ? '' : 'none';
    customSetsFieldsWrap.style.display = state.customFormat.superTbOnly ? 'none' : '';
    matchFormatSelect.addEventListener('change', () => {
      customFormatWrap.style.display = matchFormatSelect.value === 'custom' ? '' : 'none';
    });
    customSuperTbOnly.addEventListener('change', (e) => {
      customSetsFieldsWrap.style.display = e.target.checked ? 'none' : '';
    });

    main.appendChild(h('a', {
      href: '#', style: 'font-size:13px;color:var(--text-secondary);text-decoration:none',
      onClick: (e) => { e.preventDefault(); onExit(); },
    }, ['← Voltar']));
    main.appendChild(h('div', { class: 'page-header', style: 'margin-top:8px' }, [
      h('div', {}, [h('h1', {}, ['Scout ao vivo']), h('p', {}, ['Preencha os dados do jogo e comece a marcar os pontos em tempo real.'])]),
    ]));
    main.appendChild(h('div', { class: 'card', style: 'max-width:520px' }, [
      h('div', { class: 'form-grid' }, [
        h('div', { class: 'form-field span-2' }, [h('label', {}, ['Atleta']), athleteSelect]),
        h('div', { class: 'form-field' }, [h('label', {}, ['Adversário cadastrado (opcional)']), opponentAthleteSelect]),
        h('div', { class: 'form-field' }, [h('label', {}, ['Nome do adversário (se não cadastrado)']), opponentInput]),
        h('div', { class: 'form-field' }, [h('label', {}, ['Tipo de jogo']), matchTypeSelect]),
        h('div', { class: 'form-field span-2' }, [h('label', {}, ['Formato de disputa']), matchFormatSelect]),
        h('div', { class: 'form-field' }, [h('label', {}, ['Torneio (opcional)']), tournamentInput]),
        h('div', { class: 'form-field' }, [h('label', {}, ['Data']), dateInput]),
      ]),
      customFormatWrap,
      setupErrorBox,
      h('div', { class: 'form-actions' }, [
        h('button', {
          class: 'btn btn-primary', type: 'button',
          onClick: () => {
            if (!athleteSelect.value) return;
            const oppAthleteId = opponentAthleteSelect.value ? Number(opponentAthleteSelect.value) : null;
            if (oppAthleteId && oppAthleteId === Number(athleteSelect.value)) {
              setupErrorBox.textContent = 'O adversário cadastrado não pode ser o mesmo atleta.';
              return;
            }
            setupErrorBox.textContent = '';
            state.athleteId = Number(athleteSelect.value);
            state.opponentAthleteId = oppAthleteId;
            state.opponentName = oppAthleteId ? (athletes.find((a) => a.id === oppAthleteId)?.name || '') : opponentInput.value;
            state.matchType = matchTypeSelect.value;
            state.matchFormat = matchFormatSelect.value;
            state.customFormat = {
              superTbOnly: customSuperTbOnly.checked,
              gamesPerSet: Math.max(1, Number(customGamesPerSet.value) || DEFAULT_CUSTOM_FORMAT.gamesPerSet),
              setsToWin: Math.max(1, Number(customSetsToWin.value) || DEFAULT_CUSTOM_FORMAT.setsToWin),
              deciderSuperTB: customDeciderSuperTB.checked,
            };
            state.tournamentName = tournamentInput.value;
            state.date = dateInput.value;
            state.phase = 'live';
            draw();
          },
        }, ['Iniciar scout ao vivo']),
      ]),
    ]));
  }

  function drawLive() {
    const athleteName = athletes.find((a) => a.id === state.athleteId)?.name || '';
    const oppLabel = state.opponentName || 'Adversário';
    const stats = computeStats(state.events);

    function buildScoreCard() {
      const cfg = resolveFormatConfig(state.matchFormat, state.customFormat);
      const score = computeScore(state.events, cfg);
      const card = h('div', { class: 'card scout-score-card' }, [
        h('h3', { style: 'margin-bottom:2px' }, ['Placar']),
        h('p', { style: 'font-size:12px;color:var(--text-secondary);margin:0 0 8px' }, [
          `${formatDisputeLabel(state.matchFormat, state.customFormat)} — atualizado automaticamente conforme as marcações abaixo.`,
        ]),
      ]);
      if (score.sets.length) {
        card.appendChild(h('p', { style: 'font-size:14px;font-weight:600;margin-bottom:6px' }, [formatSetsHistory(score.sets)]));
      }
      if (score.matchOver) {
        const winnerName = score.winner === 'my' ? athleteName : oppLabel;
        card.appendChild(h('span', { class: 'badge badge-win', style: 'font-size:13px;padding:6px 14px' }, [`Partida encerrada — ${winnerName} venceu`]));
      } else if (score.mode === 'super_tb') {
        card.appendChild(h('p', { style: 'font-size:24px;font-weight:700;margin:4px 0' }, [`Super tiebreak: ${score.points.my} - ${score.points.opp}`]));
      } else {
        const pointsLine = score.mode === 'tiebreak'
          ? `Tiebreak: ${score.points.my} - ${score.points.opp}`
          : formatGamePoints(score.points, athleteName, oppLabel);
        card.appendChild(h('p', { style: 'font-size:24px;font-weight:700;margin:4px 0' }, [`Games: ${score.games.my} - ${score.games.opp}`]));
        card.appendChild(h('p', { style: 'font-size:15px;color:var(--text-secondary);margin:0' }, [pointsLine]));
      }
      return card;
    }

    main.appendChild(h('div', { class: 'page-header' }, [
      h('div', {}, [
        h('h1', {}, [`${athleteName} vs ${state.opponentName || 'Adversário'}`]),
        h('p', {}, [`${TYPES.find(([v]) => v === state.matchType)?.[1] || ''}${state.tournamentName ? ' · ' + state.tournamentName : ''} · ${fmtDate(state.date)}`]),
      ]),
      h('button', {
        class: 'btn btn-sm btn-danger', type: 'button',
        onClick: () => confirmModal('Cancelar scout ao vivo? Os dados marcados serão perdidos.', onExit),
      }, ['Cancelar']),
    ]));

    main.appendChild(buildScoreCard());

    main.appendChild(h('div', { class: 'card' }, [
      h('h3', { style: 'margin-bottom:10px' }, ['Resumo ao vivo']),
      h('div', { class: 'scout-stats-summary' }, [
        statTile('Toques', stats.totalTaps),
        statTile('Aces', stats.aces),
        statTile('Duplas faltas', stats.doubleFaults),
        statTile('1º saque', stats.firstServePct !== null ? `${stats.firstServePct}%` : '-'),
        statTile('Pts no 1º saque', stats.firstServePointsWonPct !== null ? `${stats.firstServePointsWonPct}%` : '-'),
        statTile('Pts no 2º saque', stats.secondServePointsWonPct !== null ? `${stats.secondServePointsWonPct}%` : '-'),
        statTile('Winners', stats.winners),
        statTile('Erros não forçados', stats.unforcedErrors),
        statTile('Break points', `${stats.breakPointsWon}/${stats.breakPointsFaced}`),
        statTile('Pontos de rede', `${stats.netPointsWon}/${stats.netPointsTotal}`),
        statTile('Rally até 4 trocas', stats.ralliesUpTo4),
        statTile('Rally acima de 4 trocas', stats.ralliesOver4),
        statTile('Aces sofridos', stats.acesAgainst),
        statTile('Duplas faltas do adversário', stats.doubleFaultsAgainst),
        statTile('Pts de devolução', `${stats.returnPointsWon}/${stats.returnPointsTotal}`),
      ]),
    ]));

    function tap(type) { state.events.push(type); draw(); }

    function groupCard(title, subtitle, types) {
      const counts = tally(state.events);
      return h('div', { class: 'card' }, [
        h('h3', { style: 'margin-bottom:2px' }, [title]),
        subtitle ? h('p', { style: 'font-size:12px;color:var(--text-secondary);margin:0 0 10px' }, [subtitle]) : null,
        h('div', { class: 'scout-live-grid' }, types.map((type) => {
          const meta = TAP_TYPES[type];
          return h('button', {
            type: 'button', class: `scout-tap-btn ${meta.variant}${meta.detail ? ' detail' : ''}`, onClick: () => tap(type),
          }, [
            h('span', {}, [meta.label]),
            h('span', { class: 'count' }, [String(counts[type] || 0)]),
          ]);
        })),
      ]);
    }

    main.appendChild(groupCard(
      'Quando seu atleta está sacando',
      'Resultado do ponto — toque exatamente 1 botão por ponto, é ele que soma no placar.',
      ['ace', 'first_won', 'first_lost', 'first_out', 'second_won', 'second_lost', 'double_fault'],
    ));
    main.appendChild(groupCard(
      'Quando o adversário está sacando',
      'Resultado do ponto — toque exatamente 1 botão por ponto, é ele que soma no placar.',
      ['opp_ace', 'opp_double_fault', 'return_won', 'return_lost'],
    ));
    main.appendChild(groupCard(
      'Detalhe do ponto (opcional)',
      'Não altera o placar — só descreve o ponto que você acabou de marcar acima.',
      ['winner', 'unforced_error', 'forced_error', 'net_won', 'net_lost', 'bp_saved', 'bp_lost'],
    ));
    main.appendChild(groupCard(
      'Duração do rally (opcional)',
      'Não altera o placar — só descreve o ponto que você acabou de marcar acima.',
      ['rally_short', 'rally_long'],
    ));

    main.appendChild(h('div', { class: 'form-actions' }, [
      h('button', {
        class: 'btn', type: 'button', disabled: !state.events.length,
        onClick: () => { state.events.pop(); draw(); },
      }, ['↩ Desfazer última marcação']),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => { state.phase = 'finish'; draw(); },
      }, ['Finalizar e salvar jogo']),
    ]));
  }

  function drawFinish() {
    const stats = computeStats(state.events);
    const score = computeScore(state.events, resolveFormatConfig(state.matchFormat, state.customFormat));
    const athleteName = athletes.find((a) => a.id === state.athleteId)?.name || '';
    const result = h('select', {}, [h('option', { value: '' }, ['Resultado']), h('option', { value: 'vitoria' }, ['Vitória']), h('option', { value: 'derrota' }, ['Derrota'])]);
    if (score.winner) result.value = score.winner === 'my' ? 'vitoria' : 'derrota';
    const setsScore = h('input', { placeholder: 'Ex: 6-4, 3-6, 6-2', value: deriveSetsScoreText(score.sets) });
    const notes = h('textarea', { placeholder: 'Observações do jogo' });
    const errorBox = h('div', { class: 'error-msg' });

    main.appendChild(h('a', {
      href: '#', style: 'font-size:13px;color:var(--text-secondary);text-decoration:none',
      onClick: (e) => { e.preventDefault(); state.phase = 'live'; draw(); },
    }, ['← Voltar para marcação']));
    main.appendChild(h('div', { class: 'page-header', style: 'margin-top:8px' }, [
      h('div', {}, [h('h1', {}, ['Finalizar jogo']), h('p', {}, [`${athleteName} vs ${state.opponentName || 'Adversário'}`])]),
    ]));

    if (state.opponentAthleteId) {
      main.appendChild(h('div', { class: 'card', style: 'background:var(--surface-2)' }, [
        h('p', { style: 'font-size:13px;margin:0' }, [
          `Como o adversário também é um aluno cadastrado, o resultado será lançado automaticamente para ambos: vitória/derrota e placar espelhados para ${state.opponentName}.`,
        ]),
      ]));
    }

    main.appendChild(h('div', { class: 'card' }, [
      h('h3', {}, ['Estatísticas marcadas']),
      h('div', { class: 'scout-stats-summary' }, [
        statTile('Aces', stats.aces), statTile('Duplas faltas', stats.doubleFaults),
        statTile('1º saque', stats.firstServePct !== null ? `${stats.firstServePct}%` : '-'),
        statTile('Pts 1º saque', stats.firstServePointsWonPct !== null ? `${stats.firstServePointsWonPct}%` : '-'),
        statTile('Pts 2º saque', stats.secondServePointsWonPct !== null ? `${stats.secondServePointsWonPct}%` : '-'),
        statTile('Winners', stats.winners), statTile('Erros não forçados', stats.unforcedErrors),
        statTile('Break points', `${stats.breakPointsWon}/${stats.breakPointsFaced}`),
        statTile('Pontos de rede', `${stats.netPointsWon}/${stats.netPointsTotal}`),
        statTile('Rally até 4 trocas', stats.ralliesUpTo4),
        statTile('Rally acima de 4 trocas', stats.ralliesOver4),
      ]),
    ]));

    main.appendChild(h('div', { class: 'card', style: 'max-width:520px' }, [
      h('div', { class: 'form-grid' }, [
        h('div', { class: 'form-field' }, [h('label', {}, ['Resultado']), result]),
        h('div', { class: 'form-field' }, [h('label', {}, ['Placar (sets)']), setsScore]),
      ]),
      h('div', { class: 'form-field', style: 'margin-top:10px' }, [h('label', {}, ['Notas']), notes]),
      errorBox,
      h('div', { class: 'form-actions' }, [
        h('button', {
          class: 'btn btn-primary', type: 'button',
          onClick: async () => {
            try {
              await api.post('/api/matches', {
                athleteId: state.athleteId, date: state.date, matchType: state.matchType,
                tournamentName: state.tournamentName || null, opponentName: state.opponentName || null,
                opponentAthleteId: state.opponentAthleteId || null,
                result: result.value || null, setsScore: setsScore.value || null,
                aces: stats.aces, doubleFaults: stats.doubleFaults, firstServePct: stats.firstServePct,
                firstServePointsWonPct: stats.firstServePointsWonPct, secondServePointsWonPct: stats.secondServePointsWonPct,
                winners: stats.winners, unforcedErrors: stats.unforcedErrors,
                breakPointsWon: stats.breakPointsWon, breakPointsFaced: stats.breakPointsFaced,
                netPointsWon: stats.netPointsWon, netPointsTotal: stats.netPointsTotal,
                ralliesUpTo4: stats.ralliesUpTo4, ralliesOver4: stats.ralliesOver4,
                matchFormat: formatDisputeLabel(state.matchFormat, state.customFormat), notes: notes.value || null,
              });
              onExit();
            } catch (err) { errorBox.textContent = err.message; }
          },
        }, ['Salvar jogo']),
      ]),
    ]));
  }

  draw();
}

function openMatchModal(athletes, onDone) {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const athleteSelect = h('select', { required: true }, athletes.map((a) => h('option', { value: a.id }, [a.name])));
  const date = h('input', { type: 'date', required: true, value: new Date().toISOString().slice(0, 10) });
  const matchType = h('select', { required: true }, TYPES.map(([v, l]) => h('option', { value: v }, [l])));
  const tournamentName = h('input', { placeholder: 'Nome do torneio (se aplicável)' });
  const opponentName = h('input', { placeholder: 'Nome do adversário' });
  const result = h('select', {}, [h('option', { value: '' }, ['Resultado']), h('option', { value: 'vitoria' }, ['Vitória']), h('option', { value: 'derrota' }, ['Derrota'])]);
  const setsScore = h('input', { placeholder: 'Ex: 6-4, 3-6, 6-2' });

  const numField = (placeholder) => h('input', { type: 'number', step: 'any', placeholder });
  const aces = numField('Aces');
  const doubleFaults = numField('Duplas faltas');
  const firstServePct = numField('1º saque (%)');
  const firstServeWonPct = numField('Pontos ganhos no 1º saque (%)');
  const secondServeWonPct = numField('Pontos ganhos no 2º saque (%)');
  const winners = numField('Winners');
  const unforcedErrors = numField('Erros não forçados');
  const bpWon = numField('Break points ganhos');
  const bpFaced = numField('Break points enfrentados');
  const netWon = numField('Pontos ganhos na rede');
  const netTotal = numField('Pontos jogados na rede');
  const ralliesUpTo4 = numField('Rallies até 4 trocas');
  const ralliesOver4 = numField('Rallies acima de 4 trocas');
  const notes = h('textarea', { placeholder: 'Observações do jogo' });
  const errorBox = h('div', { class: 'error-msg' });

  const form = h('form', {
    onSubmit: async (e) => {
      e.preventDefault();
      try {
        await api.post('/api/matches', {
          athleteId: Number(athleteSelect.value), date: date.value, matchType: matchType.value,
          tournamentName: tournamentName.value || null, opponentName: opponentName.value || null,
          result: result.value || null, setsScore: setsScore.value || null,
          aces: numOrNull(aces), doubleFaults: numOrNull(doubleFaults), firstServePct: numOrNull(firstServePct),
          firstServePointsWonPct: numOrNull(firstServeWonPct), secondServePointsWonPct: numOrNull(secondServeWonPct),
          winners: numOrNull(winners), unforcedErrors: numOrNull(unforcedErrors),
          breakPointsWon: numOrNull(bpWon), breakPointsFaced: numOrNull(bpFaced),
          netPointsWon: numOrNull(netWon), netPointsTotal: numOrNull(netTotal),
          ralliesUpTo4: numOrNull(ralliesUpTo4), ralliesOver4: numOrNull(ralliesOver4),
          notes: notes.value || null,
        });
        backdrop.remove();
        onDone();
      } catch (err) { errorBox.textContent = err.message; }
    },
  }, [
    h('h2', {}, ['Lançar jogo (scout)']),
    h('div', { class: 'form-grid cols-3', style: 'margin-top:14px' }, [
      h('div', { class: 'form-field' }, [h('label', {}, ['Atleta']), athleteSelect]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Data']), date]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Tipo de jogo']), matchType]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Torneio']), tournamentName]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Adversário']), opponentName]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Resultado']), result]),
      h('div', { class: 'form-field span-2' }, [h('label', {}, ['Placar (sets)']), setsScore]),
    ]),
    h('h3', { style: 'margin-top:16px' }, ['Estatísticas']),
    h('div', { class: 'form-grid cols-3' }, [
      field('Aces', aces), field('Duplas faltas', doubleFaults), field('1º saque %', firstServePct),
      field('Pts ganhos 1º saque %', firstServeWonPct), field('Pts ganhos 2º saque %', secondServeWonPct), field('Winners', winners),
      field('Erros não forçados', unforcedErrors), field('Break points ganhos', bpWon), field('Break points enfrentados', bpFaced),
      field('Pts ganhos na rede', netWon), field('Pts jogados na rede', netTotal),
      field('Rallies até 4 trocas', ralliesUpTo4), field('Rallies acima de 4 trocas', ralliesOver4),
    ]),
    h('div', { class: 'form-field', style: 'margin-top:10px' }, [h('label', {}, ['Notas']), notes]),
    errorBox,
    h('div', { class: 'form-actions' }, [
      h('button', { class: 'btn', type: 'button', onClick: () => backdrop.remove() }, ['Cancelar']),
      h('button', { class: 'btn btn-primary', type: 'submit' }, ['Salvar jogo']),
    ]),
  ]);

  backdrop.appendChild(h('div', { class: 'modal-box', style: 'width:680px' }, [form]));
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  document.body.appendChild(backdrop);
}

function field(label, input) {
  return h('div', { class: 'form-field' }, [h('label', {}, [label]), input]);
}
function numOrNull(input) { return input.value === '' ? null : Number(input.value); }

// ---------------------------------------------------------------------------
// Relatorio pos-jogo com IA -- heuristica sempre calculada a partir das
// estatisticas reais ja lancadas no scout; refinamento por Claude opcional.
// ---------------------------------------------------------------------------

function openMatchReportModal(match, athleteName) {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const box = h('div', { class: 'modal-box', style: 'width:640px' });
  box.appendChild(h('h2', {}, ['Relatório pós-jogo com IA']));
  box.appendChild(h('p', { style: 'margin-top:-6px;font-size:13px;color:var(--text-secondary)' }, [
    `${athleteName} · ${fmtDate(match.date)}${match.opponent_name ? ` vs ${match.opponent_name}` : ''}${match.sets_score ? ` · ${match.sets_score}` : ''}`,
  ]));

  const useAi = h('input', { type: 'checkbox' });
  const generateBtn = h('button', { class: 'btn btn-primary', type: 'button' }, ['Gerar relatório']);
  const errorBox = h('div', { class: 'error-msg' });

  box.appendChild(h('div', { class: 'form-field' }, [
    h('label', { class: 'tag-checkbox' }, [useAi, ' usar IA generativa (Claude) se ANTHROPIC_API_KEY estiver configurada']),
  ]));
  box.appendChild(h('div', { class: 'form-actions', style: 'margin-top:8px' }, [generateBtn]));
  box.appendChild(errorBox);

  const historyWrap = h('div', { style: 'margin-top:14px' });
  box.appendChild(historyWrap);

  async function loadHistory() {
    const reports = await api.get(`/api/matches/${match.id}/report`);
    clear(historyWrap);
    if (!reports.length) {
      historyWrap.appendChild(h('p', { style: 'font-size:13px;color:var(--text-muted)' }, ['Nenhum relatório gerado ainda para este jogo.']));
      return;
    }
    reports.forEach((r) => historyWrap.appendChild(buildReportCard(r)));
  }

  function buildReportCard(r) {
    return h('div', { class: 'card', style: 'margin-top:10px' }, [
      h('div', { class: 'page-header', style: 'margin-bottom:6px' }, [
        h('div', {}, [h('p', { style: 'font-size:12px;color:var(--text-secondary);margin:0' }, [fmtDate(r.generated_at)])]),
        h('div', {}, [
          h('span', { class: 'badge badge-neutral', style: 'margin-right:6px' }, [r.source === 'ia_claude' ? 'IA (Claude)' : 'Heurística']),
          h('button', {
            class: 'btn btn-sm btn-danger', type: 'button',
            onClick: () => confirmModal('Excluir este relatório?', async () => {
              await api.del(`/api/matches/${match.id}/report/${r.id}`);
              loadHistory();
            }),
          }, ['Excluir']),
        ]),
      ]),
      h('p', {}, [r.summary_text]),
      r.highlights && r.highlights.length ? h('div', {}, [
        h('strong', { style: 'font-size:13px' }, ['Pontos fortes']),
        h('ul', { style: 'margin-top:4px' }, r.highlights.map((x) => h('li', { style: 'font-size:13px' }, [x]))),
      ]) : null,
      r.improvements && r.improvements.length ? h('div', {}, [
        h('strong', { style: 'font-size:13px' }, ['Pontos de atenção']),
        h('ul', { style: 'margin-top:4px' }, r.improvements.map((x) => h('li', { style: 'font-size:13px' }, [x]))),
      ]) : null,
    ]);
  }

  generateBtn.addEventListener('click', async () => {
    errorBox.textContent = '';
    generateBtn.disabled = true;
    generateBtn.textContent = 'Gerando...';
    try {
      const report = await api.post(`/api/matches/${match.id}/report`, { useAi: useAi.checked });
      if (useAi.checked && report.source !== 'ia_claude') {
        errorBox.textContent = 'IA generativa não configurada neste ambiente (ANTHROPIC_API_KEY ausente) — relatório gerado por heurística.';
      }
      await loadHistory();
    } catch (err) {
      errorBox.textContent = err.message;
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = 'Gerar relatório';
    }
  });

  box.appendChild(h('div', { class: 'form-actions', style: 'margin-top:14px' }, [
    h('button', { class: 'btn', type: 'button', onClick: () => backdrop.remove() }, ['Fechar']),
  ]));

  backdrop.appendChild(box);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  document.body.appendChild(backdrop);
  loadHistory();
}
