const express = require('express');
const session = require('express-session');
const argon2 = require('argon2');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'fury_default_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, 
        httpOnly: true, 
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000 
    }
}));

// Banco de Dados em Memória/Arquivo
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

async function initOwnerPassword() {
    if (!process.env.OWNER_PASSWORD_HASH) {
        const defaultPassword = 'FuryOwnerPassword123!';
        const hash = await argon2.hash(defaultPassword);
        console.log(`[SEGURANÇA] Senha temporária do Proprietário: "${defaultPassword}"`);
        console.log(`[SEGURANÇA] Hash (cole no Railway): ${hash}`);
        process.env.OWNER_PASSWORD_HASH = hash;
    }
}
initOwnerPassword();

// --- ROTAS DA TELA DE LOGIN ---
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Login — EB do Fury</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-950 text-white flex items-center justify-center h-screen">
        <div class="bg-slate-900 border border-green-500/30 p-8 rounded-2xl w-full max-w-md shadow-2xl space-y-6">
            <h1 class="text-xl font-bold text-green-400 text-center tracking-wider">EXÉRCITO DO FURY</h1>
            
            <div class="flex border-b border-gray-800 pb-2">
                <button onclick="tab('roblox')" id="bR" class="flex-1 text-xs font-bold uppercase text-green-400 border-b-2 border-green-500 pb-2">Roblox</button>
                <button onclick="tab('owner')" id="bO" class="flex-1 text-xs font-bold uppercase text-gray-400 pb-2">Proprietário</button>
            </div>

            <form id="fR" onsubmit="lR(event)" class="space-y-4">
                <input type="text" id="rId" required placeholder="Seu Roblox User ID" class="w-full bg-black border border-gray-700 rounded-lg p-3 text-sm text-white">
                <input type="text" id="rName" required placeholder="Seu Nickname" class="w-full bg-black border border-gray-700 rounded-lg p-3 text-sm text-white">
                <button type="submit" class="w-full bg-green-600 hover:bg-green-500 text-black font-bold p-3 rounded-lg text-sm transition">ENTRAR</button>
            </form>

            <form id="fO" onsubmit="lO(event)" class="space-y-4 hidden">
                <input type="password" id="oPass" required placeholder="Senha do Proprietário" class="w-full bg-black border border-gray-700 rounded-lg p-3 text-sm text-white">
                <button type="submit" class="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-bold p-3 rounded-lg text-sm transition">ACESSAR DONO</button>
            </form>
        </div>
        <script>
            function tab(t) {
                if(t==='roblox'){document.getElementById('fR').classList.remove('hidden');document.getElementById('fO').classList.add('hidden');document.getElementById('bR').className="flex-1 text-xs font-bold uppercase text-green-400 border-b-2 border-green-500 pb-2";document.getElementById('bO').className="flex-1 text-xs font-bold uppercase text-gray-400 pb-2";}
                else{document.getElementById('fO').classList.remove('hidden');document.getElementById('fR').classList.add('hidden');document.getElementById('bO').className="flex-1 text-xs font-bold uppercase text-green-400 border-b-2 border-green-500 pb-2";document.getElementById('bR').className="flex-1 text-xs font-bold uppercase text-gray-400 pb-2";}
            }
            async function lR(e) {
                e.preventDefault();
                const res = await fetch('/auth/roblox', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({robloxId:document.getElementById('rId').value, username:document.getElementById('rName').value})});
                const d = await res.json();
                if(res.ok) window.location.href = d.redirect; else alert(d.error);
            }
            async function lO(e) {
                e.preventDefault();
                const res = await fetch('/auth/owner', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:document.getElementById('oPass').value})});
                const d = await res.json();
                if(res.ok) window.location.href = d.redirect; else alert(d.error);
            }
        </script>
    </body>
    </html>
    `);
});

app.get('/dashboard.html', (req, res) => {
    if (!req.session.userId) return res.redirect('/');
    res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Dashboard — EB do Fury</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-950 text-white flex h-screen">
        <aside class="w-64 bg-slate-900 border-r border-gray-800 p-6 flex flex-col justify-between">
            <div>
                <h1 class="text-green-400 font-bold mb-6 tracking-wider">EB DO FURY</h1>
                <p id="userInfo" class="text-xs text-gray-400">Carregando...</p>
            </div>
            <a href="/auth/logout" class="text-red-400 text-xs font-bold hover:underline">Sair do Sistema</a>
        </aside>
        <main class="flex-1 p-8 space-y-6">
            <h2 class="text-lg font-bold text-green-400">Painel Executivo</h2>
            <div class="grid grid-cols-3 gap-6">
                <div class="bg-slate-900 border border-green-500/20 p-6 rounded-xl">
                    <p class="text-xs text-gray-400">Membros no Grupo Roblox</p>
                    <h3 id="statUsers" class="text-3xl font-extrabold text-white mt-2">0</h3>
                </div>
                <div class="bg-slate-900 border border-blue-500/20 p-6 rounded-xl">
                    <p class="text-xs text-gray-400">Administradores</p>
                    <h3 id="statAdmins" class="text-3xl font-extrabold text-white mt-2">0</h3>
                </div>
                <div class="bg-slate-900 border border-purple-500/20 p-6 rounded-xl">
                    <p class="text-xs text-gray-400">Vendedores</p>
                    <h3 id="statSellers" class="text-3xl font-extrabold text-white mt-2">0</h3>
                </div>
            </div>
        </main>
        <script>
            async function init() {
                const rU = await fetch('/auth/me');
                if(!rU.ok) window.location.href = '/';
                const u = await rU.json();
                document.getElementById('userInfo.innerHTML = \`Logado como: <strong class="text-white">\${u.username}</strong><br><span class="text-green-400">\${u.siteRoleName}</span>\`;

                const rS = await fetch('/admin/stats');
                const s = await rS.json();
                document.getElementById('statUsers').innerText = s.groupMemberCount;
                document.getElementById('statAdmins').innerText = s.adminsCount;
                document.getElementById('statSellers').innerText = s.sellersCount;
            }
            init();
        </script>
    </body>
    </html>
    `);
});

// --- AUTENTICAÇÃO ---
app.post('/auth/roblox', async (req, res) => {
    const { robloxId, username } = req.body;
    if (!robloxId) return res.status(400).json({ error: 'Roblox ID obrigatório.' });
    try {
        const groupCheck = await axios.get(`https://groups.roblox.com/v1/users/${robloxId}/groups/roles`);
        const groupData = groupCheck.data.data.find(g => g.group.id == 427531459);

        if (!groupData && robloxId !== process.env.OWNER_ROBLOX_ID) {
            return res.status(403).json({ error: 'Você não é membro do Grupo 427531459.' });
        }

        const rank = groupData ? groupData.role.rank : 0;
        let siteRoleId = (robloxId === process.env.OWNER_ROBLOX_ID) ? 4 : (rank >= 10 ? 3 : (rank >= 5 ? 2 : 1));

        db.run(`INSERT INTO users (robloxId, username, rankInGroup, roleId) VALUES (?, ?, ?, ?) 
                ON CONFLICT(robloxId) DO UPDATE SET username = ?, rankInGroup = ?, roleId = ?`,
            [robloxId, username || 'Militar', rank, siteRoleId, username || 'Militar', rank, siteRoleId], (err) => {
                if (err) return res.status(500).json({ error: 'Erro ao salvar usuário.' });
                req.session.userId = robloxId;
                req.session.username = username || 'Militar';
                req.session.isOwner = (robloxId === process.env.OWNER_ROBLOX_ID);
                res.json({ success: true, redirect: '/dashboard.html' });
            });
    } catch (error) {
        res.status(500).json({ error: 'Erro na API da Roblox: ' + error.message });
    }
});

app.post('/auth/owner', async (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Senha obrigatória.' });
    try {
        const match = await argon2.verify(process.env.OWNER_PASSWORD_HASH, password);
        if (!match) return res.status(401).json({ error: 'Senha incorreta.' });

        req.session.userId = process.env.OWNER_ROBLOX_ID || '2261889095';
        req.session.username = 'Pieter (Proprietário)';
        req.session.isOwner = true;
        res.json({ success: true, redirect: '/dashboard.html' });
    } catch (e) {
        res.status(500).json({ error: 'Erro interno.' });
    }
});

app.get('/auth/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

app.get('/auth/me', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Não autenticado' });
    db.get(`SELECT u.*, r.name as siteRoleName FROM users u JOIN site_roles r ON u.roleId = r.id WHERE u.robloxId = ?`, 
        [req.session.userId], (err, user) => {
        if (err || !user) {
            return res.json({
                robloxId: req.session.userId,
                username: req.session.username,
                siteRoleName: req.session.isOwner ? 'Proprietário Supremo' : 'Militar',
                isOwner: req.session.isOwner
            });
        }
        user.isOwner = req.session.isOwner || (user.robloxId === process.env.OWNER_ROBLOX_ID);
        res.json(user);
    });
});

app.get('/admin/stats', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Não autorizado' });
    try {
        const apiKey = process.env.ROBLOX_OPEN_CLOUD_KEY;
        let memberCount = 0;
        if (apiKey) {
            try {
                const groupRes = await axios.get(`https://apis.roblox.com/cloud/v2/groups/427531459`, {
                    headers: { 'x-api-key': apiKey }
                });
                memberCount = groupRes.data.memberCount || 0;
            } catch (e) {}
        }
        db.get(`SELECT COUNT(*) as adminsCount FROM users WHERE roleId > 1`, (err, aRow) => {
            db.get(`SELECT COUNT(*) as sellersCount FROM store_sellers`, (err, sRow) => {
                db.all(`SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 10`, (err, logs) => {
                    res.json({
                        groupMemberCount: memberCount,
                        adminsCount: aRow?.adminsCount || 0,
                        sellersCount: sRow?.sellersCount || 0,
                        recentLogs: logs || []
                    });
                });
            });
        });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao buscar estatísticas' });
    }
});

app.listen(PORT, () => console.log(`[EB FURY] Rodando na porta ${PORT}`));
