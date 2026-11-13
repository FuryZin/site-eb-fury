const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'fury_database.sqlite'));

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (robloxId TEXT PRIMARY KEY, username TEXT, rankInGroup INTEGER, roleId INTEGER DEFAULT 1, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS site_roles (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, canPromote INTEGER DEFAULT 0, canDemote INTEGER DEFAULT 0, minRankAllowed INTEGER DEFAULT 1, maxRankAllowed INTEGER DEFAULT 255)`);
    db.run(`CREATE TABLE IF NOT EXISTS store_sellers (id INTEGER PRIMARY KEY AUTOINCREMENT, robloxId TEXT, username TEXT, salesCount INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, actorId TEXT, actorName TEXT, targetId TEXT, targetName TEXT, action TEXT, details TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    
    db.get(`SELECT COUNT(*) as count FROM site_roles`, (err, row) => {
        if (row && row.count === 0) {
            db.run(`INSERT INTO site_roles (id, name, canPromote, canDemote, minRankAllowed, maxRankAllowed) VALUES 
                (1, 'Soldado', 0, 0, 1, 1),
                (2, 'Oficial Subalterno', 1, 1, 1, 10),
                (3, 'Oficial Superior', 1, 1, 1, 20),
                (4, 'Alto Comando', 1, 1, 1, 255)`);
        }
    });
});
module.exports = db;