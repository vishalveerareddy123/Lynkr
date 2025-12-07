const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const config = require("../config");
const logger = require("../logger");

const dbPath = config.sessionStore.dbPath;
const directory = path.dirname(dbPath);

if (!fs.existsSync(directory)) {
  fs.mkdirSync(directory, { recursive: true });
}

const db = new Database(dbPath, {
  verbose: process.env.DEBUG_SQL ? console.log : null,
  fileMustExist: false
});

// Optimize SQLite settings for performance
db.pragma("journal_mode = WAL");              // Write-Ahead Logging for better concurrency
db.pragma("synchronous = NORMAL");            // Faster writes (still safe with WAL)
db.pragma("foreign_keys = ON");               // Enforce foreign key constraints
db.pragma("cache_size = -64000");             // 64MB cache (negative = KB)
db.pragma("temp_store = MEMORY");             // Store temp tables in memory
db.pragma("mmap_size = 30000000000");         // 30GB memory-mapped I/O
db.pragma("page_size = 4096");                // Optimal page size
db.pragma("busy_timeout = 5000");             // Wait 5s if database is locked

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    metadata TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS session_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT,
    type TEXT,
    status INTEGER,
    content TEXT,
    metadata TEXT,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_session_history_session_id_timestamp
    ON session_history(session_id, timestamp);

  CREATE INDEX IF NOT EXISTS idx_session_history_role
    ON session_history(role);

  CREATE INDEX IF NOT EXISTS idx_sessions_created_at
    ON sessions(created_at);

  CREATE INDEX IF NOT EXISTS idx_sessions_updated_at
    ON sessions(updated_at);

  CREATE TABLE IF NOT EXISTS files (
    path TEXT PRIMARY KEY,
    size_bytes INTEGER NOT NULL,
    mtime_ms INTEGER NOT NULL,
    language TEXT,
    summary TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_files_language
    ON files(language);

  CREATE INDEX IF NOT EXISTS idx_files_mtime
    ON files(mtime_ms DESC);

  CREATE TABLE IF NOT EXISTS symbols (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT,
    line INTEGER,
    column INTEGER,
    metadata TEXT,
    FOREIGN KEY (file_path) REFERENCES files(path) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_symbols_file_path
    ON symbols(file_path);

  CREATE INDEX IF NOT EXISTS idx_symbols_name
    ON symbols(name);

  CREATE INDEX IF NOT EXISTS idx_symbols_kind
    ON symbols(kind);

  CREATE TABLE IF NOT EXISTS framework_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    file_path TEXT,
    detail TEXT,
    metadata TEXT
  );

  CREATE TABLE IF NOT EXISTS workspace_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS edits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    file_path TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    source TEXT,
    before_content TEXT,
    after_content TEXT,
    diff TEXT,
    metadata TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_edits_file_path_created
    ON edits(file_path, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_edits_session_created
    ON edits(session_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS symbol_references (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol_id INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    line INTEGER,
    column INTEGER,
    snippet TEXT,
    metadata TEXT,
    FOREIGN KEY (symbol_id) REFERENCES symbols(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_symbol_references_symbol
    ON symbol_references(symbol_id);

  CREATE INDEX IF NOT EXISTS idx_symbol_references_file
    ON symbol_references(file_path, line);

  CREATE TABLE IF NOT EXISTS file_dependencies (
    from_path TEXT NOT NULL,
    to_path TEXT NOT NULL,
    kind TEXT,
    metadata TEXT,
    FOREIGN KEY (from_path) REFERENCES files(path) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_file_dependencies_from
    ON file_dependencies(from_path);

  CREATE INDEX IF NOT EXISTS idx_file_dependencies_to
    ON file_dependencies(to_path);

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    priority INTEGER DEFAULT 0,
    tags TEXT,
    linked_file TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    created_by TEXT,
    updated_by TEXT,
    metadata TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_status
    ON tasks(status, priority DESC, updated_at DESC);

  CREATE INDEX IF NOT EXISTS idx_tasks_linked_file
    ON tasks(linked_file, status);

  CREATE INDEX IF NOT EXISTS idx_tasks_updated_at
    ON tasks(updated_at DESC);

  CREATE TABLE IF NOT EXISTS diff_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id TEXT,
    session_id TEXT,
    file_path TEXT NOT NULL,
    hunk TEXT,
    line INTEGER,
    comment TEXT NOT NULL,
    author TEXT,
    created_at INTEGER NOT NULL,
    metadata TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_diff_comments_thread
    ON diff_comments(thread_id);

  CREATE INDEX IF NOT EXISTS idx_diff_comments_file
    ON diff_comments(file_path, line);

  CREATE TABLE IF NOT EXISTS test_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile TEXT,
    status TEXT,
    command TEXT NOT NULL,
    args TEXT,
    cwd TEXT,
    exit_code INTEGER,
    timed_out INTEGER DEFAULT 0,
    duration_ms INTEGER,
    sandbox TEXT,
    stdout TEXT,
    stderr TEXT,
    coverage TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_test_runs_created
    ON test_runs(created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_test_runs_status
    ON test_runs(status);
`);

logger.info({ dbPath }, "SQLite session store initialised");

module.exports = db;
