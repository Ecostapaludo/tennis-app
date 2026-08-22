// ---------------------------------------------------------------------------
// Orquestra o motor de regras (biomechRuleEngine.js) num relatorio
// biomecanico completo: diagnosticos + escore de eficiencia cinetica (0-100)
// + escore de seguranca articular (0-100) + sintese em linguagem natural.
// Portado 1:1 do modulo fornecido pelo head coach
// (gemini-code-1787424875134.ts).
//
// Hoje so ha regras implementadas para FOREHAND (analyzeForehand) -- outros
// golpes retornam relatorio sem diagnosticos ate regras equivalentes serem
// fornecidas.
// ---------------------------------------------------------------------------

import { analyzeForehand } from './biomechRuleEngine.js';

export function generateBiomechanicalReport(strokeType, features) {
  // 1. Extracao de diagnosticos pelas regras biomecanicas
  let diagnoses = [];
  if (strokeType === 'FOREHAND') {
    diagnoses = analyzeForehand(features);
  }

  // 2. Calculo do escore de eficiencia cinetica (0 a 100)
  let kineticScore = 100;
  let safetyScore = 100;

  diagnoses.forEach((diag) => {
    if (diag.severity === 'CRITICAL_FAULT') {
      kineticScore -= 25;
      if (diag.category === 'INJURY_RISK' || diag.injuryRiskAssessment) safetyScore -= 30;
    } else if (diag.severity === 'MINOR_DEVIATION') {
      kineticScore -= 10;
      if (diag.injuryRiskAssessment) safetyScore -= 10;
    }
  });

  kineticScore = Math.max(20, kineticScore);
  safetyScore = Math.max(30, safetyScore);

  // 3. Montagem das metricas avaliadas
  const evaluatedMetrics = [
    {
      markerId: 'pelvic_scapular_coil',
      name: 'Dissociação Pélvico-Escapular (Coil)',
      measuredValue: features.pelvicScapularCoilDeg,
      optimalMin: 20,
      optimalMax: 35,
      unit: 'deg',
      severity: features.pelvicScapularCoilDeg < 20 ? 'CRITICAL_FAULT' : 'OPTIMAL',
      deviation: Math.max(0, 20 - features.pelvicScapularCoilDeg),
    },
    {
      markerId: 'contact_depth',
      name: 'Profundidade de Impacto à Frente',
      measuredValue: features.contactDepthCm,
      optimalMin: 20,
      optimalMax: 45,
      unit: 'cm',
      severity: features.contactDepthCm < 15 ? 'CRITICAL_FAULT' : 'OPTIMAL',
      deviation: Math.max(0, 20 - features.contactDepthCm),
    },
  ];

  // 4. Sintese em linguagem natural
  let summaryText = '';
  if (diagnoses.length === 0) {
    summaryText = 'Excelente execução técnica! A cadeia cinética apresentou sequenciamento fluido, com ótimo aproveitamento da rotação axial e ponto de contato adiantado.';
  } else {
    summaryText = `Foram detectados ${diagnoses.length} pontos de ajuste biomecânico. O principal fator limitante de potência é: "${diagnoses[0].title}". Priorize os exercícios prescritos para otimizar a cadeia cinética e prevenir sobrecargas articulares.`;
  }

  return {
    strokeType,
    overallKineticEfficiencyScore: kineticScore,
    injurySafetyScore: safetyScore,
    evaluatedMetrics,
    diagnoses,
    summaryFeedback: summaryText,
  };
}
