import { calculateLoan, installmentDate } from './loan-calculation';
import { validate } from 'class-validator';
import { CreateLoanDto } from './dto/create-loan.dto';

describe('loan terms and schedule', () => {
  it('applies interest once and splits the total', () => {
    expect(calculateLoan(100, 10, 10)).toMatchObject({
      interest: 10,
      total: 110,
      amounts: Array(10).fill(11),
    });
  });
  it('conserves every cent of total and principal', () => {
    const result = calculateLoan(100, 12.5, 7);
    expect(result.amounts).toEqual([
      16.08, 16.07, 16.07, 16.07, 16.07, 16.07, 16.07,
    ]);
    expect(result.principals.reduce((n, v) => n + Math.round(v * 100), 0)).toBe(
      10000,
    );
    expect(result.amounts.reduce((n, v) => n + Math.round(v * 100), 0)).toBe(
      11250,
    );
  });
  it('rounds interest half up and supports zero interest', () => {
    expect(calculateLoan(1, 0.5, 1).total).toBe(1.01);
    expect(calculateLoan(1, 0, 3).amounts).toEqual([0.34, 0.33, 0.33]);
  });
  it('does not overflow at maximum capital', () => {
    expect(calculateLoan(999999999.99, 1000, 52).total).toBe(10999999999.89);
  });
  it.each([
    [0, 10, 1],
    [1, -1, 1],
    [1, 10, 0],
    [0.01, 0, 2],
    [1, 10, 53],
  ])('rejects invalid terms %s/%s/%s', (capital, rate, count) => {
    expect(() => calculateLoan(capital, rate, count)).toThrow();
  });
  it.each([
    ['DAILY', '2026-12-31', 1, '2027-01-01'],
    ['WEEKLY', '2026-12-31', 1, '2027-01-07'],
    ['MONTHLY', '2026-01-31', 1, '2026-02-28'],
    ['MONTHLY', '2026-01-31', 2, '2026-03-31'],
    ['MONTHLY', '2028-01-31', 1, '2028-02-29'],
  ] as const)(
    'calculates %s dates from %s',
    (frequency, start, i, expected) => {
      expect(installmentDate(start, frequency, i)).toBe(expected);
    },
  );
  it('rejects impossible dates', () => {
    expect(() => installmentDate('2026-02-30', 'MONTHLY', 0)).toThrow();
  });
  it('validates percentage input and preserves the legacy amount contract', async () => {
    const dto = Object.assign(new CreateLoanDto(), {
      borrowerId: 'f33037c0-a633-4712-8236-8fe64b3ec927',
      borrowerWalletAddress: '0x' + '1'.repeat(40),
      capital: 100,
      currency: 'USDC',
      totalInstallments: 10,
      frequency: 'DAILY',
      startDate: '2026-09-12',
      interestRate: 10,
    });
    expect(await validate(dto)).toHaveLength(0);
    dto.interestRate = 10.123;
    expect(
      (await validate(dto)).some((e) => e.property === 'interestRate'),
    ).toBe(true);
    delete dto.interestRate;
    expect(
      (await validate(dto)).some((e) => e.property === 'installmentAmount'),
    ).toBe(true);
    dto.installmentAmount = 11;
    expect(await validate(dto)).toHaveLength(0);
  });
});
