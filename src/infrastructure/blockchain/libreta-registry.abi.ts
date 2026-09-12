export const LIBRETA_REGISTRY_ABI = [
  'function registerLoan(bytes32 _loanId, bytes32 _loanHash, address _borrower, uint16 _totalInstallments) external',
  'function confirmPayment(bytes32 _loanId, uint16 _installmentNumber, bytes32 _receiptHash, bool _isDigital, bytes32 _externalTxHash) external',
  'function getBorrowerLoanCount(address _borrower) external view returns (uint256)',
  'function getLoanProofs(bytes32 _loanId) external view returns (tuple(bytes32 receiptHash, uint16 installmentNumber, uint256 timestamp, bool isDigital, bytes32 externalTxHash)[])',
  'function loans(bytes32 _loanId) external view returns (bytes32 loanHash, address lender, address borrower, uint16 totalInstallments, uint16 paidInstallments, uint256 createdAt, uint256 completedAt, uint8 status)',
  'event LoanRegistered(bytes32 indexed loanId, address indexed lender, address indexed borrower, uint16 installments, uint256 timestamp)',
  'event PaymentConfirmed(bytes32 indexed loanId, uint16 indexed installmentNumber, bytes32 receiptHash, bool isDigital, uint256 timestamp)',
  'event LoanCompleted(bytes32 indexed loanId, address indexed borrower, uint256 completedAt)',
];
