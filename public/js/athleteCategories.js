// Categorias de faixa etaria e sexo usadas no cadastro de atletas e nos
// resumos (dashboard). Faixas por ano ate Sub-12, depois por bienio (padrao
// usado nas categorias de base do tenis).
export const CATEGORY_OPTS = ['Sub-8', 'Sub-9', 'Sub-10', 'Sub-11', 'Sub-12', 'Sub-14', 'Sub-16', 'Sub-18', 'Adulto'];

export const GENDER_OPTS = [['masculino', 'Masculino'], ['feminino', 'Feminino']];
export const GENDER_LABEL = Object.fromEntries(GENDER_OPTS);
