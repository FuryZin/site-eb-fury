require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fury_secret_key_2026';
const OWNER_SECRET_KEY = process.env.OWNER_SECRET_KEY || 'DONO123456';

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
        seller_id INTEGER,
        seller_name TEXT,
        title TEXT,
        category TEXT,
        price REAL,
        promo_price REAL DEFAULT 0,
        description TEXT,
        image_type TEXT DEFAULT 'gem',
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
        user_id INTEGER,
        username TEXT,
        discord_tag TEXT,
        discord_id TEXT,
        products TEXT,
        description TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_code TEXT UNIQUE,
        username TEXT,
        subject TEXT,
        category TEXT,
        message TEXT,
        status TEXT DEFAULT 'open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
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

// ==========================================
// AUTENTICAÇÃO (MEMBROS E DONOS)
// ==========================================

// Registro (Normal ou Dono)
app.post('/api/auth/register', async (req, res) => {
    const { username, email, password, isOwner, ownerSecret } = req.body;
    if (!username || !email || !password) return res.status(400).json({ success: false, message: 'Preencha todos os campos!' });

    let userRole = 'user';

    // Se marcou a opção Dono, valida a senha mestra
    if (isOwner) {
        if (ownerSecret !== OWNER_SECRET_KEY) {
            return res.status(403).json({ success: false, message: 'Senha Mestra de Dono incorreta!' });
        }
        userRole = 'admin';
    }

    const hash = await bcrypt.hash(password, 10);
    db.run("INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)", [username, email, hash, userRole], function(err) {
        if (err) return res.status(400).json({ success: false, message: 'Usuário ou E-mail já cadastrado.' });
        const token = jwt.sign({ id: this.lastID, username, role: userRole }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, message: isOwner ? 'Conta de DONO criada com sucesso!' : 'Conta criada com sucesso!', token, username, role: userRole });
    });
});

// Login (Normal ou Dono)
app.post('/api/auth/login', (req, res) => {
    const { email, password, isOwner, ownerSecret } = req.body;
    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
        if (err || !user) return res.status(400).json({ success: false, message: 'E-mail ou senha incorretos.' });
        const validPass = await bcrypt.compare(password, user.password);
        if (!validPass) return res.status(400).json({ success: false, message: 'E-mail ou senha incorretos.' });

        let finalRole = user.role;

        // Se estiver logando como Dono, valida a senha de dono e atualiza o cargo se necessário
        if (isOwner) {
            if (ownerSecret !== OWNER_SECRET_KEY) {
                return res.status(403).json({ success: false, message: 'Senha Mestra de Dono incorreta!' });
            }
            finalRole = 'admin';
            db.run("UPDATE users SET role = 'admin' WHERE id = ?", [user.id]);
        }

        const token = jwt.sign({ id: user.id, username: user.username, role: finalRole }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, message: 'Login realizado!', token, username: user.username, role: finalRole });
    });
});

// ==========================================
// PRODUTOS & LOJA DO VENDEDOR
// ==========================================

app.get('/api/products', (req, res) => {
    db.all("SELECT * FROM products WHERE status = 'active' ORDER BY id DESC", [], (err, rows) => {
        res.json({ success: true, products: rows || [] });
    });
});

app.post('/api/products/create', authenticateToken, (req, res) => {
    if (req.user.role !== 'seller' && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Apenas vendedores aprovados podem cadastrar produtos.' });
    }

    const { title, category, price, promoPrice, description, imageType } = req.body;
    if (!title || !price || !category) return res.status(400).json({ success: false, message: 'Preencha os campos obrigatórios.' });

    db.run("INSERT INTO products (seller_id, seller_name, title, category, price, promo_price, description, image_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [req.user.id, req.user.username, title, category, parseFloat(price), parseFloat(promoPrice || 0), description, imageType || 'gem'],
        function(err) {
            if (err) return res.status(500).json({ success: false, message: 'Erro ao cadastrar produto.' });
            res.json({ success: true, message: 'Produto/Promoção cadastrado com sucesso!' });
        }
    );
});

app.get('/api/seller/my-products', authenticateToken, (req, res) => {
    db.all("SELECT * FROM products WHERE seller_id = ? ORDER BY id DESC", [req.user.id], (err, rows) => {
        res.json({ success: true, products: rows || [] });
    });
});

// ==========================================
// CHECKOUT PIX + DISCORD SALES WEBHOOK
// ==========================================

app.post('/api/checkout/pix', authenticateToken, (req, res) => {
    const { productTitle, amount } = req.body;
    const orderCode = `FUR-${Math.floor(100000 + Math.random() * 900000)}`;
    const pixKey = process.env.PIX_KEY || 'pix@furymarket.com';

    db.run("INSERT INTO orders (order_code, buyer_name, product_title, amount) VALUES (?, ?, ?, ?)",
        [orderCode, req.user.username, productTitle, parseFloat(amount)], async (err) => {
            if (err) return res.status(500).json({ success: false, message: 'Erro ao criar pedido.' });

            const salesWebhook = process.env.DISCORD_SALES_WEBHOOK_URL;
            if (salesWebhook && salesWebhook.startsWith('http')) {
                try {
                    await fetch(salesWebhook, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            embeds: [{
                                title: `⚡ NOVA VENDA REALIZADA!`,
                                color: 0x00FF66,
                                fields: [
                                    { name: "📦 Produto", value: productTitle, inline: true },
                                    { name: "💰 Valor", value: `R$ ${parseFloat(amount).toFixed(2)}`, inline: true },
                                    { name: "👤 Comprador", value: req.user.username, inline: true },
                                    { name: "🆔 Pedido", value: orderCode, inline: false }
                                ],
                                timestamp: new Date().toISOString()
                            }]
                        })
                    });
                } catch (e) { console.error('Erro Webhook Vendas:', e); }
            }

            res.json({
                success: true,
                orderCode,
                amount,
                pixKey,
                pixPayload: `00020126580014BR.GOV.BCB.PIX0136${pixKey}5204000053039865405${amount}5802BR5919FuryMarket6009SAOPAULO62070503***6304E2CA`
            });
        }
    );
});

// ==========================================
// SOLICITAÇÃO DE VENDEDOR + DISCORD NOTIFY
// ==========================================

app.post('/api/seller/apply', authenticateToken, async (req, res) => {
    const { discordTag, discordId, products, description } = req.body;
    const appCode = `SOL-${Math.floor(100000 + Math.random() * 900000)}`;

    db.run("INSERT INTO seller_applications (app_code, user_id, username, discord_tag, discord_id, products, description) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [appCode, req.user.id, req.user.username, discordTag, discordId, products, description], async function(err) {
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
                                title: `📄 Código: ${appCode}`,
                                color: 0xFF6600,
                                fields: [
                                    { name: "👤 Usuário", value: req.user.username, inline: true },
                                    { name: "🎮 Discord", value: `${discordTag} (${discordId})`, inline: true },
                                    { name: "📦 Produtos Pretendidos", value: products, inline: false },
                                    { name: "📝 Descrição", value: description, inline: false },
                                    { name: "⚙️ Ação do Dono", value: "Acesse o Painel Admin do site para **Aceitar** ou **Recusar** esta solicitação.", inline: false }
                                ],
                                timestamp: new Date().toISOString()
                            }]
                        })
                    });
                } catch (e) { console.error('Erro Webhook Discord:', e); }
            }

            res.json({ success: true, message: 'Solicitação enviada! Aguarde a aprovação do Dono pelo painel.' });
        }
    );
});

// ==========================================
// PAINEL ADMIN: APROVAR OU RECUSAR NO SITE
// ==========================================

app.get('/api/admin/dashboard', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Acesso negado.' });

    db.all("SELECT * FROM users", [], (err, users) => {
        db.all("SELECT * FROM seller_applications ORDER BY id DESC", [], (err, apps) => {
            db.all("SELECT * FROM orders ORDER BY id DESC", [], (err, orders) => {
                db.all("SELECT * FROM tickets ORDER BY id DESC", [], (err, tickets) => {
                    res.json({ success: true, users: users || [], apps: apps || [], orders: orders || [], tickets: tickets || [] });
                });
            });
        });
    });
});

// Aceitar Vendedor pelo Painel do Site
app.post('/api/admin/approve-seller', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Acesso negado.' });
    const { appId, userId } = req.body;

    db.run("UPDATE users SET role = 'seller' WHERE id = ?", [userId], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Erro ao promover usuário.' });
        
        db.run("UPDATE seller_applications SET status = 'approved' WHERE id = ?", [appId], () => {
            res.json({ success: true, message: 'Vendedor aprovado com sucesso!' });
        });
    });
});

// Recusar Vendedor pelo Painel do Site
app.post('/api/admin/reject-seller', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Acesso negado.' });
    const { appId } = req.body;

    db.run("UPDATE seller_applications SET status = 'rejected' WHERE id = ?", [appId], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Erro ao recusar solicitação.' });
        res.json({ success: true, message: 'Solicitação recusada.' });
    });
});

// TICKETS DE SUPORTE
app.post('/api/tickets/create', authenticateToken, (req, res) => {
    const { subject, category, message } = req.body;
    const ticketCode = `TCK-${Math.floor(100000 + Math.random() * 900000)}`;

    db.run("INSERT INTO tickets (ticket_code, username, subject, category, message) VALUES (?, ?, ?, ?, ?)",
        [ticketCode, req.user.username, subject, category, message], (err) => {
            if (err) return res.status(500).json({ success: false, message: 'Erro ao abrir ticket.' });
            res.json({ success: true, message: `Ticket ${ticketCode} aberto com sucesso!` });
        }
    );
});

// SERVIR FRONTEND (SPA)
app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('<h1>Erro: public/index.html não encontrado!</h1>');
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🔥 Fury Market rodando na porta ${PORT}`);
});
