import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'share_text.db');
const db = new DatabaseSync(dbPath);

// Initialize tables
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pin_code TEXT UNIQUE NOT NULL,
    title TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER DEFAULT 0,
    views_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    share_id INTEGER NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
    title TEXT,
    content TEXT NOT NULL,
    language TEXT DEFAULT 'plaintext',
    sort_order INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_shares_pin ON shares(pin_code);

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    pin_hash TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    share_id INTEGER NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    UNIQUE(username, share_id)
  );

  CREATE INDEX IF NOT EXISTS idx_user_shares_user ON user_shares(username);
`);

/**
 * Generate a random 6-digit numeric PIN
 */
export function generateRandomPin() {
  const pin = Math.floor(100000 + Math.random() * 900000).toString();
  return pin;
}

/**
 * Check if a PIN already exists
 */
export function pinExists(pinCode) {
  const stmt = db.prepare('SELECT id FROM shares WHERE pin_code = ?');
  const result = stmt.get(pinCode.toUpperCase());
  return !!result;
}

/**
 * Clean up expired shares
 */
export function cleanupExpired() {
  const now = Date.now();
  const stmt = db.prepare('DELETE FROM shares WHERE expires_at > 0 AND expires_at < ?');
  stmt.run(now);
}

/**
 * Account authentication helper
 */
export function verifyAccountAuth(username, password) {
  const cleanUser = username.trim().toLowerCase();
  const stmt = db.prepare('SELECT * FROM accounts WHERE username = ?');
  const acc = stmt.get(cleanUser);

  if (!acc) return { ok: true, isNew: true, cleanUser };

  if (acc.pin_hash && acc.pin_hash !== password) {
    return { ok: false, message: 'Password salah untuk akun/kunci ini.' };
  }

  return { ok: true, isNew: false, cleanUser, hasPassword: !!acc.pin_hash };
}

/**
 * Connect or create account / sync key
 */
export function connectAccount(username, password = '') {
  const cleanUser = username.trim().toLowerCase();
  if (!/^[a-z0-9_\-\.]{3,30}$/i.test(cleanUser)) {
    throw new Error('Format Kunci Akun harus 3-30 karakter (huruf, angka, _, -).');
  }

  const stmt = db.prepare('SELECT * FROM accounts WHERE username = ?');
  const acc = stmt.get(cleanUser);
  const pass = password ? password.trim() : '';

  if (!acc) {
    const insert = db.prepare('INSERT INTO accounts (username, pin_hash, created_at) VALUES (?, ?, ?)');
    insert.run(cleanUser, pass ? pass : null, Date.now());
    return { username: cleanUser, isNew: true, hasPassword: !!pass };
  }

  if (acc.pin_hash) {
    if (!pass || acc.pin_hash !== pass) {
      throw new Error('Password salah untuk Kunci Akun ini.');
    }
  } else if (pass) {
    const update = db.prepare('UPDATE accounts SET pin_hash = ? WHERE username = ?');
    update.run(pass, cleanUser);
  }

  return { username: cleanUser, isNew: false, hasPassword: !!(acc.pin_hash || pass) };
}

/**
 * Retrieve user cloud shares
 */
export function getUserShares(username, password = '') {
  cleanupExpired();
  const auth = verifyAccountAuth(username, password);
  if (!auth.ok) throw new Error(auth.message);

  const stmt = db.prepare(`
    SELECT s.id, s.pin_code as pin, s.title, s.created_at as createdAt, s.expires_at as expiresAt, s.views_count as viewsCount,
           (SELECT COUNT(*) FROM cards c WHERE c.share_id = s.id) as cardCount
    FROM user_shares us
    JOIN shares s ON us.share_id = s.id
    WHERE us.username = ?
    ORDER BY s.created_at DESC
    LIMIT 100
  `);

  const shares = stmt.all(auth.cleanUser);
  return { username: auth.cleanUser, shares };
}

/**
 * Claim existing PIN into account
 */
export function claimPin(username, password = '', pin) {
  const auth = verifyAccountAuth(username, password);
  if (!auth.ok) throw new Error(auth.message);

  const cleanPin = pin.trim().toUpperCase();
  const shareStmt = db.prepare('SELECT id, title FROM shares WHERE pin_code = ?');
  const share = shareStmt.get(cleanPin);

  if (!share) {
    throw new Error(`Teks dengan PIN "${cleanPin}" tidak ditemukan di database atau sudah kedaluwarsa.`);
  }

  const linkStmt = db.prepare(`
    INSERT OR IGNORE INTO user_shares (username, share_id, created_at)
    VALUES (?, ?, ?)
  `);
  linkStmt.run(auth.cleanUser, share.id, Date.now());

  return { pin: cleanPin, title: share.title };
}

/**
 * Create a new share with multiple text cards (supports optional account sync)
 */
export function createShare({ pinCode, title, expiresAt = 0, cards = [], syncKey = '', syncPassword = '' }) {
  cleanupExpired();

  let cleanSyncUser = '';
  if (syncKey && syncKey.trim()) {
    const auth = verifyAccountAuth(syncKey, syncPassword || '');
    if (!auth.ok) throw new Error(auth.message);
    cleanSyncUser = auth.cleanUser;
    if (auth.isNew) {
      const ins = db.prepare('INSERT INTO accounts (username, pin_hash, created_at) VALUES (?, ?, ?)');
      ins.run(cleanSyncUser, syncPassword ? syncPassword.trim() : null, Date.now());
    }
  }

  let finalPin = pinCode ? pinCode.trim().toUpperCase() : '';
  
  if (!finalPin) {
    let attempts = 0;
    do {
      finalPin = generateRandomPin();
      attempts++;
    } while (pinExists(finalPin) && attempts < 15);
  } else {
    // Validate format: 4-12 alphanumeric characters
    if (!/^[A-Z0-9_-]{4,12}$/i.test(finalPin)) {
      throw new Error('Format PIN harus 4-12 karakter (angka/huruf)');
    }
    if (pinExists(finalPin)) {
      throw new Error(`PIN "${finalPin}" sudah digunakan. Silakan pilih PIN lain atau buat acak.`);
    }
  }

  const now = Date.now();
  const insertShare = db.prepare(`
    INSERT INTO shares (pin_code, title, created_at, expires_at, views_count)
    VALUES (?, ?, ?, ?, 0)
  `);

  insertShare.run(finalPin, title ? title.trim() : 'Koleksi Teks', now, expiresAt || 0);

  // Retrieve inserted share id
  const getShareStmt = db.prepare('SELECT id FROM shares WHERE pin_code = ?');
  const share = getShareStmt.get(finalPin);

  const insertCard = db.prepare(`
    INSERT INTO cards (share_id, title, content, language, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);

  cards.forEach((card, idx) => {
    insertCard.run(
      share.id,
      card.title ? card.title.trim() : `Teks #${idx + 1}`,
      card.content || '',
      card.language || 'plaintext',
      idx
    );
  });

  if (cleanSyncUser) {
    const linkStmt = db.prepare(`
      INSERT OR IGNORE INTO user_shares (username, share_id, created_at)
      VALUES (?, ?, ?)
    `);
    linkStmt.run(cleanSyncUser, share.id, now);
  }

  return {
    id: share.id,
    pin: finalPin,
    title: title || 'Koleksi Teks',
    createdAt: now,
    expiresAt: expiresAt || 0,
    cardCount: cards.length,
    syncedTo: cleanSyncUser || null
  };
}

/**
 * Retrieve a share and its cards by PIN code
 */
export function getShareByPin(pinCode) {
  cleanupExpired();

  const formattedPin = pinCode.trim().toUpperCase();
  const shareStmt = db.prepare(`
    SELECT id, pin_code, title, created_at, expires_at, views_count
    FROM shares
    WHERE pin_code = ?
  `);
  const share = shareStmt.get(formattedPin);

  if (!share) {
    return null;
  }

  // Check expiration
  if (share.expires_at > 0 && share.expires_at < Date.now()) {
    const deleteStmt = db.prepare('DELETE FROM shares WHERE id = ?');
    deleteStmt.run(share.id);
    return null;
  }

  // Increment views
  const updateViews = db.prepare('UPDATE shares SET views_count = views_count + 1 WHERE id = ?');
  updateViews.run(share.id);

  // Fetch cards
  const cardsStmt = db.prepare(`
    SELECT id, title, content, language, sort_order
    FROM cards
    WHERE share_id = ?
    ORDER BY sort_order ASC, id ASC
  `);
  const cards = cardsStmt.all(share.id);

  return {
    id: share.id,
    pin: share.pin_code,
    title: share.title,
    createdAt: share.created_at,
    expiresAt: share.expires_at,
    viewsCount: share.views_count + 1,
    cards: cards.map(c => ({
      id: c.id,
      title: c.title,
      content: c.content,
      language: c.language,
      sortOrder: c.sort_order
    }))
  };
}

export default {
  createShare,
  getShareByPin,
  generateRandomPin,
  cleanupExpired,
  connectAccount,
  getUserShares,
  claimPin
};
