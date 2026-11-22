const express = require('express');
const path = require('path');
const app = express();

// O Railway exige que a porta seja lida de process.env.PORT
const PORT = process.env.PORT || 3000;

// Servir arquivos estáticos (CSS, imagens, etc.) da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Rota Principal (Home)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Rota do Marketplace
app.get('/marketplace', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'marketplace.html'));
});

// Rota do Produto
app.get('/product', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'product.html'));
});

// O '0.0.0.0' é necessário para o Railway liberar o acesso externo ao servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🔥 Fury Market rodando com sucesso na porta ${PORT}`);
});
