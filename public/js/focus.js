export const FOCUS_OPTS = [
  { value: 'technical', label: 'Técnico' },
  { value: 'physical', label: 'Físico' },
  { value: 'tactical', label: 'Tático' },
  { value: 'mental', label: 'Mental' },
];

export const FOCUS_LABEL = Object.fromEntries(FOCUS_OPTS.map((f) => [f.value, f.label]));

// Subdivisoes do foco tecnico, usadas tanto na biblioteca de drills quanto no foco da semana
export const TECHNICAL_SUBCATEGORY_OPTS = [
  { value: 'serve', label: 'Saque' },
  { value: 'volley_smash', label: 'Voleio/Smash' },
  { value: 'forehand', label: 'Forehand' },
  { value: 'backhand', label: 'Backhand/Slice' },
];

export const TECHNICAL_SUBCATEGORY_LABEL = Object.fromEntries(TECHNICAL_SUBCATEGORY_OPTS.map((s) => [s.value, s.label]));
