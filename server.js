const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

const PORT = process.env.PORT || 3000;

// Servir arquivos estáticos das pastas public e views
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'views')));

// Rota Inicial (Busca index.html em views ou public)
app.get('/', (req, res) => {
    const viewsIndex = path.join(__dirname, 'views', 'index.html');
    const publicIndex = path.join(__dirname, 'public', 'index.html');

    if (fs.existsSync(viewsIndex)) {
        return res.sendFile(viewsIndex);
    } else if (fs.existsSync(publicIndex)) {
        return res.sendFile(publicIndex);
    } else {
        return res.status(404).send(`
            <div style="font-family: sans-serif; background: #0a0a0c; color: #fff; padding: 40px; text-align: center;">
                <h1 style="color: #00ff66;">🔥 Fury Market - Servidor Conectado!</h1>
                <p>O servidor Node.js está rodando, mas o arquivo <strong>index.html</strong> não foi localizado no repositório.</p>
                <p>Caminho atual do servidor: <code>${__dirname}</code></p>
            </div>
        `);
    }
});

// Rotas secundárias
app.get('/marketplace', (req, res) => {
    const file = path.join(__dirname, 'views', 'marketplace.html');
    fs.existsSync(file) ? res.sendFile(file) : res.redirect('/');
});

app.get('/product', (req, res) => {
    const file = path.join(__dirname, 'views', 'product.html');
    fs.existsSync(file) ? res.sendFile(file) : res.redirect('/');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🔥 Servidor ativo na porta ${PORT}`);
});
