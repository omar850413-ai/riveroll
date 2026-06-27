/**
 * db.js - Adaptador Híbrido de Persistencia (Local / Firebase Firestore)
 * Versión de Producción Limpia (Sin Datos Demo).
 * Soporta edición y eliminación completa de sedes, miembros, partidos y caja.
 */

const STORAGE_KEYS = {
    CONFIG_NUBE: 'riveroll_firebase_config_v2',
    SEDES: 'riveroll_sedes',
    ALUMNOS: 'riveroll_alumnos',
    TRANSACCIONES: 'riveroll_transacciones',
    PARTIDOS: 'riveroll_partidos'
};

// Datos Semilla de Producción (Vacíos por defecto para iniciar limpios)
const SEMILLA_SEDES = [];
const SEMILLA_ALUMNOS = [];
const SEMILLA_TRANSACCIONES = [];
const SEMILLA_PARTIDOS = [];

let firebaseApp = null;
let firestoreDb = null;
let useFirebase = false;

const listeners = {
    sedes: [],
    alumnos: [],
    transacciones: [],
    partidos: []
};

function notificarCambio(coleccion, datos) {
    if (listeners[coleccion]) {
        listeners[coleccion].forEach(callback => callback(datos));
    }
}

const dbAdapter = {
    inicializar() {
        const configStr = localStorage.getItem(STORAGE_KEYS.CONFIG_NUBE);
        if (configStr) {
            try {
                const config = JSON.parse(configStr);
                this.conectarFirebase(config);
            } catch (e) {
                console.error("Error al cargar configuración de Firebase:", e);
                useFirebase = false;
            }
        } else {
            useFirebase = false;
        }
    },

    conectarFirebase(config) {
        if (!config || !config.apiKey || !config.projectId) {
            throw new Error("Credenciales de Firebase incompletas.");
        }
        if (firebase.apps.length > 0) {
            firebaseApp = firebase.app();
        } else {
            firebaseApp = firebase.initializeApp(config);
        }
        firestoreDb = firebaseApp.firestore();
        useFirebase = true;
        localStorage.setItem(STORAGE_KEYS.CONFIG_NUBE, JSON.stringify(config));
        this.reconectarListenersNube();
        return true;
    },

    desconectarFirebase() {
        localStorage.removeItem(STORAGE_KEYS.CONFIG_NUBE);
        useFirebase = false;
        firestoreDb = null;
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

    suscribir(coleccion, callback) {
        if (!listeners[coleccion]) return;
        listeners[coleccion].push(callback);
        
        if (useFirebase && firestoreDb) {
            firestoreDb.collection(coleccion).onSnapshot(snapshot => {
                const datos = [];
                snapshot.forEach(doc => {
                    datos.push({ id: doc.id, ...doc.data() });
                });
                
                if (coleccion === 'transacciones' || coleccion === 'partidos') {
                    datos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
                }
                callback(datos);
            }, error => {
                console.error(`Error en listener de ${coleccion}:`, error);
            });
        } else {
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

    // --- OPERACIONES DE ESCRITURA ---

    // 1. SEDES (CON EDITAR Y ELIMINAR)
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

    async actualizarSede(id, datosActualizados) {
        if (useFirebase && firestoreDb) {
            const temp = { ...datosActualizados };
            delete temp.id;
            await firestoreDb.collection('sedes').doc(id).update(temp);
            return { id, ...datosActualizados };
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
            await firestoreDb.collection('sedes').doc(id).delete();
        } else {
            let sedes = this.getSedesLocal();
            sedes = sedes.filter(s => s.id !== id);
            this.saveSedesLocal(sedes);
            notificarCambio('sedes', sedes);
        }
    },

    // 2. MIEMBROS / ALUMNOS
    async agregarAlumno(alumno) {
        if (useFirebase && firestoreDb) {
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
    }
};

dbAdapter.inicializar();
window.db = dbAdapter;
