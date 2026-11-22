const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// Servir arquivos estáticos (CSS, JS, Imagens se houver)
app.use(express.static(path.join(__dirname, 'public')));

// Rota para a Página Inicial
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Rota para o Marketplace
app.get('/marketplace', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'marketplace.html'));
});

// Rota para a Página do Produto
app.get('/product', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'product.html'));
});

app.listen(PORT, () => {
    console.log(`🔥 Fury Market rodando com sucesso!`);
    console.log(`🔗 Acesse no navegador: http://localhost:${PORT}`);
});
