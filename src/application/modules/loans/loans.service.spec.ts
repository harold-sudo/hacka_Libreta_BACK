jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
import { CryptoEngineService } from '../../../core/services/crypto-engine.service';
import { LoansService } from './loans.service';
import { CreateLoanDto } from './dto/create-loan.dto';

describe('LoansService percentage registration', () => {
  const wallet = '0x' + '1'.repeat(40);
  function setup() {
    const createLoan = jest.fn().mockResolvedValue({
      id: 'loan',
      hsk_loan_id: 'hash',
      loan_hash: 'terms',
    });
    const createInstallments = jest.fn().mockResolvedValue(undefined);
    const registerLoan = jest
      .fn()
      .mockResolvedValue({ txHash: '0xabc', blockNumber: 10 });
    const profiles = {
      findByAuthUserId: jest
        .fn()
        .mockResolvedValue({ id: 'lender', role: 'LENDER' }),
      findById: jest.fn((id: string) =>
        Promise.resolve({
          id,
          role: id === 'borrower' ? 'BORROWER' : 'LENDER',
          wallet_address: wallet,
        }),
      ),
    };
    const deps = [
      { createLoan },
      { createInstallments },
      profiles,
      { registerLoan },
      {
        computeHskLoanId: jest.fn().mockReturnValue('hash'),
        computeLoanHash: jest.fn().mockReturnValue('terms'),
      },
      { record: jest.fn().mockResolvedValue(undefined) },
    ] as unknown as ConstructorParameters<typeof LoansService>;
    return {
      service: new LoansService(...deps),
      createLoan,
      createInstallments,
      registerLoan,
    };
  }
  const input: CreateLoanDto = {
    borrowerId: 'borrower',
    borrowerWalletAddress: wallet,
    capital: 100,
    currency: 'USDC',
    totalInstallments: 7,
    interestRate: 12.5,
    frequency: 'MONTHLY',
    startDate: '2026-01-31',
  };
  it('persists calculated installments instead of a client-supplied amount', async () => {
    const { service, createLoan, createInstallments } = setup();
    await service.createLoan('auth-user', { ...input, installmentAmount: 999 });
    expect(createLoan).toHaveBeenCalledWith(
      expect.objectContaining({
        interest_rate: 12.5,
        frequency: 'MONTHLY',
        installment_amount: 16.08,
      }),
    );
    const rows = createInstallments.mock.calls[0][0] as {
      amount: number;
      due_date: string;
    }[];
    expect(rows.map((r) => r.amount)).toEqual([
      16.08, 16.07, 16.07, 16.07, 16.07, 16.07, 16.07,
    ]);
    expect(rows.slice(0, 3).map((r) => r.due_date)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
  });
  it('creates independent loans and installments for the same lender and borrower', async () => {
    const { service, createLoan, createInstallments, registerLoan } = setup();
    // Use real ID generation and return a different database ID for each insertion.
    const engine = new CryptoEngineService();
    (service as unknown as { cryptoEngine: CryptoEngineService }).cryptoEngine =
      engine;
    createLoan.mockImplementation(
      (row: { hsk_loan_id: string; loan_hash: string }) =>
        Promise.resolve({ ...row, id: `loan-${createLoan.mock.calls.length}` }),
    );
    await service.createLoan('auth-user', input);
    await service.createLoan('auth-user', {
      ...input,
      capital: 200,
      totalInstallments: 2,
    });
    expect(createLoan).toHaveBeenCalledTimes(2);
    const first = registerLoan.mock.calls[0][0] as { loanId: string };
    const second = registerLoan.mock.calls[1][0] as { loanId: string };
    expect(first.loanId).not.toBe(second.loanId);
    const batches = createInstallments.mock.calls.map(
      (call) => call[0] as { loan_id: string }[],
    );
    expect(batches[0]).toHaveLength(7);
    expect(batches[1]).toHaveLength(2);
    expect(batches[0].every((row) => row.loan_id === 'loan-1')).toBe(true);
    expect(batches[1].every((row) => row.loan_id === 'loan-2')).toBe(true);
  });
  it('rejects an impossible schedule before broadcasting or saving', async () => {
    const { service, registerLoan, createLoan } = setup();
    await expect(
      service.createLoan('auth-user', { ...input, startDate: '2026-02-30' }),
    ).rejects.toThrow('fecha válida');
    expect(registerLoan).not.toHaveBeenCalled();
    expect(createLoan).not.toHaveBeenCalled();
  });
});
