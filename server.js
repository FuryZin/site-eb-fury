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
        image_url TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_code TEXT UNIQUE,
        buyer_id INTEGER,
        buyer_name TEXT,
        seller_id INTEGER,
        seller_name TEXT,
        product_title TEXT,
        amount REAL,
        pix_payload TEXT,
        status TEXT DEFAULT 'awaiting_payment',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS order_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        sender_id INTEGER,
        sender_name TEXT,
        message TEXT,
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
// AUTENTICAÇÃO
// ==========================================

app.post('/api/auth/register', async (req, res) => {
    const { username, email, password, isOwner, ownerSecret } = req.body;
    if (!username || !email || !password) return res.status(400).json({ success: false, message: 'Preencha todos os campos!' });

    let userRole = 'user';
    if (isOwner) {
        if (ownerSecret !== OWNER_SECRET_KEY) return res.status(403).json({ success: false, message: 'Senha de Dono incorreta!' });
        userRole = 'admin';
    }

    const hash = await bcrypt.hash(password, 10);
    db.run("INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)", [username, email, hash, userRole], function(err) {
        if (err) return res.status(400).json({ success: false, message: 'Usuário ou E-mail já cadastrado.' });
        const token = jwt.sign({ id: this.lastID, username, role: userRole }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, message: 'Conta criada com sucesso!', token, username, role: userRole });
    });
});

app.post('/api/auth/login', (req, res) => {
    const { email, password, isOwner, ownerSecret } = req.body;
    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
        if (err || !user) return res.status(400).json({ success: false, message: 'E-mail ou senha incorretos.' });
        const validPass = await bcrypt.compare(password, user.password);
        if (!validPass) return res.status(400).json({ success: false, message: 'E-mail ou senha incorretos.' });

        let finalRole = user.role;
        if (isOwner) {
            if (ownerSecret !== OWNER_SECRET_KEY) return res.status(403).json({ success: false, message: 'Senha de Dono incorreta!' });
            finalRole = 'admin';
            db.run("UPDATE users SET role = 'admin' WHERE id = ?", [user.id]);
        }

        const token = jwt.sign({ id: user.id, username: user.username, role: finalRole }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, message: 'Login realizado!', token, username: user.username, role: finalRole });
    });
});

// ==========================================
// PRODUTOS
// ==========================================

app.get('/api/products', (req, res) => {
    db.all("SELECT * FROM products WHERE status = 'active' ORDER BY id DESC", [], (err, rows) => {
        res.json({ success: true, products: rows || [] });
    });
});

app.post('/api/products/create', authenticateToken, (req, res) => {
    if (req.user.role !== 'seller' && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Apenas vendedores aprovados podem publicar anúncios.' });
    }

    const { title, category, price, promoPrice, description, imageUrl } = req.body;
    if (!title || !price || !category) return res.status(400).json({ success: false, message: 'Preencha os campos obrigatórios.' });

    db.run("INSERT INTO products (seller_id, seller_name, title, category, price, promo_price, description, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [req.user.id, req.user.username, title, category, parseFloat(price), parseFloat(promoPrice || 0), description, imageUrl || ''],
        function(err) {
            if (err) return res.status(500).json({ success: false, message: 'Erro ao cadastrar produto.' });
            res.json({ success: true, message: 'Produto cadastrado com sucesso!' });
        }
    );
});

app.get('/api/seller/my-products', authenticateToken, (req, res) => {
    db.all("SELECT * FROM products WHERE seller_id = ? ORDER BY id DESC", [req.user.id], (err, rows) => {
        res.json({ success: true, products: rows || [] });
    });
});

// ==========================================
// PEDIDOS E CHAT (COM PROTEÇÃO DE PRIVACIDADE)
// ==========================================

// Criar Pedido
app.post('/api/checkout/create-order', authenticateToken, (req, res) => {
    const { productTitle, amount, sellerId, sellerName } = req.body;
    const orderCode = `GG-${Math.floor(100000 + Math.random() * 900000)}`;
    const pixKey = process.env.PIX_KEY || 'pix@furymarket.com';
    const pixPayload = `00020126580014BR.GOV.BCB.PIX0136${pixKey}5204000053039865405${amount}5802BR5919FuryMarket6009SAOPAULO62070503***6304E2CA`;

    db.run("INSERT INTO orders (order_code, buyer_id, buyer_name, seller_id, seller_name, product_title, amount, pix_payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [orderCode, req.user.id, req.user.username, sellerId || 1, sellerName || 'FuryStore', productTitle, parseFloat(amount), pixPayload],
        function(err) {
            if (err) return res.status(500).json({ success: false, message: 'Erro ao gerar pedido.' });
            const orderId = this.lastID;

            db.run("INSERT INTO order_messages (order_id, sender_id, sender_name, message) VALUES (?, 0, 'Sistema', ?)",
                [orderId, `Pedido #${orderCode} gerado! Faça o pagamento no Pix abaixo e aguarde o vendedor entregar seu produto aqui.`]);

            const salesWebhook = process.env.DISCORD_SALES_WEBHOOK_URL;
            if (salesWebhook && salesWebhook.startsWith('http')) {
                try {
                    fetch(salesWebhook, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            embeds: [{
                                title: `🛒 NOVO PEDIDO GERADO (GGMAX)`,
                                color: 0x00FF66,
                                fields: [
                                    { name: "🆔 Pedido", value: orderCode, inline: true },
                                    { name: "📦 Produto", value: productTitle, inline: true },
                                    { name: "💰 Valor", value: `R$ ${parseFloat(amount).toFixed(2)}`, inline: true },
                                    { name: "👤 Comprador", value: req.user.username, inline: true }
                                ],
                                timestamp: new Date().toISOString()
                            }]
                        })
                    });
                } catch (e) {}
            }

            res.json({ success: true, message: 'Pedido gerado!', orderId, orderCode, pixKey, pixPayload });
        }
    );
});

// Listar Apenas os Meus Pedidos (Comprador)
app.get('/api/orders/my-orders', authenticateToken, (req, res) => {
    db.all("SELECT * FROM orders WHERE buyer_id = ? ORDER BY id DESC", [req.user.id], (err, rows) => {
        res.json({ success: true, orders: rows || [] });
    });
});

// Listar Apenas as Vendas do Vendedor (ou Todas para Admin)
app.get('/api/orders/seller-sales', authenticateToken, (req, res) => {
    let query = "SELECT * FROM orders WHERE seller_id = ? ORDER BY id DESC";
    let params = [req.user.id];

    if (req.user.role === 'admin') {
        query = "SELECT * FROM orders ORDER BY id DESC";
        params = [];
    }

    db.all(query, params, (err, rows) => {
        res.json({ success: true, sales: rows || [] });
    });
});

// Chat do Pedido (Com Validação Estrita de Acesso)
app.get('/api/orders/:id/chat', authenticateToken, (req, res) => {
    const orderId = req.params.id;

    db.get("SELECT * FROM orders WHERE id = ?", [orderId], (err, order) => {
        if (err || !order) return res.status(404).json({ success: false, message: 'Pedido não encontrado.' });

        const isBuyer = order.buyer_id === req.user.id;
        const isSeller = order.seller_id === req.user.id;
        const isAdmin = req.user.role === 'admin';

        if (!isBuyer && !isSeller && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Acesso negado: Este pedido pertence a outro usuário.' });
        }

        db.all("SELECT * FROM order_messages WHERE order_id = ? ORDER BY id ASC", [orderId], (err, messages) => {
            res.json({ success: true, order, messages: messages || [] });
        });
    });
});

// Enviar Mensagem no Chat do Pedido
app.post('/api/orders/:id/send-message', authenticateToken, (req, res) => {
    const orderId = req.params.id;
    const { message } = req.body;

    if (!message || !message.trim()) return res.status(400).json({ success: false, message: 'Digite uma mensagem.' });

    db.get("SELECT * FROM orders WHERE id = ?", [orderId], (err, order) => {
        if (err || !order) return res.status(404).json({ success: false, message: 'Pedido não encontrado.' });

        const isBuyer = order.buyer_id === req.user.id;
        const isSeller = order.seller_id === req.user.id;
        const isAdmin = req.user.role === 'admin';

        if (!isBuyer && !isSeller && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Acesso negado.' });
        }

        db.run("INSERT INTO order_messages (order_id, sender_id, sender_name, message) VALUES (?, ?, ?, ?)",
            [orderId, req.user.id, req.user.username, message], (err) => {
                if (err) return res.status(500).json({ success: false, message: 'Erro ao enviar mensagem.' });
                res.json({ success: true, message: 'Mensagem enviada!' });
            }
        );
    });
});

// Concluir Pedido
app.post('/api/orders/:id/complete', authenticateToken, (req, res) => {
    const orderId = req.params.id;

    db.get("SELECT * FROM orders WHERE id = ?", [orderId], (err, order) => {
        if (err || !order) return res.status(404).json({ success: false, message: 'Pedido não encontrado.' });

        const isSeller = order.seller_id === req.user.id;
        const isAdmin = req.user.role === 'admin';

        if (!isSeller && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Apenas o vendedor ou dono pode concluir o pedido.' });
        }

        db.run("UPDATE orders SET status = 'completed' WHERE id = ?", [orderId], (err) => {
            if (err) return res.status(500).json({ success: false, message: 'Erro ao concluir pedido.' });
            
            db.run("INSERT INTO order_messages (order_id, sender_id, sender_name, message) VALUES (?, 0, 'Sistema', '✅ ESTE PEDIDO FOI MARCADOC OMO CONCLUÍDO E ENTREGUE!')");
            res.json({ success: true, message: 'Pedido marcado como Concluído!' });
        });
    });
});

// ==========================================
// SOLICITAÇÃO VENDEDOR & ADMIN
// ==========================================

app.post('/api/seller/apply', authenticateToken, async (req, res) => {
    const { discordTag, discordId, products, description } = req.body;
    const appCode = `SOL-${Math.floor(100000 + Math.random() * 900000)}`;

    db.run("INSERT INTO seller_applications (app_code, user_id, username, discord_tag, discord_id, products, description) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [appCode, req.user.id, req.user.username, discordTag, discordId, products, description], async function(err) {
            if (err) return res.status(500).json({ success: false, message: 'Erro ao salvar solicitação.' });

            const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
            if (webhookUrl && webhookUrl.startsWith('http')) {
                try {
                    fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            embeds: [{
                                title: `🚨 SOLICITAÇÃO DE VENDEDOR: ${appCode}`,
                                color: 0xFF6600,
                                fields: [
                                    { name: "👤 Usuário", value: req.user.username, inline: true },
                                    { name: "🎮 Discord", value: `${discordTag} (${discordId})`, inline: true },
                                    { name: "📦 Produtos", value: products, inline: false },
                                    { name: "📝 Descrição", value: description, inline: false },
                                    { name: "⚙️ Ação", value: "Acesse o Painel do Dono no site para aprovar.", inline: false }
                                ],
                                timestamp: new Date().toISOString()
                            }]
                        })
                    });
                } catch (e) {}
            }

            res.json({ success: true, message: 'Solicitação enviada! Aguarde aprovação no painel.' });
        }
    );
});

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

app.post('/api/admin/approve-seller', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Acesso negado.' });
    const { appId, userId } = req.body;

    db.run("UPDATE users SET role = 'seller' WHERE id = ?", [userId], () => {
        db.run("UPDATE seller_applications SET status = 'approved' WHERE id = ?", [appId], () => {
            res.json({ success: true, message: 'Vendedor aprovado com sucesso!' });
        });
    });
});

app.post('/api/admin/reject-seller', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Acesso negado.' });
    const { appId } = req.body;

    db.run("UPDATE seller_applications SET status = 'rejected' WHERE id = ?", [appId], () => {
        res.json({ success: true, message: 'Solicitação recusada.' });
    });
});

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

// SERVIR SPA FRONTEND
app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) res.sendFile(indexPath);
    else res.status(404).send('<h1>Erro: public/index.html não encontrado!</h1>');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🔥 Fury Market rodando na porta ${PORT}`);
});
