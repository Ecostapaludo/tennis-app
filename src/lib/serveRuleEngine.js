// ---------------------------------------------------------------------------
// Motor de regras biomecanicas do SAQUE: cruza multiplos marcadores para
// achar causas-raiz especificas do saque (erro de armacao, falta de
// carregamento de pernas, queda de ombro, contato encolhido, toss atrasado).
// Portado 1:1 do modulo fornecido pelo head coach
// (gemini-code-1787425346335.ts) -- a classe estatica TypeScript virou uma
// funcao simples exportada (mesmo padrao de biomechRuleEngine.js), logica e
// textos inalterados.
//
// ExtractedServeFeatures: { kneeFlexionDeg, shoulderTiltDeg, elbowAbductionDeg,
// racketFaceAngleTrophyDeg, verticalDisplacementCm, shoulderExternalRotationDeg,
// tossRelativeYOffsetCm, contactElbowFlexionDeg, wristPronationSpeedDegSec,
// headTiltAtImpactDeg }
// ---------------------------------------------------------------------------

export function evaluateServe(features) {
  const diagnoses = [];

  // =========================================================================
  // 1. ERRO DO BANDEIRANTE / BANDEJA DE GARCOM (Waiter's Tray Error)
  // =========================================================================
  // Causa: Face da raquete abre para cima (supinacao prematura) durante o drop,
  // inibindo a rotacao interna e a pronacao terminal.
  if (features.racketFaceAngleTrophyDeg > 65 || features.shoulderExternalRotationDeg < 60) {
    diagnoses.push({
      id: 'WAITERS_TRAY_ERROR',
      title: "Armação em Bandeja de Garçom (Waiter's Tray / Inverted Racket Drop)",
      category: 'POWER_GENERATION',
      severity: 'CRITICAL_FAULT',
      rootCauseDescription: `A face da raquete abriu apontando para o céu (${features.racketFaceAngleTrophyDeg}°) durante a descida, reduzindo a rotação externa para ${features.shoulderExternalRotationDeg}° (ideal: 90° a 120°).`,
      biomechanicalImpact: 'Impede o carregamento elástico do peitoral maior e dos rotadores internos. O atleta perde a alavanca de pronação e o efeito chicote, "empurrando" a bola com o punho bloqueado (queda drástica de velocidade e spin).',
      injuryRiskAssessment: 'Estresse elevado no complexo medial do cotovelo e impacto mecânico no tendão do bíceps.',
      correctiveDrills: [
        {
          drillName: 'Edge-First Shadow Swings (Ataque com a Borda)',
          objective: 'Conscientizar a subida da raquete guiada pela borda do aro com empunhadura Continental.',
          focusCue: 'Leve a borda da raquete em direção à bola como se fosse cortar a bola de canto, soltando a pronação apenas no impacto.',
        },
        {
          drillName: 'Lançamento de Bola de Futebol Americano ou Toalha',
          objective: 'Mecanizar a pronação natural do braço através de um objeto com rotação espiral obrigatória.',
          focusCue: 'Arremesse a toalha/bola para frente fazendo-a espiralar pelo giro do antebraço para fora.',
        },
      ],
    });
  }

  // =========================================================================
  // 2. FALTA DE CARREGAMENTO DE PERNAS (Lack of Leg Drive)
  // =========================================================================
  // Causa: Joelhos muito retos (> 145 graus) + baixa elevacao vertical (< 10 cm).
  if (features.kneeFlexionDeg > 145 && features.verticalDisplacementCm < 10) {
    diagnoses.push({
      id: 'LACK_OF_LEG_DRIVE',
      title: 'Subutilização de Membros Inferiores (Lack of Leg Drive)',
      category: 'POWER_GENERATION',
      severity: 'CRITICAL_FAULT',
      rootCauseDescription: `Flexão de joelhos insuficiente na Trophy Pose (${features.kneeFlexionDeg}°, ideal: 100°-125°) resultando em apenas ${features.verticalDisplacementCm} cm de elevação vertical.`,
      biomechanicalImpact: 'Incapacidade de capturar a Força de Reação do Solo (GRF). A cadeia cinética perde até 50% de sua fonte primária de energia potencial, forçando o ombro e o tronco a gerarem toda a potência.',
      injuryRiskAssessment: 'Fator primário de sobrecarga no manguito rotador e fadiga precoce do complexo articular glenoumeral.',
      correctiveDrills: [
        {
          drillName: 'Plataforma com Salto e Aterrissagem Adiantada',
          objective: 'Carregar os calcanhares e explodir verticalmente em direção ao interior da quadra.',
          focusCue: 'Afunde os joelhos até sentir os quadríceps carregados e salte para aterrissar 40 cm dentro da quadra com a perna dianteira.',
        },
      ],
    });
  }

  // =========================================================================
  // 3. QUEDA PREMATURA DO OMBRO DIANTEIRO / CABECA (Early Shoulder Collapse)
  // =========================================================================
  // Causa: Baixo Shoulder Tilt (< 15 graus) ou cabeca/olhar caindo antes do impacto.
  if (features.shoulderTiltDeg < 15 || features.headTiltAtImpactDeg > 20) {
    diagnoses.push({
      id: 'EARLY_SHOULDER_COLLAPSE',
      title: 'Queda Prematura do Ombro e Tronco (Early Shoulder/Chest Drop)',
      category: 'CONTROL_TIMING',
      severity: 'CRITICAL_FAULT',
      rootCauseDescription: `Inclinação da linha dos ombros insuficiente (${features.shoulderTiltDeg}°, ideal: 25°-40°) com queda prematura do braço não-dominante e da cabeça.`,
      biomechanicalImpact: 'O ponto de impacto é puxado para baixo, reduzindo a margem da bola em relação à rede e resultando em saques presos na fita. Além disso, elimina o efeito "Cartwheel" (roda-gigante) de transferência vertical.',
      injuryRiskAssessment: 'Aumento da compressão subacromial e pinçamento do tendão supraespinhal.',
      correctiveDrills: [
        {
          drillName: 'Toss Retention Drill (Braço Esquerdo Estendido)',
          objective: 'Manter o braço não-dominante estendido para cima até o momento da propulsão.',
          focusCue: 'Mantenha o braço do toss apontando para a bola até que a raquete comece a subir atrás das costas.',
        },
      ],
    });
  }

  // =========================================================================
  // 4. CONTATO BAIXO / BRACO ENCOLHIDO (Collapsed Arm at Impact)
  // =========================================================================
  // Causa: Cotovelo excessivamente flexionado (< 160 graus) no instante do impacto.
  if (features.contactElbowFlexionDeg < 160) {
    diagnoses.push({
      id: 'COLLAPSED_ARM_IMPACT',
      title: 'Alcance Incompleto no Ponto de Contato (Collapsed Reach)',
      category: 'CONTROL_TIMING',
      severity: 'CRITICAL_FAULT',
      rootCauseDescription: `O cotovelo apresentou ${features.contactElbowFlexionDeg}° de flexão no momento do impacto (ideal: 172° a 180° de extensão completa).`,
      biomechanicalImpact: 'Perda do raio máximo da alavanca de aceleração linear (v = ω · r). O ângulo de ataque perde altura, exigindo trajetórias mais parabólicas e vulneráveis.',
      correctiveDrills: [
        {
          drillName: 'High Reach Target Hit',
          objective: 'Condicionar o ponto de contato no ápice absoluto da extensão do braço.',
          focusCue: 'Busque a bola no "segundo andar" — estenda completamente o braço como se fosse tocar o teto.',
        },
      ],
    });
  }

  // =========================================================================
  // 5. TOSS ATRASADO OU DESLOCADO (Erratic Toss Alignment)
  // =========================================================================
  // Causa: Lancamento caindo atras da cabeca em saques Flat/Slice.
  if (features.tossRelativeYOffsetCm < -5) {
    diagnoses.push({
      id: 'BACKWARD_TOSS_HYPEREXTENSION',
      title: 'Toss Atrasado com Hiperextensão Lombar',
      category: 'INJURY_RISK',
      severity: 'CRITICAL_FAULT',
      rootCauseDescription: `O ápice do toss ficou projetado ${Math.abs(features.tossRelativeYOffsetCm)} cm atrás da cabeça em um saque que exige projeção frontal.`,
      biomechanicalImpact: 'Impede a translação do peso do corpo para a frente, forçando o atleta a arquear a coluna lombar para alcançar a bola.',
      injuryRiskAssessment: 'Risco severo de espondilólise, hérnias discais lombares e sobrecarga facetária por hiperextensão sob carga compressiva.',
      correctiveDrills: [
        {
          drillName: 'Toss no Aro no Chão (Target Landing)',
          objective: 'Treinar o lançamento para que a bola caia cerca de 30 a 40 cm à frente da linha de base.',
          focusCue: 'Solte a bola no nível dos olhos sem usar os dedos para dar rotação e deixe-a quicar dentro do aro.',
        },
      ],
    });
  }

  return diagnoses;
}
