-- Tennis Head Coach App - schema SQLite
-- Executado automaticamente na inicializacao do servidor (idempotente)

-- Papeis: 'head_coach' (acesso total), 'treinador' (visualiza planos de treino),
-- 'responsavel' (visualiza jogos e avaliacoes dos atletas vinculados)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('head_coach','treinador','responsavel')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS athletes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  birth_date TEXT,
  category TEXT,
  gender TEXT CHECK (gender IS NULL OR gender IN ('masculino', 'feminino')),
  dominant_hand TEXT,
  ranking_position INTEGER,
  club TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Vinculo entre contas 'responsavel' (aluno/pai/responsavel) e os atletas que podem visualizar
CREATE TABLE IF NOT EXISTS athlete_guardians (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  relationship TEXT,
  PRIMARY KEY (user_id, athlete_id)
);

-- Turmas: agrupam varios atletas para facilitar o planejamento em conjunto
-- Toda turma precisa informar um horario fixo (schedule_time) OU ser marcada
-- como aula avulsa (is_dropin = 1, sem horario recorrente)
CREATE TABLE IF NOT EXISTS athlete_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  schedule_time TEXT,
  schedule_slots TEXT,
  is_dropin INTEGER NOT NULL DEFAULT 0,
  head_coach_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ball_stage TEXT CHECK (ball_stage IS NULL OR ball_stage IN ('vermelha','laranja','verde','amarela')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS athlete_group_members (
  group_id INTEGER NOT NULL REFERENCES athlete_groups(id) ON DELETE CASCADE,
  athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, athlete_id)
);

-- Uma turma pode ter varios treinadores responsaveis (alem do head coach, opcional, unico)
CREATE TABLE IF NOT EXISTS athlete_group_trainers (
  group_id INTEGER NOT NULL REFERENCES athlete_groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

-- Foco da semana: define, por semana (segunda-feira de referencia), qual foco
-- (tecnico/fisico/tatico/mental) orienta o planejamento; restringe quais drills
-- podem ser selecionados nas sessoes daquela semana. Quando o foco e 'technical',
-- subcategory pode refinar para uma subdivisao especifica (serve/volley_smash/
-- forehand/backhand), igual a biblioteca de drills. Quando o foco e 'technical',
-- secondary_focus_category permite combinar com UM segundo foco (physical/
-- tactical/mental) na mesma semana -- fora desse caso fica sempre NULL.
CREATE TABLE IF NOT EXISTS weekly_focus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_start TEXT NOT NULL UNIQUE,
  focus_category TEXT NOT NULL CHECK (focus_category IN ('technical','physical','tactical','mental')),
  subcategory TEXT,
  secondary_focus_category TEXT CHECK (secondary_focus_category IS NULL OR secondary_focus_category IN ('physical','tactical','mental')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Biblioteca de drills: exercicios reutilizaveis, categorizados por foco.
-- Dentro do foco 'technical', o drill pode opcionalmente ter uma subdivisao
-- (serve/volley_smash/forehand/backhand) para organizar a biblioteca por golpe.
CREATE TABLE IF NOT EXISTS drills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  focus_category TEXT NOT NULL CHECK (focus_category IN ('technical','physical','tactical','mental')),
  subcategory TEXT,
  description TEXT,
  duration_minutes INTEGER,
  equipment TEXT,
  court_zone TEXT,
  kids_stage TEXT CHECK (kids_stage IS NULL OR kids_stage IN ('vermelha','laranja','verde')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS training_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  title TEXT NOT NULL,
  objective TEXT,
  focus_technical TEXT,
  focus_physical TEXT,
  focus_tactical TEXT,
  focus_mental TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'planejado',
  kids_stage TEXT CHECK (kids_stage IS NULL OR kids_stage IN ('vermelha','laranja','verde')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS training_session_athletes (
  session_id INTEGER NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  attendance TEXT DEFAULT 'previsto',
  PRIMARY KEY (session_id, athlete_id)
);

CREATE TABLE IF NOT EXISTS training_session_drills (
  session_id INTEGER NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  drill_id INTEGER NOT NULL REFERENCES drills(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, drill_id)
);

-- Avaliacao de desempenho, estruturada em 4 categorias (Tecnico/Tatico/Fisico/Mental)
-- seguindo o modelo de "4 performance factors" usado pela ITF/USTA Player Development,
-- com criterios granulares por categoria (nao apenas 1 nota generica por area) inspirados
-- em rubricas reais de avaliacao de academias e no Tactical Skills Questionnaire in Tennis.
-- Tecnico: 1 nota por golpe (forehand..smash). Tatico: antecipacao, tomada de decisao
-- (tactical_awareness), construcao de ponto, adaptacao. Fisico: movimentacao (footwork),
-- resistencia (physical_fitness), recuperacao entre pontos. Mental: foco (mental_focus),
-- controle emocional, resiliencia, competitividade, coachability.
CREATE TABLE IF NOT EXISTS evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  forehand REAL,
  backhand REAL,
  serve REAL,
  serve_variety REAL,
  forehand_slice REAL,
  backhand_slice REAL,
  return_shot REAL,
  volley REAL,
  smash REAL,
  tactical_awareness REAL,
  tactical_anticipation REAL,
  tactical_point_construction REAL,
  tactical_adaptability REAL,
  angle_creation REAL,
  court_zone_awareness REAL,
  footwork REAL,
  physical_fitness REAL,
  physical_recovery REAL,
  mental_focus REAL,
  mental_emotional_control REAL,
  mental_resilience REAL,
  mental_competitiveness REAL,
  mental_coachability REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Relatorio de IA para uma avaliacao de desempenho (heuristica sempre; texto
-- refinado por Claude quando ANTHROPIC_API_KEY estiver configurada), a partir
-- das notas reais ja lancadas. Uma avaliacao pode ter varias geracoes (historico).
CREATE TABLE IF NOT EXISTS evaluation_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluation_id INTEGER NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  summary_text TEXT NOT NULL,
  highlights_json TEXT NOT NULL,
  improvements_json TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'heuristica'
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  match_type TEXT NOT NULL CHECK (match_type IN ('torneio','treino','ranking')),
  tournament_name TEXT,
  opponent_name TEXT,
  opponent_athlete_id INTEGER REFERENCES athletes(id) ON DELETE SET NULL,
  result TEXT CHECK (result IN ('vitoria','derrota', NULL)),
  sets_score TEXT,
  aces INTEGER,
  double_faults INTEGER,
  first_serve_pct REAL,
  first_serve_points_won_pct REAL,
  second_serve_points_won_pct REAL,
  winners INTEGER,
  unforced_errors INTEGER,
  break_points_won INTEGER,
  break_points_faced INTEGER,
  net_points_won INTEGER,
  net_points_total INTEGER,
  rallies_up_to_4 INTEGER,
  rallies_over_4 INTEGER,
  match_format TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Relatorio pos-jogo gerado por IA (heuristica sempre; texto refinado por Claude
-- quando ANTHROPIC_API_KEY estiver configurada), a partir das estatisticas reais
-- ja registradas no scout do jogo. Um jogo pode ter varias geracoes (historico).
CREATE TABLE IF NOT EXISTS match_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  summary_text TEXT NOT NULL,
  highlights_json TEXT NOT NULL,
  improvements_json TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'heuristica'
);

CREATE TABLE IF NOT EXISTS stroke_video_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  stroke_type TEXT NOT NULL,
  video_filename TEXT,
  video_original_name TEXT,
  note TEXT,
  technique_score REAL,
  power_score REAL,
  consistency_score REAL,
  balance_score REAL,
  overall_score REAL,
  ai_comments TEXT,
  analysis_source TEXT NOT NULL DEFAULT 'simulado',
  serve_type TEXT,
  serve_confidence REAL,
  knee_flexion REAL,
  elbow_flexion REAL,
  shoulder_abduction REAL,
  shoulder_tilt REAL,
  impact_frame_index INTEGER,
  impact_timestamp_ms REAL,
  impact_confidence REAL,
  peak_velocity REAL,
  coil_dissociation REAL,
  coil_sufficient INTEGER,
  kinetic_efficiency_score REAL,
  injury_safety_score REAL,
  biomech_report_json TEXT,
  pose_landmarks_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Relatorio narrativo aprofundado (opcionalmente por IA) de uma analise de
-- video ja existente -- mesmo padrao de historico de match_reports acima,
-- so que a partir do biomech_report_json ja calculado, nao de estatisticas
-- de jogo.
CREATE TABLE IF NOT EXISTS video_biomech_narratives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_analysis_id INTEGER NOT NULL REFERENCES stroke_video_analyses(id) ON DELETE CASCADE,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  headline TEXT NOT NULL,
  executive_summary TEXT NOT NULL,
  kinetic_chain_audit_json TEXT NOT NULL,
  action_plan_json TEXT NOT NULL,
  coach_encouragement TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'heuristica'
);

-- athlete_id guarda o atleta principal (para planos individuais, o unico atleta;
-- para planos de grupo, o primeiro selecionado). A lista completa de atletas de
-- um plano de grupo fica em training_plan_athletes -- se essa tabela tiver
-- linhas para o plano, ele e um plano de grupo.
CREATE TABLE IF NOT EXISTS training_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  period_label TEXT,
  focus_areas_json TEXT NOT NULL,
  summary_text TEXT,
  source TEXT NOT NULL DEFAULT 'heuristica',
  snapshot_json TEXT
);

CREATE TABLE IF NOT EXISTS training_plan_athletes (
  plan_id INTEGER NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
  athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  PRIMARY KEY (plan_id, athlete_id)
);

-- Torneios previstos (planejados), separados dos jogos ja registrados no scout --
-- aqui e so a agenda: nome, local, periodo e quais atletas vao participar, para
-- alimentar o calendario/lembretes no painel.
CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  location TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tournament_athletes (
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  athlete_id INTEGER NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  PRIMARY KEY (tournament_id, athlete_id)
);

-- Base biomecanica de referencia: para cada golpe (forehand, backhand, saque...),
-- o head coach cadastra as fases do movimento e, dentro de cada fase, os
-- marcadores biomecanicos esperados (angulos-alvo, criticidade, indicador de
-- erro). Essa e a "regua" usada para comparar o video do aluno -- nao guarda
-- nenhum video de terceiros, so o conhecimento tecnico digitado/importado.
CREATE TABLE IF NOT EXISTS biomech_models (
  stroke_type TEXT PRIMARY KEY,
  model_version TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS biomech_phases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stroke_type TEXT NOT NULL REFERENCES biomech_models(stroke_type) ON DELETE CASCADE,
  phase_order INTEGER NOT NULL,
  phase_name TEXT NOT NULL,
  timeframe TEXT
);

CREATE TABLE IF NOT EXISTS biomech_markers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phase_id INTEGER NOT NULL REFERENCES biomech_phases(id) ON DELETE CASCADE,
  marker_order INTEGER NOT NULL,
  marker_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  target_range TEXT,
  criticality TEXT,
  fault_indicator TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_date ON training_sessions(date);
CREATE INDEX IF NOT EXISTS idx_evaluations_athlete_date ON evaluations(athlete_id, date);
CREATE INDEX IF NOT EXISTS idx_matches_athlete_date ON matches(athlete_id, date);
CREATE INDEX IF NOT EXISTS idx_video_athlete_date ON stroke_video_analyses(athlete_id, date);
CREATE INDEX IF NOT EXISTS idx_plans_athlete ON training_plans(athlete_id);
CREATE INDEX IF NOT EXISTS idx_guardians_athlete ON athlete_guardians(athlete_id);
CREATE INDEX IF NOT EXISTS idx_group_members_athlete ON athlete_group_members(athlete_id);
CREATE INDEX IF NOT EXISTS idx_drills_focus ON drills(focus_category);
CREATE INDEX IF NOT EXISTS idx_session_drills_drill ON training_session_drills(drill_id);
CREATE INDEX IF NOT EXISTS idx_plan_athletes_athlete ON training_plan_athletes(athlete_id);
CREATE INDEX IF NOT EXISTS idx_biomech_phases_stroke ON biomech_phases(stroke_type);
CREATE INDEX IF NOT EXISTS idx_biomech_markers_phase ON biomech_markers(phase_id);
