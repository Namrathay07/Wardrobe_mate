// server/index.js (ESM)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import ColorThief from 'colorthief';
import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import fetch from 'node-fetch';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// --- Cloudinary Configuration ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
const prisma = new PrismaClient();
const PORT = 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

app.use(cors());
app.use(express.json());

// --- Authentication Middleware ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// --- Helper: Color utilities and smart outfit suggestions ---
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 1); break;
      case g: h = (b - r) / d + 3; break;
      default: h = (r - g) / d + 5;
    }
    h *= 60;
  }
  return [h, s, l];
}

function getHueName([r, g, b]) {
  const [h, s, l] = rgbToHsl(r, g, b);
  if (s < 0.12) return 'neutral';
  if (h < 20) return 'red';
  if (h < 50) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 170) return 'green';
  if (h < 255) return 'blue';
  if (h < 290) return 'indigo';
  if (h < 330) return 'purple';
  return 'red';
}

function complementText(hue) {
  switch (hue) {
    case 'red': return 'white, black, denim blue, or beige';
    case 'orange': return 'white, navy, olive, or charcoal';
    case 'yellow': return 'white, tan, navy, or grey';
    case 'green': return 'beige, brown, cream, or black';
    case 'blue': return 'white, tan, mustard, or grey';
    case 'indigo': return 'white, tan, grey, or rust';
    case 'purple': return 'black, white, tan, or olive';
    default: return 'a pop color like coral, teal, or mustard';
  }
}

function generateSuggestion(category, dominant, palette) {
  const hue = getHueName(dominant || [128,128,128]);
  const withNeutrals = complementText(hue);
  const hasBusyPattern = Array.isArray(palette) && palette.length >= 4;

  const keepBottomSolid = hasBusyPattern ? ' Keep the rest of the outfit solid to avoid pattern clash.' : '';

  const common = `Try pairing with ${withNeutrals}.`;

  const cat = (category || '').toLowerCase();
  if (cat.includes('kurti')) {
    return `Pair the kurti with white/cream leggings or palazzos and a ${hue === 'neutral' ? 'contrasting' : 'complementary'} dupatta. ${common}${keepBottomSolid}`;
  }
  if (cat.includes('saree')) {
    return `Choose a ${hue === 'neutral' ? 'contrasting' : 'complementary'} blouse and metallic accessories. ${common}${keepBottomSolid}`;
  }
  if (cat.includes('kurta')) {
    return `Style with white/beige churidar or pyjama; add a ${hue === 'neutral' ? 'contrasting' : 'coordinated'} Nehru jacket. ${common}${keepBottomSolid}`;
  }
  if (cat.includes('t-shirt') || cat.includes('oversized tee')) {
    return `Go with blue/black jeans or shorts; layer with a denim or light jacket. ${common}`;
  }
  if (cat.includes('shirt')) {
    return `Team with chinos or denim in ${withNeutrals.split(',')[0]} for balance.${keepBottomSolid}`;
  }
  if (cat.includes('dress')) {
    return `Add a slim belt and shoes in ${withNeutrals.split(',')[0]}; minimal jewelry works best.${keepBottomSolid}`;
  }
  if (cat.includes('jumpsuit')) {
    return `Break the silhouette with a belt or shrug in a ${hue === 'neutral' ? 'contrasting' : 'complementary'} color. ${common}`;
  }
  if (cat.includes('sweater') || cat.includes('jacket')) {
    return `Pair with denim and boots; add a scarf in a ${hue === 'neutral' ? 'bold' : 'complementary'} shade. ${common}`;
  }
  return common + keepBottomSolid;
}

// --- Helper: Intelligent clothing classification based on color analysis ---
function classifyClothingByColor(dominantColor, palette) {
  const [r, g, b] = dominantColor;
  
  // Analyze color patterns to determine clothing type
  const isPlaid = palette && palette.length >= 4 && 
    palette.some(c => Math.abs(c[0] - c[1]) < 30 && Math.abs(c[1] - c[2]) < 30); // Similar colors suggest plaid
  
  const isStriped = palette && palette.length >= 3 && 
    palette.some(c => Math.abs(c[0] - c[1]) > 50 || Math.abs(c[1] - c[2]) > 50); // High contrast suggests stripes
  
  const isSolid = palette && palette.length <= 2;
  
  // Color temperature analysis
  const isWarm = r > g && r > b;
  const isCool = b > r && b > g;
  const isNeutral = Math.abs(r - g) < 30 && Math.abs(g - b) < 30;
  
  // Heuristics that often correlate with sleeveless/tank tops
  const isLight = r > 200 && g > 200 && b > 200; // Very light colors
  const isPastel = r > 170 && g > 170 && b > 170 && (r < 230 || g < 230 || b < 230);
  const warmLight = isLight && (r >= g && r >= b); // cream/beige
  const peachy = r > 200 && g > 170 && b < 160; // peach/apricot tones common in summer tanks
  
  // Make intelligent guesses based on color patterns
  if (isPlaid) {
    return 'Shirt'; // Plaid patterns are typically shirts
  } else if (isStriped) {
    return 'T-shirt'; // Striped patterns are often t-shirts
  } else if (isLight || isPastel || warmLight || peachy) {
    return 'Tank Top'; // Light/pastel colors often indicate tank tops or crop tops
  } else if (isSolid && isWarm) {
    return 'T-shirt'; // Solid warm colors are often t-shirts
  } else if (isSolid && isCool) {
    return 'Shirt'; // Solid cool colors are often shirts
  } else if (isNeutral) {
    return 'Shirt'; // Neutral colors are often shirts
  } else {
    return 'T-shirt'; // Default fallback
  }
}

// --- Helper: Calculate intelligent style score ---
function calculateStyleScore(dominantColor, palette, category) {
  let score = 50; // Base score
  
  // Color vibrancy bonus (0-20 points)
  const [r, g, b] = dominantColor;
  const maxColor = Math.max(r, g, b);
  const minColor = Math.min(r, g, b);
  const vibrancy = (maxColor - minColor) / 255;
  score += Math.round(vibrancy * 20);
  
  // Color harmony bonus (0-15 points)
  const colorCount = palette ? palette.length : 1;
  if (colorCount >= 3 && colorCount <= 5) {
    score += 15; // Good color variety
  } else if (colorCount === 2) {
    score += 10; // Decent variety
  }
  
  // Category-specific bonuses (0-15 points)
  const categoryBonuses = {
    'T-shirt': 10,
    'Shirt': 12,
    'Dress': 15,
    'Sweater': 12,
    'Jacket': 15,
    'Pants': 8,
    'Jeans': 10,
    'Shoes': 10,
    'Skirt': 12,
    'Shorts': 8
  };
  score += categoryBonuses[category] || 5;
  
  // Color temperature bonus (0-10 points)
  if (r > g && r > b) {
    score += 8; // Warm colors (reds, oranges)
  } else if (b > r && b > g) {
    score += 7; // Cool colors (blues, purples)
  } else if (g > r && g > b) {
    score += 6; // Green tones
  } else {
    score += 5; // Neutral colors
  }
  
  // Ensure score is between 1-100
  return Math.max(1, Math.min(100, score));
}

// --- Helper: Normalize AI labels into standard categories ---
function normalizeCategory(rawLabel) {
  if (!rawLabel || typeof rawLabel !== 'string') return 'Unknown';
  const label = rawLabel.toLowerCase();
  
  const mappings = [
    // Outerwear
    { keys: ['trench coat', 'trenchcoat', 'coat'], value: 'Coat' },
    { keys: ['blazer', 'jacket', 'parka', 'anorak'], value: 'Jacket' },
    { keys: ['shrug', 'bolero'], value: 'Shrug' },
    // Western tops
    { keys: ['t-shirt', 'tee', 'tshirt', 'tee shirt', 't shirt', 'graphic tee'], value: 'T-shirt' },
    { keys: ['oversized tee', 'oversize tee', 'baggy tee'], value: 'Oversized Tee' },
    { keys: ['shirt', 'dress shirt', 'button-up', 'button down', 'flannel'], value: 'Shirt' },
    { keys: ['top', 'blouse'], value: 'Top' },
    { keys: ['tank top', 'sleeveless top', 'sleeveless', 'singlet', 'vest', 'halter', 'camisole', 'cami', 'bralette', 'bikini top'], value: 'Tank Top' },
    { keys: ['crop top', 'cropped top'], value: 'Crop Top' },
    { keys: ['sweater', 'jumper', 'cardigan', 'hoodie'], value: 'Sweater' },
    // Western bottoms
    { keys: ['jeans'], value: 'Jeans' },
    { keys: ['trousers', 'pants', 'slacks', 'chinos'], value: 'Pants' },
    { keys: ['shorts'], value: 'Shorts' },
    { keys: ['skirt'], value: 'Skirt' },
    // One-piece western
    { keys: ['dress', 'gown'], value: 'Dress' },
    { keys: ['jumpsuit', 'romper', 'playsuit'], value: 'Jumpsuit' },
    // Ethnic wear
    { keys: ['kurti', 'kurthi', 'kurta top', 'tunic'], value: 'Kurti' },
    { keys: ['short kurti', 'short kurthi'], value: 'Short Kurti' },
    { keys: ['kurta', 'kurtha'], value: 'Kurta (Men)'} ,
    { keys: ['saree', 'sari', 'saari'], value: 'Saree' },
    { keys: ['dupatta'], value: 'Dupatta' },
    // Footwear and accessories
    { keys: ['sneaker', 'running shoe', 'shoe', 'boot'], value: 'Shoes' },
    { keys: ['bag', 'handbag', 'backpack', 'purse', 'tote'], value: 'Bag' },
    { keys: ['hat', 'cap', 'beanie'], value: 'Hat' },
  ];

  for (const mapping of mappings) {
    if (mapping.keys.some((k) => label.includes(k))) return mapping.value;
  }
  
  // If no mapping found, just capitalize the first letter as a fallback
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// --- Multer Setup for temporary local uploads ---
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) =>
    cb(null, `img_${Date.now()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage });

// --- Default Demo User ---
let DEFAULT_USER_ID = null;
async function ensureDefaultUser() {
  const email = 'demo@aistylist.local';
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: 'Demo User' },
  });
  DEFAULT_USER_ID = user.id;
}

// --- Routes ---

app.get('/', (_, res) =>
  res.send('AI Stylist API ✅ Use POST /api/analyze and GET /api/wardrobe')
);

// --- Authentication Routes ---
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash
      }
    });

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Failed to login' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

app.post('/api/analyze', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ error: 'No image uploaded' });

    const filePath = req.file.path;

    // 1. Upload to Cloudinary to get a public URL
    const cloudinaryRes = await cloudinary.uploader.upload(filePath, {
      folder: "styleme",
    });
    const imageUrl = cloudinaryRes.secure_url;

    // 2. Get Color Analysis first
    const color = await ColorThief.getColor(filePath);
    const palette = await ColorThief.getPalette(filePath, 5);
    
    // 3. Use HuggingFace Inference API for category detection
    let category = "Unknown";
    let aiClassificationFailed = false;
    
    try {
      const imageBuffer = fs.readFileSync(filePath);
      const hfRes = await fetch(
        'https://api-inference.huggingface.co/models/facebook/deit-base-distilled-patch16-224',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.HUGGINGFACE_API_TOKEN}`,
            'Content-Type': 'application/octet-stream',
          },
          body: imageBuffer,
        }
      );

      if (hfRes.ok) {
        const hfData = await hfRes.json();
        console.log('HuggingFace response:', JSON.stringify(hfData, null, 2));
        if (Array.isArray(hfData) && hfData.length > 0) {
          // Heuristic: ethnic wear detection first
          const topPreds = hfData.slice(0, 5).map(p => String(p.label || '').toLowerCase());
          const containsAny = (arr, keys) => arr.some(lbl => keys.some(k => lbl.includes(k)));

          const sareeTerms = ['saree','sari','saari'];
          const kurtiTerms = ['kurti','kurthi','kurta','kurtha','kameez','anarkali'];
          const dupattaLike = ['dupatta','stole','shawl'];
          const kurtiLikeWraps = ['kimono','sarong','abaya','kaftan','cloak'];

          if (containsAny(topPreds, sareeTerms)) {
            category = 'Saree';
          } else if (containsAny(topPreds, [...kurtiTerms, ...dupattaLike, ...kurtiLikeWraps])) {
            category = 'Kurti';
          } else {
            // Consider top-k predictions and pick best clothing label by priority
          const clothingPriority = [
            'saree','kurti','kurtha','kurta','tank top','crop top','t-shirt','oversized tee','top','shirt','dress','jumpsuit','jeans','pants','skirt','shorts','sweater','hoodie','jacket','coat','shrug','dupatta','shoes','hat','bag'
          ];
            const clothingKeywords = clothingPriority;
            let best = null;
            for (const pred of hfData.slice(0, 5)) {
              const raw = String(pred.label || '').toLowerCase();
              const match = clothingKeywords.find(k => raw.includes(k));
              if (match) {
                const norm = normalizeCategory(raw);
                // pick the one with highest priority (lowest index)
                if (!best || clothingPriority.indexOf(match) < clothingPriority.indexOf(best.key)) {
                  best = { key: match, normalized: norm };
                }
              }
            }

            if (best) {
              category = best.normalized;
              
              // Special case: if AI says "T-shirt" but color analysis suggests tank top, prefer tank top
              if (best.normalized === 'T-shirt') {
                const colorBasedCategory = classifyClothingByColor(color, palette);
                if (colorBasedCategory === 'Tank Top') {
                  category = 'Tank Top';
                  console.log('Overriding T-shirt classification with Tank Top based on color analysis');
                }
              }
            } else {
              console.log('AI classification not clothing-related, using color-based classification');
              aiClassificationFailed = true;
            }
          }
        }
      } else {
        console.error('HuggingFace error:', hfRes.status, await hfRes.text());
        aiClassificationFailed = true;
      }
    } catch (e) {
      console.error('HF fetch failed:', e.message);
      aiClassificationFailed = true;
    }
    
    // 4. Fallback to intelligent color-based classification if AI fails
    if (aiClassificationFailed || category === "Unknown") {
      category = classifyClothingByColor(color, palette);
      console.log('Using color-based classification:', category);
    }
    
    // Calculate intelligent style score based on color analysis
    const styleScore = calculateStyleScore(color, palette, category);

    // 4. Generate smart suggestion based on category and colors
    const suggestion = generateSuggestion(category, color, palette);

    // 5. Save everything to the database
    const record = await prisma.clothingItem.create({
      data: {
        userId: req.user.userId,
        imageUrl,
        dominantRgb: color,
        palette,
        category,
        styleScore,
      },
    });
    
    // 6. Cleanup the temporary local file
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) {
      console.warn('unlink failed', e.message);
    }

    // 7. Respond to the client
    return res.json({
      color,
      palette,
      category,
      styleScore,
      suggestion,
      imageUrl,
      itemId: record.id,
    });
  } catch (err) {
    console.error('analyze error:', err);
    return res.status(500).json({ error: 'Analysis failed' });
  }
});

app.get('/api/wardrobe', authenticateToken, async (req, res) => {
  try {
    const items = await prisma.clothingItem.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items });
  } catch (err) {
    console.error('wardrobe error:', err);
    res.status(500).json({ error: 'Failed to fetch wardrobe' });
  }
});

app.delete('/api/wardrobe/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const item = await prisma.clothingItem.findFirst({ 
      where: { 
        id,
        userId: req.user.userId 
      } 
    });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    if (item.imageUrl.includes('res.cloudinary.com')) {
      try {
        const publicId = item.imageUrl.split('/').slice(-2).join('/').replace(/\.[^/.]+$/, '');
        await cloudinary.uploader.destroy(`styleme/${publicId}`);
      } catch (e) {
        console.warn('Cloudinary deletion failed:', e.message);
      }
    }

    await prisma.clothingItem.delete({ where: { id } });
    return res.json({ ok: true, deletedId: id });
  } catch (err) {
    console.error('delete item error:', err);
    return res.status(500).json({ error: 'Failed to delete item' });
  }
});

app.patch('/api/wardrobe/:id/category', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const { category } = req.body;
    if (!category || typeof category !== 'string') {
      return res.status(400).json({ error: 'category (string) is required' });
    }
    const item = await prisma.clothingItem.findFirst({ 
      where: { 
        id,
        userId: req.user.userId 
      } 
    });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const normalized = normalizeCategory(category);
    const updated = await prisma.clothingItem.update({
      where: { id },
      data: { category: normalized },
    });
    return res.json({ item: updated });
  } catch (err) {
    console.error('update category error:', err);
    return res.status(500).json({ error: 'Failed to update category' });
  }
});

app.delete('/api/wardrobe', authenticateToken, async (req, res) => {
  try {
    const { count } = await prisma.clothingItem.deleteMany({
      where: { userId: req.user.userId },
    });

    return res.json({ ok: true, deleted: count });
  } catch (err) {
    console.error('clear wardrobe error:', err);
    return res.status(500).json({ error: 'Failed to clear wardrobe' });
  }
});

// --- Boot Up The Server ---
async function main() {
  console.log('Setting up the default user...');
  await ensureDefaultUser();
  console.log('Default user is ready.');

  app.listen(PORT, () => {
    console.log(`✅ AI Stylist backend running on http://localhost:${PORT}`);
  });
}

main();