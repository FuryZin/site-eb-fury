const express = require('express');
const session = require('express-session');
const path = require('path');
const argon2 = require('argon2');
const axios = require('axios');
const db = require('./database');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'fury_default_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', 
        httpOnly: true, 
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000 
    }
}));

app.use(express.static(path.join(__dirname, 'public')));

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

app.post('/auth/roblox', async (req, res) => {
    const { robloxId, username } = req.body;
    if (!robloxId) return res.status(400).json({ error: 'Roblox ID obrigatório.' });

    try {
        const groupCheck = await axios.get(`https://groups.roblox.com/v1/users/${robloxId}/groups/roles`);
        const groupData = groupCheck.data.data.find(g => g.group.id == 427531459);

        if (!groupData && robloxId !== process.env.OWNER_ROBLOX_ID) {
            return res.status(403).json({ error: 'Você não é membro do Exército Brasileiro do Fury (Grupo 427531459).' });
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
    req.session.destroy(() => res.redirect('/login.html'));
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
