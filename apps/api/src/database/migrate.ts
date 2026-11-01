import { openDatabase } from "./db.js";
const { sqlite } = await openDatabase();
sqlite.close();
console.log("Migrations aplicadas.");
