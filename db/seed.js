// Popula o banco com dados de demonstracao. Rode com: npm run seed
import db from './db.js';
import { hashPassword } from '../src/lib/auth.js';

function upsertUser(name, email, password, role) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return existing.id;
  const { hash, salt } = hashPassword(password);
  const info = db.prepare(
    'INSERT INTO users (name, email, password_hash, password_salt, role) VALUES (?, ?, ?, ?, ?)'
  ).run(name, email, hash, salt, role);
  return Number(info.lastInsertRowid);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

console.log('Criando usuarios de demonstracao...');
const coachId = upsertUser('Head Coach (demo)', 'coach@demo.com', 'coach123', 'head_coach');
const assistantId = upsertUser('Treinador Assistente (demo)', 'treinador@demo.com', 'treinador123', 'treinador');

const athletesData = [
  { name: 'Luiza Andrade', category: 'Sub-16', dominantHand: 'Destra', ranking: 42, club: 'Clube Atletico Central' },
  { name: 'Pedro Nakamura', category: 'Sub-18', dominantHand: 'Destro', ranking: 18, club: 'Clube Atletico Central' },
  { name: 'Beatriz Lima', category: 'Adulto', dominantHand: 'Canhota', ranking: 65, club: 'Arena Tenis Clube' },
];

console.log('Criando atletas de demonstracao...');
const athleteIds = athletesData.map((a) => {
  const existing = db.prepare('SELECT id FROM athletes WHERE name = ?').get(a.name);
  if (existing) return existing.id;
  const info = db.prepare(
    `INSERT INTO athletes (created_by, name, category, dominant_hand, ranking_position, club)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(coachId, a.name, a.category, a.dominantHand, a.ranking, a.club);
  return Number(info.lastInsertRowid);
});

console.log('Vinculando conta de responsavel...');
const guardianId = upsertUser('Responsavel da Luiza (demo)', 'responsavel@demo.com', 'responsavel123', 'responsavel');
db.prepare('INSERT OR IGNORE INTO athlete_guardians (user_id, athlete_id, relationship) VALUES (?, ?, ?)')
  .run(guardianId, athleteIds[0], 'Mae/Pai');

console.log('Criando sessoes de treino...');
const sessionsCount = db.prepare('SELECT COUNT(*) c FROM training_sessions').get().c;
if (sessionsCount === 0) {
  const sessions = [
    { date: daysAgo(-2), title: 'Treino tecnico - forehand e backhand', focusTechnical: 'Consistencia de fundo de quadra', status: 'planejado' },
    { date: daysAgo(-5), title: 'Treino de saque e devolucao', focusTechnical: 'Precisao de saque por alvo', status: 'planejado' },
    { date: daysAgo(3), title: 'Treino fisico + tatico', focusPhysical: 'Resistencia especifica', focusTactical: 'Padroes de jogo cross-court', status: 'realizado' },
  ];
  sessions.forEach((s) => {
    const info = db.prepare(
      `INSERT INTO training_sessions (created_by, date, title, objective, focus_technical, focus_physical, focus_tactical, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(coachId, s.date, s.title, 'Evoluir consistencia e reduzir erros nao forcados', s.focusTechnical || null, s.focusPhysical || null, s.focusTactical || null, s.status);
    const sid = Number(info.lastInsertRowid);
    athleteIds.forEach((aid) => db.prepare('INSERT INTO training_session_athletes (session_id, athlete_id) VALUES (?, ?)').run(sid, aid));
  });
}

console.log('Criando avaliacoes de desempenho...');
const evalCount = db.prepare('SELECT COUNT(*) c FROM evaluations').get().c;
if (evalCount === 0) {
  const r1 = (v) => Math.round(Math.min(9.5, v) * 10) / 10;
  athleteIds.forEach((aid, idx) => {
    for (let i = 0; i < 3; i++) {
      const base = 5.5 + idx * 0.5 + i * 0.6;
      db.prepare(
        `INSERT INTO evaluations (athlete_id, date, forehand, backhand, serve, return_shot, volley, smash,
          tactical_awareness, tactical_anticipation, tactical_point_construction, tactical_adaptability,
          footwork, physical_fitness, physical_recovery,
          mental_focus, mental_emotional_control, mental_resilience, mental_competitiveness, mental_coachability,
          notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        aid, daysAgo(90 - i * 30),
        r1(base + 0.5), r1(base), r1(base - 0.8), r1(base - 0.3),
        r1(base - 1.2), r1(base - 0.6),
        r1(base + 0.1), r1(base - 0.2), r1(base + 0.3), r1(base - 0.5),
        r1(base + 0.2), r1(base + 0.3), r1(base - 0.6),
        r1(base + 0.1), r1(base - 0.3), r1(base + 0.4), r1(base + 0.6), r1(base + 0.2),
        'Avaliacao periodica de desempenho.'
      );
    }
  });
}

console.log('Criando jogos (scout)...');
const matchCount = db.prepare('SELECT COUNT(*) c FROM matches').get().c;
if (matchCount === 0) {
  const types = ['torneio', 'treino', 'ranking'];
  athleteIds.forEach((aid, idx) => {
    for (let i = 0; i < 4; i++) {
      const win = (i + idx) % 2 === 0;
      db.prepare(
        `INSERT INTO matches (athlete_id, date, match_type, tournament_name, opponent_name, result, sets_score,
          aces, double_faults, first_serve_pct, first_serve_points_won_pct, second_serve_points_won_pct,
          winners, unforced_errors, break_points_won, break_points_faced, net_points_won, net_points_total, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        aid, daysAgo(60 - i * 15), types[i % types.length],
        types[i % types.length] === 'torneio' ? 'Copa Regional de Tenis' : null,
        `Adversario ${i + 1}`, win ? 'vitoria' : 'derrota', win ? '6-4, 6-3' : '4-6, 6-7',
        4 + i, 2 + (i % 3), 58 + i, 65 + i, 48 + i, 18 + i, 22 - i, 3, 5, 6, 10,
        'Jogo registrado via scout do app.'
      );
    }
  });
}

console.log('Criando analises de video (simuladas)...');
const videoCount = db.prepare('SELECT COUNT(*) c FROM stroke_video_analyses').get().c;
if (videoCount === 0) {
  const strokes = ['forehand', 'backhand', 'serve'];
  athleteIds.forEach((aid) => {
    strokes.forEach((stroke, i) => {
      db.prepare(
        `INSERT INTO stroke_video_analyses (athlete_id, date, stroke_type, note, technique_score, power_score,
          consistency_score, balance_score, overall_score, ai_comments, analysis_source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        aid, daysAgo(20 - i * 5), stroke, 'Video de demonstracao (sem arquivo real).',
        7.2, 6.8, 7.5, 7.0, 7.1,
        `Analise simulada de ${stroke}: dados de exemplo para demonstracao do relatorio.`,
        'simulado'
      );
    });
  });
}

console.log('\nSeed concluido!');
console.log('Login head coach:   coach@demo.com / coach123');
console.log('Login treinador:    treinador@demo.com / treinador123');
console.log('Login responsavel:  responsavel@demo.com / responsavel123 (ve apenas a atleta Luiza Andrade)');
