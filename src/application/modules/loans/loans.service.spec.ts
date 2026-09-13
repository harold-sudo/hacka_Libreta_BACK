jest.mock('@nestjs/config', () => ({ ConfigService: class {} }));
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
  it('rejects an impossible schedule before broadcasting or saving', async () => {
    const { service, registerLoan, createLoan } = setup();
    await expect(
      service.createLoan('auth-user', { ...input, startDate: '2026-02-30' }),
    ).rejects.toThrow('fecha válida');
    expect(registerLoan).not.toHaveBeenCalled();
    expect(createLoan).not.toHaveBeenCalled();
  });
});
