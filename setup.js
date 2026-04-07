/**
 * Ages of Civilization – Notion Setup Script
 * Erstellt die Datenbanken mit dem eigenen Notion-Token.
 *
 * Vorher: Öffne Notion, gehe auf eine Seite und füge deine Integration hinzu:
 *   ... → Connections → [Integration auswählen]
 * Dann: node setup.js <SEITEN-ID>
 *
 * Die Seiten-ID findest du in der URL: notion.so/Seitenname-HIER-IST-DIE-ID
 */

require('dotenv').config();

const PAGE_ID = process.argv[2];
const TOKEN = process.env.NOTION_TOKEN;
const ENV_PATH = require('path').join(__dirname, '.env');
const fs = require('fs');

if (!PAGE_ID) {
  console.error('\n❌ Fehlende Seiten-ID!\n');
  console.log('Verwendung: node setup.js 33774171a5cd80a7a182e43d0733e35d');
  console.log('\nSo findest du die Seiten-ID:');
  console.log('1. Öffne Notion und gehe auf eine Seite (oder erstelle eine neue)');
  console.log('2. Klicke auf "..." oben rechts → "Connections" → deine Integration hinzufügen');
  console.log('3. Kopiere die URL der Seite, z.B.:');
  console.log('   https://www.notion.so/MeinSpiel-abc123def456...');
  console.log('   Die ID sind die letzten 32 Zeichen: abc123def456...\n');
  process.exit(1);
}

const HEADERS = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28',
};

async function notion(method, path, body) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method, headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Notion error (${res.status}): ${data.message}`);
  return data;
}

async function setup() {
  console.log('\n⚔️  Ages of Civilization – Setup\n');
  console.log('🔑 Token:', TOKEN ? TOKEN.slice(0, 15) + '...' : 'FEHLT');
  console.log('📄 Seiten-ID:', PAGE_ID, '\n');

  // Test: Seite erreichbar?
  console.log('1/4 Verbindung zur Notion-Seite testen...');
  try {
    await notion('GET', `/pages/${PAGE_ID.replace(/-/g, '')}`);
    console.log('   ✓ Seite erreichbar\n');
  } catch (err) {
    console.error('   ❌ Seite nicht erreichbar:', err.message);
    console.log('\nLösung:');
    console.log('  • Öffne Notion → gehe auf die Seite');
    console.log('  • Klicke "..." → "Connections" → deine Integration hinzufügen\n');
    process.exit(1);
  }

  // Container-Seite
  console.log('2/4 Container-Seite erstellen...');
  const parentPage = await notion('POST', '/pages', {
    parent: { page_id: PAGE_ID },
    properties: {
      title: [{ text: { content: '⚔️ Ages of Civilization – Game' } }],
    },
    children: [{
      object: 'block', type: 'paragraph',
      paragraph: { rich_text: [{ text: { content: 'Datenbankcontainer für das Ages of Civilization Idle Game.' } }] },
    }],
  });
  console.log('   ✓ Container erstellt:', parentPage.id, '\n');

  // Users DB
  console.log('3/4 Users-Datenbank erstellen...');
  const usersDb = await notion('POST', '/databases', {
    parent: { type: 'page_id', page_id: parentPage.id },
    title: [{ text: { content: 'Users' } }],
    properties: {
      Username:        { title: {} },
      Password_Hash:   { rich_text: {} },
      Email:           { email: {} },
      Age:             { select: { options: [
        { name: 'Stone Age',   color: 'gray'   },
        { name: 'Bronze Age',  color: 'orange' },
        { name: 'Iron Age',    color: 'brown'  },
        { name: 'Medieval',    color: 'purple' },
        { name: 'Renaissance', color: 'yellow' },
        { name: 'Industrial',  color: 'blue'   },
        { name: 'Modern',      color: 'green'  },
        { name: 'Space Age',   color: 'pink'   },
      ]}},
      Level:           { number: { format: 'number' } },
      Total_Score:     { number: { format: 'number' } },
      Play_Time_Minutes:{ number: { format: 'number' } },
      Last_Login:      { date: {} },
      Save_Data:       { rich_text: {} },
    },
  });
  console.log('   ✓ Users DB:', usersDb.id, '\n');

  // Leaderboard DB
  console.log('4/4 Leaderboard-Datenbank erstellen...');
  const lbDb = await notion('POST', '/databases', {
    parent: { type: 'page_id', page_id: parentPage.id },
    title: [{ text: { content: 'Leaderboard' } }],
    properties: {
      Entry:      { title: {} },
      Username:   { rich_text: {} },
      Event_Name: { rich_text: {} },
      Score:      { number: { format: 'number' } },
      Age_Reached:{ select: { options: [
        { name: 'Stone Age',   color: 'gray'   },
        { name: 'Bronze Age',  color: 'orange' },
        { name: 'Iron Age',    color: 'brown'  },
        { name: 'Medieval',    color: 'purple' },
        { name: 'Renaissance', color: 'yellow' },
        { name: 'Industrial',  color: 'blue'   },
        { name: 'Modern',      color: 'green'  },
        { name: 'Space Age',   color: 'pink'   },
      ]}},
      Rank:       { number: { format: 'number' } },
      Date:       { date: {} },
    },
  });
  console.log('   ✓ Leaderboard DB:', lbDb.id, '\n');

  // .env aktualisieren
  let env = fs.readFileSync(ENV_PATH, 'utf8');
  env = env
    .replace(/^USERS_DB_ID=.*/m,        `USERS_DB_ID=${usersDb.id}`)
    .replace(/^LEADERBOARD_DB_ID=.*/m,  `LEADERBOARD_DB_ID=${lbDb.id}`);
  fs.writeFileSync(ENV_PATH, env, 'utf8');

  console.log('✅ Setup abgeschlossen! .env wurde aktualisiert.\n');
  console.log('   USERS_DB_ID        =', usersDb.id);
  console.log('   LEADERBOARD_DB_ID  =', lbDb.id);
  console.log('\nJetzt starten: npm start\n');
}

setup().catch(err => {
  console.error('\n❌ Setup fehlgeschlagen:', err.message, '\n');
  process.exit(1);
});
