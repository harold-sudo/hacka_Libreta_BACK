import { Loan } from '../domain/loan.entity';

export interface ILoanRepository {
  findById(id: string): Promise<Loan | null>;
  findByHskLoanId(hskLoanId: string): Promise<Loan | null>;
  findActiveByBorrowerId(borrowerId: string): Promise<Loan | null>;
  findByLenderId(lenderId: string): Promise<Loan[]>;
  findByBorrowerId(borrowerId: string): Promise<Loan[]>;
  createLoan(loan: Partial<Loan>): Promise<Loan>;
  updateLoan(id: string, updates: Partial<Loan>): Promise<Loan>;
}
