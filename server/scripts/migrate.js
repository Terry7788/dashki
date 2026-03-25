/**
 * Simplified Migration Script
 * 
 * Usage:
 *   1. Run this script to export local data: node scripts/migrate.js
 *   2. The script will make the API call to your Railway production
 * 
 * Requires: Railway server has the /api/admin/import-data endpoint
 */

const sqlite3 = require('sqlite3').verbose();
const https = require('https');
const fs = require('fs');
const path = require('path');

const LOCAL_DB_PATH = path.join(__dirname, '..', 'dashki.db');
const RAILWAY_URL = process.env.RAILWAY_URL || 'https://dashki-production.up.railway.app';

function exportFromLocalDb() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(LOCAL_DB_PATH);
    
    console.log('📤 Reading local database...');
    
    db.all(`SELECT * FROM Foods`, [], (err, foods) => {
      if (err) { db.close(); reject(err); return; }
      
      db.all(`SELECT * FROM SavedMeals`, [], (err, meals) => {
        if (err) { db.close(); reject(err); return; }
        
        db.all(`SELECT * FROM SavedMealItems`, [], (err, mealItems) => {
          db.close();
          if (err) { reject(err); return; }
          
          console.log(`   Found ${foods.length} foods`);
          console.log(`   Found ${meals.length} saved meals`);
          console.log(`   Found ${mealItems.length} meal items`);
          
          resolve({ foods, meals, mealItems });
        });
      });
    });
  });
}

function importToRailway(data) {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/admin/import-data', RAILWAY_URL);
    
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    console.log(`\n📥 Sending to ${RAILWAY_URL}...`);
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body));
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

async function main() {
  try {
    const data = await exportFromLocalDb();
    const result = await importToRailway(data);
    
    console.log('\n✅ Migration complete!');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    
    if (err.message.includes('ECONNREFUSED') || err.message.includes('ENOTFOUND')) {
      console.log('\n💡 Make sure your Railway server is running:');
      console.log(`   ${RAILWAY_URL}`);
      console.log('\n   Or set RAILWAY_URL env var');
    }
    process.exit(1);
  }
}

main();