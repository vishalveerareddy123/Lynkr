const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const logger = require("../logger");

class AgentStore {
  constructor() {
    // Use same database location as main app
    const dbDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const dbPath = path.join(dbDir, "lynkr.db");
    this.db = new Database(dbPath, {
      verbose: process.env.DEBUG_SQL ? console.log : null,
      fileMustExist: false
    });

    this.initTables();
    this.prepareStatements();
  }

  initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_executions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        agent_type TEXT NOT NULL,
        prompt TEXT NOT NULL,
        model TEXT NOT NULL,
        status TEXT NOT NULL, -- 'pending', 'running', 'completed', 'failed'
        result TEXT,
        error TEXT,
        steps INTEGER DEFAULT 0,
        duration_ms INTEGER,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_agent_executions_session_id
        ON agent_executions(session_id);

      CREATE INDEX IF NOT EXISTS idx_agent_executions_agent_type
        ON agent_executions(agent_type);

      CREATE INDEX IF NOT EXISTS idx_agent_executions_status
        ON agent_executions(status);

      CREATE INDEX IF NOT EXISTS idx_agent_executions_created_at
        ON agent_executions(created_at DESC);
    `);

    logger.info("Agent store tables initialized");
  }

  prepareStatements() {
    this.stmts = {
      create: this.db.prepare(`
        INSERT INTO agent_executions (
          session_id, agent_type, prompt, model, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `),

      updateStatus: this.db.prepare(`
        UPDATE agent_executions
        SET status = ?, completed_at = ?
        WHERE id = ?
      `),

      complete: this.db.prepare(`
        UPDATE agent_executions
        SET status = 'completed',
            result = ?,
            steps = ?,
            duration_ms = ?,
            input_tokens = ?,
            output_tokens = ?,
            completed_at = ?
        WHERE id = ?
      `),

      fail: this.db.prepare(`
        UPDATE agent_executions
        SET status = 'failed',
            error = ?,
            steps = ?,
            duration_ms = ?,
            completed_at = ?
        WHERE id = ?
      `),

      get: this.db.prepare(`
        SELECT * FROM agent_executions WHERE id = ?
      `),

      getBySession: this.db.prepare(`
        SELECT * FROM agent_executions
        WHERE session_id = ?
        ORDER BY created_at DESC
      `),

      getRecent: this.db.prepare(`
        SELECT * FROM agent_executions
        ORDER BY created_at DESC
        LIMIT ?
      `),

      stats: this.db.prepare(`
        SELECT
          agent_type,
          COUNT(*) as total_executions,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          AVG(CASE WHEN status = 'completed' THEN duration_ms ELSE NULL END) as avg_duration_ms,
          SUM(input_tokens) as total_input_tokens,
          SUM(output_tokens) as total_output_tokens
        FROM agent_executions
        GROUP BY agent_type
      `)
    };
  }

  /**
   * Create new agent execution
   */
  createExecution({ sessionId, agentType, prompt, model }) {
    const now = Date.now();
    const result = this.stmts.create.run(
      sessionId || null,
      agentType,
      prompt,
      model,
      'pending',
      now
    );

    logger.info({
      executionId: result.lastInsertRowid,
      agentType,
      sessionId
    }, "Created agent execution");

    return result.lastInsertRowid;
  }

  /**
   * Update execution status
   */
  updateStatus(executionId, status) {
    const now = Date.now();
    this.stmts.updateStatus.run(status, now, executionId);
  }

  /**
   * Mark execution as completed
   */
  completeExecution(executionId, result, stats = {}) {
    const now = Date.now();
    this.stmts.complete.run(
      result,
      stats.steps || 0,
      stats.durationMs || 0,
      stats.inputTokens || 0,
      stats.outputTokens || 0,
      now,
      executionId
    );

    logger.info({
      executionId,
      steps: stats.steps,
      durationMs: stats.durationMs
    }, "Agent execution completed");
  }

  /**
   * Mark execution as failed
   */
  failExecution(executionId, error, stats = {}) {
    const now = Date.now();
    this.stmts.fail.run(
      error.message || String(error),
      stats.steps || 0,
      stats.durationMs || 0,
      now,
      executionId
    );

    logger.warn({
      executionId,
      error: error.message
    }, "Agent execution failed");
  }

  /**
   * Get execution by ID
   */
  getExecution(executionId) {
    return this.stmts.get.get(executionId);
  }

  /**
   * Get executions by session
   */
  getSessionExecutions(sessionId) {
    return this.stmts.getBySession.all(sessionId);
  }

  /**
   * Get recent executions
   */
  getRecentExecutions(limit = 100) {
    return this.stmts.getRecent.all(limit);
  }

  /**
   * Get aggregate statistics
   */
  getStats() {
    return this.stmts.stats.all();
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

// Singleton instance
let instance = null;

function getInstance() {
  if (!instance) {
    instance = new AgentStore();
  }
  return instance;
}

module.exports = getInstance();
