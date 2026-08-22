// ---------------------------------------------------------------------------
// Motor de regras biomecanicas: cruza multiplos marcadores ja medidos (coil,
// flexao de joelho, atraso de punho, profundidade de contato...) para achar a
// causa-raiz de um problema tecnico, em vez de so apontar "esse angulo esta
// fora da faixa". Portado 1:1 do modulo fornecido pelo head coach
// (gemini-code-1787424854296.ts) -- so a classe estatica TypeScript virou
// funcoes simples exportadas (consistente com o resto de src/lib/), a logica
// e os textos sao os mesmos.
//
// ExtractedStrokeFeatures: { pelvicScapularCoilDeg, kneeFlexionDeg,
// wristLagAngleDeg, contactDepthCm, racketFaceAngleDeg,
// wristPronationSpeedDegSec? }
// EvaluatedMetric: { markerId, name, measuredValue, optimalMin, optimalMax,
// unit, severity: 'OPTIMAL'|'MINOR_DEVIATION'|'CRITICAL_FAULT', deviation }
// KineticDiagnosis: { id, title, category, severity, rootCauseDescription,
// biomechanicalImpact, injuryRiskAssessment?, correctiveDrills: [{drillName,
// objective, focusCue}] }
// ---------------------------------------------------------------------------

// Avalia uma metrica individual contra seus limites otimos.
export function evaluateRange(id, name, val, min, max, unit, criticalTolerance) {
  let severity = 'OPTIMAL';
  let deviation = 0;

  if (val < min) {
    deviation = min - val;
    severity = deviation > criticalTolerance ? 'CRITICAL_FAULT' : 'MINOR_DEVIATION';
  } else if (val > max) {
    deviation = val - max;
    severity = deviation > criticalTolerance ? 'CRITICAL_FAULT' : 'MINOR_DEVIATION';
  }

  return { markerId: id, name, measuredValue: val, optimalMin: min, optimalMax: max, unit, severity, deviation };
}

// Motor de inferencia para Forehand: cruza multiplos marcadores para achar a causa-raiz.
export function analyzeForehand(features) {
  const diagnoses = [];

  // REGRA 1: Golpe Dominado pelo Braco (Falta de Cadeia Cinetica)
  // Causa: Pouco Coil (< 20 graus) + Joelhos estendidos (> 150 graus)
  if (features.pelvicScapularCoilDeg < 20 && features.kneeFlexionDeg > 150) {
    diagnoses.push({
      id: 'ARM_DOMINATED_SWING',
      title: 'Golpe Dominado pelo Membro Superior (Arm-Dominated Swing)',
      category: 'POWER_GENERATION',
      severity: 'CRITICAL_FAULT',
      rootCauseDescription: `A dissociação pélvico-escapular foi de apenas ${features.pelvicScapularCoilDeg}° (mínimo ideal: 25°) com baixa flexão de pernas (${features.kneeFlexionDeg}°).`,
      biomechanicalImpact: 'A aceleração da raquete está sendo compensada exclusivamente pelos músculos do ombro e do punho, resultando em perda de potência profunda e baixa margem de segurança sobre a rede.',
      injuryRiskAssessment: 'Alto risco de sobrecarga no manguito rotador e nos tendões flexores/extensores do antebraço (epicondilite).',
      correctiveDrills: [
        {
          drillName: 'Medicine Ball Coil & Release (2kg)',
          objective: 'Treinar o armazenamento de energia na rotação do core antes do desprendimento dos braços.',
          focusCue: 'Gire os ombros mostrando as costas para a rede antes de iniciar o movimento.',
        },
        {
          drillName: 'Shadow Swings com Pausa na Base',
          objective: 'Fixar o afundamento do centro de gravidade no pé de apoio.',
          focusCue: 'Sinta o peso do corpo afundar na perna dominante antes de impulsionar para cima.',
        },
      ],
    });
  }

  // REGRA 2: Ponto de Contato Atrasado
  // Causa: Profundidade de contato <= 10cm a frente ou atras da linha do quadril
  if (features.contactDepthCm < 15) {
    diagnoses.push({
      id: 'LATE_CONTACT_POINT',
      title: 'Ponto de Contato Atrasado',
      category: 'CONTROL_TIMING',
      severity: features.contactDepthCm < 5 ? 'CRITICAL_FAULT' : 'MINOR_DEVIATION',
      rootCauseDescription: `O impacto ocorreu a apenas ${features.contactDepthCm} cm da linha do quadril (ideal: 25 a 45 cm à frente).`,
      biomechanicalImpact: 'Força a articulação do punho a absorver o impacto em extensão forçada com o cotovelo retraído, desestabilizando a face da raquete e reduzindo o tempo de bola na quadra.',
      injuryRiskAssessment: 'Fator primário para microtraumas de compressão no punho e estresse no cotovelo.',
      correctiveDrills: [
        {
          drillName: 'Forehand com Cone de Referência',
          objective: 'Estabelecer referência visual espacial fixa para impactar a bola sempre à frente.',
          focusCue: 'Ataque a bola antes que ela atinja a linha do seu pé dianteiro.',
        },
      ],
    });
  }

  // REGRA 3: Ausencia de Lag / Pushing the Ball
  // Causa: Angulo antebraco-raquete muito aberto no inicio do forward swing
  if (features.wristLagAngleDeg > 130) {
    diagnoses.push({
      id: 'LACK_OF_WRIST_LAG',
      title: 'Ausência de Efeito Chicote (Racket Lag)',
      category: 'POWER_GENERATION',
      severity: 'MINOR_DEVIATION',
      rootCauseDescription: `Ângulo do punho/raquete em ${features.wristLagAngleDeg}° durante o início da aceleração (ideal: 85° a 105°).`,
      biomechanicalImpact: 'A raquete é "empurrada" linearmente em vez de chicotear, inibindo a transferência elástica terminal e diminuindo o RPM de topspin.',
      correctiveDrills: [
        {
          drillName: 'Loose Wrist Drop Swings',
          objective: 'Relaxar a empunhadura para permitir o atraso inercial da cabeça da raquete.',
          focusCue: 'Mantenha a pressão da empunhadura em 3/10 para a ponta da raquete cair livremente.',
        },
      ],
    });
  }

  return diagnoses;
}
