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
    `)
  ]);
}

// Generate random 6-digit numeric PIN
function generateRandomPin() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Konfigurasi database Cloudflare D1 belum terhubung (binding "DB").'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    await ensureTables(env.DB);

    const body = await request.json();
    const { title, pinCode, expiryHours, cards } = body;

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

    await env.DB.batch(insertStatements);

    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const shareUrl = `${baseUrl}/?pin=${finalPin}`;

    // Reliable zero-dependency QR Code URL
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
        qrCode: qrDataUrl
      }
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      message: err.message || 'Terjadi kesalahan pada server saat membuat sesi teks.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
