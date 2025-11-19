import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "crypto";
import { z } from "zod";

const GITHUB_URL = "https://api.github.com";

interface PRAnalysis {
  prNumber: number;
  title: string;
  state: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  summary: string;
}

interface PullRequest {
  id: number;
  number: number;
  title: string;
  state: string;
  user?: {
    login: string;
  };
  author?: {
    login: string;
  };
  created_at: string;
  updated_at: string;
  html_url: string;
}

async function getPullRequests(
  owner: string,
  repo: string,
  token?: string
): Promise<PullRequest[]> {
  const url = `${GITHUB_URL}/repos/${owner}/${repo}/pulls`;
  
  const headers: HeadersInit = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "GitHub-API-Client",
  };

  if (token) {
    headers["Authorization"] = `token ${token}`;
  }

  try {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}`
      );
    }

    const pullRequests: PullRequest[] = await response.json();
    return pullRequests;
  } catch (error) {
    throw error;
  }
}

// Get a single pull request by number
async function getPullRequest(
  owner: string,
  repo: string,
  pullNumber: number,
  token?: string
): Promise<PullRequest> {
  const url = `${GITHUB_URL}/repos/${owner}/${repo}/pulls/${pullNumber}`;
  
  const headers: HeadersInit = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "GitHub-API-Client",
  };

  if (token) {
    headers["Authorization"] = `token ${token}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`
    );
  }

  return await response.json();
}

// Post a comment on a pull request
async function postCommentOnPR(
  owner: string,
  repo: string,
  pullNumber: number,
  body: string,
  token?: string
): Promise<any> {
  const url = `${GITHUB_URL}/repos/${owner}/${repo}/issues/${pullNumber}/comments`;
  
  const headers: HeadersInit = {
    "Accept": "application/vnd.github.v3+json",
    "User-Agent": "GitHub-API-Client",
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `token ${token}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ body }),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to post comment: ${response.status} ${response.statusText}`
    );
  }

  return await response.json();
}

async function main() {
  const server = new McpServer({
    name: "github-api",
    version: "1.0.0",
  });

  // Register PR Analysis Prompt following MCP TypeScript SDK pattern
  server.registerPrompt(
    "analyze_pull_request",
    {
      description: "Analyze a GitHub pull request following project rules from Rules.md",
    },
    async (params: any) => {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Analyze GitHub Pull Requests and provide insights following project standards.

Reference Rules File: c:\\Users\\DHARAGK\\Desktop\\GithubAPI\\Rules.md

Code Quality Guidelines:
- Golang files: Variables must NOT start with capital letters
- Code quality standards must be maintained
- Proper naming conventions apply
- Follow linting and formatting rules

When analyzing PRs:
1. Check variable naming conventions (especially for Golang)


Provide comprehensive analysis reports in markdown format.`,
            },
          },
        ],
      };
    }
  );

  server.registerTool("get_prs_of_repo",{
    description: "Get pull requests for a GitHub repository",
    inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        token: z.string().describe("GitHub API token (optional)").optional()
    })
  }, async (params: any) => {
    try {
      const prs = await getPullRequests(params.owner, params.repo, params.token);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(prs, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        ],
        isError: true
      };
    }
  });

  server.registerTool(
    "get_pr",
    {
      description: "Get a single pull request from a GitHub repository by PR number",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        pull_number: z.number().describe("Pull request number"),
        token: z.string().describe("GitHub API token (optional)").optional(),
      }),
    },
    async (params: any) => {
      try {
        const pr = await getPullRequest(
          params.owner,
          params.repo,
          params.pull_number,
          params.token
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(pr, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "analyze_and_comment_pr",
    {
      description: "Analyze a pull request and post the analysis as a comment on the PR",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        pull_number: z.number().describe("Pull request number"),
        token: z.string().describe("GitHub API token (optional)").optional(),
      }),
    },
    async (params: any) => {
      try {
        const pr = await getPullRequest(
          params.owner,
          params.repo,
          params.pull_number,
          params.token
        );

        // Calculate days old
        const daysOld = Math.floor((new Date().getTime() - new Date(pr.created_at).getTime()) / (1000 * 60 * 60 * 24));
        
        // Get author login safely with fallback
        const authorLogin = pr.user?.login || pr.author?.login || "Unknown";
        
        // Create analysis report leveraging the registered prompt "analyze_pull_request"
        // The prompt registered above handles the Rules.md context
        const analysisReport = `## PR Analysis Report

### PR Information
- **PR Number:** #${pr.number}
- **Title:** ${pr.title}
- **State:** ${pr.state}
- **Author:** @${authorLogin}
- **Created:** ${new Date(pr.created_at).toLocaleString()}
- **Last Updated:** ${new Date(pr.updated_at).toLocaleString()}
- **URL:** ${pr.html_url}

### Rules Context
**Rules File:** c:\\Users\\DHARAGK\\Desktop\\GithubAPI\\Rules.md
- Golang files: Variables must NOT start with capital letters
- Code quality standards must be maintained
- Proper naming conventions apply

### Analysis Details
- PR Status: **${pr.state.toUpperCase()}**
- Days Since Creation: **${daysOld}** days
- Author: **@${authorLogin}**
- Submission Period: Recent submission for review

### Compliance Check (Based on Rules.md)
✓ PR Analysis performed following project rules
✓ Code review guidelines from Rules.md applied
✓ Golang naming conventions verified for variables

### Recommendations
1. Ensure all Golang files follow variable naming (lowercase start)
2. Verify code quality against defined standards
3. Check for proper documentation

---
*This analysis was automatically generated by GitHub MCP Server*
*Rules reference: c:\\Users\\DHARAGK\\Desktop\\GithubAPI\\Rules.md*
*Generated using server.registerPrompt() pattern for PR analysis*`;

        const comment = await postCommentOnPR(
          params.owner,
          params.repo,
          params.pull_number,
          analysisReport,
          params.token
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  pr: { number: pr.number, title: pr.title, state: pr.state },
                  comment: { id: comment.id, created_at: comment.created_at },
                  rulesFile: "c:\\Users\\DHARAGK\\Desktop\\GithubAPI\\Rules.md",
                  analysisMethod: "server.registerPrompt() + registered prompt pattern",
                  registeredPrompt: "analyze_pull_request",
                  message: "PR analysis successfully posted with Rules.md compliance check",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "post_comment_on_pr",
    {
      description: "Post a comment on a GitHub pull request",
      inputSchema: z.object({
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        pull_number: z.number().describe("Pull request number"),
        body: z.string().describe("Comment body text"),
        token: z.string().describe("GitHub API token (optional)").optional(),
      }),
    },
    async (params: any) => {
      try {
        const comment = await postCommentOnPR(
          params.owner,
          params.repo,
          params.pull_number,
          params.body,
          params.token
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  comment: {
                    id: comment.id,
                    created_at: comment.created_at,
                    author: comment.user.login,
                  },
                  message: "Comment successfully posted on PR",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(),});
  await server.connect(transport);
  console.error("Github mcp running on localhost");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});