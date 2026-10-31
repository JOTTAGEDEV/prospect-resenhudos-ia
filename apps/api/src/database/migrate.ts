import { openDatabase } from './db.js';
const {sqlite}=openDatabase();
sqlite.close();
console.log('Migrations aplicadas.');
