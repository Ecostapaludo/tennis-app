import { h, clear, fmtDate, scoreClass, confirmModal } from '../dom.js';
import { api } from '../api.js';
import { poseSkeletonSVG } from '../components/poseSkeleton.js';
import { drawBiomechanicalOverlay, normalizeLandmarksTo01 } from '../components/canvasOverlay.js';

const IMPACT_FPS = 60; // mesmo valor usado na simulacao do backend (videoAnalysis.js)

const STROKES = [['forehand', 'Forehand'], ['backhand', 'Backhand'], ['serve', 'Saque'], ['volley', 'Voleio'], ['smash', 'Smash']];
const STROKE_LABEL = Object.fromEntries(STROKES);
const SERVE_TYPE_LABEL = { FLAT: 'Flat', SLICE: 'Slice', KICK: 'Kick' };

export async function renderVideo(main, ctx) {
  const athletes = await api.get('/api/athletes');
  clear(main);

  main.appendChild(h('div', { class: 'page-header' }, [
    h('div', {}, [h('h1', {}, ['Análise de vídeo']), h('p', {}, ['Upload de vídeo de golpe e análise biomecânica.'])]),
    h('a', { class: 'btn btn-sm', href: '#/biomech' }, ['📐 Base biomecânica']),
  ]));

  main.appendChild(h('div', { class: 'notice-banner' }, [
    '⚠️ A análise abaixo é SIMULADA para fins de demonstração deste MVP — as notas e comentários não vêm de um ',
    'processamento real de visão computacional. O ponto de integração para conectar um serviço real de análise ',
    'de vídeo (pose estimation) já está pronto em src/lib/videoAnalysis.js no backend.',
  ]));

  if (!athletes.length) {
    main.appendChild(h('div', { class: 'card' }, [h('div', { class: 'empty-state' }, ['Cadastre um atleta primeiro.'])]));
    return;
  }

  const athleteSelect = h('select', {}, athletes.map((a) => h('option', { value: a.id }, [a.name])));
  const strokeSelect = h('select', {}, STROKES.map(([v, l]) => h('option', { value: v }, [l])));
  const dateInput = h('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
  const fileInput = h('input', { type: 'file', accept: 'video/*' });
  const noteInput = h('textarea', { placeholder: 'Observações sobre o vídeo (opcional)' });
  const errorBox = h('div', { class: 'error-msg' });
  const submitBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, ['Enviar e analisar']);

  const resultWrap = h('div');

  const form = h('form', {
    onSubmit: async (e) => {
      e.preventDefault();
      errorBox.textContent = '';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Analisando...';
      try {
        const fd = new FormData();
        fd.append('athleteId', athleteSelect.value);
        fd.append('strokeType', strokeSelect.value);
        fd.append('date', dateInput.value);
        fd.append('note', noteInput.value || '');
        if (fileInput.files[0]) fd.append('video', fileInput.files[0]);
        const analysis = await api.upload('/api/video-analyses', fd);
        renderResult(resultWrap, analysis, strokeSelect.options[strokeSelect.selectedIndex].text, athleteSelect.options[athleteSelect.selectedIndex].text);
        fileInput.value = '';
        await loadHistory();
      } catch (err) {
        errorBox.textContent = err.message;
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar e analisar';
      }
    },
  }, [
    h('div', { class: 'form-grid' }, [
      h('div', { class: 'form-field' }, [h('label', {}, ['Atleta']), athleteSelect]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Golpe']), strokeSelect]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Data']), dateInput]),
      h('div', { class: 'form-field' }, [h('label', {}, ['Vídeo (opcional neste MVP)']), fileInput]),
      h('div', { class: 'form-field span-2' }, [h('label', {}, ['Notas']), noteInput]),
    ]),
    errorBox,
    h('div', { class: 'form-actions' }, [submitBtn]),
  ]);

  main.appendChild(h('div', { class: 'card' }, [h('h3', {}, ['Novo upload']), form]));
  main.appendChild(resultWrap);

  const history = h('div', { class: 'card' }, [h('h3', {}, ['Histórico de análises'])]);
  const historyList = h('div');
  history.appendChild(historyList);
  main.appendChild(history);

  async function loadHistory() {
    const items = await api.get(`/api/video-analyses?athleteId=${athleteSelect.value}`);
    clear(historyList);
    if (!items.length) { historyList.appendChild(h('div', { class: 'empty-state' }, ['Sem análises para este atleta.'])); return; }
    const athleteName = athleteSelect.options[athleteSelect.selectedIndex]?.text || 'Atleta';
    const table = h('table', {}, [
      h('thead', {}, [h('tr', {}, [h('th', {}, ['Data']), h('th', {}, ['Golpe']), h('th', {}, ['Tipo de saque']), h('th', {}, ['Técnica']), h('th', {}, ['Potência']), h('th', {}, ['Consistência']), h('th', {}, ['Equilíbrio']), h('th', {}, ['Geral']), h('th', {}, [''])])]),
      h('tbody', {}, items.slice().reverse().map((v) => h('tr', {}, [
        h('td', {}, [fmtDate(v.date)]), h('td', {}, [v.stroke_type]),
        h('td', {}, [v.serve_type ? `${SERVE_TYPE_LABEL[v.serve_type] || v.serve_type} (${Math.round(v.serve_confidence * 100)}%)` : '-']),
        h('td', {}, [pill(v.technique_score)]), h('td', {}, [pill(v.power_score)]),
        h('td', {}, [pill(v.consistency_score)]), h('td', {}, [pill(v.balance_score)]),
        h('td', {}, [pill(v.overall_score)]),
        h('td', {}, [h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, [
          v.biomech_report ? h('button', {
            class: 'btn btn-sm', type: 'button',
            onClick: () => openBiomechNarrativeModal(v.id, athleteName, STROKE_LABEL[v.stroke_type] || v.stroke_type),
          }, ['🧠 Relatório IA']) : null,
          h('button', {
            class: 'btn btn-sm btn-danger', type: 'button',
            onClick: () => confirmModal('Excluir este relatório de análise de vídeo?', async () => {
              await api.del(`/api/video-analyses/${v.id}`);
              await loadHistory();
            }),
          }, ['Excluir']),
        ])]),
      ]))),
    ]);
    historyList.appendChild(table);
  }
  athleteSelect.addEventListener('change', loadHistory);
  await loadHistory();
}

function pill(v) {
  return h('span', { class: `score-pill ${scoreClass(v)}` }, [v ?? '-']);
}

function renderResult(wrap, analysis, strokeLabel, athleteName) {
  clear(wrap);
  wrap.appendChild(h('div', { class: 'card' }, [
    h('div', { class: 'page-header', style: 'margin-bottom:0' }, [
      h('h3', {}, [`Resultado da análise — ${strokeLabel}`]),
      analysis.biomechReport ? h('button', {
        class: 'btn btn-sm', type: 'button',
        onClick: () => openBiomechNarrativeModal(analysis.id, athleteName, strokeLabel),
      }, ['🧠 Relatório IA aprofundado']) : null,
    ]),
    analysis.poseLandmarks ? buildVideoPlayerBlock(analysis) : null,
    (analysis.serveType || analysis.impactFrameIndex != null) ? h('p', { style: 'margin:-6px 0 10px;display:flex;gap:6px;flex-wrap:wrap' }, [
      analysis.serveType ? h('span', { class: 'badge badge-torneio' }, [
        `Tipo de saque: ${SERVE_TYPE_LABEL[analysis.serveType] || analysis.serveType} (confiança ${Math.round(analysis.serveConfidence * 100)}%)`,
      ]) : null,
      analysis.impactFrameIndex != null ? h('span', { class: 'badge badge-ranking' }, [
        `Impacto: quadro ${analysis.impactFrameIndex} (t=${analysis.impactTimestampMs}ms) · confiança ${Math.round(analysis.impactConfidence * 100)}%`,
      ]) : null,
    ]) : null,
    h('div', { class: 'grid grid-4', style: 'margin:12px 0' }, [
      scoreBlock('Técnica', analysis.techniqueScore),
      scoreBlock('Potência', analysis.powerScore),
      scoreBlock('Consistência', analysis.consistencyScore),
      scoreBlock('Equilíbrio', analysis.balanceScore),
    ]),
    analysis.kneeFlexion != null ? h('div', { class: 'grid grid-2', style: 'margin-bottom:12px;align-items:start' }, [
      analysis.poseLandmarks ? h('div', { style: 'max-width:260px' }, [
        h('div', { style: 'font-size:12px;color:var(--text-secondary);margin:0 0 6px' }, ['Esqueleto (frame analisado)']),
        h('div', { html: poseSkeletonSVG(analysis.poseLandmarks, buildAngleAnnotations(analysis)) }),
      ]) : null,
      h('div', {}, [
        h('p', { style: 'font-size:12px;color:var(--text-secondary);margin:0 0 6px' }, ['Ângulos articulares (frame analisado)']),
        h('div', { class: 'grid grid-4' }, [
          angleBlock('Joelho', analysis.kneeFlexion),
          angleBlock('Cotovelo', analysis.elbowFlexion),
          angleBlock('Abdução ombro', analysis.shoulderAbduction),
          angleBlock('Inclinação ombros', analysis.shoulderTilt),
          analysis.coilDissociation != null ? h('div', {}, [
            h('div', { style: 'font-size:12px;color:var(--text-secondary)' }, ['Coil (X-Factor)']),
            h('span', { class: `score-pill ${analysis.coilSufficient ? 'score-high' : 'score-low'}` }, [`${analysis.coilDissociation}°`]),
          ]) : null,
        ]),
      ]),
    ]) : null,
    analysis.biomechReport ? buildBiomechReportBlock(analysis.biomechReport) : null,
    h('p', { class: 'video-note' }, [analysis.aiComments]),
  ]));
}

const SEVERITY_LABEL = { CRITICAL_FAULT: 'Falha crítica', MINOR_DEVIATION: 'Desvio leve', OPTIMAL: 'Ótimo' };
const SEVERITY_BADGE = { CRITICAL_FAULT: 'badge-critical', MINOR_DEVIATION: 'badge-warning', OPTIMAL: 'badge-low' };

function buildBiomechReportBlock(report) {
  const wrap = h('div', { class: 'card', style: 'background:var(--surface-2);margin-bottom:12px' }, [
    h('h4', { style: 'margin-bottom:8px' }, ['Diagnóstico biomecânico (causa-raiz)']),
    h('div', { style: 'display:flex;gap:16px;margin-bottom:10px' }, [
      percentScoreBlock('Eficiência cinética', report.overallKineticEfficiencyScore),
      percentScoreBlock('Segurança articular', report.injurySafetyScore),
    ]),
    h('p', { style: 'font-size:13.5px;margin:0 0 10px' }, [report.summaryFeedback]),
  ]);

  report.diagnoses.forEach((diag) => {
    wrap.appendChild(h('div', { class: 'card', style: 'margin-bottom:8px;padding:12px' }, [
      h('div', { class: 'page-header', style: 'margin-bottom:4px' }, [
        h('strong', { style: 'font-size:13.5px' }, [diag.title]),
        h('span', { class: `badge ${SEVERITY_BADGE[diag.severity] || 'badge-neutral'}` }, [SEVERITY_LABEL[diag.severity] || diag.severity]),
      ]),
      h('p', { style: 'font-size:13px;margin:0 0 4px' }, [h('strong', {}, ['Causa-raiz: ']), diag.rootCauseDescription]),
      h('p', { style: 'font-size:13px;margin:0 0 4px' }, [h('strong', {}, ['Impacto: ']), diag.biomechanicalImpact]),
      diag.injuryRiskAssessment ? h('p', { style: 'font-size:13px;margin:0 0 6px;color:var(--status-critical)' }, [
        h('strong', {}, ['Risco de lesão: ']), diag.injuryRiskAssessment,
      ]) : null,
      diag.correctiveDrills && diag.correctiveDrills.length ? h('div', {}, [
        h('strong', { style: 'font-size:12.5px' }, ['Drills corretivos']),
        h('ul', { style: 'margin-top:4px' }, diag.correctiveDrills.map((d) => h('li', { style: 'font-size:13px;margin-bottom:4px' }, [
          h('strong', {}, [d.drillName]), ` — ${d.objective} `,
          h('em', {}, [`"${d.focusCue}"`]),
        ]))),
      ]) : null,
    ]));
  });

  return wrap;
}

function percentScoreBlock(label, val) {
  return h('div', {}, [
    h('div', { style: 'font-size:12px;color:var(--text-secondary)' }, [label]),
    h('span', { class: `score-pill ${scoreClass(val / 10)}` }, [`${val}/100`]),
  ]);
}
function scoreBlock(label, val) {
  return h('div', {}, [
    h('div', { style: 'font-size:12px;color:var(--text-secondary)' }, [label]),
    h('span', { class: `score-pill ${scoreClass(val)}` }, [val]),
  ]);
}
function angleBlock(label, val) {
  return h('div', {}, [
    h('div', { style: 'font-size:12px;color:var(--text-secondary)' }, [label]),
    h('span', { class: 'score-pill score-mid' }, [`${val}°`]),
  ]);
}

// ---------------------------------------------------------------------------
// Relatorio narrativo aprofundado com IA -- heuristica sempre calculada a
// partir do diagnostico biomecanico real ja gerado (biomechReport); refino
// opcional por Claude, mesmo padrao dos relatorios de jogo/avaliacao.
// ---------------------------------------------------------------------------

function openBiomechNarrativeModal(videoAnalysisId, athleteName, strokeLabel) {
  const backdrop = h('div', { class: 'modal-backdrop' });
  const box = h('div', { class: 'modal-box', style: 'width:680px' });
  box.appendChild(h('h2', {}, ['Relatório biomecânico aprofundado']));
  box.appendChild(h('p', { style: 'margin-top:-6px;font-size:13px;color:var(--text-secondary)' }, [
    `${athleteName} · ${strokeLabel}`,
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
    const narratives = await api.get(`/api/video-analyses/${videoAnalysisId}/biomech-narrative`);
    clear(historyWrap);
    if (!narratives.length) {
      historyWrap.appendChild(h('p', { style: 'font-size:13px;color:var(--text-muted)' }, ['Nenhum relatório gerado ainda para esta análise.']));
      return;
    }
    narratives.forEach((n) => historyWrap.appendChild(buildNarrativeCard(n)));
  }

  function buildNarrativeCard(n) {
    return h('div', { class: 'card', style: 'margin-top:10px' }, [
      h('div', { class: 'page-header', style: 'margin-bottom:6px' }, [
        h('div', {}, [h('p', { style: 'font-size:12px;color:var(--text-secondary);margin:0' }, [fmtDate(n.generatedAt)])]),
        h('div', {}, [
          h('span', { class: 'badge badge-neutral', style: 'margin-right:6px' }, [n.source === 'ia_claude' ? 'IA (Claude)' : 'Heurística']),
          h('button', {
            class: 'btn btn-sm btn-danger', type: 'button',
            onClick: () => confirmModal('Excluir este relatório?', async () => {
              await api.del(`/api/video-analyses/${videoAnalysisId}/biomech-narrative/${n.id}`);
              loadHistory();
            }),
          }, ['Excluir']),
        ]),
      ]),
      h('h4', { style: 'margin-bottom:2px' }, [n.headline]),
      h('p', { style: 'font-size:13px' }, [n.executiveSummary]),
      n.kineticChainAudit && n.kineticChainAudit.length ? h('div', { style: 'margin-bottom:8px' }, [
        h('strong', { style: 'font-size:12.5px' }, ['Auditoria da cadeia cinética']),
        h('ul', { style: 'margin-top:4px' }, n.kineticChainAudit.map((k) => h('li', { style: 'font-size:13px;margin-bottom:2px' }, [
          h('strong', {}, [`${k.segment}: `]), k.finding,
        ]))),
      ]) : null,
      n.actionPlan && n.actionPlan.length ? h('div', {}, [
        h('strong', { style: 'font-size:12.5px' }, ['Plano de ação']),
        h('ol', { style: 'margin-top:4px' }, n.actionPlan.map((a) => h('li', { style: 'font-size:13px;margin-bottom:4px' }, [
          h('strong', {}, [a.drillName]), ` — ${a.objective} `, h('em', {}, [`"${a.motorCue}"`]),
          a.dosage ? ` (${a.dosage})` : null,
        ]))),
      ]) : null,
      n.coachEncouragement ? h('p', { style: 'font-size:13px;font-style:italic;margin-top:8px' }, [n.coachEncouragement]) : null,
    ]);
  }

  generateBtn.addEventListener('click', async () => {
    errorBox.textContent = '';
    generateBtn.disabled = true;
    generateBtn.textContent = 'Gerando...';
    try {
      const narrative = await api.post(`/api/video-analyses/${videoAnalysisId}/biomech-narrative`, { useAi: useAi.checked });
      if (useAi.checked && narrative.source !== 'ia_claude') {
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

// Indices do MediaPipe Pose usados na anotacao de angulos do lado dominante
// (hoje sempre 'RIGHT' na simulacao -- ver poseAngles.js/videoAnalysis.js).
const MP_IDX = { RIGHT_SHOULDER: 12, RIGHT_ELBOW: 14, RIGHT_WRIST: 16, RIGHT_HIP: 24, RIGHT_KNEE: 26, RIGHT_ANKLE: 28 };

// Colore a anotacao de CRITICAL quando o diagnostico biomecanico real
// menciona aquela articulacao na causa-raiz (evita inventar limiares novos
// so para a cor do desenho -- reaproveita o mesmo diagnostico ja mostrado
// no card "Diagnóstico biomecânico" abaixo).
function jointStatus(label, biomechReport) {
  const keyword = label.toLowerCase().split(' ')[0];
  const hit = (biomechReport?.diagnoses || []).some((d) => (d.rootCauseDescription || '').toLowerCase().includes(keyword));
  return hit ? 'CRITICAL' : 'OPTIMAL';
}

function buildAngleAnnotations(analysis) {
  return [
    { vertexIndex: MP_IDX.RIGHT_KNEE, p1Index: MP_IDX.RIGHT_HIP, p2Index: MP_IDX.RIGHT_ANKLE, angleValue: analysis.kneeFlexion, label: 'Joelho', status: jointStatus('joelho', analysis.biomechReport) },
    { vertexIndex: MP_IDX.RIGHT_ELBOW, p1Index: MP_IDX.RIGHT_SHOULDER, p2Index: MP_IDX.RIGHT_WRIST, angleValue: analysis.elbowFlexion, label: 'Cotovelo', status: jointStatus('cotovelo', analysis.biomechReport) },
    { vertexIndex: MP_IDX.RIGHT_SHOULDER, p1Index: MP_IDX.RIGHT_HIP, p2Index: MP_IDX.RIGHT_ELBOW, angleValue: analysis.shoulderAbduction, label: 'Ombro', status: jointStatus('ombro', analysis.biomechReport) },
  ];
}

// ---------------------------------------------------------------------------
// Player de video com overlay de canvas (esqueleto + arcos/badges de angulo)
// -- reimplementacao em JS puro (sem React/build step, ver canvasOverlay.js)
// do componente fornecido pelo head coach (gemini-code-1787498949894.ts).
//
// Como so temos UM instantaneo simulado de angulos (nao uma serie por
// quadro), o overlay so e desenhado quando o video esta PAUSADO -- durante a
// reproducao o canvas fica limpo, para nao passar a falsa impressao de
// rastreamento continuo em tempo real que os dados nao sustentam.
// ---------------------------------------------------------------------------

function buildVideoPlayerBlock(analysis) {
  const wrap = h('div', { class: 'card', style: 'margin-bottom:12px' });
  wrap.appendChild(h('p', { style: 'font-size:12px;color:var(--text-secondary);margin:0 0 8px' }, [
    'Vídeo enviado, com o esqueleto anotado sobreposto enquanto pausado.',
  ]));

  const container = h('div', { style: 'position:relative;width:100%;max-width:480px;aspect-ratio:16/9;background:#000;border-radius:8px;overflow:hidden' });
  const videoEl = h('video', {
    src: `/api/video-analyses/${analysis.id}/file`, muted: true, playsInline: true,
    style: 'width:100%;height:100%;object-fit:contain;display:block',
  });
  const canvas = h('canvas', { style: 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none' });
  container.appendChild(videoEl);
  container.appendChild(canvas);

  const normalizedLandmarks = normalizeLandmarksTo01(analysis.poseLandmarks);
  const angleAnnotations = buildAngleAnnotations(analysis);

  function drawOverlay() {
    const w = canvas.clientWidth || 480;
    const hgt = canvas.clientHeight || 270;
    canvas.width = w;
    canvas.height = hgt;
    drawBiomechanicalOverlay(canvas.getContext('2d'), w, hgt, normalizedLandmarks, angleAnnotations);
  }
  function clearOverlay() {
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }

  videoEl.addEventListener('error', () => wrap.remove()); // nenhum video foi enviado nesta analise
  videoEl.addEventListener('loadedmetadata', drawOverlay);
  videoEl.addEventListener('play', clearOverlay);
  videoEl.addEventListener('pause', drawOverlay);
  videoEl.addEventListener('seeked', () => { if (videoEl.paused) drawOverlay(); });

  const playBtn = h('button', { class: 'btn btn-sm', type: 'button' }, ['Reproduzir']);
  playBtn.addEventListener('click', () => { if (videoEl.paused) videoEl.play(); else videoEl.pause(); });
  videoEl.addEventListener('play', () => { playBtn.textContent = 'Pausar'; });
  videoEl.addEventListener('pause', () => { playBtn.textContent = 'Reproduzir'; });

  const frameLabel = h('span', { style: 'font-family:monospace;font-size:12px;color:var(--text-secondary)' }, ['Frame: 0']);
  function updateFrameLabel() {
    const frame = Math.floor(videoEl.currentTime * IMPACT_FPS);
    const isImpact = analysis.impactFrameIndex != null && frame === analysis.impactFrameIndex;
    frameLabel.textContent = `Frame: ${frame}${isImpact ? ' (IMPACTO)' : ''}`;
  }
  videoEl.addEventListener('timeupdate', updateFrameLabel);
  videoEl.addEventListener('seeked', updateFrameLabel);

  const impactBtn = analysis.impactFrameIndex != null ? h('button', {
    class: 'btn btn-sm btn-danger', type: 'button',
    onClick: () => {
      if (!isFinite(videoEl.duration)) return;
      videoEl.currentTime = Math.min(analysis.impactFrameIndex / IMPACT_FPS, Math.max(0, videoEl.duration - 0.05));
      videoEl.pause();
    },
  }, ['Ir para Impacto (t₀)']) : null;

  wrap.appendChild(container);
  wrap.appendChild(h('div', { style: 'display:flex;align-items:center;gap:8px;margin-top:8px' }, [playBtn, impactBtn, frameLabel]));
  return wrap;
}
