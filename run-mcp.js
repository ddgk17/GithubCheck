
import { spawn } from "child_process";

const prOwner = process.env.PR_OWNER;
const prRepo = process.env.PR_REPO;
const prNumber = Number(process.env.PR_NUMBER);
const token = process.env.GITHUB_TOKEN;

if (!prOwner || !prRepo || !prNumber || !token) {
  console.error("Missing environment variables");
  process.exit(1);
}

console.log(`Running MCP for PR #${prNumber} on ${prOwner}/${prRepo}`);


const child = spawn("node", ["./dist/github-mcp.js"], {
  stdio: ["pipe", "pipe", "inherit"]
});

// JSON-RPC request → calls analyze_and_comment_pr
const request = {
  jsonrpc: "2.0",
  id: 1,
  method: "tools.call",
  params: {
    name: "analyze_and_comment_pr",
    arguments: {
      owner: prOwner,
      repo: prRepo,
      pull_number: prNumber,
      token: token
    }
  }
};

child.stdin.write(JSON.stringify(request) + "\n");

child.stdout.on("data", (data) => {
  console.log("MCP Response:", data.toString());
});

child.on("exit", (code) => {
  console.log("MCP server exited:", code);
});
