const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const logger = require("../../logger");

class AgentDefinitionLoader {
  constructor() {
    this.agents = new Map();
    this.loadBuiltInAgents();
    this.loadFilesystemAgents();
  }

  /**
   * Load built-in agents (Explore, Plan, General)
   */
  loadBuiltInAgents() {
    // Explore Agent
    this.agents.set("Explore", {
      name: "Explore",
      description: "Fast codebase exploration for finding files, searching code, and understanding architecture. MUST BE USED when user asks 'where is', 'find all', 'how does X work', or needs to search codebase.",
      systemPrompt: `You are a fast codebase exploration agent.

Your role:
- Search codebases efficiently using Glob, Grep, Read
- Find files, functions, patterns
- Answer questions about code location and structure
- Provide concise, actionable findings

Tools available: Glob, Grep, Read, workspace_search, workspace_symbol_search

IMPORTANT RULES:
1. You CANNOT spawn subagents (no Task tool)
2. Return ONLY a summary of findings (not all intermediate steps)
3. Be efficient - aim for 5-8 tool calls maximum
4. Include specific file paths and line numbers in your final answer
5. When done, provide clear summary starting with "EXPLORATION COMPLETE:"

Work autonomously. Do not ask questions.`,
      allowedTools: [
        "Glob",
        "Grep",
        "Read"
      ],
      model: "haiku", // Fast, cheap
      maxSteps: 10,
      builtIn: true
    });

    // Plan Agent
    this.agents.set("Plan", {
      name: "Plan",
      description: "Design implementation plans for features. MUST BE USED when user asks 'how should I implement', 'plan for adding', 'design approach for', or needs architectural guidance.",
      systemPrompt: `You are an implementation planning agent.

Your role:
- Understand existing codebase architecture
- Design step-by-step implementation plans
- Identify files to modify
- Consider edge cases and testing

Tools available: All exploration tools

IMPORTANT RULES:
1. You CANNOT spawn subagents (no Task tool)
2. Explore codebase first to understand patterns
3. Create detailed, numbered implementation steps
4. Return ONLY the final plan (not exploration details)
5. When done, provide plan starting with "IMPLEMENTATION PLAN:"

Maximum 10 exploration steps, then generate plan.
Work autonomously. Make reasonable assumptions.`,
      allowedTools: [
        "Glob",
        "Grep",
        "Read"
      ],
      model: "sonnet", // Needs reasoning
      maxSteps: 15,
      builtIn: true
    });

    // General-Purpose Agent
    this.agents.set("general-purpose", {
      name: "general-purpose",
      description: "Complex multi-step tasks requiring file modifications, refactoring, or implementing features. MUST BE USED for 'refactor', 'implement', 'add feature', 'update all', or complex changes.",
      systemPrompt: `You are a general-purpose agent for complex tasks.

Your role:
- Execute multi-step implementations
- Modify files, refactor code, add features
- Use all available tools to complete tasks
- Handle errors and adapt

Tools available: ALL TOOLS (Read, Write, Edit, Bash, Glob, Grep, etc.)

IMPORTANT RULES:
1. You CANNOT spawn subagents (no Task tool)
2. Break complex tasks into steps
3. Execute autonomously
4. Return ONLY summary of changes (not all tool output)
5. When done, provide summary starting with "TASK COMPLETE:"

Maximum 20 steps.
Work autonomously. Complete the task.`,
      allowedTools: [], // Empty = all tools allowed
      model: "sonnet",
      maxSteps: 20,
      builtIn: true
    });

    logger.info({ count: this.agents.size }, "Loaded built-in agents");
  }

  /**
   * Load agents from .claude/agents/*.md files
   */
  loadFilesystemAgents() {
    const agentsDir = path.join(process.cwd(), ".claude", "agents");

    if (!fs.existsSync(agentsDir)) {
      logger.debug("No .claude/agents directory found, skipping filesystem agents");
      return;
    }

    const files = fs.readdirSync(agentsDir).filter(f => f.endsWith(".md"));

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(agentsDir, file), "utf8");
        const agent = this.parseAgentFile(content, file);

        if (agent) {
          // Programmatic agents take precedence over filesystem
          if (!this.agents.has(agent.name) || !this.agents.get(agent.name).builtIn) {
            this.agents.set(agent.name, agent);
            logger.info({ name: agent.name, file }, "Loaded filesystem agent");
          }
        }
      } catch (error) {
        logger.warn({ file, error: error.message }, "Failed to load agent file");
      }
    }
  }

  /**
   * Parse agent markdown file with YAML frontmatter
   */
  parseAgentFile(content, filename) {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

    if (!match) {
      logger.warn({ filename }, "Agent file missing YAML frontmatter");
      return null;
    }

    const [, frontmatter, body] = match;
    const config = yaml.load(frontmatter);

    return {
      name: config.name || path.basename(filename, ".md"),
      description: config.description || "",
      systemPrompt: body.trim(),
      allowedTools: config.tools || [],
      model: config.model || "sonnet",
      maxSteps: config.maxSteps || 15,
      builtIn: false,
      source: "filesystem"
    };
  }

  /**
   * Register agent programmatically (takes precedence over filesystem)
   */
  registerAgent(name, definition) {
    this.agents.set(name, {
      ...definition,
      name,
      builtIn: false,
      source: "programmatic"
    });
    logger.info({ name }, "Registered programmatic agent");
  }

  /**
   * Get agent definition by name
   */
  getAgent(name) {
    // Case-insensitive lookup
    const normalized = name.toLowerCase();
    for (const [key, value] of this.agents.entries()) {
      if (key.toLowerCase() === normalized) {
        return value;
      }
    }
    return null;
  }

  /**
   * Get all agent definitions
   */
  getAllAgents() {
    return Array.from(this.agents.values());
  }

  /**
   * Find agent by task description (automatic delegation)
   */
  findAgentForTask(taskDescription) {
    const desc = taskDescription.toLowerCase();

    // Score each agent based on description match
    let bestMatch = null;
    let bestScore = 0;

    for (const agent of this.agents.values()) {
      const agentDesc = agent.description.toLowerCase();

      // Extract keywords from agent description
      const keywords = this.extractKeywords(agentDesc);

      // Count matches
      let score = 0;
      for (const keyword of keywords) {
        if (desc.includes(keyword)) {
          score += keyword.length; // Longer keywords = higher weight
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = agent;
      }
    }

    // Require minimum score to avoid false positives
    if (bestScore >= 5) {
      logger.info({
        agent: bestMatch.name,
        score: bestScore,
        task: taskDescription.slice(0, 50)
      }, "Auto-selected agent for task");
      return bestMatch;
    }

    return null;
  }

  /**
   * Extract keywords from agent description
   */
  extractKeywords(description) {
    // Extract words in quotes and common phrases
    const keywords = [];

    // Words in quotes
    const quoted = description.match(/'([^']+)'/g) || [];
    keywords.push(...quoted.map(q => q.replace(/'/g, "")));

    // Common action words
    const actions = ["find", "search", "implement", "plan", "refactor", "explore"];
    for (const action of actions) {
      if (description.includes(action)) {
        keywords.push(action);
      }
    }

    return keywords;
  }
}

module.exports = AgentDefinitionLoader;
