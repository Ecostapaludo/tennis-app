# CoachPro — App para Head Coach de Tênis

Aplicativo web para organizar treinos, avaliar desempenho, registrar scout de
jogos, analisar vídeos de golpes e gerar planos de treino individualizados com
apoio de IA.

## O que o app faz

- **Planejamento de treinos**: criação de sessões (planos de aula) com data,
  horário, objetivos e foco técnico/físico/tático/mental, com atletas
  vinculados.
- **Avaliações de desempenho**: notas de 0 a 10 por critério (forehand,
  backhand, saque, retorno, voleio, smash, footwork, físico, tática, mental),
  com histórico por atleta.
- **Scout de jogos**: lançamento de jogos de torneio, treino e ranking, com
  placar e estatísticas (aces, duplas faltas, % de 1º saque, winners, erros
  não forçados, break points, pontos de rede etc.).
- **Análise de vídeo de golpes**: upload de vídeo e geração de uma análise
  biomecânica com notas (técnica, potência, consistência, equilíbrio) — nesta
  versão a análise é **simulada** (ver seção "Sobre a IA" abaixo).
- **Relatórios e gráficos**: evolução das avaliações, radar de habilidades,
  desempenho em jogos e evolução da análise de vídeo, tudo comparando
  períodos.
- **Plano de treino com IA**: motor que cruza avaliações, jogos e análises de
  vídeo para sugerir focos individuais prioritários e treinos recomendados;
  opcionalmente pode ser refinado por um modelo de linguagem (Claude).
- **Perfis de acesso**: head coach (acesso total), treinador (visualiza
  apenas o planejamento de treinos) e responsável/aluno (visualiza apenas
  jogos e avaliações do(s) atleta(s) vinculado(s) a ele).

## Requisitos

- **Node.js 22.5 ou superior** (o app usa o módulo `node:sqlite`, nativo do
  Node, então **não é necessário instalar nenhum pacote externo** — nem
  banco de dados separado, nem `npm install`).
- Verifique sua versão com `node -v`. Se for menor que 22.5, atualize o Node
  (ex: via [nvm](https://github.com/nvm-sh/nvm): `nvm install 22`).

## Como rodar

```bash
# 1. entre na pasta do projeto
cd tennis-coach-app

# 2. (opcional, mas recomendado) popule o banco com dados de demonstração
npm run seed

# 3. inicie o servidor
npm start
```

Abra **http://localhost:3000** no navegador.

O banco de dados SQLite é criado automaticamente em `data/tennis_coach.db` na
primeira execução — não precisa instalar nem configurar nenhum banco externo.

### Contas de demonstração (criadas pelo `npm run seed`)

| Papel | Email | Senha | Acesso |
|---|---|---|---|
| Head Coach | coach@demo.com | coach123 | Total |
| Treinador | treinador@demo.com | treinador123 | Somente visualizar planejamento de treinos |
| Responsável | responsavel@demo.com | responsavel123 | Somente jogos e avaliações da atleta Luiza Andrade |

Você pode (e deve, em uso real) criar sua própria conta de head coach e
desativar/remover as contas de demonstração pela tela **Usuários**.

> Para criar a primeira conta de head coach manualmente (sem seed), rode:
> `node -e "import('./db/db.js').then(async()=>{const{hashPassword}=await import('./src/lib/auth.js');const db=(await import('./db/db.js')).default;const{hash,salt}=hashPassword('SUASENHA');db.prepare('INSERT INTO users (name,email,password_hash,password_salt,role) VALUES (?,?,?,?,?)').run('Seu Nome','seu@email.com',hash,salt,'head_coach');console.log('criado!')})"`

## Perfis de acesso (papéis)

- **Head coach**: acesso total — cadastra atletas, planeja treinos, lança
  avaliações, faz scout de jogos, sobe vídeos, gera relatórios, gera planos
  de treino com IA e gerencia usuários.
- **Treinador**: enxerga apenas a tela de **Planejamento de treinos** (planos
  de aula) e a lista de atletas, em modo leitura. Não vê avaliações, jogos,
  vídeos nem pode editar nada.
- **Responsável/aluno**: enxerga apenas **jogos realizados** e **avaliações**
  do(s) atleta(s) vinculado(s) à sua conta, em modo leitura. Um responsável
  pode ter mais de um atleta vinculado (ex: dois filhos).

Contas de treinador e responsável são criadas pelo head coach na tela
**Usuários** (a vinculação de um responsável a um ou mais atletas é feita no
mesmo formulário).

## Sobre a IA deste app

Duas partes do app usam "IA" com propósitos e limitações diferentes — vale
entender a diferença:

### 1. Análise de vídeo (biomecânica) — SIMULADA

A tela **Análise de vídeo** aceita o upload de um vídeo e devolve notas de
técnica/potência/consistência/equilíbrio com comentários. **Isso é uma
simulação** para que toda a interface, banco de dados e relatórios já
funcionem de ponta a ponta. Não há processamento real de visão computacional
rodando aqui.

O ponto de integração para conectar uma análise real está isolado em
`src/lib/videoAnalysis.js`, na função `analyzeStrokeVideo()`. Para ter uma
análise biomecânica de verdade, essa função precisa ser substituída por uma
chamada a um serviço de pose estimation (ex: MediaPipe, OpenPose) ou a uma
API de visão computacional especializada em esportes — mantendo o mesmo
formato de retorno (`techniqueScore`, `powerScore`, `consistencyScore`,
`balanceScore`, `aiComments`).

### 2. Plano de treino com IA — heurística real + IA generativa opcional

A tela **Plano de treino com IA** sempre calcula um plano de verdade (não
simulado) a partir dos dados reais do atleta: menores notas nas últimas
avaliações, estatísticas das últimas partidas (erros não forçados, % de 1º
saque) e notas das análises de vídeo. Esse cálculo (heurística) roda 100%
localmente, sem depender de nenhum serviço externo.

Opcionalmente, se você configurar a variável de ambiente
`ANTHROPIC_API_KEY` (veja `.env.example`), o resumo do plano é reescrito por
um modelo Claude para ficar mais claro e natural — mas os números e focos
prioritários vêm sempre dos dados reais, nunca inventados pelo modelo.

Para habilitar: copie `.env.example` para `.env` e preencha
`ANTHROPIC_API_KEY=sua-chave-aqui`, depois reinicie o servidor.

## Estrutura do projeto

```
tennis-coach-app/
  server.js              servidor HTTP (zero dependencias externas)
  db/
    schema.sql            estrutura do banco (SQLite)
    db.js                  conexao + migração automática
    seed.js                dados de demonstração
  src/
    lib/                   autenticação, permissões, motor de IA, upload
    routes/                rotas da API REST
  public/                  frontend (HTML/CSS/JS puro, sem build step)
  data/                    banco SQLite (criado automaticamente)
  uploads/                 vídeos enviados na análise de golpes
```

## Por que não usa React/Next/Prisma?

Este projeto foi construído propositalmente **sem nenhuma dependência
externa** (nem no backend, nem no frontend) — usando apenas recursos nativos
do Node.js (`node:http`, `node:sqlite`, `node:crypto`) e JavaScript puro no
navegador. Isso significa: zero `npm install`, zero risco de conflito de
versões, roda em qualquer máquina com Node 22.5+, e fica fácil de auditar ou
estender. Se preferir migrar para um framework (Next.js, Express, Prisma
etc.) no futuro, a separação entre `db/`, `src/routes/` e `public/` já deixa
isso relativamente direto.

## Backup dos dados

Todo o banco de dados vive em um único arquivo: `data/tennis_coach.db`. Para
fazer backup, basta copiar esse arquivo (com o servidor parado, para
garantir consistência). Os vídeos enviados ficam em `uploads/`.
