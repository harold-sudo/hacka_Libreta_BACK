import { Installment } from '../domain/installment.entity';

export interface IInstallmentRepository {
  claimCash(id: string): Promise<void>;
  findById(id: string): Promise<Installment | null>;
  findByLoanId(loanId: string): Promise<Installment[]>;
  findByLoanIdAndNumber(
    loanId: string,
    installmentNumber: number,
  ): Promise<Installment | null>;
  createInstallments(
    installments: Partial<Installment>[],
  ): Promise<Installment[]>;
  updateInstallment(
    id: string,
    updates: Partial<Installment>,
  ): Promise<Installment>;
  findByPollarTxHash(
    chainId: number,
    txHash: string,
  ): Promise<Installment | null>;
}
