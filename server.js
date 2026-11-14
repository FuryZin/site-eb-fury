const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8080;

// Configurar pasta pública
app.use(express.static(path.join(__dirname, 'public')));

// Rota de segurança caso o arquivo index.html esteja na raiz ou na pasta public
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
