CREATE TABLE administrator (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  email TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 254 AND email = lower(trim(email))),
  password_salt TEXT NOT NULL CHECK (length(password_salt) = 64 AND password_salt NOT GLOB '*[^0-9a-f]*'),
  password_hash TEXT NOT NULL CHECK (length(password_hash) = 128 AND password_hash NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL
);
