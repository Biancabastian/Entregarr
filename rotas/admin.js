const express = require('express');
const appAdmin = express.Router();
const db = require('../banco/database');
const upload = require('../util/imagens');

appAdmin.get('/index', (req, res) => {
    res.render('admin/index-admin');
});

appAdmin.get('/', (req, res) => {
    res.render('admin/login');
});

appAdmin.post('/login', (req, res) => {
    res.redirect('/admin/index');
});

appAdmin.get('/categorias', (req, res) => {
    db.all(
        'SELECT * FROM categorias ORDER BY nome COLLATE NOCASE',
        [],
        (erro, categorias) => {
            if (erro) {
                return res.status(500).send('Erro ao consultar categorias.');
            }

            res.render('admin/categorias/lista', { categorias });
        }
    );
});

appAdmin.get('/categorias/form-cadastrar', (req, res) => {
    res.render('admin/categorias/cadastro');
});

appAdmin.post('/categorias/cadastrar', (req, res) => {
    const nome = (req.body.nome || '').trim();
    const descricao = (req.body.descricao || '').trim();

    if (!nome) {
        return res.status(400).send('Informe o nome da categoria.');
    }

    db.run(
        'INSERT INTO categorias (nome, descricao) VALUES (?, ?)',
        [nome, descricao],
        function (erro) {
            if (erro) {
                if (erro.message.includes('UNIQUE')) {
                    return res.status(400).send(
                        'Essa categoria já existe. Informe outro nome.'
                    );
                }

                return res.status(500).send('Erro ao cadastrar categoria.');
            }

            res.redirect('/admin/categorias');
        }
    );
});

appAdmin.get('/categorias/editar/:id', (req, res) => {
    db.get(
        'SELECT * FROM categorias WHERE id = ?',
        [req.params.id],
        (erro, categoria) => {
            if (erro) {
                return res.status(500).send('Erro ao consultar categoria.');
            }

            if (!categoria) {
                return res.status(404).send('Categoria não encontrada.');
            }

            res.render('admin/categorias/editar', { categoria });
        }
    );
});

appAdmin.post('/categorias/editar/:id', (req, res) => {
    const id = req.params.id;
    const nome = (req.body.nome || '').trim();
    const descricao = (req.body.descricao || '').trim();

    if (!nome) {
        return res.status(400).send('Informe o nome da categoria.');
    }

    db.get(
        'SELECT * FROM categorias WHERE id = ?',
        [id],
        (erro, categoriaAtual) => {
            if (erro) {
                return res.status(500).send('Erro ao consultar categoria.');
            }

            if (!categoriaAtual) {
                return res.status(404).send('Categoria não encontrada.');
            }

            db.serialize(() => {
                db.run('BEGIN TRANSACTION', erroInicio => {
                    if (erroInicio) {
                        return res.status(500).send(
                            'Erro ao iniciar atualização.'
                        );
                    }

                    // Atualiza a categoria nos produtos que usam o nome antigo.
                    db.run(
                        'UPDATE produtos SET categoria = ? WHERE categoria = ?',
                        [nome, categoriaAtual.nome],
                        erroProdutos => {
                            if (erroProdutos) {
                                return db.run('ROLLBACK', () => {
                                    res.status(500).send(
                                        'Erro ao atualizar produtos da categoria.'
                                    );
                                });
                            }

                            db.run(
                                `UPDATE categorias
                                 SET nome = ?, descricao = ?
                                 WHERE id = ?`,
                                [nome, descricao, id],
                                erroCategoria => {
                                    if (erroCategoria) {
                                        return db.run('ROLLBACK', () => {
                                            if (erroCategoria.message.includes('UNIQUE')) {
                                                return res.status(400).send(
                                                    'Já existe uma categoria com esse nome.'
                                                );
                                            }

                                            res.status(500).send(
                                                'Erro ao atualizar categoria.'
                                            );
                                        });
                                    }

                                    db.run('COMMIT', erroCommit => {
                                        if (erroCommit) {
                                            return db.run('ROLLBACK', () => {
                                                res.status(500).send(
                                                    'Erro ao salvar alterações.'
                                                );
                                            });
                                        }

                                        res.redirect('/admin/categorias');
                                    });
                                }
                            );
                        }
                    );
                });
            });
        }
    );
});

appAdmin.post('/categorias/excluir/:id', (req, res) => {
    db.get(
        'SELECT nome FROM categorias WHERE id = ?',
        [req.params.id],
        (erro, categoria) => {
            if (erro) {
                return res.status(500).send('Erro ao consultar categoria.');
            }

            if (!categoria) {
                return res.redirect('/admin/categorias');
            }

            db.get(
                'SELECT COUNT(*) AS total FROM produtos WHERE categoria = ?',
                [categoria.nome],
                (erroContagem, resultado) => {
                    if (erroContagem) {
                        return res.status(500).send(
                            'Erro ao verificar produtos.'
                        );
                    }

                    if (resultado.total > 0) {
                        return res.status(400).send(
                            'Não é possível excluir: existem produtos nessa categoria.'
                        );
                    }

                    db.run(
                        'DELETE FROM categorias WHERE id = ?',
                        [req.params.id],
                        erroDelete => {
                            if (erroDelete) {
                                return res.status(500).send(
                                    'Erro ao excluir categoria.'
                                );
                            }

                            res.redirect('/admin/categorias');
                        }
                    );
                }
            );
        }
    );
});

appAdmin.get('/produtos', (req, res) => {
    db.all(
        'SELECT * FROM produtos ORDER BY id DESC',
        [],
        (erro, produtos) => {
            if (erro) {
                return res.status(500).send('Erro ao consultar produtos.');
            }

            res.render('admin/produtos/lista', { produtos });
        }
    );
});

appAdmin.get('/produtos/form-cadastrar', (req, res) => {
    db.all(
        'SELECT * FROM categorias ORDER BY nome COLLATE NOCASE',
        [],
        (erro, categorias) => {
            if (erro) {
                return res.status(500).send('Erro ao carregar categorias.');
            }

            res.render('admin/produtos/cadastro', { categorias });
        }
    );
});

appAdmin.post(
    '/produtos/cadastrar',
    upload.single('imagem'),
    (req, res) => {
        const { nome, categoria, descricao } = req.body;
        const valor = Number(req.body.valor);
        const estoque = Number.parseInt(req.body.estoque, 10);
        const imagem = req.file ? req.file.filename : null;

        if (
            !nome ||
            !categoria ||
            !Number.isFinite(valor) ||
            valor < 0 ||
            !Number.isInteger(estoque) ||
            estoque < 0
        ) {
            return res.status(400).send(
                'Confira o nome, a categoria, o valor e o estoque informados.'
            );
        }

        db.run(
            `INSERT INTO produtos
             (nome, categoria, valor, estoque, descricao, imagem)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                nome.trim(),
                categoria,
                valor,
                estoque,
                (descricao || '').trim(),
                imagem
            ],
            function (erro) {
                if (erro) {
                    return res.status(500).send('Erro ao cadastrar produto.');
                }

                res.redirect('/admin/produtos');
            }
        );
    }
);

appAdmin.get('/produtos/editar/:id', (req, res) => {
    db.get(
        'SELECT * FROM produtos WHERE id = ?',
        [req.params.id],
        (erro, produto) => {
            if (erro) {
                return res.status(500).send('Erro ao consultar produto.');
            }

            if (!produto) {
                return res.status(404).send('Produto não encontrado.');
            }

            db.all(
                'SELECT * FROM categorias ORDER BY nome COLLATE NOCASE',
                [],
                (erroCategorias, categorias) => {
                    if (erroCategorias) {
                        return res.status(500).send(
                            'Erro ao carregar categorias.'
                        );
                    }

                    res.render('admin/produtos/editar', {
                        produto,
                        categorias
                    });
                }
            );
        }
    );
});

appAdmin.post(
    '/produtos/editar/:id',
    upload.single('imagem'),
    (req, res) => {
        const id = req.params.id;
        const { nome, categoria, descricao } = req.body;
        const valor = Number(req.body.valor);
        const estoque = Number.parseInt(req.body.estoque, 10);

        if (
            !nome ||
            !categoria ||
            !Number.isFinite(valor) ||
            valor < 0 ||
            !Number.isInteger(estoque) ||
            estoque < 0
        ) {
            return res.status(400).send(
                'Confira o nome, a categoria, o valor e o estoque informados.'
            );
        }

        db.get(
            'SELECT * FROM produtos WHERE id = ?',
            [id],
            (erro, produtoAtual) => {
                if (erro) {
                    return res.status(500).send('Erro ao consultar produto.');
                }

                if (!produtoAtual) {
                    return res.status(404).send('Produto não encontrado.');
                }

                // Mantém a imagem anterior se nenhuma nova for enviada.
                const imagem = req.file
                    ? req.file.filename
                    : produtoAtual.imagem;

                db.run(
                    `UPDATE produtos
                     SET nome = ?, categoria = ?, valor = ?, estoque = ?,
                         descricao = ?, imagem = ?
                     WHERE id = ?`,
                    [
                        nome.trim(),
                        categoria,
                        valor,
                        estoque,
                        (descricao || '').trim(),
                        imagem,
                        id
                    ],
                    function (erroUpdate) {
                        if (erroUpdate) {
                            return res.status(500).send(
                                'Erro ao atualizar produto.'
                            );
                        }

                        res.redirect('/admin/produtos');
                    }
                );
            }
        );
    }
);

appAdmin.post('/produtos/excluir/:id', (req, res) => {
    db.run(
        'DELETE FROM produtos WHERE id = ?',
        [req.params.id],
        erro => {
            if (erro) {
                return res.status(500).send('Erro ao excluir produto.');
            }

            res.redirect('/admin/produtos');
        }
    );
});


module.exports = appAdmin;
