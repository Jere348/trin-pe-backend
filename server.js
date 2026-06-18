const express = require('express');
const cors = require('cors');
const { Pool } = require('pg'); 
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json());

// 1. CONEXIÓN A LA BASE DE DATOS EN LA NUBE (SUPABASE)
const connectionString = 'postgresql://postgres.qzesfdluxomapvspzpie:RodrigoBackend2026@aws-1-us-east-2.pooler.supabase.com:6543/postgres';

const pool = new Pool({
    connectionString: connectionString,
});

pool.connect((err) => {
    if (err) console.error('Error al conectar a Supabase:', err);
    else console.log('Conectado con éxito a la base de datos de Supabase (PostgreSQL).');
});

// 2. CREAR LA TABLA DE USUARIOS
const crearTablaQuery = `
    CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nombre TEXT,
        dni TEXT UNIQUE,
        celular TEXT,
        correo TEXT UNIQUE,
        contrasena TEXT,
        rol TEXT DEFAULT 'Ciudadano'
    );
`;

pool.query(crearTablaQuery)
    .then(() => console.log('Tabla de usuarios verificada/creada.'))
    .catch((err) => console.error('Error al crear la tabla:', err));

    // 2.5 CREAR LA TABLA DE TRÁMITES
const crearTablaTramitesQuery = `
    CREATE TABLE IF NOT EXISTS tramites (
        id SERIAL PRIMARY KEY,
        titulo TEXT NOT NULL,
        codigo_interno TEXT,
        descripcion TEXT,
        entidad TEXT,
        modalidad TEXT,
        costo NUMERIC(10, 2),
        requisitos JSONB,
        pasos JSONB,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
`;

pool.query(crearTablaTramitesQuery)
    .then(() => console.log('Tabla de trámites verificada/creada.'))
    .catch((err) => console.error('Error al crear la tabla de trámites:', err));


// 2.6 CREAR LA TABLA DE MÉTRICAS DE BÚSQUEDA
const crearTablaMetricasQuery = `
    CREATE TABLE IF NOT EXISTS metricas_busquedas (
        id SERIAL PRIMARY KEY,
        termino TEXT NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
`;
pool.query(crearTablaMetricasQuery)
    .then(() => console.log('Tabla de métricas verificada/creada.'))
    .catch((err) => console.error('Error al crear tabla métricas:', err));


// ==========================================
// 2.7 CREAR LA TABLA DE ENTIDADES
// ==========================================
const crearTablaEntidadesQuery = `
    CREATE TABLE IF NOT EXISTS entidades (
        id SERIAL PRIMARY KEY,
        sigla VARCHAR(50) NOT NULL,
        nombre_completo VARCHAR(255) NOT NULL,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
`;
pool.query(crearTablaEntidadesQuery)
    .then(() => {
        console.log('Tabla de entidades verificada.');
        // MAGIA: Agregamos la columna de logo por si no existe
        return pool.query('ALTER TABLE entidades ADD COLUMN IF NOT EXISTS logo_url TEXT;');
    })
    .catch((err) => console.error('Error al verificar tabla entidades:', err));

// 3. RUTA DE REGISTRO
app.post('/api/registro', async (req, res) => {
    // ESTA ES LA ALARMA NUEVA
    console.log("=======================================");
    console.log("🔔 ALGUIEN HIZO CLIC EN REGISTRARSE 🔔");
    console.log("Datos que llegaron:", req.body);
    console.log("=======================================");

    const { nombre, dni, celular, correo, contrasena, rol } = req.body;

    try {
        const salt = await bcrypt.genSalt(10);
        const contrasenaEncriptada = await bcrypt.hash(contrasena, salt);

        const sql = `INSERT INTO usuarios (nombre, dni, celular, correo, contrasena, rol) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`;
        const valores = [nombre, dni, celular, correo, contrasenaEncriptada, rol || 'Ciudadano'];

        const resultado = await pool.query(sql, valores);
        res.json({ mensaje: 'Usuario registrado con éxito en la nube', id: resultado.rows[0].id });
        
    } catch (error) {
        console.error("🚨 DETALLE DEL ERROR:", error); 
        
        if (error.code === '23505') { 
            return res.status(400).json({ error: 'El DNI o Correo ya están registrados.' });
        }
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ==========================================
// 2.8 CREAR TABLA DE FAVORITOS
// ==========================================
const crearTablaFavoritosQuery = `
    CREATE TABLE IF NOT EXISTS tramites_favoritos (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
        tramite_id INTEGER REFERENCES tramites(id) ON DELETE CASCADE,
        fecha_guardado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(usuario_id, tramite_id) -- Evita que guarden el mismo trámite dos veces
    );
`;
pool.query(crearTablaFavoritosQuery)
    .then(() => console.log('Tabla de favoritos verificada.'))
    .catch((err) => console.error('Error al crear tabla favoritos:', err));

// 4. RUTA DE INICIO DE SESIÓN
app.post('/api/login', async (req, res) => {
    const { correo_dni, contrasena } = req.body;

    try {
        const sql = `SELECT * FROM usuarios WHERE correo = $1 OR dni = $2`;
        const resultado = await pool.query(sql, [correo_dni, correo_dni]);

        if (resultado.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const usuario = resultado.rows[0];

        const contrasenaValida = await bcrypt.compare(contrasena, usuario.contrasena);
        if (!contrasenaValida) {
            return res.status(401).json({ error: 'Contraseña incorrecta' });
        }

        res.json({ 
            mensaje: 'Inicio de sesión exitoso', 
            usuario: { 
                id: usuario.id,     // <--- ¡ESTE DATO ES LA LLAVE MAESTRA!
                nombre: usuario.nombre, 
                rol: usuario.rol 
            } 
        });

    } catch (error) {
        res.status(500).json({ error: 'Error en el servidor durante el login' });
    }
});
// 4.5 . RUTA PARA CREAR UN NUEVO TRÁMITE (PANEL ADMIN)
app.post('/api/tramites', async (req, res) => {
    console.log("=======================================");
    console.log("📝 NUEVO TRÁMITE RECIBIDO DEL ADMIN");
    console.log("Título:", req.body.titulo);
    console.log("=======================================");

    const { 
        titulo, 
        codigo_interno, 
        descripcion, 
        entidad, 
        modalidad, 
        costo, 
        requisitos, 
        pasos 
    } = req.body;

    try {
        const sql = `
            INSERT INTO tramites 
            (titulo, codigo_interno, descripcion, entidad, modalidad, costo, requisitos, pasos) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
            RETURNING id
        `;
        
        // Convertimos los arrays a JSON (texto) para guardarlos en PostgreSQL
        const valores = [
            titulo, 
            codigo_interno, 
            descripcion, 
            entidad, 
            modalidad, 
            costo || 0, // Si no hay costo, ponemos 0
            JSON.stringify(requisitos), 
            JSON.stringify(pasos)
        ];

        const resultado = await pool.query(sql, valores);
        res.status(201).json({ 
            mensaje: 'Trámite publicado con éxito', 
            id: resultado.rows[0].id 
        });
        
    } catch (error) {
        console.error("🚨 ERROR AL GUARDAR TRÁMITE:", error);
        res.status(500).json({ error: 'Error interno al guardar el trámite' });
    }
});

// 6. RUTA PARA OBTENER TODOS LOS TRÁMITES (PANEL CIUDADANO)
app.get('/api/tramites', async (req, res) => {
    try {
        // Buscamos todos los trámites, ordenados para que los más nuevos salgan primero
        const sql = 'SELECT * FROM tramites ORDER BY fecha_creacion DESC';
        const resultado = await pool.query(sql);
        
        // Enviamos la lista completa al frontend
        res.json(resultado.rows);
    } catch (error) {
        console.error("🚨 ERROR AL OBTENER TRÁMITES:", error);
        res.status(500).json({ error: 'Error interno al obtener los trámites' });
    }
});
// ==========================================
// 7. RUTA PARA ACTUALIZAR UN TRÁMITE (EDITAR)
// ==========================================
app.put('/api/tramites/:id', async (req, res) => {
    const idDelTramite = req.params.id;
    const { titulo, codigo_interno, descripcion, entidad, modalidad, costo, requisitos, pasos } = req.body;

    try {
        const sql = `
            UPDATE tramites 
            SET titulo = $1, codigo_interno = $2, descripcion = $3, entidad = $4, 
                modalidad = $5, costo = $6, requisitos = $7, pasos = $8
            WHERE id = $9
        `;
        
        const valores = [
            titulo, codigo_interno, descripcion, entidad, modalidad, 
            costo || 0, JSON.stringify(requisitos), JSON.stringify(pasos), idDelTramite
        ];

        await pool.query(sql, valores);
        res.status(200).json({ mensaje: 'Trámite actualizado con éxito' });
        
    } catch (error) {
        console.error("🚨 ERROR AL ACTUALIZAR TRÁMITE:", error);
        res.status(500).json({ error: 'Error interno al actualizar' });
    }
});

// ==========================================
// 8. RUTA PARA ELIMINAR UN TRÁMITE
// ==========================================
app.delete('/api/tramites/:id', async (req, res) => {
    const idDelTramite = req.params.id;

    try {
        // Ejecutamos la orden de borrado en la base de datos
        await pool.query('DELETE FROM tramites WHERE id = $1', [idDelTramite]);
        res.status(200).json({ mensaje: 'Trámite eliminado para siempre' });
        
    } catch (error) {
        console.error("🚨 ERROR AL ELIMINAR TRÁMITE:", error);
        res.status(500).json({ error: 'Error interno al eliminar' });
    }
});

// ==========================================
// 9. RUTA PARA REGISTRAR UNA BÚSQUEDA (CIUDADANO)
// ==========================================
app.post('/api/metricas', async (req, res) => {
    const { termino } = req.body;
    
    // Solo guardamos si escribió al menos 2 letras (para no llenar la base de datos de basura)
    if (!termino || termino.trim().length < 2) {
        return res.status(400).json({ error: 'Término muy corto' });
    }

    try {
        // Guardamos el término en minúsculas para unificar (ej. "DNI" y "dni" son lo mismo)
        await pool.query('INSERT INTO metricas_busquedas (termino) VALUES ($1)', [termino.toLowerCase().trim()]);
        res.status(200).json({ mensaje: 'Búsqueda registrada' });
    } catch (error) {
        res.status(500).json({ error: 'Error al guardar métrica' });
    }
});

// ==========================================
// 10. RUTA PARA OBTENER EL TOP 10 (ADMIN)
// ==========================================
app.get('/api/metricas/top', async (req, res) => {
    try {
        // Esta consulta agrupa las palabras iguales, las cuenta y las ordena de mayor a menor
        const sql = `
            SELECT termino, COUNT(*) as cantidad 
            FROM metricas_busquedas 
            GROUP BY termino 
            ORDER BY cantidad DESC 
            LIMIT 10
        `;
        const resultado = await pool.query(sql);
        res.status(200).json(resultado.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener métricas' });
    }
});

// ==========================================
// 11. RUTAS PARA EL CATÁLOGO DE ENTIDADES
// ==========================================

// A) Leer todas las entidades
app.get('/api/entidades', async (req, res) => {
    try {
        const resultado = await pool.query('SELECT * FROM entidades ORDER BY sigla ASC');
        res.status(200).json(resultado.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener entidades' });
    }
});

// B) Crear una nueva entidad
app.post('/api/entidades', async (req, res) => {
    const { sigla, nombre_completo, logo_url } = req.body; // <-- Recibimos el logo
    try {
        await pool.query(
            'INSERT INTO entidades (sigla, nombre_completo, logo_url) VALUES ($1, $2, $3)', 
            [sigla.toUpperCase(), nombre_completo, logo_url] // <-- Lo guardamos
        );
        res.status(201).json({ mensaje: 'Entidad registrada con éxito' });
    } catch (error) {
        res.status(500).json({ error: 'Error al crear la entidad' });
    }
});

// C) Eliminar una entidad
app.delete('/api/entidades/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM entidades WHERE id = $1', [req.params.id]);
        res.status(200).json({ mensaje: 'Entidad eliminada' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar la entidad' });
    }
});

// 5. ENCENDER EL SERVIDOR LOCAL
const PORT = 5001; // <--- CAMBIAMOS A 5001
app.listen(PORT, () => {
    console.log(`Servidor Backend corriendo en http://localhost:${PORT}`);
});

// ==========================================
// 12. RUTAS PARA EL SISTEMA DE FAVORITOS
// ==========================================

// A) Guardar un trámite en favoritos
app.post('/api/favoritos', async (req, res) => {
    const { usuario_id, tramite_id } = req.body;
    try {
        await pool.query(
            'INSERT INTO tramites_favoritos (usuario_id, tramite_id) VALUES ($1, $2)',
            [usuario_id, tramite_id]
        );
        res.status(201).json({ mensaje: 'Trámite guardado en favoritos' });
    } catch (error) {
        // El código 23505 es de PostgreSQL e indica que se rompió la regla "UNIQUE" (ya lo había guardado)
        if (error.code === '23505') { 
            return res.status(400).json({ error: 'El trámite ya está en tus favoritos' });
        }
        res.status(500).json({ error: 'Error al guardar favorito' });
    }
});

// B) Leer todos los favoritos de un ciudadano específico
app.get('/api/favoritos/:usuario_id', async (req, res) => {
    const { usuario_id } = req.params;
    try {
        // MAGIA SQL: Usamos JOIN para mezclar la tabla de favoritos con la info completa del trámite
        const sql = `
            SELECT t.* FROM tramites_favoritos tf
            JOIN tramites t ON tf.tramite_id = t.id
            WHERE tf.usuario_id = $1
            ORDER BY tf.fecha_guardado DESC
        `;
        const resultado = await pool.query(sql, [usuario_id]);
        res.status(200).json(resultado.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error al cargar favoritos' });
    }
});

// C) Eliminar un favorito (cuando el ciudadano le quita la estrella)
app.delete('/api/favoritos/:usuario_id/:tramite_id', async (req, res) => {
    const { usuario_id, tramite_id } = req.params;
    try {
        await pool.query(
            'DELETE FROM tramites_favoritos WHERE usuario_id = $1 AND tramite_id = $2',
            [usuario_id, tramite_id]
        );
        res.status(200).json({ mensaje: 'Favorito eliminado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar favorito' });
    }
});

