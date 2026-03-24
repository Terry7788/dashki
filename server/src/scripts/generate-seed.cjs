const fs = require('fs');
const csvContent = fs.readFileSync('./foods-seed.csv', 'utf8');
const lines = csvContent.split('\n').slice(1);

const foods = [];
for (const line of lines) {
  if (!line.trim()) continue;
  const parts = line.split(',');
  if (parts.length >= 3) {
    const name = parts[0].replace(/^"|"$/g, '').trim();
    const amount = parseFloat(parts[1]) || 1;
    const calories = parseFloat(parts[2]) || 0;
    const protein = parts[3] ? parseFloat(parts[3]) : null;
    if (name && calories > 0) {
      foods.push({ name, baseAmount: amount, baseUnit: amount === 1 ? 'servings' : 'grams', calories, protein });
    }
  }
}

// Output as JS module
const output = 'export const SEED_FOODS = ' + JSON.stringify(foods, null, 2) + ';\n';
fs.writeFileSync('./seed-foods.js', output);
console.log('Generated seed-foods.js with', foods.length, 'foods');