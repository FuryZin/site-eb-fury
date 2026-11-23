require('dotenv').config();
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fury_secret_key';

// Middleware para processar requisições JSON e formulários
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));

// "Banco de Dados" simulado na memória do servidor
const users = []; 
const sellerApplications = [];

// ==========================================
// 1. ROTAS DE AUTENTICAÇÃO (CADASTRO E LOGIN)
// ==========================================

// Endpoint de Cadastro
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: 'Preencha todos os campos!' });
        }

        const userExists = users.find(u => u.email === email || u.username === username);
        if (userExists) {
            return res.status(400).json({ success: false, message: 'Usuário ou E-mail já cadastrado!' });
        }

        // Criptografar a senha por segurança
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newUser = {
            id: Date.now().toString(),
            username,
            email,
            password: hashedPassword,
            role: 'user',
            createdAt: new Date()
        };

        users.push(newUser);

        // Gerar Token de Login
        const token = jwt.sign({ id: newUser.id, username: newUser.username, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });

        return res.json({ success: true, message: 'Conta criada com sucesso!', token, username: newUser.username });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Erro no servidor.' });
    }
});

// Endpoint de Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = users.find(u => u.email === email);
        if (!user) {
            return res.status(400).json({ success: false, message: 'E-mail ou senha incorretos.' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ success: false, message: 'E-mail ou senha incorretos.' });
        }

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

        return res.json({ success: true, message: 'Login realizado com sucesso!', token, username: user.username });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Erro ao fazer login.' });
    }
});

// ==========================================
// 2. INTEGRAÇÃO COM DISCORD (SEJA UM VENDEDOR)
// ==========================================

app.post('/api/seller/apply', async (req, res) => {
    try {
        const { discordTag, discordId, experience, products, description } = req.body;
        const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
        const roleId = process.env.DISCORD_ROLE_ID;

        if (!discordTag || !discordId || !products || !description) {
            return res.status(400).json({ success: false, message: 'Preencha todos os campos obrigatórios!' });
        }

        const applicationId = `SOL-${Math.floor(100000 + Math.random() * 900000)}`;

        // Enviar Embed Formatado para o Discord da Equipe
        if (webhookUrl && webhookUrl.startsWith('http')) {
            const roleMention = roleId ? `<@&${roleId}>` : '';
            
            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: `📢 ${roleMention} **NOVA SOLICITAÇÃO DE VENDEDOR RECEBIDA!**`,
                    embeds: [{
                        title: `📄 Solicitação: ${applicationId}`,
                        color: 0x00FF66, // Verde Neon
                        fields: [
                            { name: "👤 Nick do Discord", value: discordTag, inline: true },
                            { name: "🆔 ID do Discord", value: discordId, inline: true },
                            { name: "🛒 O que pretende vender?", value: products, inline: false },
                            { name: "⭐ Experiência prévia", value: experience || 'Não informou', inline: true },
                            { name: "📝 Descrição da Loja", value: description, inline: false },
                            { name: "🛡️ Declaração", value: "Confirmou que NÃO venderá hacks, cheats ou contas roubadas." }
                        ],
                        footer: { text: "Fury Market System • Aprovação Pendente" },
                        timestamp: new Date().toISOString()
                    }]
                })
            });
        }

        return res.json({ 
            success: true, 
            message: 'Sua solicitação foi enviada à equipe! Acompanhe o status pelo Discord.' 
        });

    } catch (error) {
        console.error('Erro na solicitação Discord:', error);
        return res.status(500).json({ success: false, message: 'Erro ao enviar para o Discord.' });
    }
});

// ==========================================
// 3. CHECKOUT DE PAGAMENTO (PIX)
// ==========================================

app.post('/api/checkout/pix', (req, res) => {
    const { productId, amount } = req.body;
    const pixKey = process.env.PIX_KEY || 'pix@furymarket.com';

    const orderId = `FUR-${Math.floor(100000 + Math.random() * 900000)}`;

    return res.json({
        success: true,
        orderId,
        amount,
        pixKey,
        pixPayload: `00020126580014BR.GOV.BCB.PIX0136${pixKey}5204000053039865405${amount}5802BR5919Fury Market Store6009SAO PAULO62070503***6304E2CA`,
        instructions: "Copie a chave Pix acima, faça o pagamento no aplicativo do seu banco e envie o comprovante no suporte."
    });
});

// ==========================================
// 4. ROTAS DAS PÁGINAS (HTML)
// ==========================================

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'views', 'login.html')));
app.get('/seller', (req, res) => res.sendFile(path.join(__dirname, 'views', 'seller.html')));
app.get('/checkout', (req, res) => res.sendFile(path.join(__dirname, 'views', 'checkout.html')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🔥 Fury Market rodando na porta ${PORT}`);
});
