const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;

// Servir imagens/logos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// Rota para a Página Inicial
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Rota para o Marketplace
app.get('/marketplace', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'marketplace.html'));
});

// Rota para o Produto
app.get('/product', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'product.html'));
});

// Qualquer outra rota vai para a home
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🔥 Fury Market rodando na porta ${PORT}`);
});
