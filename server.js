import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import {
  createShare,
  getShareByPin,
  cleanupExpired,
  connectAccount,
  getUserShares,
  claimPin
} from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Periodic cleanup every 15 minutes
setInterval(() => {
  try {
    cleanupExpired();
  } catch (err) {
    console.error('Error during cleanup:', err.message);
  }
}, 15 * 60 * 1000);

// Helper to determine full host URL
function getBaseUrl(req) {
  const host = req.get('host') || `localhost:${PORT}`;
  const protocol = req.protocol || 'http';
  return `${protocol}://${host}`;
}

// API Routes
/**
 * POST /api/shares
 * Create a new share containing multiple text cards
 */
app.post('/api/shares', async (req, res) => {
  try {
    const { title, pinCode, expiryHours, cards, syncKey, syncPassword } = req.body;

    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Minimal harus ada 1 kartu teks yang dibagikan.'
      });
    }

    const validCards = cards.filter(c => c && (c.content?.trim() || c.title?.trim()));
    if (validCards.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Setidaknya salah satu kartu teks harus memiliki isi atau judul.'
      });
    }

    let expiresAt = 0;
    const hours = Number(expiryHours);
    if (!isNaN(hours) && hours > 0) {
      expiresAt = Date.now() + hours * 60 * 60 * 1000;
    }

    const shareResult = createShare({
      pinCode,
      title: title || 'Koleksi Teks',
      expiresAt,
      cards: validCards,
      syncKey,
      syncPassword
    });

    const baseUrl = getBaseUrl(req);
    const shareUrl = `${baseUrl}/?pin=${shareResult.pin}`;

    const qrDataUrl = await QRCode.toDataURL(shareUrl, {
      margin: 2,
      width: 250,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    res.status(201).json({
      success: true,
      data: {
        ...shareResult,
        shareUrl,
        qrCode: qrDataUrl
      }
    });
  } catch (err) {
    console.error('Error creating share:', err);
    res.status(400).json({
      success: false,
      message: err.message || 'Gagal membuat sesi berbagi teks.'
    });
  }
});

/**
 * GET /api/shares/:pin
 * Retrieve text cards by PIN
 */
app.get('/api/shares/:pin', async (req, res) => {
  try {
    const { pin } = req.params;
    if (!pin) {
      return res.status(400).json({
        success: false,
        message: 'Kode PIN wajib diisi.'
      });
    }

    const share = getShareByPin(pin);
    if (!share) {
      return res.status(404).json({
        success: false,
        message: 'Teks dengan PIN tersebut tidak ditemukan atau masa aktifnya telah habis.'
      });
    }

    const baseUrl = getBaseUrl(req);
    const shareUrl = `${baseUrl}/?pin=${share.pin}`;

    const qrDataUrl = await QRCode.toDataURL(shareUrl, {
      margin: 2,
      width: 250,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    res.json({
      success: true,
      data: {
        ...share,
        shareUrl,
        qrCode: qrDataUrl
      }
    });
  } catch (err) {
    console.error('Error fetching share:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan saat memuat teks.'
    });
  }
});

/**
 * POST /api/auth/connect
 * Connect or create user account / sync key
 */
app.post('/api/auth/connect', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username) {
      return res.status(400).json({ success: false, message: 'Kunci Akun / Username wajib diisi.' });
    }
    const result = connectAccount(username, password || '');
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/user/shares
 * Retrieve user cloud shares
 */
app.get('/api/user/shares', (req, res) => {
  try {
    const { username, password } = req.query;
    if (!username) {
      return res.status(400).json({ success: false, message: 'Username parameter required' });
    }
    const result = getUserShares(username, password || '');
    const baseUrl = getBaseUrl(req);
    const sharesWithLinks = result.shares.map(s => ({
      ...s,
      shareUrl: `${baseUrl}/?pin=${s.pin}`
    }));
    res.json({
      success: true,
      data: {
        username: result.username,
        count: sharesWithLinks.length,
        shares: sharesWithLinks
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/user/claim
 * Claim existing PIN to user account
 */
app.post('/api/user/claim', (req, res) => {
  try {
    const { username, password, pin } = req.body;
    if (!username || !pin) {
      return res.status(400).json({ success: false, message: 'Username dan PIN wajib diisi.' });
    }
    const result = claimPin(username, password || '', pin);
    res.json({
      success: true,
      message: `PIN "${result.pin}" (${result.title || 'Koleksi Teks'}) berhasil ditautkan ke akun ${username}!`,
      data: result
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Serve frontend for all remaining routes (fallback)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 TextShare Server berjalan di: http://localhost:${PORT}`);
});
