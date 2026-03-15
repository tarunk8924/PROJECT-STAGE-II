import solc from "solc";
import fs from "fs";
import path from "path";

const contractPath = path.resolve("contracts/MicroCreditLoan.sol");
const source = fs.readFileSync(contractPath, "utf8");

const input = {
  language: "Solidity",
  sources: {
    "MicroCreditLoan.sol": {
      content: source,
    },
  },
  settings: {
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object"],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  const errors = output.errors.filter((e: any) => e.severity === "error");
  if (errors.length > 0) {
    console.error("Compilation errors:");
    errors.forEach((e: any) => console.error(e.formattedMessage));
    process.exit(1);
  }
}

const contract = output.contracts["MicroCreditLoan.sol"]["MicroCreditLoan"];
const artifact = {
  abi: contract.abi,
  bytecode: "0x" + contract.evm.bytecode.object,
};

const outDir = path.resolve("contracts/artifacts");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "MicroCreditLoan.json"),
  JSON.stringify(artifact, null, 2)
);

console.log("Contract compiled successfully!");
console.log("ABI and bytecode saved to contracts/artifacts/MicroCreditLoan.json");
