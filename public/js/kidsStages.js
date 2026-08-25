// Estagios do mini-tenis (metodologia ITF Play and Stay / Tenis 10), usados para marcar
// drills voltados a criancas iniciantes e para a aba de planejamento por estagio.
export const KIDS_STAGE_OPTS = [
  { value: 'vermelha', label: 'Bola vermelha' },
  { value: 'laranja', label: 'Bola laranja' },
  { value: 'verde', label: 'Bola verde' },
];

export const KIDS_STAGE_LABEL = Object.fromEntries(KIDS_STAGE_OPTS.map((s) => [s.value, s.label]));

// Classificacao de bola da turma: as 3 etapas do mini-tenis + "amarela" (bola
// padrao, turma adulta/juvenil sem restricao de mini-tenis). Usado no cadastro
// de turma para condicionar quais drills podem ser usados com aquela turma.
export const BALL_STAGE_OPTS = [
  ...KIDS_STAGE_OPTS,
  { value: 'amarela', label: 'Amarela / Adulto' },
];

export const BALL_STAGE_LABEL = Object.fromEntries(BALL_STAGE_OPTS.map((s) => [s.value, s.label]));

export const BALL_STAGE_EMOJI = { vermelha: '🔴', laranja: '🟠', verde: '🟢', amarela: '🟡' };

// Converte a classificacao de bola de uma turma no valor de kids_stage esperado
// pelos drills: as 3 etapas mapeiam direto, "amarela" (bola padrao) mapeia para
// null (drills sem marcacao de estagio, ou seja, biblioteca geral/adulta).
export function ballStageToKidsStage(ballStage) {
  return ballStage === 'amarela' ? null : ballStage;
}
