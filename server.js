require('dotenv').config();
const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fury_secret_key_2026';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// BANCO DE DADOS PERSISTENTE (SQLite)
const db = new sqlite3.Database('./fury_database.db', (err) => {
    if (err) console.error('Erro no SQLite:', err);
    else console.log('📁 Banco SQLite iniciado com sucesso!');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        email TEXT UNIQUE,
        password TEXT,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seller_name TEXT,
        title TEXT,
        category TEXT,
        price REAL,
        description TEXT,
        image_type TEXT DEFAULT 'gem',
        status TEXT DEFAULT 'active'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_code TEXT UNIQUE,
        buyer_name TEXT,
        product_title TEXT,
        amount REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS seller_applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_code TEXT UNIQUE,
        username TEXT,
        discord_tag TEXT,
        discord_id TEXT,
        products TEXT,
        description TEXT,
        status TEXT DEFAULT 'pending'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_code TEXT UNIQUE,
        username TEXT,
        subject TEXT,
        category TEXT,
        message TEXT,
        status TEXT DEFAULT 'open'
    )`);

    // Criar Admin padrão (admin@furymarket.com / admin123)
    db.get("SELECT * FROM users WHERE email = 'admin@furymarket.com'", async (err, row) => {
        if (!row) {
            const hash = await bcrypt.hash('admin123', 10);
            db.run("INSERT INTO users (username, email, password, role) VALUES ('Admin', 'admin@furymarket.com', ?, 'admin')", [hash]);
            console.log('👤 Admin criado: admin@furymarket.com / admin123');
        }
    });

    // Produtos Iniciais
    db.get("SELECT count(*) as count FROM products", (err, row) => {
        if (row && row.count === 0) {
            db.run("INSERT INTO products (seller_name, title, category, price, description, image_type) VALUES ('FuryStore', 'Recarga 1060 Diamantes (Via ID)', 'Diamantes', 45.00, 'Entrega via ID oficial.', 'gem')");
            db.run("INSERT INTO products (seller_name, title, category, price, description, image_type) VALUES ('FuryStore', 'Gift Card R$ 50 Google Play', 'Gift Cards', 48.50, 'Resgate na Play Store.', 'gift')");
            db.run("INSERT INTO products (seller_name, title, category, price, description, image_type) VALUES ('FuryStore', 'Coaching Mestre 1 hora', 'Coaching', 30.00, 'Treino ao vivo.', 'trophy')");
        }
    });
});

// AUTH MIDDLEWARE
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Não autorizado.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'Sessão expirada.' });
        req.user = user;
        next();
    });
}

// ENDPOINTS DA API

app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ success: false, message: 'Preencha todos os campos!' });

    const hash = await bcrypt.hash(password, 10);
    db.run("INSERT INTO users (username, email, password) VALUES (?, ?, ?)", [username, email, hash], function(err) {
        if (err) return res.status(400).json({ success: false, message: 'Usuário ou E-mail já cadastrado.' });
        const token = jwt.sign({ id: this.lastID, username, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, message: 'Conta criada!', token, username, role: 'user' });
    });
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
        if (err || !user) return res.status(400).json({ success: false, message: 'E-mail ou senha incorretos.' });
        const validPass = await bcrypt.compare(password, user.password);
        if (!validPass) return res.status(400).json({ success: false, message: 'E-mail ou senha incorretos.' });

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, message: 'Login realizado!', token, username: user.username, role: user.role });
    });
});

app.get('/api/products', (req, res) => {
    db.all("SELECT * FROM products WHERE status = 'active' ORDER BY id DESC", [], (err, rows) => {
        res.json({ success: true, products: rows || [] });
    });
});

app.post('/api/checkout/pix', authenticateToken, (req, res) => {
    const { productTitle, amount } = req.body;
    const orderCode = `FUR-${Math.floor(100000 + Math.random() * 900000)}`;
    const pixKey = process.env.PIX_KEY || 'pix@furymarket.com';

    db.run("INSERT INTO orders (order_code, buyer_name, product_title, amount) VALUES (?, ?, ?, ?)",
        [orderCode, req.user.username, productTitle, parseFloat(amount)], (err) => {
            if (err) return res.status(500).json({ success: false, message: 'Erro ao criar pedido.' });
            res.json({
                success: true,
                orderCode,
                amount,
                pixKey,
                pixPayload: `00020126580014BR.GOV.BCB.PIX0136${pixKey}5204000053039865405${amount}5802BR5919FuryMarket6009SAOPAULO62070503***6304E2CA`
            });
        });
});

app.post('/api/seller/apply', authenticateToken, async (req, res) => {
    const { discordTag, discordId, products, description } = req.body;
    const appCode = `SOL-${Math.floor(100000 + Math.random() * 900000)}`;

    db.run("INSERT INTO seller_applications (app_code, username, discord_tag, discord_id, products, description) VALUES (?, ?, ?, ?, ?, ?)",
        [appCode, req.user.username, discordTag, discordId, products, description], async function(err) {
            if (err) return res.status(500).json({ success: false, message: 'Erro ao salvar solicitação.' });

            const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
            const roleId = process.env.DISCORD_ROLE_ID;
            if (webhookUrl && webhookUrl.startsWith('http')) {
                try {
                    const roleMention = roleId ? `<@&${roleId}>` : '';
                    await fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            content: `🚨 ${roleMention} **NOVA SOLICITAÇÃO DE VENDEDOR!**`,
                            embeds: [{
                                title: `📄 Solicitação: ${appCode}`,
                                color: 0x00FF66,
                                fields: [
                                    { name: "👤 Usuário", value: req.user.username, inline: true },
                                    { name: "🎮 Discord", value: `${discordTag} (${discordId})`, inline: true },
                                    { name: "📦 Produtos", value: products, inline: false },
                                    { name: "📝 Descrição", value: description, inline: false }
                                ],
                                timestamp: new Date().toISOString()
                            }]
                        })
                    });
                } catch (e) { console.error('Erro Webhook:', e); }
            }
            res.json({ success: true, message: 'Solicitação enviada com sucesso!' });
        });
});

app.post('/api/tickets/create', authenticateToken, (req, res) => {
    const { subject, category, message } = req.body;
    const ticketCode = `TCK-${Math.floor(100000 + Math.random() * 900000)}`;

    db.run("INSERT INTO tickets (ticket_code, username, subject, category, message) VALUES (?, ?, ?, ?, ?)",
        [ticketCode, req.user.username, subject, category, message], (err) => {
            if (err) return res.status(500).json({ success: false, message: 'Erro ao abrir ticket.' });
            res.json({ success: true, message: `Ticket ${ticketCode} aberto com sucesso!` });
        });
});

app.get('/api/admin/dashboard', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Acesso negado.' });

    db.all("SELECT * FROM users", [], (err, users) => {
        db.all("SELECT * FROM seller_applications", [], (err, apps) => {
            db.all("SELECT * FROM orders", [], (err, orders) => {
                db.all("SELECT * FROM tickets", [], (err, tickets) => {
                    res.json({ success: true, users: users || [], apps: apps || [], orders: orders || [], tickets: tickets || [] });
                });
            });
        });
    });
});

// Servir o Frontend SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🔥 Fury Market rodando na porta ${PORT}`);
});
