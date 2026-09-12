// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title LibretaRegistry
 * @author LIBRETA Core Team (ETH Bolivia Buildathon 2026)
 * @notice Registro descentralizado e inmutable de atestaciones de microcrédito.
 */
contract LibretaRegistry {
    
    enum LoanStatus { CREATED, ACTIVE, COMPLETED, DEFAULTED }

    struct Loan {
        bytes32 loanHash;         // keccak256(loanId, borrowerPubKey, lenderPubKey, salt)
        address lender;           // Dirección de la entidad / prestamista emisor
        address borrower;         // Dirección o identificador criptográfico del prestatario
        uint16 totalInstallments; // Cantidad total de cuotas pactadas (ej. 12)
        uint16 paidInstallments;  // Cuotas pagadas y confirmadas con doble atestación
        uint256 createdAt;        // Timestamp de anclaje inicial
        uint256 completedAt;      // Timestamp de liquidación completa
        LoanStatus status;        // Estado actual del crédito
    }

    struct PaymentProof {
        bytes32 receiptHash;      // keccak256(loanId, installmentNumber, amountHash, timestamp)
        uint16 installmentNumber; // Número correlativo de cuota
        uint256 timestamp;        // Momento de verificación bilateral
        bool isDigital;           // true: liquidado vía Pollar (USDC); false: efectivo
        bytes32 externalTxHash;   // Hash de la transacción mainnet en Pollar (si aplica)
    }

    // Mapeo principal: loanId (bytes32) => Estructura del crédito
    mapping(bytes32 => Loan) public loans;
    
    // Historial forense de pagos: loanId => Lista de atestaciones de pago
    mapping(bytes32 => PaymentProof[]) internal loanProofs;
    
    // Índice por prestatario: borrower address => Lista de loanIds
    mapping(address => bytes32[]) public borrowerLoans;

    // Eventos emitidos para indexadores (The Graph / Supabase Webhooks)
    event LoanRegistered(
        bytes32 indexed loanId, 
        address indexed lender, 
        address indexed borrower, 
        uint16 installments,
        uint256 timestamp
    );

    event PaymentConfirmed(
        bytes32 indexed loanId, 
        uint16 indexed installmentNumber, 
        bytes32 receiptHash, 
        bool isDigital,
        uint256 timestamp
    );

    event LoanCompleted(
        bytes32 indexed loanId, 
        address indexed borrower, 
        uint256 completedAt
    );

    /**
     * @notice Registra un nuevo microcrédito acordado entre prestamista y prestatario.
     */
    function registerLoan(
        bytes32 _loanId,
        bytes32 _loanHash,
        address _borrower,
        uint16 _totalInstallments
    ) external {
        require(loans[_loanId].createdAt == 0, "LIBRETA: El credito ya esta registrado");
        require(_totalInstallments > 0, "LIBRETA: Las cuotas deben ser mayores a cero");
        require(_borrower != address(0), "LIBRETA: Direccion de prestatario invalida");

        loans[_loanId] = Loan({
            loanHash: _loanHash,
            lender: msg.sender,
            borrower: _borrower,
            totalInstallments: _totalInstallments,
            paidInstallments: 0,
            createdAt: block.timestamp,
            completedAt: 0,
            status: LoanStatus.ACTIVE
        });

        borrowerLoans[_borrower].push(_loanId);

        emit LoanRegistered(_loanId, msg.sender, _borrower, _totalInstallments, block.timestamp);
    }

    /**
     * @notice Registra una prueba de pago confirmada mediante atestación bilateral o Pollar.
     */
    function confirmPayment(
        bytes32 _loanId,
        uint16 _installmentNumber,
        bytes32 _receiptHash,
        bool _isDigital,
        bytes32 _externalTxHash
    ) external {
        Loan storage loan = loans[_loanId];
        require(loan.status == LoanStatus.ACTIVE, "LIBRETA: El credito no esta activo");
        require(msg.sender == loan.lender, "LIBRETA: Solo el prestamista registrado puede confirmar");
        require(_installmentNumber == loan.paidInstallments + 1, "LIBRETA: Secuencia de cuota invalida");

        loan.paidInstallments += 1;

        loanProofs[_loanId].push(PaymentProof({
            receiptHash: _receiptHash,
            installmentNumber: _installmentNumber,
            timestamp: block.timestamp,
            isDigital: _isDigital,
            externalTxHash: _externalTxHash
        }));

        emit PaymentConfirmed(_loanId, _installmentNumber, _receiptHash, _isDigital, block.timestamp);

        if (loan.paidInstallments == loan.totalInstallments) {
            loan.status = LoanStatus.COMPLETED;
            loan.completedAt = block.timestamp;
            emit LoanCompleted(_loanId, loan.borrower, block.timestamp);
        }
    }

    /**
     * @notice Consulta el número total de préstamos históricos asociados a un prestatario.
     */
    function getBorrowerLoanCount(address _borrower) external view returns (uint256) {
        return borrowerLoans[_borrower].length;
    }

    /**
     * @notice Retorna el listado completo de atestaciones de pago de un crédito.
     */
    function getLoanProofs(bytes32 _loanId) external view returns (PaymentProof[] memory) {
        return loanProofs[_loanId];
    }
}