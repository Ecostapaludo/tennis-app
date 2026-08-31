// Modalidade esportiva do app: hoje o conteudo (drills, criterios) e todo de
// tenis, mas a estrutura ja suporta um segundo modulo (beach tennis) --
// turma/atleta/drill ficam marcados com a modalidade, e o treinador so
// consegue montar planos de aula dentro da modalidade em que foi cadastrado.
export const MODALITY_OPTS = [
  { value: 'tenis', label: 'Tênis' },
  { value: 'beach_tennis', label: 'Beach Tennis' },
];

export const MODALITY_LABEL = Object.fromEntries(MODALITY_OPTS.map((m) => [m.value, m.label]));
