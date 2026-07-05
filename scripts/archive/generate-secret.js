#!/usr/bin/env node

/**
 * Générateur de SESSION_SECRET
 * 
 * Usage:
 *   node generate-secret.js
 */

const crypto = require('crypto');

console.log('\n========================================');
console.log('  GÉNÉRATEUR DE SESSION_SECRET');
console.log('========================================\n');

const secret = crypto.randomBytes(32).toString('hex');

console.log('Votre SESSION_SECRET généré:');
console.log('');
console.log('  ' + secret);
console.log('');
console.log('Copiez cette valeur dans votre fichier .env:');
console.log('  SESSION_SECRET=' + secret);
console.log('');
console.log('========================================\n');
