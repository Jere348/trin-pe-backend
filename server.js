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
            usuario: { nombre: usuario.nombre, rol: usuario.rol } 
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
// 5. ENCENDER EL SERVIDOR LOCAL
const PORT = 5001; // <--- CAMBIAMOS A 5001
app.listen(PORT, () => {
    console.log(`Servidor Backend corriendo en http://localhost:${PORT}`);
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