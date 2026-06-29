/**
 * db.js - Adaptador Híbrido de Persistencia (Local / Firebase Firestore)
 * Versión de Producción Limpia (Sin Datos Demo).
 * Conexión automática silenciosa con Firebase (Credenciales Hardcodeadas).
 */

const STORAGE_KEYS = {
    SEDES: 'riveroll_sedes_v3',
    ALUMNOS: 'riveroll_alumnos_v3',
    TRANSACCIONES: 'riveroll_transacciones_v3',
    PARTIDOS: 'riveroll_partidos_v3',
    TRABAJADORES: 'riveroll_trabajadores_v3',
    ACTIVIDADES: 'riveroll_actividades_v3',
    CATEGORIAS: 'riveroll_categorias_v3',
    ASISTENCIAS: 'riveroll_asistencias_v3'
};

const SUPER_ADMINS = ['omar850413@gmail.com'];

// =========================================================================
// CONFIGURACIÓN DE FIREBASE: PEGA TUS CREDENCIALES AQUÍ ADENTRO
// La aplicación se conectará automáticamente de forma silenciosa.
// =========================================================================
const firebaseConfig = {
    apiKey: "AIzaSyAJ5XGT4ngzGcJLgLD3QqjLpNSzZFygcAE",
    authDomain: "ai-lef.firebaseapp.com",
    projectId: "ai-lef",
    storageBucket: "ai-lef.firebasestorage.app",
    messagingSenderId: "427833296481",
    appId: "1:427833296481:web:c19fbdabaacac4de274c20",
    measurementId: "G-555Y1BCC07"
};
// =========================================================================

// Datos Semilla de Producción (Vacíos por defecto)
const SEMILLA_SEDES = [];
const SEMILLA_ALUMNOS = [];
const SEMILLA_TRANSACCIONES = [];
const SEMILLA_PARTIDOS = [];
const SEMILLA_TRABAJADORES = [];
const SEMILLA_ACTIVIDADES = [];

let firebaseApp = null;
let firestoreDb = null;
let useFirebase = false;

let dbCurrentUser = null;

const listeners = {
    sedes: [],
    alumnos: [],
    transacciones: [],
    partidos: [],
    trabajadores: [],
    actividades: [],
    categorias: [],
    asistencias: []
};

function notificarCambio(coleccion, datos) {
    if (listeners[coleccion]) {
        listeners[coleccion].forEach(callback => callback(datos));
    }
}

const dbAdapter = {
    inicializar() {
        // Validar si las credenciales fueron incrustadas
        const estaConfigurado = firebaseConfig.projectId && !firebaseConfig.projectId.startsWith("PEGA_AQUI_");
        
        if (estaConfigurado) {
            try {
                this.conectarFirebase(firebaseConfig);
            } catch (e) {
                console.error("Error al inicializar Firebase Firestore:", e);
                useFirebase = false;
            }
        } else {
            console.warn("⚠️ Firebase no configurado en db.js. Usando almacenamiento local temporal.");
            useFirebase = false;
        }
    },

    conectarFirebase(config) {
        if (firebase.apps.length > 0) {
            firebaseApp = firebase.app();
        } else {
            firebaseApp = firebase.initializeApp(config);
        }
        firestoreDb = firebaseApp.firestore();
        useFirebase = true;
        console.log("🔥 Conexión en la nube activada automáticamente.");
        this.reconectarListenersNube();
        return true;
    },

    isNubeActiva() {
        return useFirebase;
    },
    
    setCurrentUser(user) {
        dbCurrentUser = user;
        this.reconectarListenersNube();
    },

    suscribir(coleccion, callback) {
        if (!listeners[coleccion]) return;
        listeners[coleccion].push(callback);
        
        if (useFirebase && firestoreDb) {
            let queryRef = firestoreDb.collection(coleccion);
            
            // Si el usuario no es superadministrador, filtrar por su userId
            const esSuperAdmin = dbCurrentUser && SUPER_ADMINS.includes(dbCurrentUser.email.toLowerCase());
            if (dbCurrentUser && !esSuperAdmin) {
                // Filtrar sedes creadas por el usuario
                if (coleccion === 'sedes' || coleccion === 'transacciones' || coleccion === 'partidos' || coleccion === 'alumnos' || coleccion === 'trabajadores' || coleccion === 'actividades' || coleccion === 'categorias' || coleccion === 'asistencias') {
                    queryRef = queryRef.where('userId', '==', dbCurrentUser.uid);
                }
            }
            
            queryRef.onSnapshot(snapshot => {
                const datos = [];
                snapshot.forEach(doc => {
                    datos.push({ id: doc.id, ...doc.data() });
                });
                
                if (coleccion === 'transacciones' || coleccion === 'partidos' || coleccion === 'actividades') {
                    datos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
                }
                callback(datos);
            }, error => {
                console.error(`Error en listener de ${coleccion}:`, error);
            });
        } else {
            let datosLocal = [];
            const userFilter = (item) => {
                const esSuperAdmin = dbCurrentUser && SUPER_ADMINS.includes(dbCurrentUser.email.toLowerCase());
                if (!dbCurrentUser) return true;
                if (esSuperAdmin) return true;
                return item.userId === dbCurrentUser.uid;
            };
            
            if (coleccion === 'sedes') {
                datosLocal = this.getSedesLocal().filter(userFilter);
            } else if (coleccion === 'alumnos') {
                datosLocal = this.getAlumnosLocal().filter(userFilter);
            } else if (coleccion === 'transacciones') {
                datosLocal = this.getTransaccionesLocal().filter(userFilter);
            } else if (coleccion === 'partidos') {
                datosLocal = this.getPartidosLocal().filter(userFilter);
            } else if (coleccion === 'trabajadores') {
                datosLocal = this.getTrabajadoresLocal().filter(userFilter);
            } else if (coleccion === 'actividades') {
                datosLocal = this.getActividadesLocal().filter(userFilter);
            } else if (coleccion === 'categorias') {
                datosLocal = this.getCategoriasLocal().filter(userFilter);
            } else if (coleccion === 'asistencias') {
                datosLocal = this.getAsistenciasLocal().filter(userFilter);
            }
            callback(datosLocal);
        }
    },

    reconectarListenersNube() {
        if (!useFirebase || !firestoreDb) return;
        Object.keys(listeners).forEach(coleccion => {
            const callbacksActivos = [...listeners[coleccion]];
            listeners[coleccion] = [];
            callbacksActivos.forEach(cb => {
                this.suscribir(coleccion, cb);
            });
        });
    },

    // --- LOCAL STORAGE GETTERS/SETTERS ---
    getSedesLocal() {
        const data = localStorage.getItem(STORAGE_KEYS.SEDES);
        if (!data) { this.saveSedesLocal(SEMILLA_SEDES); return SEMILLA_SEDES; }
        return JSON.parse(data);
    },
    saveSedesLocal(data) { localStorage.setItem(STORAGE_KEYS.SEDES, JSON.stringify(data)); },

    getAlumnosLocal() {
        const data = localStorage.getItem(STORAGE_KEYS.ALUMNOS);
        if (!data) { this.saveAlumnosLocal(SEMILLA_ALUMNOS); return SEMILLA_ALUMNOS; }
        return JSON.parse(data);
    },
    saveAlumnosLocal(data) { localStorage.setItem(STORAGE_KEYS.ALUMNOS, JSON.stringify(data)); },

    getTransaccionesLocal() {
        const data = localStorage.getItem(STORAGE_KEYS.TRANSACCIONES);
        if (!data) { this.saveTransaccionesLocal(SEMILLA_TRANSACCIONES); return SEMILLA_TRANSACCIONES; }
        return JSON.parse(data);
    },
    saveTransaccionesLocal(data) { localStorage.setItem(STORAGE_KEYS.TRANSACCIONES, JSON.stringify(data)); },

    getPartidosLocal() {
        const data = localStorage.getItem(STORAGE_KEYS.PARTIDOS);
        if (!data) { this.savePartidosLocal(SEMILLA_PARTIDOS); return SEMILLA_PARTIDOS; }
        return JSON.parse(data);
    },
    savePartidosLocal(data) { localStorage.setItem(STORAGE_KEYS.PARTIDOS, JSON.stringify(data)); },

    getTrabajadoresLocal() {
        const data = localStorage.getItem(STORAGE_KEYS.TRABAJADORES);
        if (!data) { this.saveTrabajadoresLocal(SEMILLA_TRABAJADORES); return SEMILLA_TRABAJADORES; }
        return JSON.parse(data);
    },
    saveTrabajadoresLocal(data) { localStorage.setItem(STORAGE_KEYS.TRABAJADORES, JSON.stringify(data)); },

    getActividadesLocal() {
        const data = localStorage.getItem(STORAGE_KEYS.ACTIVIDADES);
        if (!data) { this.saveActividadesLocal(SEMILLA_ACTIVIDADES); return SEMILLA_ACTIVIDADES; }
        return JSON.parse(data);
    },
    saveActividadesLocal(data) { localStorage.setItem(STORAGE_KEYS.ACTIVIDADES, JSON.stringify(data)); },

    getCategoriasLocal() {
        const data = localStorage.getItem(STORAGE_KEYS.CATEGORIAS);
        if (!data) { return []; }
        return JSON.parse(data);
    },
    saveCategoriasLocal(data) { localStorage.setItem(STORAGE_KEYS.CATEGORIAS, JSON.stringify(data)); },

    getAsistenciasLocal() {
        const data = localStorage.getItem(STORAGE_KEYS.ASISTENCIAS);
        if (!data) { return []; }
        return JSON.parse(data);
    },
    saveAsistenciasLocal(data) { localStorage.setItem(STORAGE_KEYS.ASISTENCIAS, JSON.stringify(data)); },

    // --- OPERACIONES DE ESCRITURA ---

    // 1. SEDES
    async agregarSede(sede) {
        if (dbCurrentUser) {
            sede.userId = dbCurrentUser.uid;
        }
        
        if (useFirebase && firestoreDb) {
            try {
                const docRef = await firestoreDb.collection('sedes').add(sede);
                return { id: docRef.id, ...sede };
            } catch (err) {
                console.error("Firestore agregarSede error, fallback local:", err);
                alert("Firebase Error de Escritura (Revisa si tus reglas de base de datos están en modo público): " + err.message + "\n\nSe guardará temporalmente en tu navegador de forma local.");
                
                const sedes = this.getSedesLocal();
                sede.id = 's_' + Date.now();
                sedes.push(sede);
                this.saveSedesLocal(sedes);
                notificarCambio('sedes', sedes);
                return sede;
            }
        } else {
            const sedes = this.getSedesLocal();
            sede.id = 's_' + Date.now();
            sedes.push(sede);
            this.saveSedesLocal(sedes);
            notificarCambio('sedes', sedes);
            return sede;
        }
    },

    async actualizarSede(id, datosActualizados) {
        if (useFirebase && firestoreDb) {
            try {
                const temp = { ...datosActualizados };
                delete temp.id;
                await firestoreDb.collection('sedes').doc(id).update(temp);
                return { id, ...datosActualizados };
            } catch (err) {
                console.error("Firestore actualizarSede error:", err);
                alert("Error al actualizar en la nube: " + err.message);
            }
        } else {
            const sedes = this.getSedesLocal();
            const index = sedes.findIndex(s => s.id === id);
            if (index !== -1) {
                sedes[index] = { ...sedes[index], ...datosActualizados, id };
                this.saveSedesLocal(sedes);
                notificarCambio('sedes', sedes);
                return sedes[index];
            }
            return null;
        }
    },

    async eliminarSede(id) {
        if (useFirebase && firestoreDb) {
            try {
                await firestoreDb.collection('sedes').doc(id).delete();
            } catch (err) {
                console.error("Firestore eliminarSede error:", err);
            }
        } else {
            let sedes = this.getSedesLocal();
            sedes = sedes.filter(s => s.id !== id);
            this.saveSedesLocal(sedes);
            notificarCambio('sedes', sedes);
        }
    },

    // 2. MIEMBROS / ALUMNOS
    async agregarAlumno(alumno) {
        if (dbCurrentUser) {
            alumno.userId = dbCurrentUser.uid;
        }
        
        if (useFirebase && firestoreDb) {
            try {
                const docRef = await firestoreDb.collection('alumnos').add(alumno);
                return { id: docRef.id, ...alumno };
            } catch (err) {
                console.error("Firestore agregarAlumno error, fallback local:", err);
                alert("Firebase Error: " + err.message + "\nSe guardará localmente.");
                
                const alumnos = this.getAlumnosLocal();
                alumno.id = 'a_' + Date.now();
                alumnos.push(alumno);
                this.saveAlumnosLocal(alumnos);
                notificarCambio('alumnos', alumnos);
                return alumno;
            }
        } else {
            const alumnos = this.getAlumnosLocal();
            alumno.id = 'a_' + Date.now();
            alumnos.push(alumno);
            this.saveAlumnosLocal(alumnos);
            notificarCambio('alumnos', alumnos);
            return alumno;
        }
    },

    async actualizarAlumno(id, datosActualizados) {
        if (useFirebase && firestoreDb) {
            const temp = { ...datosActualizados };
            delete temp.id;
            await firestoreDb.collection('alumnos').doc(id).update(temp);
            return { id, ...datosActualizados };
        } else {
            const alumnos = this.getAlumnosLocal();
            const index = alumnos.findIndex(a => a.id === id);
            if (index !== -1) {
                alumnos[index] = { ...alumnos[index], ...datosActualizados, id };
                this.saveAlumnosLocal(alumnos);
                notificarCambio('alumnos', alumnos);
                return alumnos[index];
            }
            return null;
        }
    },

    async saveAlumnos(listaAlumnosCompleta) {
        if (useFirebase && firestoreDb) {
            const batch = firestoreDb.batch();
            listaAlumnosCompleta.forEach(alumno => {
                const docRef = firestoreDb.collection('alumnos').doc(alumno.id);
                const temp = { ...alumno };
                delete temp.id;
                batch.set(docRef, temp);
            });
            await batch.commit();
        } else {
            this.saveAlumnosLocal(listaAlumnosCompleta);
            notificarCambio('alumnos', listaAlumnosCompleta);
        }
    },

    async eliminarAlumno(id) {
        if (useFirebase && firestoreDb) {
            await firestoreDb.collection('alumnos').doc(id).delete();
        } else {
            let alumnos = this.getAlumnosLocal();
            alumnos = alumnos.filter(a => a.id !== id);
            this.saveAlumnosLocal(alumnos);
            notificarCambio('alumnos', alumnos);
        }
    },

    // 3. TRANSACCIONES
    async agregarTransaccion(transaccion) {
        if (useFirebase && firestoreDb) {
            const temp = { ...transaccion };
            delete temp.id;
            const docRef = await firestoreDb.collection('transacciones').add(temp);
            return { id: docRef.id, ...transaccion };
        } else {
            const transacciones = this.getTransaccionesLocal();
            transacciones.unshift(transaccion);
            this.saveTransaccionesLocal(transacciones);
            notificarCambio('transacciones', transacciones);
            return transaccion;
        }
    },

    async eliminarTransaccion(id) {
        if (useFirebase && firestoreDb) {
            await firestoreDb.collection('transacciones').doc(id).delete();
        } else {
            let transacciones = this.getTransaccionesLocal();
            transacciones = transacciones.filter(t => t.id !== id);
            this.saveTransaccionesLocal(transacciones);
            notificarCambio('transacciones', transacciones);
        }
    },

    // 4. PARTIDOS
    async agregarPartido(partido) {
        if (useFirebase && firestoreDb) {
            const temp = { ...partido };
            delete temp.id;
            const docRef = await firestoreDb.collection('partidos').add(temp);
            return { id: docRef.id, ...partido };
        } else {
            const partidos = this.getPartidosLocal();
            partidos.unshift(partido);
            this.savePartidosLocal(partidos);
            notificarCambio('partidos', partidos);
            return partido;
        }
    },

    async actualizarPartido(id, datosActualizados) {
        if (useFirebase && firestoreDb) {
            const temp = { ...datosActualizados };
            delete temp.id;
            await firestoreDb.collection('partidos').doc(id).update(temp);
            return { id, ...datosActualizados };
        } else {
            const partidos = this.getPartidosLocal();
            const index = partidos.findIndex(p => p.id === id);
            if (index !== -1) {
                partidos[index] = { ...partidos[index], ...datosActualizados, id };
                this.savePartidosLocal(partidos);
                notificarCambio('partidos', partidos);
                return partidos[index];
            }
            return null;
        }
    },

    // 5. TRABAJADORES
    async agregarTrabajador(trabajador) {
        if (dbCurrentUser) {
            trabajador.userId = dbCurrentUser.uid;
        }
        if (useFirebase && firestoreDb) {
            const temp = { ...trabajador };
            delete temp.id;
            const docRef = await firestoreDb.collection('trabajadores').add(temp);
            return { id: docRef.id, ...trabajador };
        } else {
            const trabajadores = this.getTrabajadoresLocal();
            trabajador.id = 'tr_' + Date.now();
            trabajadores.push(trabajador);
            this.saveTrabajadoresLocal(trabajadores);
            notificarCambio('trabajadores', trabajadores);
            return trabajador;
        }
    },

    async eliminarTrabajador(id) {
        if (useFirebase && firestoreDb) {
            await firestoreDb.collection('trabajadores').doc(id).delete();
        } else {
            let trabajadores = this.getTrabajadoresLocal();
            trabajadores = trabajadores.filter(t => t.id !== id);
            this.saveTrabajadoresLocal(trabajadores);
            notificarCambio('trabajadores', trabajadores);
        }
    },

    // 6. ACTIVIDADES (ROLL)
    async agregarActividad(actividad) {
        if (dbCurrentUser) {
            actividad.userId = dbCurrentUser.uid;
        }
        if (useFirebase && firestoreDb) {
            const temp = { ...actividad };
            delete temp.id;
            const docRef = await firestoreDb.collection('actividades').add(temp);
            return { id: docRef.id, ...actividad };
        } else {
            const actividades = this.getActividadesLocal();
            actividad.id = 'ac_' + Date.now();
            actividades.push(actividad);
            this.saveActividadesLocal(actividades);
            notificarCambio('actividades', actividades);
            return actividad;
        }
    },

    async eliminarActividad(id) {
        if (useFirebase && firestoreDb) {
            await firestoreDb.collection('actividades').doc(id).delete();
        } else {
            let actividades = this.getActividadesLocal();
            actividades = actividades.filter(a => a.id !== id);
            this.saveActividadesLocal(actividades);
            notificarCambio('actividades', actividades);
        }
    },

    // 7. CATEGORIAS (FÚTBOL)
    async agregarCategoria(categoria) {
        if (dbCurrentUser) {
            categoria.userId = dbCurrentUser.uid;
        }
        if (useFirebase && firestoreDb) {
            const temp = { ...categoria };
            delete temp.id;
            const docRef = await firestoreDb.collection('categorias').add(temp);
            return { id: docRef.id, ...categoria };
        } else {
            const categorias = this.getCategoriasLocal();
            categoria.id = 'cat_' + Date.now();
            categorias.push(categoria);
            this.saveCategoriasLocal(categorias);
            notificarCambio('categorias', categorias);
            return categoria;
        }
    },

    async eliminarCategoria(id) {
        if (useFirebase && firestoreDb) {
            await firestoreDb.collection('categorias').doc(id).delete();
        } else {
            let categorias = this.getCategoriasLocal();
            categorias = categorias.filter(c => c.id !== id);
            this.saveCategoriasLocal(categorias);
            notificarCambio('categorias', categorias);
        }
    },

    async actualizarCategoria(id, categoria) {
        if (dbCurrentUser) {
            categoria.userId = dbCurrentUser.uid;
        }
        if (useFirebase && firestoreDb) {
            const temp = { ...categoria };
            delete temp.id;
            await firestoreDb.collection('categorias').doc(id).update(temp);
        } else {
            const categorias = this.getCategoriasLocal();
            const idx = categorias.findIndex(c => c.id === id);
            if (idx !== -1) {
                categorias[idx] = { ...categorias[idx], ...categoria, id };
                this.saveCategoriasLocal(categorias);
                notificarCambio('categorias', categorias);
            }
        }
    },

    // 8. ASISTENCIAS (REGISTROS DIARIOS/SEMANALES)
    async guardarAsistencia(asistencia) {
        if (dbCurrentUser) {
            asistencia.userId = dbCurrentUser.uid;
        }
        
        // El id se forma como asistencia_[fecha]_[categoriaId] o asistencia_[fecha]_gym
        const docId = `asistencia_${asistencia.fecha}_${asistencia.categoriaId}`;
        
        if (useFirebase && firestoreDb) {
            const temp = { ...asistencia };
            delete temp.id;
            await firestoreDb.collection('asistencias').doc(docId).set(temp);
            return { id: docId, ...asistencia };
        } else {
            const asistencias = this.getAsistenciasLocal();
            const index = asistencias.findIndex(a => a.fecha === asistencia.fecha && a.categoriaId === asistencia.categoriaId);
            if (index !== -1) {
                asistencias[index] = { ...asistencia, id: docId };
            } else {
                asistencias.push({ ...asistencia, id: docId });
            }
            this.saveAsistenciasLocal(asistencias);
            notificarCambio('asistencias', asistencias);
            return { id: docId, ...asistencia };
        }
    }
};

dbAdapter.inicializar();
window.db = dbAdapter;
