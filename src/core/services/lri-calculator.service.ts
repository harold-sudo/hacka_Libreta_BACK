import { Injectable } from '@nestjs/common';

export interface LriCalculationInput {
  onTimePaidInstallments: number;
  totalPaidInstallments: number;
  completedLoansCount: number;
  totalRepaidCapital: number;
  totalDisbursedCapital: number;
}

export interface LriCalculationOutput {
  lriScore: number;
  punctualityRate: number;
  completedLoans: number;
  repaymentRatio: number;
  confidenceGrade: 'EXCELLENT' | 'VERY_GOOD' | 'GOOD' | 'FAIR' | 'INSUFFICIENT';
}

@Injectable()
export class LriCalculatorService {
  /**
   * Calcula el Libreta Reliability Index (LRI) de manera determinística:
   * LRI = (0.50 * P_puntual + 0.30 * C_completitud + 0.20 * D_devolucion) * 100
   */
  calculate(input: LriCalculationInput): LriCalculationOutput {
    const {
      onTimePaidInstallments,
      totalPaidInstallments,
      completedLoansCount,
      totalRepaidCapital,
      totalDisbursedCapital,
    } = input;

    // 1. Tasa de puntualidad (0 si no ha pagado ninguna cuota)
    const punctualityRate =
      totalPaidInstallments > 0
        ? Math.min(
            1.0,
            Math.max(0.0, onTimePaidInstallments / totalPaidInstallments),
          )
        : 1.0; // Estado inicial neutral si está al día en cuota 0

    // 2. Completitud de créditos históricos (máximo 3 créditos = 1.0)
    const completitudRate = Math.min(
      1.0,
      Math.max(0.0, completedLoansCount / 3.0),
    );

    // 3. Proporción de devolución del capital financiado
    const repaymentRatio =
      totalDisbursedCapital > 0
        ? Math.min(
            1.0,
            Math.max(0.0, totalRepaidCapital / totalDisbursedCapital),
          )
        : 1.0;

    // Ponderación oficial
    const rawScore =
      (0.5 * punctualityRate + 0.3 * completitudRate + 0.2 * repaymentRatio) *
      100;
    const lriScore = Math.round(rawScore * 10) / 10; // Redondeo a 1 decimal

    let confidenceGrade: LriCalculationOutput['confidenceGrade'] =
      'INSUFFICIENT';
    if (lriScore >= 90) {
      confidenceGrade = 'EXCELLENT';
    } else if (lriScore >= 75) {
      confidenceGrade = 'VERY_GOOD';
    } else if (lriScore >= 60) {
      confidenceGrade = 'GOOD';
    } else if (lriScore >= 40) {
      confidenceGrade = 'FAIR';
    }

    return {
      lriScore,
      punctualityRate: Math.round(punctualityRate * 1000) / 1000,
      completedLoans: completedLoansCount,
      repaymentRatio: Math.round(repaymentRatio * 1000) / 1000,
      confidenceGrade,
    };
  }
}
