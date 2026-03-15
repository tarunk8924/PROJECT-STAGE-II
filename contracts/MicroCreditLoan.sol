// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract MicroCreditLoan {
    enum LoanStatus { Created, Active, Completed, Defaulted, Rejected }

    struct Loan {
        uint256 loanId;
        address borrower;
        uint256 amount;
        uint256 interestRate;
        uint256 tenure;
        uint256 totalDue;
        uint256 amountRepaid;
        LoanStatus status;
        uint256 createdAt;
        uint256 approvedAt;
    }

    address public owner;
    mapping(uint256 => Loan) public loans;
    uint256 public loanCount;

    event LoanCreated(uint256 indexed loanId, address indexed borrower, uint256 amount, uint256 interestRate, uint256 tenure);
    event LoanApproved(uint256 indexed loanId, uint256 timestamp);
    event LoanDisbursed(uint256 indexed loanId, uint256 amount);
    event RepaymentMade(uint256 indexed loanId, uint256 amount, uint256 totalRepaid);
    event LoanCompleted(uint256 indexed loanId, uint256 totalRepaid);
    event LoanDefaulted(uint256 indexed loanId);
    event LoanRejected(uint256 indexed loanId, string reason);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function createLoan(
        uint256 _loanId,
        address _borrower,
        uint256 _amount,
        uint256 _interestRate,
        uint256 _tenure,
        uint256 _totalDue
    ) external onlyOwner returns (uint256) {
        loans[_loanId] = Loan({
            loanId: _loanId,
            borrower: _borrower,
            amount: _amount,
            interestRate: _interestRate,
            tenure: _tenure,
            totalDue: _totalDue,
            amountRepaid: 0,
            status: LoanStatus.Created,
            createdAt: block.timestamp,
            approvedAt: 0
        });
        loanCount++;
        emit LoanCreated(_loanId, _borrower, _amount, _interestRate, _tenure);
        return _loanId;
    }

    function approveLoan(uint256 _loanId) external onlyOwner {
        require(loans[_loanId].status == LoanStatus.Created, "Loan not in created state");
        loans[_loanId].status = LoanStatus.Active;
        loans[_loanId].approvedAt = block.timestamp;
        emit LoanApproved(_loanId, block.timestamp);
        emit LoanDisbursed(_loanId, loans[_loanId].amount);
    }

    function recordRepayment(uint256 _loanId, uint256 _amount) external onlyOwner {
        require(loans[_loanId].status == LoanStatus.Active, "Loan not active");
        loans[_loanId].amountRepaid += _amount;
        emit RepaymentMade(_loanId, _amount, loans[_loanId].amountRepaid);

        if (loans[_loanId].amountRepaid >= loans[_loanId].totalDue) {
            loans[_loanId].status = LoanStatus.Completed;
            emit LoanCompleted(_loanId, loans[_loanId].amountRepaid);
        }
    }

    function markDefaulted(uint256 _loanId) external onlyOwner {
        require(loans[_loanId].status == LoanStatus.Active, "Loan not active");
        loans[_loanId].status = LoanStatus.Defaulted;
        emit LoanDefaulted(_loanId);
    }

    function rejectLoan(uint256 _loanId, string calldata _reason) external onlyOwner {
        require(loans[_loanId].status == LoanStatus.Created, "Loan not in created state");
        loans[_loanId].status = LoanStatus.Rejected;
        emit LoanRejected(_loanId, _reason);
    }

    function getLoan(uint256 _loanId) external view returns (Loan memory) {
        return loans[_loanId];
    }
}
