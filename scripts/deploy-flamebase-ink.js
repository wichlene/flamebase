// Deploys the core FlameBase social contract to Ink (Kraken's OP Stack L2).
//
// Usage (from project root, with PRIVATE_KEY set in .env):
//   npx hardhat run scripts/deploy-flamebase-ink.js --network ink
//
// After it prints the address, set it in your Vercel env as
//   NEXT_PUBLIC_FLAMEBASE_INK_CONTRACT=<address>
// so the frontend can offer Ink as a second network.

const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying FlameBase to Ink with account:", deployer.address);

  const FlameBase = await hre.ethers.getContractFactory("FlameBase");
  const contract = await FlameBase.deploy();
  await contract.waitForDeployment();

  const addr = await contract.getAddress();
  console.log("FlameBase deployed to Ink at:", addr);
  console.log("\nSet this in your environment:");
  console.log(`NEXT_PUBLIC_FLAMEBASE_INK_CONTRACT=${addr}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
