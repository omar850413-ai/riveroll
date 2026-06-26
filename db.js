/**
 * db.js - Adaptador Híbrido de Persistencia (Local / Firebase Firestore)
 * Permite alternar de forma transparente entre almacenamiento local (localStorage)
 * y una base de datos profesional en la nube (Firestore) en tiempo real.
 */

const STORAGE_KEYS = {
    CONFIG_NUBE: 'riveroll_firebase_config_v2',
    SEDES: 'riveroll_sedes',
    ALUMNOS: 'riveroll_alumnos',
    TRANSACCIONES: 'riveroll_transacciones',
    PARTIDOS: 'riveroll_partidos'
};

// Datos Semilla para inicialización local offline
const SEMILLA_SEDES = [
    { id: 's1', nombre: 'Riveroll Soccer Academy', rubro: 'soccer', inscripcion: 600, mensualidad: 900 },
    { id: 's2', nombre: 'Riveroll Fitness Gym', rubro: 'gym', inscripcion: 400, mensualidad: 700 }
];

const SEMILLA_ALUMNOS = [
    { id: '1', nombre: 'Mateo Riveroll', fechaNacimiento: '2015-04-12', categoria: '2015', tutorNombre: 'Carlos Riveroll', tutorTelefono: '5551234567', foto: '', sedeId: 's1', pagos: { inscripcion: 'pagado', mensualidades: { '2026-04': 'pagado', '2026-05': 'pagado', '2026-06': 'pendiente' } } },
    { id: '2', nombre: 'Santiago Gómez', fechaNacimiento: '2017-08-22', categoria: '2017', tutorNombre: 'Laura Gómez', tutorTelefono: '5559876543', foto: '', sedeId: 's1', pagos: { inscripcion: 'pagado', mensualidades: { '2026-04': 'pagado', '2026-05': 'adeudo', '2026-06': 'pendiente' } } },
    { id: '3', nombre: 'Iker Ruiz', fechaNacimiento: '2014-11-05', categoria: '2014', tutorNombre: 'Juan Ruiz', tutorTelefono: '5555555555', foto: '', sedeId: 's1', pagos: { inscripcion: 'pendiente', mensualidades: { '2026-05': 'pendiente', '2026-06': 'pendiente' } } },
    { id: '4', nombre: 'Valeria Méndez', fechaNacimiento: '1995-03-24', categoria: 'Adulto / Gym', tutorNombre: 'Margarita Méndez', tutorTelefono: '5557778899', foto: '', sedeId: 's2', pagos: { inscripcion: 'pagado', mensualidades: { '2026-05': 'pagado', '2026-06': 'pendiente' } } }
];

const SEMILLA_TRANSACCIONES = [
    { id: 't1', tipo: 'ingreso', categoria: 'Inscripción', monto: 600, descripcion: 'Inscripción Mateo Riveroll (Riveroll Soccer Academy)', fecha: '2026-04-01' },
    { id: 't2', tipo: 'ingreso', categoria: 'Mensualidad', monto: 900, descripcion: 'Mensualidad Abril Mateo Riveroll', fecha: '2026-04-05' },
    { id: 't3', tipo: 'ingreso', categoria: 'Mensualidad', monto: 900, descripcion: 'Mensualidad Mayo Mateo Riveroll', fecha: '2026-05-02' },
    { id: 't4', tipo: 'ingreso', categoria: 'Inscripción', monto: 600, descripcion: 'Inscripción Santiago Gómez', fecha: '2026-04-02' },
    { id: 't5', tipo: 'ingreso', categoria: 'Mensualidad', monto: 900, descripcion: 'Mensualidad Abril Santiago Gómez', fecha: '2026-04-06' },
    { id: 't6', tipo: 'ingreso', categoria: 'Mensualidad', monto: 700, descripcion: 'Mensualidad Mayo Valeria Méndez (Riveroll Fitness Gym)', fecha: '2026-05-05' },
    { id: 't7', tipo: 'egreso', categoria: 'Renta de Canchas', monto: 1500, descripcion: 'Renta campo alterno para entrenamientos', fecha: '2026-06-18' }
];

const SEMILLA_PARTIDOS = [
    { id: 'p1', categoria: '2015', rival: 'Leones Negros FC', fecha: '2026-06-27', asistencia: { '1': { asistio: true, arbitraje: 'pendiente' } } }
];

// Estado de conexión del adaptador
let firebaseApp = null;
let firestoreDb = null;
let useFirebase = false;

// Registro de Callbacks Reactivos (para simular onSnapshot en local)
const listeners = {
    sedes: [],
    alumnos: [],
    transacciones: [],
    partidos: []
};

// Disparador local de eventos reactivos
function notificarCambio(coleccion, datos) {
    if (listeners[coleccion]) {
        listeners[coleccion].forEach(callback => callback(datos));
    }
}

const dbAdapter = {
    // --- INICIALIZACIÓN E CONFIGURACIÓN ---
    inicializar() {
        const configStr = localStorage.getItem(STORAGE_KEYS.CONFIG_NUBE);
        if (configStr) {
            try {
                const config = JSON.parse(configStr);
                this.conectarFirebase(config);
            } catch (e) {
                console.error("Error al cargar configuración de Firebase guardada:", e);
                useFirebase = false;
            }
        } else {
            console.log("ℹ️ Operando en modo local offline (localStorage).");
            useFirebase = false;
        }
    },

    conectarFirebase(config) {
        if (!config || !config.apiKey || !config.projectId) {
            throw new Error("Credenciales incompletas.");
        }
        
        // Evitar doble inicialización
        if (firebase.apps.length > 0) {
            firebaseApp = firebase.app();
        } else {
            firebaseApp = firebase.initializeApp(config);
        }
        
        firestoreDb = firebaseApp.firestore();
        useFirebase = true;
        
        // Guardar configuración en localStorage
        localStorage.setItem(STORAGE_KEYS.CONFIG_NUBE, JSON.stringify(config));
        console.log("🔥 Conectado exitosamente a Firebase Firestore.");
        
        // Volver a enlazar los listeners activos a Firestore
        this.reconectarListenersNube();
        return true;
    },

    desconectarFirebase() {
        localStorage.removeItem(STORAGE_KEYS.CONFIG_NUBE);
        useFirebase = false;
        firestoreDb = null;
        console.log("🔌 Desconectado de Firebase. Retornando a modo local.");
        
        // Notificar con datos locales
        notificarCambio('sedes', this.getSedesLocal());
        notificarCambio('alumnos', this.getAlumnosLocal());
        notificarCambio('transacciones', this.getTransaccionesLocal());
        notificarCambio('partidos', this.getPartidosLocal());
    },

    isNubeActiva() {
        return useFirebase;
    },

    obtenerConfigActual() {
        const configStr = localStorage.getItem(STORAGE_KEYS.CONFIG_NUBE);
        return configStr ? JSON.parse(configStr) : null;
    },

    // --- SUSCRIPCIONES REACTIVAS EN TIEMPO REAL ---
    suscribir(coleccion, callback) {
        if (!listeners[coleccion]) return;
        listeners[coleccion].push(callback);
        
        if (useFirebase && firestoreDb) {
            // Suscribir directo a Firestore en tiempo real
            firestoreDb.collection(coleccion).onSnapshot(snapshot => {
                const datos = [];
                snapshot.forEach(doc => {
                    datos.push({ id: doc.id, ...doc.data() });
                });
                
                // Si la colección es transacciones o partidos, ordenar
                if (coleccion === 'transacciones') {
                    datos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
                } else if (coleccion === 'partidos') {
                    datos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
                }
                
                callback(datos);
            }, error => {
                console.error(`Error en listener de Firestore para ${coleccion}:`, error);
            });
        } else {
            // Retornar datos locales inmediatamente
            let datosLocal = [];
            if (coleccion === 'sedes') datosLocal = this.getSedesLocal();
            else if (coleccion === 'alumnos') datosLocal = this.getAlumnosLocal();
            else if (coleccion === 'transacciones') datosLocal = this.getTransaccionesLocal();
            else if (coleccion === 'partidos') datosLocal = this.getPartidosLocal();
            
            callback(datosLocal);
        }
    },

    reconectarListenersNube() {
        if (!useFirebase || !firestoreDb) return;
        
        // Volver a detonar las suscripciones conectándolas a Firestore
        Object.keys(listeners).forEach(coleccion => {
            const callbacksActivos = [...listeners[coleccion]];
            // Limpiar los listeners locales viejos
            listeners[coleccion] = [];
            
            // Re-vincular cada callback a Firestore
            callbacksActivos.forEach(cb => {
                this.suscribir(coleccion, cb);
            });
        });
    },

    // --- MÉTODOS LOCALES (FALLBACK) ---
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

    // --- OPERACIONES DE ESCRITURA CONSOLIDADAS (HÍBRIDAS) ---
    
    // 1. SEDES
    async agregarSede(sede) {
        if (useFirebase && firestoreDb) {
            const docRef = await firestoreDb.collection('sedes').add(sede);
            return { id: docRef.id, ...sede };
        } else {
            const sedes = this.getSedesLocal();
            sedes.push(sede);
            this.saveSedesLocal(sedes);
            notificarCambio('sedes', sedes);
            return sede;
        }
    },

    // 2. MIEMBROS / ALUMNOS
    async agregarAlumno(alumno) {
        if (useFirebase && firestoreDb) {
            // Generar ID en Firestore
            const docRef = await firestoreDb.collection('alumnos').add(alumno);
            return { id: docRef.id, ...alumno };
        } else {
            const alumnos = this.getAlumnosLocal();
            alumnos.push(alumno);
            this.saveAlumnosLocal(alumnos);
            notificarCambio('alumnos', alumnos);
            return alumno;
        }
    },

    async actualizarAlumno(id, datosActualizados) {
        if (useFirebase && firestoreDb) {
            // Eliminar propiedad id si viene adentro para evitar sobreescribir la llave del doc
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
        // Método de compatibilidad para sobreescribir masivamente (utilizado en toggles rápidos)
        if (useFirebase && firestoreDb) {
            // En Firestore escribimos de uno por uno o por lotes (Batch)
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
    }
};

// Autoinicializar al cargar la página
dbAdapter.inicializar();
window.db = dbAdapter;
