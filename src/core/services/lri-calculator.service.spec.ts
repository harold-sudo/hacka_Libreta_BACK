import { LriCalculatorService } from './lri-calculator.service';

describe('LriCalculatorService', () => {
  let service: LriCalculatorService;

  beforeEach(() => {
    service = new LriCalculatorService();
  });

  it('debe calcular 100 de score para un cliente perfecto con 3+ créditos concluidos', () => {
    const result = service.calculate({
      onTimePaidInstallments: 36,
      totalPaidInstallments: 36,
      completedLoansCount: 3,
      totalRepaidCapital: 3600,
      totalDisbursedCapital: 3600,
    });

    // P_puntual = 1.0 (50), C_completitud = 1.0 (30), D_devolucion = 1.0 (20) => 100.0
    expect(result.lriScore).toBe(100);
    expect(result.punctualityRate).toBe(1.0);
    expect(result.confidenceGrade).toBe('EXCELLENT');
  });

  it('debe calcular adecuadamente las ponderaciones oficiales (0.50 P + 0.30 C + 0.20 D)', () => {
    const result = service.calculate({
      onTimePaidInstallments: 8,
      totalPaidInstallments: 10, // P = 0.8 => 0.50 * 0.8 = 40
      completedLoansCount: 1, // C = 1/3 => 0.30 * 0.3333 = 10
      totalRepaidCapital: 1000, // D = 1.0 => 0.20 * 1.0 = 20
      totalDisbursedCapital: 1000,
    });

    // Score esperado: 40 + 10 + 20 = 70.0
    expect(result.lriScore).toBeCloseTo(70.0, 0);
    expect(result.confidenceGrade).toBe('GOOD');
  });

  it('debe manejar prestatarios nuevos sin cuotas pagadas sin dividir por cero', () => {
    const result = service.calculate({
      onTimePaidInstallments: 0,
      totalPaidInstallments: 0,
      completedLoansCount: 0,
      totalRepaidCapital: 0,
      totalDisbursedCapital: 1200,
    });

    expect(result.lriScore).toBe(0);
    expect(result.confidenceGrade).toBe('INSUFFICIENT');
    expect(Number.isFinite(result.lriScore)).toBe(true);
  });
});
