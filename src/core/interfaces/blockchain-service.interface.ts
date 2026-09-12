export interface IBlockchainService {
  registerLoan(params: {
    loanId: string;
    loanHash: string;
    borrowerWallet: string;
    totalInstallments: number;
  }): Promise<{ txHash: string; blockNumber?: number }>;

  confirmPayment(params: {
    loanId: string;
    installmentNumber: number;
    receiptHash: string;
    isDigital: boolean;
    externalTxHash: string;
  }): Promise<{ txHash: string; blockNumber?: number }>;

  getLoanProofs(loanId: string): Promise<
    {
      receiptHash: string;
      installmentNumber: number;
      timestamp: number;
      isDigital: boolean;
      externalTxHash: string;
    }[]
  >;
}
