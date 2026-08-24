// Estagios do mini-tenis (metodologia ITF Play and Stay / Tenis 10), usados para marcar
// drills voltados a criancas iniciantes e para a aba de planejamento por estagio.
export const KIDS_STAGE_OPTS = [
  { value: 'vermelha', label: 'Bola vermelha' },
  { value: 'laranja', label: 'Bola laranja' },
  { value: 'verde', label: 'Bola verde' },
];

export const KIDS_STAGE_LABEL = Object.fromEntries(KIDS_STAGE_OPTS.map((s) => [s.value, s.label]));
