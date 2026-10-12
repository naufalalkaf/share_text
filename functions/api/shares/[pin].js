export async function onRequestGet(context) {
  const { params, request, env } = context;
  const pin = params.pin;

  if (!env.DB) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Konfigurasi database Cloudflare D1 belum terhubung (binding "DB").'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!pin) {
    return new Response(JSON.stringify({
      success: false,
      message: 'Kode PIN wajib diisi.'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const formattedPin = pin.trim().toUpperCase();

    // Fetch share
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

    // Check expiration
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

    // Increment views
    await env.DB.prepare('UPDATE shares SET views_count = views_count + 1 WHERE id = ?')
      .bind(share.id)
      .run();

    // Fetch cards
    const { results: cards } = await env.DB.prepare(`
      SELECT id, title, content, language, sort_order
      FROM cards
      WHERE share_id = ?
      ORDER BY sort_order ASC, id ASC
    `).bind(share.id).all();

    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;
    const shareUrl = `${baseUrl}/?pin=${share.pin_code}`;

    // Reliable zero-dependency QR Code URL
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
