/**
 * db.js - Adaptador de Persistencia para Club Jaguares Atlético River
 * Sincroniza datos de la Academia e implementa muro social, comentarios y transmisiones.
 */

const STORAGE_KEYS = {
    SEDES: 'riveroll_sedes_v3',
    ALUMNOS: 'riveroll_alumnos_v3',
    CATEGORIAS: 'riveroll_categorias_v3',
    ASISTENCIAS: 'riveroll_asistencias_v3',
    POSTS: 'jaguares_posts_v1',
    COMMENTS: 'jaguares_comments_v1',
    LIVESTREAMS: 'jaguares_livestreams_v1'
};

const firebaseConfig = {
    apiKey: "AIzaSyAJ5XGT4ngzGcJLgLD3QqjLpNSzZFygcAE",
    authDomain: "ai-lef.firebaseapp.com",
    projectId: "ai-lef",
    storageBucket: "ai-lef.firebasestorage.app",
    messagingSenderId: "427833296481",
    appId: "1:427833296481:web:c19fbdabaacac4de274c20",
    measurementId: "G-555Y1BCC07"
};

let firebaseApp = null;
let firestoreDb = null;
let useFirebase = false;
let dbCurrentUser = null;

const listeners = {
    sedes: [],
    alumnos: [],
    categorias: [],
    asistencias: [],
    posts: [],
    comments: [],
    livestreams: []
};

function notificarCambio(coleccion, datos) {
    if (listeners[coleccion]) {
        listeners[coleccion].forEach(cb => cb(datos));
    }
}

// Inicializar Firebase
try {
    if (typeof firebase !== 'undefined') {
        if (firebase.apps.length === 0) {
            firebaseApp = firebase.initializeApp(firebaseConfig);
        } else {
            firebaseApp = firebase.app();
        }
        firestoreDb = firebaseApp.firestore();
        useFirebase = true;
        console.log("Firebase conectado exitosamente en Club Jaguares.");
    } else {
        console.log("Firebase SDK no detectado. Usando almacenamiento local.");
    }
} catch (e) {
    console.error("Error al conectar con Firebase:", e);
    useFirebase = false;
}

// Inicializar LocalStorage con datos por defecto si no existen
Object.values(STORAGE_KEYS).forEach(key => {
    if (!localStorage.getItem(key)) {
        localStorage.setItem(key, JSON.stringify([]));
    }
});

// Guardar y notificar cambios locales
function guardarLocal(key, datos) {
    localStorage.setItem(key, JSON.stringify(datos));
}

function obtenerLocal(key) {
    const raw = localStorage.getItem(key);
    try {
        return raw ? JSON.parse(raw) : [];
    } catch(e) {
        return [];
    }
}

// ADAPTADOR PÚBLICO DE PERSISTENCIA
window.db = {
    isNubeActiva() {
        return useFirebase;
    },
    setCurrentUser(user) {
        dbCurrentUser = user;
    },
    getCurrentUser() {
        return dbCurrentUser;
    },

    // Suscripción en Tiempo Real
    suscribir(coleccion, callback) {
        if (!listeners[coleccion]) return;
        listeners[coleccion].push(callback);

        if (useFirebase && firestoreDb) {
            // Suscribirse a Firestore
            let query = firestoreDb.collection(coleccion);
            
            // Ordenamientos por defecto para colecciones sociales
            if (coleccion === 'posts') {
                query = query.orderBy('timestamp', 'desc');
            } else if (coleccion === 'comments') {
                query = query.orderBy('timestamp', 'asc');
            } else if (coleccion === 'livestreams') {
                query = query.orderBy('active', 'desc').orderBy('timestamp', 'desc');
            }

            query.onSnapshot(snapshot => {
                const list = [];
                snapshot.forEach(doc => {
                    list.push({ id: doc.id, ...doc.data() });
                });
                
                // Actualizar LocalStorage de respaldo
                const localKey = STORAGE_KEYS[coleccion.toUpperCase()];
                if (localKey) {
                    guardarLocal(localKey, list);
                }
                
                notificarCambio(coleccion, list);
            }, err => {
                console.error(`Error en listener de Firestore para ${coleccion}:`, err);
                // Si falla, responder con local
                const localKey = STORAGE_KEYS[coleccion.toUpperCase()];
                if (localKey) callback(obtenerLocal(localKey));
            });
        } else {
            // Responder inmediatamente con almacenamiento local
            const localKey = STORAGE_KEYS[coleccion.toUpperCase()];
            if (localKey) callback(obtenerLocal(localKey));
        }
    },

    // --- ACCIONES SOCIALES: MURO ---
    async agregarPost(post) {
        const postData = {
            ...post,
            timestamp: firebase.firestore.FieldValue.serverTimestamp() || new Date().toISOString(),
            likes: []
        };

        if (useFirebase && firestoreDb) {
            await firestoreDb.collection('posts').add(postData);
        } else {
            const list = obtenerLocal(STORAGE_KEYS.POSTS);
            postData.id = 'local_' + Date.now();
            postData.timestamp = new Date().toISOString();
            list.unshift(postData);
            guardarLocal(STORAGE_KEYS.POSTS, list);
            notificarCambio('posts', list);
        }
    },

    async toggleLikePost(postId, userId) {
        if (useFirebase && firestoreDb) {
            const docRef = firestoreDb.collection('posts').doc(postId);
            await firestoreDb.runTransaction(async transaction => {
                const doc = await transaction.get(docRef);
                if (!doc.exists) return;
                
                const data = doc.data();
                let likes = data.likes || [];
                if (likes.includes(userId)) {
                    likes = likes.filter(id => id !== userId);
                } else {
                    likes.push(userId);
                }
                transaction.update(docRef, { likes });
            });
        } else {
            const list = obtenerLocal(STORAGE_KEYS.POSTS);
            const idx = list.findIndex(p => p.id === postId);
            if (idx !== -1) {
                let likes = list[idx].likes || [];
                if (likes.includes(userId)) {
                    likes = likes.filter(id => id !== userId);
                } else {
                    likes.push(userId);
                }
                list[idx].likes = likes;
                guardarLocal(STORAGE_KEYS.POSTS, list);
                notificarCambio('posts', list);
            }
        }
    },

    async eliminarPost(postId) {
        if (useFirebase && firestoreDb) {
            await firestoreDb.collection('posts').doc(postId).delete();
        } else {
            let list = obtenerLocal(STORAGE_KEYS.POSTS);
            list = list.filter(p => p.id !== postId);
            guardarLocal(STORAGE_KEYS.POSTS, list);
            notificarCambio('posts', list);
        }
    },

    // --- ACCIONES SOCIALES: COMENTARIOS ---
    async agregarComentario(comment) {
        const commentData = {
            ...comment,
            timestamp: firebase.firestore.FieldValue.serverTimestamp() || new Date().toISOString()
        };

        if (useFirebase && firestoreDb) {
            await firestoreDb.collection('comments').add(commentData);
        } else {
            const list = obtenerLocal(STORAGE_KEYS.COMMENTS);
            commentData.id = 'local_' + Date.now();
            commentData.timestamp = new Date().toISOString();
            list.push(commentData);
            guardarLocal(STORAGE_KEYS.COMMENTS, list);
            notificarCambio('comments', list);
        }
    },

    // --- ACCIONES SOCIALES: EN VIVO ---
    async iniciarTransmision(liveData) {
        const stream = {
            ...liveData,
            active: true,
            timestamp: firebase.firestore.FieldValue.serverTimestamp() || new Date().toISOString()
        };

        if (useFirebase && firestoreDb) {
            const doc = await firestoreDb.collection('livestreams').add(stream);
            return doc.id;
        } else {
            const list = obtenerLocal(STORAGE_KEYS.LIVESTREAMS);
            stream.id = 'local_' + Date.now();
            stream.timestamp = new Date().toISOString();
            list.unshift(stream);
            guardarLocal(STORAGE_KEYS.LIVESTREAMS, list);
            notificarCambio('livestreams', list);
            return stream.id;
        }
    },

    async terminarTransmision(streamId) {
        if (useFirebase && firestoreDb) {
            await firestoreDb.collection('livestreams').doc(streamId).update({ active: false });
        } else {
            const list = obtenerLocal(STORAGE_KEYS.LIVESTREAMS);
            const idx = list.findIndex(s => s.id === streamId);
            if (idx !== -1) {
                list[idx].active = false;
                guardarLocal(STORAGE_KEYS.LIVESTREAMS, list);
                notificarCambio('livestreams', list);
            }
        }
    },

    // --- RENDER DE INTEGRANTES (PANINI MODEL UPDATES) ---
    async actualizarDatosPaniniAlumno(alumnoId, datosPanini) {
        if (useFirebase && firestoreDb) {
            await firestoreDb.collection('alumnos').doc(alumnoId).update(datosPanini);
        } else {
            const list = obtenerLocal(STORAGE_KEYS.ALUMNOS);
            const idx = list.findIndex(a => a.id === alumnoId);
            if (idx !== -1) {
                list[idx] = { ...list[idx], ...datosPanini };
                guardarLocal(STORAGE_KEYS.ALUMNOS, list);
                notificarCambio('alumnos', list);
            }
        }
    }
};
