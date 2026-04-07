require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Anfragen. Bitte warte eine Minute.' },
});

const leaderboardSubmitLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zu viele Leaderboard-Einträge. Bitte warte eine Minute.' },
});

app.use('/api/', generalLimiter);

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const USERS_DB_ID = process.env.USERS_DB_ID;
const LEADERBOARD_DB_ID = process.env.LEADERBOARD_DB_ID;
const JWT_SECRET = process.env.JWT_SECRET;
const PORT = process.env.PORT || 3000;

const NOTION_VERSION = '2022-06-28';
const NOTION_BASE = 'https://api.notion.com/v1';

// ── Notion helpers ────────────────────────────────────────────────────────────

function notionHeaders() {
  return {
    'Authorization': `Bearer ${NOTION_TOKEN}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
  };
}

async function notionRequest(method, path, body) {
  const res = await fetch(`${NOTION_BASE}${path}`, {
    method,
    headers: notionHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Notion API error');
  return data;
}

function toRichText(str) {
  // Notion rich_text max 2000 chars per segment
  const chunks = [];
  for (let i = 0; i < str.length; i += 2000) {
    chunks.push({ text: { content: str.slice(i, i + 2000) } });
  }
  return chunks;
}

function fromRichText(arr) {
  if (!arr || !arr.length) return '';
  return arr.map(b => b.plain_text || b.text?.content || '').join('');
}

// Query users database by username
async function findUserByUsername(username) {
  const data = await notionRequest('POST', `/databases/${USERS_DB_ID}/query`, {
    filter: {
      property: 'Username',
      title: { equals: username },
    },
  });
  return data.results[0] || null;
}

// Extract all properties from a Notion user page
function parseUser(page) {
  const p = page.properties;
  return {
    id: page.id,
    username: fromRichText(p.Username?.title),
    passwordHash: fromRichText(p.Password_Hash?.rich_text),
    email: p.Email?.email || '',
    age: p.Age?.select?.name || 'Stone Age',
    level: p.Level?.number || 1,
    totalScore: p.Total_Score?.number || 0,
    playTime: p.Play_Time_Minutes?.number || 0,
    saveData: fromRichText(p.Save_Data?.rich_text) || '{}',
  };
}

// ── Auth middleware ───────────────────────────────────────────────────────────

function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Check username availability
app.get('/api/check-username/:username', async (req, res) => {
  try {
    const existing = await findUserByUsername(req.params.username);
    res.json({ available: !existing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

    const existing = await findUserByUsername(username);
    if (existing) return res.status(409).json({ error: 'Username already taken' });

    const hash = await bcrypt.hash(password, 10);
    const initialSave = JSON.stringify({
      lvl: 1, age: 0, score: 0, clicks: 0,
      res: { food: 0, wood: 0, stone: 100, bronze: 0, iron: 0, gold: 0, faith: 0, culture: 0, science: 0, art: 0, coal: 0, steel: 0, goods: 0, oil: 0, electricity: 0, tech: 0, credits: 0, fuel: 0, alloys: 0 },
      bld: { camp: 0, lumbermill: 0, quarry: 0, bronzemine: 0, tradingpost: 0, ironforge: 0, barracks: 0, treasury: 0, cathedral: 0, library: 0, academy: 0, studio: 0, coalmine: 0, steelmill: 0, factory: 0, oilrig: 0, powerplant: 0, techlab: 0, spaceport: 0, fueldepot: 0, alloyfoundry: 0 },
      clickPowers: [2, 1, 0.5],
      clicksBySlot: [0, 0, 0],
      weeklyBaseScore: 0,
      weeklyStartTs: 0,
      gatherAge: 0,
      prestige: 0,
      ts: new Date().toISOString(),
    });

    const page = await notionRequest('POST', '/pages', {
      parent: { database_id: USERS_DB_ID },
      properties: {
        Username: { title: [{ text: { content: username } }] },
        Password_Hash: { rich_text: toRichText(hash) },
        Email: { email: email || null },
        Age: { select: { name: 'Stone Age' } },
        Level: { number: 1 },
        Total_Score: { number: 0 },
        Play_Time_Minutes: { number: 0 },
        Save_Data: { rich_text: toRichText(initialSave) },
        Last_Login: { date: { start: new Date().toISOString().split('T')[0] } },
      },
    });

    const token = jwt.sign({ userId: page.id, username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const page = await findUserByUsername(username);
    if (!page) return res.status(401).json({ error: 'Invalid username or password' });

    const user = parseUser(page);
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

    // Update last login
    await notionRequest('PATCH', `/pages/${page.id}`, {
      properties: {
        Last_Login: { date: { start: new Date().toISOString().split('T')[0] } },
      },
    });

    const token = jwt.sign({ userId: page.id, username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, username });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Load game save
app.get('/api/save', authRequired, async (req, res) => {
  try {
    const page = await notionRequest('GET', `/pages/${req.user.userId}`);
    const user = parseUser(page);
    res.json({ saveData: user.saveData });
  } catch (err) {
    console.error('Load save error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Write game save
app.post('/api/save', authRequired, async (req, res) => {
  try {
    const { saveData } = req.body;
    if (!saveData) return res.status(400).json({ error: 'No save data provided' });

    const state = JSON.parse(saveData);
    const AGE_NAMES = ['Stone Age', 'Bronze Age', 'Iron Age', 'Medieval', 'Renaissance', 'Industrial', 'Modern', 'Space Age'];

    await notionRequest('PATCH', `/pages/${req.user.userId}`, {
      properties: {
        Age: { select: { name: AGE_NAMES[state.age] || 'Stone Age' } },
        Level: { number: state.lvl || 1 },
        Total_Score: { number: Math.floor(state.score || 0) },
        Save_Data: { rich_text: toRichText(saveData) },
        Last_Login: { date: { start: new Date().toISOString().split('T')[0] } },
      },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Save error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const eventName = req.query.event || 'Global';
    const data = await notionRequest('POST', `/databases/${LEADERBOARD_DB_ID}/query`, {
      filter: {
        property: 'Event_Name',
        rich_text: { equals: eventName },
      },
      sorts: [{ property: 'Score', direction: 'descending' }],
      page_size: 10,
    });

    const entries = data.results.map((p, i) => ({
      rank: i + 1,
      username: fromRichText(p.properties.Username?.rich_text),
      score: p.properties.Score?.number || 0,
      ageReached: p.properties.Age_Reached?.select?.name || 'Stone Age',
      prestige: p.properties.Prestige?.number || 0,
      date: p.properties.Date?.date?.start || '',
    }));

    res.json({ entries, event: eventName });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Submit score to leaderboard
app.post('/api/leaderboard/submit', leaderboardSubmitLimiter, authRequired, async (req, res) => {
  try {
    const { score, ageReached, eventName = 'Global', force = false, prestige = 0 } = req.body;

    // Check if user already has an entry for this event
    const existing = await notionRequest('POST', `/databases/${LEADERBOARD_DB_ID}/query`, {
      filter: {
        and: [
          { property: 'Username', rich_text: { equals: req.user.username } },
          { property: 'Event_Name', rich_text: { equals: eventName } },
        ],
      },
    });

    const AGE_NAMES = ['Stone Age', 'Bronze Age', 'Iron Age', 'Medieval', 'Renaissance', 'Industrial', 'Modern', 'Space Age'];
    const ageName = AGE_NAMES[ageReached] || ageReached;

    if (existing.results.length > 0) {
      const existingEntry = existing.results[0];
      const existingScore = existingEntry.properties.Score?.number || 0;
      if (!force && score <= existingScore) return res.json({ ok: true, improved: false });

      await notionRequest('PATCH', `/pages/${existingEntry.id}`, {
        properties: {
          Score: { number: score },
          Age_Reached: { select: { name: ageName } },
          Prestige: { number: prestige },
          Date: { date: { start: new Date().toISOString().split('T')[0] } },
        },
      });
    } else {
      await notionRequest('POST', '/pages', {
        parent: { database_id: LEADERBOARD_DB_ID },
        properties: {
          Entry: { title: [{ text: { content: `${req.user.username} – ${eventName}` } }] },
          Username: { rich_text: toRichText(req.user.username) },
          Event_Name: { rich_text: toRichText(eventName) },
          Score: { number: score },
          Age_Reached: { select: { name: ageName } },
          Prestige: { number: prestige },
          Date: { date: { start: new Date().toISOString().split('T')[0] } },
        },
      });
    }

    res.json({ ok: true, improved: true });
  } catch (err) {
    console.error('Submit score error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
app.listen(PORT, () => {
  console.log(`\n⚔️  Ages of Civilization Server`);
  console.log(`   Running at http://localhost:${PORT}`);
  console.log(`   Open http://localhost:${PORT} in your browser\n`);
});
}

module.exports = app;
