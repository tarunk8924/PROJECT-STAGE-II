import crypto from "crypto";
import {
  isEthereumConfigured,
  initEthereum,
  createLoanOnChain,
  approveLoanOnChain,
  recordRepaymentOnChain,
  markDefaultedOnChain,
  rejectLoanOnChain,
  getEtherscanTxUrl,
  getEtherscanAddressUrl,
  getContractAddress,
} from "./ethereum.js";

let ethereumReady = false;

export async function initBlockchain(): Promise<void> {
  if (isEthereumConfigured()) {
    ethereumReady = await initEthereum();
    if (ethereumReady) {
      console.log("Blockchain mode: Ethereum Sepolia (real)");
    } else {
      console.log("Blockchain mode: Simulation (Ethereum init failed)");
    }
  } else {
    console.log("Blockchain mode: Simulation (no Ethereum credentials configured)");
  }
}

export function isUsingRealBlockchain(): boolean {
  return ethereumReady;
}

export function generateContractHash(data: object): string {
  return "0x" + crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

export function generateTxId(): string {
  return "0x" + crypto.randomBytes(32).toString("hex");
}

export function generateContractAddress(): string {
  return "0x" + crypto.randomBytes(20).toString("hex");
}

export function generateBlockNumber(): number {
  return Math.floor(Math.random() * 1000000) + 18000000;
}

export interface SmartContractEvent {
  event: string;
  timestamp: string;
  blockNumber: number;
  txHash: string;
  data: Record<string, unknown>;
  etherscanUrl?: string;
  onChain: boolean;
}

export function createContractEvent(
  eventName: string,
  data: Record<string, unknown>
): SmartContractEvent {
  return {
    event: eventName,
    timestamp: new Date().toISOString(),
    blockNumber: generateBlockNumber(),
    txHash: generateTxId(),
    data,
    onChain: false,
  };
}

export function createOnChainEvent(
  eventName: string,
  txHash: string,
  blockNumber: number,
  data: Record<string, unknown>
): SmartContractEvent {
  return {
    event: eventName,
    timestamp: new Date().toISOString(),
    blockNumber,
    txHash,
    etherscanUrl: getEtherscanTxUrl(txHash),
    data,
    onChain: true,
  };
}

export interface BlockchainResult {
  txHash: string;
  blockNumber: number;
  contractAddress: string;
  etherscanTxUrl?: string;
  etherscanContractUrl?: string;
  onChain: boolean;
  event: SmartContractEvent;
}

export async function createLoanBlockchain(
  loanId: number,
  borrowerEmail: string,
  amount: number,
  interestRate: number,
  tenure: number,
  totalDue: number
): Promise<BlockchainResult> {
  if (ethereumReady) {
    const result = await createLoanOnChain(loanId, borrowerEmail, amount, interestRate, tenure, totalDue);
    if (result) {
      return {
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        contractAddress: result.contractAddress,
        etherscanTxUrl: getEtherscanTxUrl(result.txHash),
        etherscanContractUrl: getEtherscanAddressUrl(result.contractAddress),
        onChain: true,
        event: createOnChainEvent("LoanCreated", result.txHash, result.blockNumber, {
          loanId, borrower: borrowerEmail, amount,
        }),
      };
    }
  }

  const event = createContractEvent("LoanCreated", { loanId, borrower: borrowerEmail, amount });
  return {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    contractAddress: generateContractAddress(),
    onChain: false,
    event,
  };
}

export async function approveLoanBlockchain(
  loanId: number,
  approvedBy: number,
  amount: number
): Promise<BlockchainResult> {
  if (ethereumReady) {
    const result = await approveLoanOnChain(loanId);
    if (result) {
      return {
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        contractAddress: getContractAddress() || "",
        etherscanTxUrl: getEtherscanTxUrl(result.txHash),
        onChain: true,
        event: createOnChainEvent("LoanApproved", result.txHash, result.blockNumber, {
          loanId, approvedBy, amount,
        }),
      };
    }
  }

  const event = createContractEvent("LoanApproved", { loanId, approvedBy, amount });
  return {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    contractAddress: getContractAddress() || generateContractAddress(),
    onChain: false,
    event,
  };
}

export async function recordRepaymentBlockchain(
  loanId: number,
  amount: number,
  totalRepaid: number,
  isOnTime: boolean
): Promise<BlockchainResult> {
  if (ethereumReady) {
    const result = await recordRepaymentOnChain(loanId, amount);
    if (result) {
      return {
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        contractAddress: getContractAddress() || "",
        etherscanTxUrl: getEtherscanTxUrl(result.txHash),
        onChain: true,
        event: createOnChainEvent("RepaymentMade", result.txHash, result.blockNumber, {
          loanId, amount, totalRepaid, isOnTime,
        }),
      };
    }
  }

  const event = createContractEvent("RepaymentMade", { loanId, amount, totalRepaid, isOnTime });
  return {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    contractAddress: getContractAddress() || generateContractAddress(),
    onChain: false,
    event,
  };
}

export async function markDefaultBlockchain(loanId: number): Promise<BlockchainResult> {
  if (ethereumReady) {
    const result = await markDefaultedOnChain(loanId);
    if (result) {
      return {
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        contractAddress: getContractAddress() || "",
        etherscanTxUrl: getEtherscanTxUrl(result.txHash),
        onChain: true,
        event: createOnChainEvent("LoanDefaulted", result.txHash, result.blockNumber, { loanId }),
      };
    }
  }

  const event = createContractEvent("LoanDefaulted", { loanId });
  return {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    contractAddress: getContractAddress() || generateContractAddress(),
    onChain: false,
    event,
  };
}

export async function rejectLoanBlockchain(loanId: number, reason: string): Promise<BlockchainResult> {
  if (ethereumReady) {
    const result = await rejectLoanOnChain(loanId, reason);
    if (result) {
      return {
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        contractAddress: getContractAddress() || "",
        etherscanTxUrl: getEtherscanTxUrl(result.txHash),
        onChain: true,
        event: createOnChainEvent("LoanRejected", result.txHash, result.blockNumber, { loanId, reason }),
      };
    }
  }

  const event = createContractEvent("LoanRejected", { loanId, reason: reason || "Not approved" });
  return {
    txHash: event.txHash,
    blockNumber: event.blockNumber,
    contractAddress: getContractAddress() || generateContractAddress(),
    onChain: false,
    event,
  };
}
