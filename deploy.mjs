import { execSync } from 'child_process';

console.log("Building...");
execSync("npm run build", { stdio: "inherit" });

console.log("\nDeploying to Main Project (gen-lang-client-0746151360)...");
execSync("npx firebase deploy --project gen-lang-client-0746151360", { stdio: "inherit" });

console.log("\nDeployment completed successfully!");
