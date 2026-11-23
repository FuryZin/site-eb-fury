require('dotenv').config();
const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fury_secret_key';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// BANCO DE DADOS PERSISTENTE (SQLite)
// ==========================================
const db = new sqlite3.Database('./fury_database.db', (err) => {
    if (err) console.error('Erro ao conectar ao SQLite:', err);
    else console.log('📁 Banco de dados SQLite conectado com sucesso!');
});

db.serialize(() => {
    // Tabela de Usuários
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        email TEXT UNIQUE,
        password TEXT,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabela de Produtos
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seller_id INTEGER,
        seller_name TEXT,
        title TEXT,
        category TEXT,
        price REAL,
        description TEXT,
        image_type TEXT DEFAULT 'gem',
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabela de Pedidos
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_code TEXT UNIQUE,
        buyer_name TEXT,
        product_title TEXT,
        amount REAL,
        status TEXT DEFAULT 'awaiting_payment',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabela de Solicitações de Vendedor
    db.run(`CREATE TABLE IF NOT EXISTS seller_applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_code TEXT UNIQUE,
        username TEXT,
        discord_tag TEXT,
        discord_id TEXT,
        products TEXT,
        description TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabela de Tickets de Suporte
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

    // Inserir Administrador Padrão se não existir (Admin / admin123)
    db.get("SELECT * FROM users WHERE email = 'admin@furymarket.com'", async (err, row) => {
        if (!row) {
            const hash = await bcrypt.hash('admin123', 10);
            db.run("INSERT INTO users (username, email, password, role) VALUES ('Admin', 'admin@furymarket.com', ?, 'admin')", [hash]);
            console.log('👤 Usuário Admin padrão criado: admin@furymarket.com / admin123');
        }
    });

    // Inserir Produtos Iniciais de Exemplo se a tabela estiver vazia
    db.get("SELECT count(*) as count FROM products", (err, row) => {
        if (row && row.count === 0) {
            db.run("INSERT INTO products (seller_id, seller_name, title, category, price, description, image_type) VALUES (1, 'FuryStore', 'Recarga 1060 Diamantes (Via ID)', 'Diamantes', 45.00, 'Entrega imediata na conta via ID oficial.', 'gem')");
            db.run("INSERT INTO products (seller_id, seller_name, title, category, price, description, image_type) VALUES (1, 'FuryStore', 'Gift Card R$ 50 Google Play', 'Gift Cards', 48.50, 'Código resgatável direto na Play Store.', 'gift')");
            db.run("INSERT INTO products (seller_id, seller_name, title, category, price, description, image_type) VALUES (1, 'FuryStore', 'Coaching Avançado de Posicionamento', 'Coaching', 30.00, '1 Hora de treino ao vivo com jogador Mestre.', 'trophy')");
        }
    });
});

// ==========================================
// MIDDLEWARES DE AUTENTICAÇÃO
// ==========================================
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
// ENDPOINTS DA API BACKEND
// ==========================================

// Autenticação: Registro
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

// Autenticação: Login
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

// Produtos: Listar
app.get('/api/products', (req, res) => {
    db.all("SELECT * FROM products WHERE status = 'active' ORDER BY id DESC", [], (err, rows) => {
        res.json({ success: true, products: rows || [] });
    });
});

// Produtos: Criar (Vendedores/Admin)
app.post('/api/products/create', authenticateToken, (req, res) => {
    const { title, category, price, description, image_type } = req.body;
    if (!title || !price || !category) return res.status(400).json({ success: false, message: 'Preencha os campos obrigatórios.' });

    db.run("INSERT INTO products (seller_id, seller_name, title, category, price, description, image_type) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [req.user.id, req.user.username, title, category, parseFloat(price), description, image_type || 'gem'], function(err) {
            if (err) return res.status(500).json({ success: false, message: 'Erro ao cadastrar produto.' });
            res.json({ success: true, message: 'Produto publicado com sucesso!' });
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

// Solicitação para ser Vendedor + Webhook Discord
app.post('/api/seller/apply', authenticateToken, async (req, res) => {
    const { discordTag, discordId, products, description } = req.body;
    const appCode = `SOL-${Math.floor(100000 + Math.random() * 900000)}`;

    db.run("INSERT INTO seller_applications (app_code, username, discord_tag, discord_id, products, description) VALUES (?, ?, ?, ?, ?, ?)",
        [appCode, req.user.username, discordTag, discordId, products, description], async function(err) {
            if (err) return res.status(500).json({ success: false, message: 'Erro ao enviar solicitação.' });

            // Envio para Discord se configurado
            const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
            const roleId = process.env.DISCORD_ROLE_ID;
            if (webhookUrl && webhookUrl.startsWith('http')) {
                try {
                    const roleMention = roleId ? `<@&${roleId}>` : '';
                    await fetch(webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            content: `🚨 ${roleMention} **NOVA SOLICITAÇÃO DE VENDEDOR RECEBIDA!**`,
                            embeds: [{
                                title: `📄 Solicitação nº ${appCode}`,
                                color: 0x00FF66,
                                fields: [
                                    { name: "👤 Usuário Plataforma", value: req.user.username, inline: true },
                                    { name: "🎮 Discord", value: `${discordTag} (ID: ${discordId})`, inline: true },
                                    { name: "📦 Produtos Pretendidos", value: products, inline: false },
                                    { name: "📝 Descrição da Loja", value: description, inline: false }
                                ],
                                footer: { text: "Fury Market Administration" },
                                timestamp: new Date().toISOString()
                            }]
                        })
                    });
                } catch (e) { console.error('Erro no webhook:', e); }
            }

            res.json({ success: true, message: 'Solicitação enviada! Acompanhe a aprovação.' });
        });
});

// Suporte: Abrir Ticket
app.post('/api/tickets/create', authenticateToken, (req, res) => {
    const { subject, category, message } = req.body;
    const ticketCode = `TCK-${Math.floor(100000 + Math.random() * 900000)}`;

    db.run("INSERT INTO tickets (ticket_code, username, subject, category, message) VALUES (?, ?, ?, ?, ?)",
        [ticketCode, req.user.username, subject, category, message], (err) => {
            if (err) return res.status(500).json({ success: false, message: 'Erro ao abrir ticket.' });
            res.json({ success: true, message: `Ticket ${ticketCode} aberto com sucesso!` });
        });
});

// Painel Admin: Listar Dados do Sistema
app.get('/api/admin/dashboard', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Acesso negado.' });

    db.all("SELECT * FROM users", [], (err, users) => {
        db.all("SELECT * FROM seller_applications", [], (err, apps) => {
            db.all("SELECT * FROM orders", [], (err, orders) => {
                db.all("SELECT * FROM tickets", [], (err, tickets) => {
                    res.json({ success: true, users, apps, orders, tickets });
                });
            });
        });
    });
});

// ==========================================
// FRONTEND COMPLETO (SPA DINÂMICA INTEGRADA)
// ==========================================
app.get('*', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fury Market — Marketplace Oficial Free Fire</title>
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

    <!-- CABEÇALHO / NAVBAR -->
    <header class="bg-furyCard border-b border-furyBorder sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between gap-4">
            <div class="flex items-center gap-2 cursor-pointer" onclick="navigate('home')">
                <i class="fa-solid fa-gamepad text-furyAccent text-3xl"></i>
                <span class="text-xl font-black tracking-wider text-white">FURY<span class="text-furyAccent">MARKET</span></span>
            </div>

            <div class="flex items-center gap-4 text-sm font-semibold">
                <button onclick="navigate('home')" class="hover:text-furyAccent">Início</button>
                <button onclick="navigate('marketplace')" class="hover:text-furyAccent">Explorar</button>
                <button onclick="navigate('seller')" class="hover:text-furyAccent text-furyOrange"><i class="fa-solid fa-store mr-1"></i>Seja Vendedor</button>
                <button onclick="navigate('tickets')" class="hover:text-furyAccent">Suporte</button>
                <button id="adminNavBtn" onclick="navigate('admin')" class="hidden text-red-400 hover:text-red-300 font-bold"><i class="fa-solid fa-user-shield mr-1"></i>Admin</button>
            </div>

            <div class="flex items-center gap-3" id="authNavArea">
                <!-- Renderizado via JS -->
            </div>
        </div>
    </header>

    <!-- ALERTA GLOBAL -->
    <div id="globalAlert" class="hidden max-w-7xl mx-auto my-4 px-4">
        <div id="globalAlertBody" class="p-4 rounded-xl text-center font-bold"></div>
    </div>

    <!-- ÁREA DE CONTEÚDO DINÂMICO -->
    <main id="appContent" class="max-w-7xl mx-auto px-4 py-8 flex-1 w-full">
        <!-- Renderizado dinamicamente -->
    </main>

    <!-- RODAPÉ -->
    <footer class="bg-furyCard border-t border-furyBorder py-6 text-center text-sm text-gray-400">
        <div class="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
            <div><strong>FURYMARKET &copy; 2026</strong> — Marketplace Gamer Oficial</div>
            <div class="flex gap-4">
                <a href="#" class="hover:underline">Termos de Uso</a>
                <a href="#" class="hover:underline">Privacidade</a>
            </div>
        </div>
    </footer>

    <!-- LÓGICA DO FRONTEND INTERATIVO -->
    <script>
        let currentUser = localStorage.getItem('fury_user');
        let currentRole = localStorage.getItem('fury_role');
        let authToken = localStorage.getItem('fury_token');

        function updateNav() {
            const authArea = document.getElementById('authNavArea');
            const adminBtn = document.getElementById('adminNavBtn');

            if (currentRole === 'admin') adminBtn.classList.remove('hidden');
            else adminBtn.classList.add('hidden');

            if (currentUser) {
                authArea.innerHTML = \`
                    <span class="text-sm text-gray-300 font-bold"><i class="fa-solid fa-user text-furyAccent mr-1"></i>\${currentUser}</span>
                    <button onclick="logout()" class="bg-furyBorder hover:bg-red-900/50 text-red-400 font-bold px-3 py-1.5 rounded-lg text-xs transition">Sair</button>
                \`;
            } else {
                authArea.innerHTML = \`
                    <button onclick="navigate('login')" class="bg-furyAccent hover:bg-furyAccentHover text-furyBg font-bold px-4 py-2 rounded-lg text-sm transition">Entrar / Cadastrar</button>
                \`;
            }
        }

        function logout() {
            localStorage.clear();
            currentUser = null; currentRole = null; authToken = null;
            updateNav();
            navigate('home');
            showAlert('Sessão encerrada.', true);
        }

        function showAlert(msg, success) {
            const box = document.getElementById('globalAlert');
            const body = document.getElementById('globalAlertBody');
            box.classList.remove('hidden');
            body.className = \`p-4 rounded-xl text-center font-bold \${success ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}\`;
            body.innerText = msg;
            setTimeout(() => box.classList.add('hidden'), 4000);
        }

        async function navigate(page, extraData = null) {
            const container = document.getElementById('appContent');
            updateNav();

            if (page === 'home' || page === 'marketplace') {
                container.innerHTML = \`<div class="text-center py-12"><i class="fa-solid fa-circle-notch fa-spin text-3xl text-furyAccent"></i></div>\`;
                const res = await fetch('/api/products');
                const data = await res.json();
                
                container.innerHTML = \`
                    <section class="bg-gradient-to-r from-zinc-900 to-furyCard border border-furyBorder rounded-2xl p-8 mb-8">
                        <span class="bg-furyAccent/10 text-furyAccent border border-furyAccent/20 text-xs font-bold px-3 py-1 rounded-full">MARKETPLACE GAMER</span>
                        <h1 class="text-3xl font-black mt-3 mb-2 text-white">Compre Diamantes e Serviços com <span class="text-furyAccent">Segurança</span></h1>
                        <p class="text-gray-400 text-sm mb-4">Entrega rápida, vendedores verificados e suporte 24h.</p>
                        <button onclick="navigate('seller')" class="bg-furyAccent text-furyBg font-bold px-6 py-2.5 rounded-xl text-sm">Quero Vender Também</button>
                    </section>

                    <h2 class="text-xl font-bold mb-4 flex items-center gap-2"><i class="fa-solid fa-fire text-furyOrange"></i> Produtos Disponíveis</h2>
                    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                        \${data.products.map(p => \`
                            <div class="bg-furyCard border border-furyBorder rounded-xl p-5 flex flex-col justify-between">
                                <div>
                                    <div class="h-32 bg-zinc-900 rounded-lg flex items-center justify-center mb-3">
                                        <i class="fa-solid fa-\${p.image_type === 'gem' ? 'gem text-furyAccent' : p.image_type === 'gift' ? 'gift text-furyOrange' : 'trophy text-yellow-400'} text-4xl"></i>
                                    </div>
                                    <span class="text-xs text-gray-500 uppercase font-bold">\${p.category}</span>
                                    <h3 class="font-bold text-white text-base mt-1">\${p.title}</h3>
                                    <p class="text-xs text-gray-400 mt-1 mb-3">\${p.description}</p>
                                </div>
                                <div>
                                    <div class="text-lg font-black text-white mb-3">R$ \${p.price.toFixed(2)} <span class="text-xs text-gray-500 font-normal">por \${p.seller_name}</span></div>
                                    <button onclick="buyProduct('\${p.title}', \${p.price})" class="w-full bg-furyAccent hover:bg-furyAccentHover text-furyBg font-bold py-2 rounded-lg text-sm transition">Comprar via Pix</button>
                                </div>
                            </div>
                        \`).join('')}
                    </div>
                \`;
            }

            else if (page === 'login') {
                container.innerHTML = \`
                    <div class="max-w-md mx-auto bg-furyCard border border-furyBorder p-8 rounded-2xl shadow-2xl">
                        <h2 class="text-2xl font-black text-center mb-6">Acesse sua Conta</h2>
                        <form id="authForm" class="space-y-4">
                            <div id="userField" class="hidden">
                                <label class="block text-xs text-gray-400 mb-1">Nome de Usuário</label>
                                <input type="text" id="inputUsername" class="w-full bg-furyBg border border-furyBorder rounded-lg p-3 text-sm text-white">
                            </div>
                            <div>
                                <label class="block text-xs text-gray-400 mb-1">E-mail</label>
                                <input type="email" id="inputEmail" required class="w-full bg-furyBg border border-furyBorder rounded-lg p-3 text-sm text-white">
                            </div>
                            <div>
                                <label class="block text-xs text-gray-400 mb-1">Senha</label>
                                <input type="password" id="inputPassword" required class="w-full bg-furyBg border border-furyBorder rounded-lg p-3 text-sm text-white">
                            </div>
                            <button type="submit" id="authSubmitBtn" class="w-full bg-furyAccent text-furyBg font-bold py-3 rounded-lg text-sm">Entrar</button>
                        </form>
                        <div class="text-center mt-4">
                            <button onclick="toggleAuthMode()" id="toggleAuthText" class="text-xs text-furyAccent hover:underline">Não tem conta? Cadastre-se</button>
                        </div>
                    </div>
                \`;

                let isRegistering = false;
                window.toggleAuthMode = () => {
                    isRegistering = !isRegistering;
                    document.getElementById('userField').classList.toggle('hidden', !isRegistering);
                    document.getElementById('authSubmitBtn').innerText = isRegistering ? 'Criar Conta' : 'Entrar';
                    document.getElementById('toggleAuthText').innerText = isRegistering ? 'Já tem conta? Faça Login' : 'Não tem conta? Cadastre-se';
                };

                document.getElementById('authForm').onsubmit = async (e) => {
                    e.preventDefault();
                    const endpoint = isRegistering ? '/api/auth/register' : '/api/auth/login';
                    const payload = {
                        username: document.getElementById('inputUsername').value,
                        email: document.getElementById('inputEmail').value,
                        password: document.getElementById('inputPassword').value
                    };

                    const res = await fetch(endpoint, {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(payload)
                    });
                    const data = await res.json();

                    if (data.success) {
                        localStorage.setItem('fury_token', data.token);
                        localStorage.setItem('fury_user', data.username);
                        localStorage.setItem('fury_role', data.role);
                        currentUser = data.username; currentRole = data.role; authToken = data.token;
                        showAlert(data.message, true);
                        navigate('home');
                    } else {
                        showAlert(data.message, false);
                    }
                };
            }

            else if (page === 'seller') {
                container.innerHTML = \`
                    <div class="max-w-xl mx-auto bg-furyCard border border-furyBorder p-8 rounded-2xl">
                        <h2 class="text-2xl font-bold mb-2">Seja um Vendedor Autorizado</h2>
                        <p class="text-xs text-gray-400 mb-6">Sua solicitação é analisada pela administração e notificada no Discord.</p>
                        <form id="sellerAppForm" class="space-y-4">
                            <div>
                                <label class="block text-xs text-gray-400 mb-1">Tag do Discord</label>
                                <input type="text" id="appDiscordTag" required placeholder="Ex: Player#1234" class="w-full bg-furyBg border border-furyBorder rounded-lg p-3 text-sm">
                            </div>
                            <div>
                                <label class="block text-xs text-gray-400 mb-1">ID do Discord</label>
                                <input type="text" id="appDiscordId" required placeholder="Ex: 839201928374928" class="w-full bg-furyBg border border-furyBorder rounded-lg p-3 text-sm">
                            </div>
                            <div>
                                <label class="block text-xs text-gray-400 mb-1">Produtos que deseja vender</label>
                                <input type="text" id="appProducts" required placeholder="Ex: Recargas de ID, Gift Cards" class="w-full bg-furyBg border border-furyBorder rounded-lg p-3 text-sm">
                            </div>
                            <div>
                                <label class="block text-xs text-gray-400 mb-1">Descrição da sua Loja</label>
                                <textarea id="appDescription" required class="w-full bg-furyBg border border-furyBorder rounded-lg p-3 text-sm" rows="3"></textarea>
                            </div>
                            <button type="submit" class="w-full bg-furyAccent text-furyBg font-bold py-3 rounded-lg text-sm">Enviar para Análise</button>
                        </form>
                    </div>
                \`;

                document.getElementById('sellerAppForm').onsubmit = async (e) => {
                    e.preventDefault();
                    if (!authToken) return showAlert('Faça login primeiro!', false);

                    const res = await fetch('/api/seller/apply', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
                        body: JSON.stringify({
                            discordTag: document.getElementById('appDiscordTag').value,
                            discordId: document.getElementById('appDiscordId').value,
                            products: document.getElementById('appProducts').value,
                            description: document.getElementById('appDescription').value
                        })
                    });
                    const data = await res.json();
                    showAlert(data.message, data.success);
                };
            }

            else if (page === 'tickets') {
                container.innerHTML = \`
                    <div class="max-w-xl mx-auto bg-furyCard border border-furyBorder p-8 rounded-2xl">
                        <h2 class="text-2xl font-bold mb-2">Central de Suporte (Tickets)</h2>
                        <p class="text-xs text-gray-400 mb-6">Abra um chamado interno para solucionar dúvidas ou reembolsos.</p>
                        <form id="ticketForm" class="space-y-4">
                            <div>
                                <label class="block text-xs text-gray-400 mb-1">Assunto</label>
                                <input type="text" id="tckSubject" required class="w-full bg-furyBg border border-furyBorder rounded-lg p-3 text-sm">
                            </div>
                            <div>
                                <label class="block text-xs text-gray-400 mb-1">Categoria</label>
                                <select id="tckCategory" class="w-full bg-furyBg border border-furyBorder rounded-lg p-3 text-sm text-white">
                                    <option>Dúvidas em Compras</option>
                                    <option>Problemas com Vendedor</option>
                                    <option>Solicitação de Reembolso</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-xs text-gray-400 mb-1">Mensagem detalhada</label>
                                <textarea id="tckMessage" required rows="4" class="w-full bg-furyBg border border-furyBorder rounded-lg p-3 text-sm"></textarea>
                            </div>
                            <button type="submit" class="w-full bg-furyAccent text-furyBg font-bold py-3 rounded-lg text-sm">Abrir Ticket</button>
                        </form>
                    </div>
                \`;

                document.getElementById('ticketForm').onsubmit = async (e) => {
                    e.preventDefault();
                    if (!authToken) return showAlert('Faça login primeiro!', false);

                    const res = await fetch('/api/tickets/create', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + authToken },
                        body: JSON.stringify({
                            subject: document.getElementById('tckSubject').value,
                            category: document.getElementById('tckCategory').value,
                            message: document.getElementById('tckMessage').value
                        })
                    });
                    const data = await res.json();
                    showAlert(data.message, data.success);
                };
            }

            else if (page === 'admin') {
                if (currentRole !== 'admin') return showAlert('Acesso restrito ao Administrador.', false);
                container.innerHTML = \`<div class="text-center py-12"><i class="fa-solid fa-circle-notch fa-spin text-3xl text-furyAccent"></i></div>\`;

                const res = await fetch('/api/admin/dashboard', { headers: { 'Authorization': 'Bearer ' + authToken } });
                const data = await res.json();

                if (!data.success) return showAlert(data.message, false);

                container.innerHTML = \`
                    <h2 class="text-2xl font-black mb-6 flex items-center gap-2 text-red-400"><i class="fa-solid fa-user-shield"></i> Painel de Administração</h2>
                    
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                        <div class="bg-furyCard border border-furyBorder p-4 rounded-xl">
                            <span class="text-xs text-gray-400">Total Usuários</span>
                            <div class="text-2xl font-black text-white">\${data.users.length}</div>
                        </div>
                        <div class="bg-furyCard border border-furyBorder p-4 rounded-xl">
                            <span class="text-xs text-gray-400">Solicitações Vendedor</span>
                            <div class="text-2xl font-black text-furyOrange">\${data.apps.length}</div>
                        </div>
                        <div class="bg-furyCard border border-furyBorder p-4 rounded-xl">
                            <span class="text-xs text-gray-400">Pedidos Registrados</span>
                            <div class="text-2xl font-black text-furyAccent">\${data.orders.length}</div>
                        </div>
                        <div class="bg-furyCard border border-furyBorder p-4 rounded-xl">
                            <span class="text-xs text-gray-400">Tickets Abertos</span>
                            <div class="text-2xl font-black text-yellow-400">\${data.tickets.length}</div>
                        </div>
                    </div>

                    <div class="bg-furyCard border border-furyBorder rounded-xl p-6 mb-8">
                        <h3 class="font-bold mb-4">Solicitações de Vendedor Pendentes</h3>
                        <div class="space-y-3">
                            \${data.apps.length === 0 ? '<p class="text
