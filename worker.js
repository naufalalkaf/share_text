// Cloudflare Worker for ShareText (Workers + Static Assets + D1)

// Helper to ensure database tables exist in Cloudflare D1
async function ensureTables(db) {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS shares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pin_code TEXT UNIQUE NOT NULL,
        title TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER DEFAULT 0,
        views_count INTEGER DEFAULT 0
      );
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        share_id INTEGER NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
        title TEXT,
        content TEXT NOT NULL,
        language TEXT DEFAULT 'plaintext',
        sort_order INTEGER DEFAULT 0
      );
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_shares_pin ON shares(pin_code);
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        pin_hash TEXT,
        created_at INTEGER NOT NULL
      );
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS user_shares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        share_id INTEGER NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        UNIQUE(username, share_id)
      );
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_user_shares_user ON user_shares(username);
    `)
  ]);
}

// Generate random 6-digit numeric PIN
function generateRandomPin() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Validate account credentials helper
async function verifyAccountAuth(db, username, password) {
  const cleanUser = username.trim().toLowerCase();
  const acc = await db.prepare('SELECT * FROM accounts WHERE username = ?')
    .bind(cleanUser)
    .first();

  if (!acc) return { ok: true, isNew: true, cleanUser };

  if (acc.pin_hash && acc.pin_hash !== password) {
    return { ok: false, message: 'Password salah untuk akun/kunci ini.' };
  }

  return { ok: true, isNew: false, cleanUser, hasPassword: !!acc.pin_hash };
}

// -------------------------------------------------------------
// API: CREATE SHARE
// -------------------------------------------------------------
async function handleCreateShare(request, env) {
  if (!env.DB) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Database D1 belum terhubung (binding "DB").'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    await ensureTables(env.DB);

    const body = await request.json();
    const { title, pinCode, expiryHours, cards, syncKey, syncPassword } = body;

    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Minimal harus ada 1 kartu teks yang dibagikan.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const validCards = cards.filter(c => c && (c.content?.trim() || c.title?.trim()));
    if (validCards.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Setidaknya salah satu kartu teks harus memiliki isi atau judul.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check account sync if provided
    let cleanSyncUser = '';
    if (syncKey && syncKey.trim()) {
      const authCheck = await verifyAccountAuth(env.DB, syncKey, syncPassword || '');
      if (!authCheck.ok) {
        return new Response(JSON.stringify({ success: false, message: authCheck.message }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      cleanSyncUser = authCheck.cleanUser;
      if (authCheck.isNew) {
        await env.DB.prepare('INSERT INTO accounts (username, pin_hash, created_at) VALUES (?, ?, ?)')
          .bind(cleanSyncUser, syncPassword ? syncPassword.trim() : null, Date.now())
          .run();
      }
    }

    let finalPin = pinCode ? pinCode.trim().toUpperCase() : '';

    if (!finalPin) {
      let attempts = 0;
      do {
        finalPin = generateRandomPin();
        const existing = await env.DB.prepare('SELECT id FROM shares WHERE pin_code = ?')
          .bind(finalPin)
          .first();
        if (!existing) break;
        attempts++;
      } while (attempts < 15);
    } else {
      if (!/^[A-Z0-9_-]{4,12}$/i.test(finalPin)) {
        return new Response(JSON.stringify({
          success: false,
          message: 'Format PIN harus 4-12 karakter (angka/huruf).'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const existing = await env.DB.prepare('SELECT id FROM shares WHERE pin_code = ?')
        .bind(finalPin)
        .first();

      if (existing) {
        return new Response(JSON.stringify({
          success: false,
          message: `PIN "${finalPin}" sudah digunakan. Silakan gunakan PIN lain atau buat acak.`
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    let expiresAt = 0;
    const hours = Number(expiryHours);
    if (!isNaN(hours) && hours > 0) {
      expiresAt = Date.now() + hours * 60 * 60 * 1000;
    }

    const now = Date.now();
    const finalTitle = title ? title.trim() : 'Koleksi Teks';

    // Insert Share
    await env.DB.prepare(`
      INSERT INTO shares (pin_code, title, created_at, expires_at, views_count)
      VALUES (?, ?, ?, ?, 0)
    `).bind(finalPin, finalTitle, now, expiresAt).run();

    const shareRecord = await env.DB.prepare('SELECT id FROM shares WHERE pin_code = ?')
      .bind(finalPin)
      .first();

    const shareId = shareRecord.id;

    // Batch Insert Cards
    const insertStatements = validCards.map((card, idx) => {
      return env.DB.prepare(`
        INSERT INTO cards (share_id, title, content, language, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        shareId,
        card.title ? card.title.trim() : `Teks #${idx + 1}`,
        card.content || '',
        card.language || 'plaintext',
        idx
      );
    });

    // Link to user account if connected
    if (cleanSyncUser) {
      insertStatements.push(
        env.DB.prepare(`
          INSERT OR IGNORE INTO user_shares (username, share_id, created_at)
          VALUES (?, ?, ?)
        `).bind(cleanSyncUser, shareId, now)
      );
    }

    await env.DB.batch(insertStatements);

    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const shareUrl = `${baseUrl}/?pin=${finalPin}`;
    const qrDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(shareUrl)}`;

    return new Response(JSON.stringify({
      success: true,
      data: {
        id: shareId,
        pin: finalPin,
        title: finalTitle,
        createdAt: now,
        expiresAt,
        cardCount: validCards.length,
        shareUrl,
        qrCode: qrDataUrl,
        syncedTo: cleanSyncUser || null
      }
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      message: err.message || 'Terjadi kesalahan saat membuat sesi teks.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// -------------------------------------------------------------
// API: GET SHARE BY PIN
// -------------------------------------------------------------
async function handleGetShare(pin, request, env) {
  if (!env.DB) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Database D1 belum terhubung (binding "DB").'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const formattedPin = pin.trim().toUpperCase();

    const share = await env.DB.prepare(`
      SELECT id, pin_code, title, created_at, expires_at, views_count
      FROM shares
      WHERE pin_code = ?
    `).bind(formattedPin).first();

    if (!share) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Teks dengan PIN tersebut tidak ditemukan atau masa aktifnya telah habis.'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (share.expires_at > 0 && share.expires_at < Date.now()) {
      await env.DB.prepare('DELETE FROM shares WHERE id = ?').bind(share.id).run();
      return new Response(JSON.stringify({
        success: false,
        message: 'Masa aktif koleksi teks ini telah kedaluwarsa.'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await env.DB.prepare('UPDATE shares SET views_count = views_count + 1 WHERE id = ?')
      .bind(share.id)
      .run();

    const { results: cards } = await env.DB.prepare(`
      SELECT id, title, content, language, sort_order
      FROM cards
      WHERE share_id = ?
      ORDER BY sort_order ASC, id ASC
    `).bind(share.id).all();

    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const shareUrl = `${baseUrl}/?pin=${share.pin_code}`;
    const qrDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(shareUrl)}`;

    return new Response(JSON.stringify({
      success: true,
      data: {
        id: share.id,
        pin: share.pin_code,
        title: share.title,
        createdAt: share.created_at,
        expiresAt: share.expires_at,
        viewsCount: (share.views_count || 0) + 1,
        cards: (cards || []).map(c => ({
          id: c.id,
          title: c.title,
          content: c.content,
          language: c.language,
          sortOrder: c.sort_order
        })),
        shareUrl,
        qrCode: qrDataUrl
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      message: err.message || 'Terjadi kesalahan saat memuat teks.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// -------------------------------------------------------------
// API: CONNECT ACCOUNT / SYNC KEY
// -------------------------------------------------------------
async function handleConnectAccount(request, env) {
  if (!env.DB) {
    return new Response(JSON.stringify({ success: false, message: 'DB not connected' }), { status: 500 });
  }

  try {
    await ensureTables(env.DB);
    const { username, password } = await request.json();

    if (!username || !username.trim()) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Kunci Akun / Username wajib diisi.'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const cleanUser = username.trim().toLowerCase();
    if (!/^[a-z0-9_\-\.]{3,30}$/i.test(cleanUser)) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Format Kunci Akun harus 3-30 karakter (huruf, angka, _, -).'
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const acc = await env.DB.prepare('SELECT * FROM accounts WHERE username = ?')
      .bind(cleanUser)
      .first();

    const pass = password ? password.trim() : '';

    if (!acc) {
      // Create new account/key
      await env.DB.prepare('INSERT INTO accounts (username, pin_hash, created_at) VALUES (?, ?, ?)')
        .bind(cleanUser, pass ? pass : null, Date.now())
        .run();

      return new Response(JSON.stringify({
        success: true,
        data: {
          username: cleanUser,
          isNew: true,
          hasPassword: !!pass
        }
      }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    }

    // Verify existing password
    if (acc.pin_hash) {
      if (!pass || acc.pin_hash !== pass) {
        return new Response(JSON.stringify({
          success: false,
          message: 'Password salah untuk Kunci Akun ini.'
        }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
    } else if (pass) {
      // Set password if none was previously set
      await env.DB.prepare('UPDATE accounts SET pin_hash = ? WHERE username = ?')
        .bind(pass, cleanUser)
        .run();
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        username: cleanUser,
        isNew: false,
        hasPassword: !!(acc.pin_hash || pass)
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// -------------------------------------------------------------
// API: GET USER SHARES (CLOUD HISTORY)
// -------------------------------------------------------------
async function handleGetUserShares(request, env) {
  if (!env.DB) {
    return new Response(JSON.stringify({ success: false, message: 'DB not connected' }), { status: 500 });
  }

  try {
    await ensureTables(env.DB);
    const url = new URL(request.url);
    const username = url.searchParams.get('username') || '';
    const password = url.searchParams.get('password') || '';

    if (!username.trim()) {
      return new Response(JSON.stringify({ success: false, message: 'Username parameter required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const authCheck = await verifyAccountAuth(env.DB, username, password);
    if (!authCheck.ok) {
      return new Response(JSON.stringify({ success: false, message: authCheck.message }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Query shares for this user
    const { results } = await env.DB.prepare(`
      SELECT s.id, s.pin_code as pin, s.title, s.created_at as createdAt, s.expires_at as expiresAt, s.views_count as viewsCount,
             (SELECT COUNT(*) FROM cards c WHERE c.share_id = s.id) as cardCount
      FROM user_shares us
      JOIN shares s ON us.share_id = s.id
      WHERE us.username = ?
      ORDER BY s.created_at DESC
      LIMIT 100
    `).bind(authCheck.cleanUser).all();

    const baseUrl = `${url.protocol}//${url.host}`;
    const sharesWithLinks = (results || []).map(r => ({
      ...r,
      shareUrl: `${baseUrl}/?pin=${r.pin}`
    }));

    return new Response(JSON.stringify({
      success: true,
      data: {
        username: authCheck.cleanUser,
        count: sharesWithLinks.length,
        shares: sharesWithLinks
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// -------------------------------------------------------------
// API: CLAIM EXISTING PIN INTO USER ACCOUNT
// -------------------------------------------------------------
async function handleClaimPin(request, env) {
  if (!env.DB) {
    return new Response(JSON.stringify({ success: false, message: 'DB not connected' }), { status: 500 });
  }

  try {
    await ensureTables(env.DB);
    const { username, password, pin } = await request.json();

    if (!username || !pin) {
      return new Response(JSON.stringify({ success: false, message: 'Username dan PIN wajib diisi' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const authCheck = await verifyAccountAuth(env.DB, username, password || '');
    if (!authCheck.ok) {
      return new Response(JSON.stringify({ success: false, message: authCheck.message }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const cleanPin = pin.trim().toUpperCase();
    const share = await env.DB.prepare('SELECT id, title, created_at FROM shares WHERE pin_code = ?')
      .bind(cleanPin)
      .first();

    if (!share) {
      return new Response(JSON.stringify({
        success: false,
        message: `Teks dengan PIN "${cleanPin}" tidak ditemukan di database atau sudah kedaluwarsa.`
      }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    await env.DB.prepare(`
      INSERT OR IGNORE INTO user_shares (username, share_id, created_at)
      VALUES (?, ?, ?)
    `).bind(authCheck.cleanUser, share.id, Date.now()).run();

    return new Response(JSON.stringify({
      success: true,
      message: `PIN "${cleanPin}" (${share.title || 'Koleksi Teks'}) berhasil ditautkan ke akun ${authCheck.cleanUser}!`,
      data: {
        pin: cleanPin,
        title: share.title
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API: POST /api/shares
    if (url.pathname === '/api/shares' && request.method === 'POST') {
      return handleCreateShare(request, env);
    }

    // API: GET /api/shares/:pin
    if (url.pathname.startsWith('/api/shares/') && request.method === 'GET') {
      const pin = url.pathname.replace('/api/shares/', '');
      return handleGetShare(pin, request, env);
    }

    // API: POST /api/auth/connect (Login / Connect Sync Key)
    if (url.pathname === '/api/auth/connect' && request.method === 'POST') {
      return handleConnectAccount(request, env);
    }

    // API: GET /api/user/shares (Cloud History Sync across devices)
    if (url.pathname === '/api/user/shares' && request.method === 'GET') {
      return handleGetUserShares(request, env);
    }

    // API: POST /api/user/claim (Link past PIN to account)
    if (url.pathname === '/api/user/claim' && request.method === 'POST') {
      return handleClaimPin(request, env);
    }

    // Static Assets fallback (index.html, style.css, app.js, favicon.svg)
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  }
};
