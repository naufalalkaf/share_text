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
 * Create a new share with multiple text cards
 */
export function createShare({ pinCode, title, expiresAt = 0, cards = [] }) {
  cleanupExpired();

  let finalPin = pinCode ? pinCode.trim().toUpperCase() : '';
  
  if (!finalPin) {
    let attempts = 0;
    do {
      finalPin = generateRandomPin();
      attempts++;
    } while (pinExists(finalPin) && attempts < 15);
  } else {
    // Validate format: 4-10 alphanumeric characters
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

  return {
    id: share.id,
    pin: finalPin,
    title: title || 'Koleksi Teks',
    createdAt: now,
    expiresAt: expiresAt || 0,
    cardCount: cards.length
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
  cleanupExpired
};
