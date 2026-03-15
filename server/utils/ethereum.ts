import { ethers } from "ethers";
import fs from "fs";
import path from "path";

let provider: ethers.JsonRpcProvider | null = null;
let wallet: ethers.Wallet | null = null;
let contractInstance: ethers.Contract | null = null;
let contractAddress: string | null = null;
let isInitialized = false;

const SEPOLIA_CHAIN_ID = 11155111;
const ETHERSCAN_BASE_URL = "https://sepolia.etherscan.io";

function loadArtifact() {
  const artifactPath = path.resolve("contracts/artifacts/MicroCreditLoan.json");
  if (!fs.existsSync(artifactPath)) {
    throw new Error("Contract artifact not found. Run compile script first.");
  }
  return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

export function isEthereumConfigured(): boolean {
  return !!(process.env.ETHEREUM_RPC_URL && process.env.DEPLOYER_PRIVATE_KEY);
}

export async function initEthereum(): Promise<boolean> {
  if (isInitialized) return true;

  const rpcUrl = process.env.ETHEREUM_RPC_URL?.trim();
  let privateKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();

  if (!rpcUrl || !privateKey) {
    console.log("Ethereum not configured - using simulation mode");
    return false;
  }

  privateKey = privateKey.replace(/['"]/g, "").trim();
  if (!privateKey.startsWith("0x")) {
    privateKey = "0x" + privateKey;
  }

  const hexPart = privateKey.slice(2);
  if (!/^[0-9a-fA-F]{64}$/.test(hexPart)) {
    console.error(`Invalid private key format: expected 64 hex characters, got ${hexPart.length} characters`);
    console.log("Please check your DEPLOYER_PRIVATE_KEY secret. It should be 64 hex characters from MetaMask.");
    return false;
  }

  try {
    provider = new ethers.JsonRpcProvider(rpcUrl);
    const network = await provider.getNetwork();
    console.log(`Connected to Ethereum network: ${network.name} (chainId: ${network.chainId})`);

    wallet = new ethers.Wallet(privateKey, provider);
    const balance = await provider.getBalance(wallet.address);
    console.log(`Deployer address: ${wallet.address}`);
    console.log(`Deployer balance: ${ethers.formatEther(balance)} ETH`);

    if (balance === 0n) {
      console.warn("Warning: Deployer wallet has 0 ETH. Transactions will fail.");
    }

    isInitialized = true;
    return true;
  } catch (error) {
    console.error("Failed to initialize Ethereum:", error);
    return false;
  }
}

export async function deployContract(): Promise<{ address: string; txHash: string; blockNumber: number } | null> {
  if (!wallet || !provider) {
    const initialized = await initEthereum();
    if (!initialized) return null;
  }

  try {
    const artifact = loadArtifact();
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet!);

    console.log("Deploying MicroCreditLoan contract to Ethereum...");
    const contract = await factory.deploy();
    const deployTx = contract.deploymentTransaction();

    if (!deployTx) throw new Error("Deployment transaction not found");

    console.log(`Deploy tx hash: ${deployTx.hash}`);
    const receipt = await deployTx.wait();

    if (!receipt) throw new Error("Deploy receipt not found");

    contractAddress = await contract.getAddress();
    contractInstance = new ethers.Contract(contractAddress, artifact.abi, wallet!);

    console.log(`Contract deployed at: ${contractAddress}`);
    console.log(`Block number: ${receipt.blockNumber}`);

    try {
      fs.writeFileSync(
        path.resolve("contracts/deployed_address.txt"),
        contractAddress
      );
      console.log("Contract address saved to contracts/deployed_address.txt");
    } catch (e) {
      console.warn("Could not save deployed address to file:", e);
    }

    return {
      address: contractAddress,
      txHash: deployTx.hash,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    console.error("Contract deployment failed:", error);
    return null;
  }
}

export async function getOrDeployContract(): Promise<ethers.Contract | null> {
  if (contractInstance) return contractInstance;

  if (!wallet) {
    const initialized = await initEthereum();
    if (!initialized) return null;
  }

  let savedAddress = process.env.CONTRACT_ADDRESS;
  if (!savedAddress) {
    try {
      const addrFile = path.resolve("contracts/deployed_address.txt");
      if (fs.existsSync(addrFile)) {
        savedAddress = fs.readFileSync(addrFile, "utf8").trim();
      }
    } catch (_) {}
  }
  if (savedAddress) {
    try {
      const artifact = loadArtifact();
      contractInstance = new ethers.Contract(savedAddress, artifact.abi, wallet!);
      contractAddress = savedAddress;
      console.log(`Using existing contract at: ${savedAddress}`);
      return contractInstance;
    } catch (error) {
      console.error("Failed to connect to existing contract:", error);
    }
  }

  const result = await deployContract();
  if (result) {
    return contractInstance;
  }
  return null;
}

export async function createLoanOnChain(
  loanId: number,
  borrowerAddress: string,
  amount: number,
  interestRate: number,
  tenure: number,
  totalDue: number
): Promise<{ txHash: string; blockNumber: number; contractAddress: string } | null> {
  const contract = await getOrDeployContract();
  if (!contract) return null;

  try {
    const amountWei = ethers.parseEther(amount.toString());
    const totalDueWei = ethers.parseEther(totalDue.toString());
    const interestRateBps = Math.round(interestRate * 100);

    const borrowerAddr = ethers.isAddress(borrowerAddress)
      ? borrowerAddress
      : ethers.getAddress("0x" + ethers.keccak256(ethers.toUtf8Bytes(borrowerAddress)).slice(26));

    const tx = await contract.createLoan(
      loanId,
      borrowerAddr,
      amountWei,
      interestRateBps,
      tenure,
      totalDueWei
    );
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      contractAddress: contractAddress!,
    };
  } catch (error) {
    console.error("Failed to create loan on chain:", error);
    return null;
  }
}

export async function approveLoanOnChain(
  loanId: number
): Promise<{ txHash: string; blockNumber: number } | null> {
  const contract = await getOrDeployContract();
  if (!contract) return null;

  try {
    const tx = await contract.approveLoan(loanId);
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    console.error("Failed to approve loan on chain:", error);
    return null;
  }
}

export async function recordRepaymentOnChain(
  loanId: number,
  amount: number
): Promise<{ txHash: string; blockNumber: number } | null> {
  const contract = await getOrDeployContract();
  if (!contract) return null;

  try {
    const amountWei = ethers.parseEther(amount.toString());
    const tx = await contract.recordRepayment(loanId, amountWei);
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    console.error("Failed to record repayment on chain:", error);
    return null;
  }
}

export async function markDefaultedOnChain(
  loanId: number
): Promise<{ txHash: string; blockNumber: number } | null> {
  const contract = await getOrDeployContract();
  if (!contract) return null;

  try {
    const tx = await contract.markDefaulted(loanId);
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    console.error("Failed to mark loan defaulted on chain:", error);
    return null;
  }
}

export async function rejectLoanOnChain(
  loanId: number,
  reason: string
): Promise<{ txHash: string; blockNumber: number } | null> {
  const contract = await getOrDeployContract();
  if (!contract) return null;

  try {
    const tx = await contract.rejectLoan(loanId, reason);
    const receipt = await tx.wait();

    return {
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    console.error("Failed to reject loan on chain:", error);
    return null;
  }
}

export function getEtherscanTxUrl(txHash: string): string {
  return `${ETHERSCAN_BASE_URL}/tx/${txHash}`;
}

export function getEtherscanAddressUrl(address: string): string {
  return `${ETHERSCAN_BASE_URL}/address/${address}`;
}

export function getContractAddress(): string | null {
  return contractAddress;
}

export function getDeployerAddress(): string | null {
  return wallet?.address || null;
}
