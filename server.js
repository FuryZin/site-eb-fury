const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

const PORT = process.env.PORT || 3000;

// Servir arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// Rota Principal (Home)
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'views', 'index.html');
    
    // Verifica se o arquivo existe antes de enviar
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send('<h1>Erro 404: Arquivo views/index.html não foi encontrado no servidor!</h1><p>Verifique se a pasta "views" e o arquivo "index.html" foram enviados para o GitHub.</p>');
    }
});

// Rota do Marketplace
app.get('/marketplace', (req, res) => {
    const mktPath = path.join(__dirname, 'views', 'marketplace.html');
    if (fs.existsSync(mktPath)) {
        res.sendFile(mktPath);
    } else {
        res.redirect('/');
    }
});

// Rota do Produto
app.get('/product', (req, res) => {
    const prodPath = path.join(__dirname, 'views', 'product.html');
    if (fs.existsSync(prodPath)) {
        res.sendFile(prodPath);
    } else {
        res.redirect('/');
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🔥 Fury Market rodando na porta ${PORT}`);
});
