import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import {
  createShare,
  getShareByPin,
  cleanupExpired
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
    const { title, pinCode, expiryHours, cards } = req.body;

    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Minimal harus ada 1 kartu teks yang dibagikan.'
      });
    }

    // Filter out completely empty cards, or ensure at least one has content
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
      cards: validCards
    });

    const baseUrl = getBaseUrl(req);
    const shareUrl = `${baseUrl}/?pin=${shareResult.pin}`;

    // Generate QR code as data URL
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

// Serve frontend for all remaining routes (fallback)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 TextShare Server berjalan di: http://localhost:${PORT}`);
});
