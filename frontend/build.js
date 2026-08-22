const { execSync } = require("child_process");

// Render legacy build chain runs: cd frontend && npm install --legacy-peer-deps && npm run build
// The real Next.js app lives at the repo root, so bridge the build there.
execSync("npm install --legacy-peer-deps", { cwd: "..", stdio: "inherit" });
execSync("npm run build", { cwd: "..", stdio: "inherit" });
