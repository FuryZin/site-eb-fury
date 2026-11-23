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
    if (err) console.error('Erro ao conectar ao SQLite:', err);
    else console.log('📁 Banco SQLite conectado com sucesso!');
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

    // Admin Padrão (admin@furymarket.com / admin123)
    db.get("SELECT * FROM users WHERE email = 'admin@furymarket.com'", async (err, row) => {
        if (!row) {
            const hash = await bcrypt.hash('admin123', 10);
            db.run("INSERT INTO users (username, email, password, role) VALUES ('Admin', 'admin@furymarket.com', ?, 'admin')", [hash]);
            console.log('👤 Admin padrão criado: admin@furymarket.com / admin123');
        }
    });

    // Produtos Iniciais
    db.get("SELECT count(*) as count FROM products", (err, row) => {
        if (row && row.count === 0) {
            db.run("INSERT INTO products (seller_name, title, category, price, description, image_type) VALUES ('FuryStore', 'Recarga 1060 Diamantes (Via ID)', 'Diamantes', 45.00, 'Entrega imediata via ID oficial.', 'gem')");
            db.run("INSERT INTO products (seller_name, title, category, price, description, image_type) VALUES ('FuryStore', 'Gift Card R$ 50 Google Play', 'Gift Cards', 48.50, 'Código resgatável na Play Store.', 'gift')");
            db.run("INSERT INTO products (seller_name, title, category, price, description, image_type) VALUES ('FuryStore', 'Coaching Avançado Mestre', 'Coaching', 30.00, '1 Hora de treino ao vivo.', 'trophy')");
        }
    });
});

// MIDDLEWARE DE AUTENTICAÇÃO
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

// ROTAS DA API

// Registro
app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ success: false, message: 'Preencha todos os campos!' });

    const hash = await bcrypt.hash(password, 10);
    db.run("INSERT INTO users (username, email, password) VALUES (?, ?, ?)", [username, email, hash], function(err) {
        if (err) return res.status(400).json({ success: false, message: 'Usuário ou E-mail já existente.' });
        const token = jwt.sign({ id: this.lastID, username, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, message: 'Conta criada com sucesso!', token, username, role: 'user' });
    });
});

// Login
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

// Listar Produtos
app.get('/api/products', (req, res) => {
    db.all("SELECT * FROM products WHERE status = 'active' ORDER BY id DESC", [], (err, rows) => {
        res.json({ success: true, products: rows || [] });
    });
});

// Checkout Pix
app.post('/api/checkout/pix', authenticateToken, (req, res) => {
    const { productTitle, amount } = req.body;
    const orderCode = `FUR-${Math.floor(100000 + Math.random() * 900000)}`;
    const pixKey = process.env.PIX_KEY || 'pix@furymarket.com';

    db.run("INSERT INTO orders (order_code, buyer_name, product_title, amount) VALUES (?, ?, ?, ?)",
        [orderCode, req.user.username, productTitle, parseFloat(amount)], (err) => {
            if (err) return res.status(500).json({ success: false, message: 'Erro ao gerar pedido.' });
            
            res.json({
                success: true,
                orderCode,
                amount,
                pixKey,
                pixPayload: `00020126580014BR.GOV.BCB.PIX0136${pixKey}5204000053039865405${amount}5802BR5919FuryMarket6009SAOPAULO62070503***6304E2CA`
            });
        });
});

// Solicitação Vendedor + Discord Webhook
app.post('/api/seller/apply', authenticateToken, async (req, res) => {
    const { discordTag, discordId, products, description } = req.body;
    const appCode = `SOL-${Math.floor(100000 + Math.random() * 900000)}`;

    db.run("INSERT INTO seller_applications (app_code, username, discord_tag, discord_id, products, description) VALUES (?, ?, ?, ?, ?, ?)",
        [appCode, req.user.username, discordTag, discordId, products, description], async function(err) {
            if (err) return res.status(500).json({ success: false, message: 'Erro ao registrar solicitação.' });

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
                                title: `📄 Código: ${appCode}`,
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
                } catch (e) { console.error('Erro Webhook Discord:', e); }
            }

            res.json({ success: true, message: 'Solicitação enviada com sucesso!' });
        });
});

// Tickets Suporte
app.post('/api/tickets/create', authenticateToken, (req, res) => {
    const { subject, category, message } = req.body;
    const ticketCode = `TCK-${Math.floor(100000 + Math.random() * 900000)}`;

    db.run("INSERT INTO tickets (ticket_code, username, subject, category, message) VALUES (?, ?, ?, ?, ?)",
        [ticketCode, req.user.username, subject, category, message], (err) => {
            if (err) return res.status(500).json({ success: false, message: 'Erro ao abrir ticket.' });
            res.json({ success: true, message: `Ticket ${ticketCode} aberto com sucesso!` });
        });
});

// Dashboard Admin
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

// FRONTEND COMPLETO (SPA)
app.get('*', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fury Market — Marketplace Free Fire</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        furyBg: '#0a0a0c',
                        furyCard: '#121216',
                        furyBorder: '#262630',
                        furyAccent: '#00ff66',
                        furyAccentHover: '#00cc52',
                        furyOrange: '#ff6600',
                    }
                }
            }
        }
    </script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body class="bg-furyBg text-gray-100 font-sans min-h-screen flex flex-col justify-between">
    <header class="bg-furyCard border-b border-furyBorder sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between gap-4">
            <div class="flex items-center gap-2 cursor-pointer" onclick="navigate('home')">
                <i class="fa-solid fa-gamepad text-furyAccent text-3xl"></i>
                <span class="text-xl font-black text-white">FURY<span class="text-furyAccent">MARKET</span></span>
            </div>
            <div class="flex items-center gap-4 text-sm font-semibold">
