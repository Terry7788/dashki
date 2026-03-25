/**
 * Migration Script: Import Foods and SavedMeals from local DB to Railway Production
 * 
 * Usage:
 *   1. First run: node scripts/export-local-data.js (exports to data.json)
 *   2. Then run: node scripts/migrate-from-local.js <railway-url>
 *      Example: node scripts/migrate-from-local.js https://dashki-production.up.railway.app
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Load SQLite
const sqlite3 = require('sqlite3').verbose();

const LOCAL_DB_PATH = path.join(__dirname, '..', 'dashki.db');
const EXPORT_FILE = path.join(__dirname, 'local-data-export.json');

/**
 * Read local database and export Foods and SavedMeals
 */
function exportLocalData() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(LOCAL_DB_PATH);
    
    // Get all foods
    db.all(`SELECT * FROM Foods`, [], (err, foods) => {
      if (err) {
        db.close();
        reject(err);
        return;
      }
      
      // Get all saved meals
      db.all(`SELECT * FROM SavedMeals`, [], (err, savedMeals) => {
        if (err) {
          db.close();
          reject(err);
          return;
        }
        
        // Get all saved meal items
        db.all(`SELECT * FROM SavedMealItems`, [], (err, savedMealItems) => {
          db.close();
          
          if (err) {
            reject(err);
            return;
          }
          
          const data = {
            foods,
            savedMeals,
            savedMealItems,
            exportedAt: new Date().toISOString()
          };
          
          // Save to file
          fs.writeFileSync(EXPORT_FILE, JSON.stringify(data, null, 2));
          console.log(`✅ Exported ${foods.length} foods, ${savedMeals.length} saved meals to ${EXPORT_FILE}`);
          
          resolve(data);
        });
      });
    });
  });
}

/**
 * Make HTTP request to import data
 */
function importToServer(serverUrl, data) {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/migrate-import', serverUrl);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('✅ Import successful!');
          console.log('Response:', body);
          resolve(body);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Main execution
 */
async function main() {
  const serverUrl = process.argv[2];
  
  if (!serverUrl) {
    console.log('Step 1: Export local data');
    console.log('  Running: node scripts/migrate-from-local.js --export');
    console.log('');
    console.log('Step 2: Import to Railway');
    console.log('  Usage: node scripts/migrate-from-local.js <railway-url>');
    console.log('  Example: node scripts/migrate-from-local.js https://dashki-production.up.railway.app');
    console.log('');
    
    // Check if there's an exported file
    if (fs.existsSync(EXPORT_FILE)) {
      console.log(`📁 Found existing export: ${EXPORT_FILE}`);
      const data = JSON.parse(fs.readFileSync(EXPORT_FILE, 'utf8'));
      console.log(`   ${data.foods.length} foods, ${data.savedMeals.length} saved meals`);
    }
    process.exit(0);
  }
  
  if (serverUrl === '--export') {
    await exportLocalData();
    console.log('\nNow run: node scripts/migrate-from-local.js <railway-url>');
    return;
  }
  
  // Import mode
  let data;
  
  // Check for exported file first
  if (fs.existsSync(EXPORT_FILE)) {
    console.log(`📂 Loading from export file: ${EXPORT_FILE}`);
    data = JSON.parse(fs.readFileSync(EXPORT_FILE, 'utf8'));
  } else {
    console.log('📤 Exporting local data...');
    data = await exportLocalData();
  }
  
  console.log(`\n📥 Importing to ${serverUrl}...`);
  
  try {
    await importToServer(serverUrl, data);
    console.log('\n✅ Migration complete!');
  } catch (err) {
    console.error('\n❌ Import failed:', err.message);
    console.log('\nNote: You need to add the /api/migrate-import endpoint to your server first.');
    console.log('See scripts/add-migration-endpoint.js');
    process.exit(1);
  }
}

main().catch(console.error);