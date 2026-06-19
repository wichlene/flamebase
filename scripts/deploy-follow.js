// Deploys the FlameFollow contract to the configured network.
//
// Usage (from project root, with PRIVATE_KEY set in .env):
//   npx hardhat run scripts/deploy-follow.js --network base
//
// After it prints the address, set it in your Vercel env as
//   NEXT_PUBLIC_FOLLOW_CONTRACT=<address>
// and redeploy the frontend so follows go on-chain.

const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying FlameFollow with account:", deployer.address);

  const FlameFollow = await hre.ethers.getContractFactory("FlameFollow");
  const contract = await FlameFollow.deploy();
  await contract.waitForDeployment();

  const addr = await contract.getAddress();
  console.log("FlameFollow deployed to:", addr);
  console.log("\nSet this in your environment:");
  console.log(`NEXT_PUBLIC_FOLLOW_CONTRACT=${addr}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
