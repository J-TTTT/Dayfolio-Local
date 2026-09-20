CREATE TABLE users(id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','member')), active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE invitations(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,token_hash TEXT NOT NULL,expires INTEGER NOT NULL,created_at TEXT NOT NULL);
