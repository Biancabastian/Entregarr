const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./banco/ecommerce.db', (erro) => {
    if (erro) console.log(erro.message);
    else console.log('Banco conectado.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS categorias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL UNIQUE,
        descricao TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS produtos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        categoria TEXT,
        valor REAL NOT NULL DEFAULT 0,
        estoque INTEGER NOT NULL DEFAULT 0,
        descricao TEXT,
        imagem TEXT
    )`);
    
    const categorias = [
        ['Blusas', 'Blusas femininas e masculinas'],
        ['Camisetas', 'Camisetas básicas e estampadas'],
        ['Camisas', 'Camisas casuais e sociais'],
        ['Jaquetas', 'Jaquetas e casacos'],
        ['Calças', 'Calças jeans, sociais e casuais'],
        ['Calções e Shorts', 'Calções e shorts para diferentes ocasiões'],
        ['Vestidos', 'Vestidos para diferentes ocasiões'],
        ['Saias', 'Saias curtas, midi e longas'],
        ['Moletons', 'Moletons e blusas de frio'],
        ['Acessórios', 'Acessórios para complementar o look']
    ];
    const inserir = db.prepare('INSERT OR IGNORE INTO categorias (nome, descricao) VALUES (?, ?)');
    categorias.forEach(c => inserir.run(c));
    inserir.finalize();
});
module.exports = db;
