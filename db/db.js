import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'tennis_coach.db');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON;');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

// Migracao leve: adiciona colunas novas em tabelas ja existentes (CREATE TABLE IF NOT EXISTS
// nao altera tabelas que ja existem de uma instalacao anterior)
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
ensureColumn('drills', 'subcategory', 'TEXT');
ensureColumn('weekly_focus', 'subcategory', 'TEXT');
ensureColumn('weekly_focus', 'secondary_focus_category', 'TEXT');
ensureColumn('evaluations', 'tactical_anticipation', 'REAL');
ensureColumn('evaluations', 'tactical_point_construction', 'REAL');
ensureColumn('evaluations', 'tactical_adaptability', 'REAL');
ensureColumn('evaluations', 'physical_recovery', 'REAL');
ensureColumn('evaluations', 'mental_emotional_control', 'REAL');
ensureColumn('evaluations', 'mental_resilience', 'REAL');
ensureColumn('evaluations', 'mental_competitiveness', 'REAL');
ensureColumn('evaluations', 'mental_coachability', 'REAL');
ensureColumn('athletes', 'gender', 'TEXT');
ensureColumn('evaluations', 'serve_variety', 'REAL');
ensureColumn('evaluations', 'forehand_slice', 'REAL');
ensureColumn('evaluations', 'backhand_slice', 'REAL');
ensureColumn('evaluations', 'angle_creation', 'REAL');
ensureColumn('evaluations', 'court_zone_awareness', 'REAL');
ensureColumn('athlete_groups', 'schedule_time', 'TEXT');
ensureColumn('athlete_groups', 'is_dropin', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('athlete_groups', 'schedule_slots', 'TEXT');
ensureColumn('athlete_groups', 'head_coach_id', 'INTEGER');
ensureColumn('drills', 'court_zone', 'TEXT');
ensureColumn('matches', 'rallies_up_to_4', 'INTEGER');
ensureColumn('matches', 'rallies_over_4', 'INTEGER');
ensureColumn('matches', 'match_format', 'TEXT');
ensureColumn('matches', 'opponent_athlete_id', 'INTEGER REFERENCES athletes(id) ON DELETE SET NULL');
ensureColumn('stroke_video_analyses', 'serve_type', 'TEXT');
ensureColumn('stroke_video_analyses', 'serve_confidence', 'REAL');
ensureColumn('stroke_video_analyses', 'knee_flexion', 'REAL');
ensureColumn('stroke_video_analyses', 'elbow_flexion', 'REAL');
ensureColumn('stroke_video_analyses', 'shoulder_abduction', 'REAL');
ensureColumn('stroke_video_analyses', 'shoulder_tilt', 'REAL');
ensureColumn('stroke_video_analyses', 'impact_frame_index', 'INTEGER');
ensureColumn('stroke_video_analyses', 'impact_timestamp_ms', 'REAL');
ensureColumn('stroke_video_analyses', 'impact_confidence', 'REAL');
ensureColumn('stroke_video_analyses', 'peak_velocity', 'REAL');
ensureColumn('stroke_video_analyses', 'coil_dissociation', 'REAL');
ensureColumn('stroke_video_analyses', 'coil_sufficient', 'INTEGER');
ensureColumn('stroke_video_analyses', 'kinetic_efficiency_score', 'REAL');
ensureColumn('stroke_video_analyses', 'injury_safety_score', 'REAL');
ensureColumn('stroke_video_analyses', 'biomech_report_json', 'TEXT');
ensureColumn('stroke_video_analyses', 'pose_landmarks_json', 'TEXT');
ensureColumn('drills', 'kids_stage', 'TEXT');
ensureColumn('training_sessions', 'kids_stage', 'TEXT');
ensureColumn('athlete_groups', 'ball_stage', 'TEXT');

export default db;
export { dbPath };
