/**
 * app.js - Lógica interactiva para Club Jaguares Atlético River
 * Integración de comunidad, Panini y reproductor en vivo.
 */

// Superadmins definidos
const SUPER_ADMINS = ['omar850413@gmail.com'];

const state = {
    currentUser: null,
    isAdmin: false,
    sedes: [],
    alumnos: [],
    categorias: [],
    asistencias: [],
    posts: [],
    comments: [],
    livestreams: [],
    
    // Vista activa
    activeView: 'muro',
    // Filtro de categoría panini activo
    activePaniniCategoriaId: null,
    // Transmisión activa actual
    activeStreamId: null
};

// --- CICLO DE VIDA Y INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    inicializarAuthListener();
});

function inicializarAuthListener() {
    if (typeof firebase !== 'undefined') {
        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                state.currentUser = user;
                state.isAdmin = SUPER_ADMINS.includes(user.email.toLowerCase());
                window.db.setCurrentUser(user);
                
                // Mostrar UI principal
                document.getElementById('auth-overlay').classList.remove('active');
                
                // Habilitar botón de iniciar stream si es administrador
                if (state.isAdmin) {
                    const btnTrigger = document.getElementById('btn-iniciar-stream-trigger');
                    if (btnTrigger) btnTrigger.style.display = 'inline-flex';
                }
                
                suscribirColeccionesJaguares();
            } else {
                state.currentUser = null;
                state.isAdmin = false;
                window.db.setCurrentUser(null);
                document.getElementById('auth-overlay').classList.add('active');
            }
        });
    }
}

// --- AUTENTICACIÓN ---
let isRegisterMode = false;

function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    const submitBtn = document.getElementById('auth-submit-btn');
    const toggleBtn = document.getElementById('auth-toggle-btn');
    
    if (isRegisterMode) {
        submitBtn.innerText = "Registrarse y Acceder";
        toggleBtn.innerText = "¿Ya tienes cuenta? Inicia Sesión";
    } else {
        submitBtn.innerText = "Iniciar Sesión";
        toggleBtn.innerText = "¿No tienes cuenta? Regístrate aquí";
    }
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    
    try {
        if (isRegisterMode) {
            await firebase.auth().createUserWithEmailAndPassword(email, password);
            alert("Cuenta registrada con éxito. ¡Bienvenido al Club Jaguares!");
        } else {
            await firebase.auth().signInWithEmailAndPassword(email, password);
        }
    } catch (err) {
        alert("Error de autenticación: " + err.message);
    }
}

function handleLogout() {
    if (confirm("¿Seguro que deseas salir del portal?")) {
        firebase.auth().signOut();
    }
}

// --- CONEXIÓN DE BASE DE DATOS Y SUSCRIPCIONES ---
function suscribirColeccionesJaguares() {
    // Sincronizar Sede (Jaguares es soccer)
    window.db.suscribir('sedes', (sedesList) => {
        state.sedes = sedesList;
        // Buscaremos la sede Jaguares
        const jagSede = sedesList.find(s => s.rubro === 'soccer') || sedesList[0];
        if (jagSede) {
            state.activeSedeId = jagSede.id;
            actualizarFiltrosCategoriasPanini();
        }
    });

    window.db.suscribir('categorias', (cats) => {
        state.categorias = cats;
        actualizarFiltrosCategoriasPanini();
    });

    window.db.suscribir('alumnos', (alumnosList) => {
        state.alumnos = alumnosList;
        renderPaniniGrid();
    });

    // Suscripciones a colecciones sociales
    window.db.suscribir('posts', (postsList) => {
        state.posts = postsList;
        renderMuro();
    });

    window.db.suscribir('comments', (commentsList) => {
        state.comments = commentsList;
        // Volver a renderizar comentarios del post o chat de en vivo según corresponda
        renderComentariosPosts();
        renderChatLiveStream();
    });

    window.db.suscribir('livestreams', (streams) => {
        state.livestreams = streams;
        actualizarEstadoTransmision();
    });
}

// --- NAVEGACIÓN Y VISTAS ---
function switchView(viewName, element) {
    state.activeView = viewName;
    
    // Cambiar clases activas en paneles
    document.querySelectorAll('.view-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    document.getElementById(`view-${viewName}`).classList.add('active');
    
    // Cambiar clases activas en botones
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    element.classList.add('active');
}

// --- MURO SOCIAL ---
function abrirModalCrearPost() {
    document.getElementById('modal-crear-post').classList.add('active');
}

function cerrarModalCrearPost() {
    document.getElementById('modal-crear-post').classList.remove('active');
    document.getElementById('form-crear-post').reset();
}

async function guardarPost(e) {
    e.preventDefault();
    if (!state.currentUser) return;
    
    const text = document.getElementById('post-input-text').value.trim();
    const mediaUrl = document.getElementById('post-input-media').value.trim();
    
    const post = {
        autor: state.currentUser.email.split('@')[0].toUpperCase(),
        autorEmail: state.currentUser.email,
        texto: text,
        media: mediaUrl || null
    };
    
    try {
        await window.db.agregarPost(post);
        cerrarModalCrearPost();
    } catch(err) {
        console.error("Error al crear post:", err);
    }
}

function renderMuro() {
    const container = document.getElementById('posts-container');
    if (!container) return;
    container.innerHTML = "";
    
    if (state.posts.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 3rem 1.5rem; color: var(--text-muted);">
                <i class="fa-solid fa-comments" style="font-size: 2.5rem; color: var(--color-orange); margin-bottom: 0.75rem;"></i>
                <p>No hay publicaciones todavía. ¡Sé el primero en compartir algo!</p>
            </div>
        `;
        return;
    }
    
    state.posts.forEach(post => {
        const isLiked = post.likes && post.likes.includes(state.currentUser?.uid);
        const postCard = document.createElement('div');
        postCard.className = 'post-card';
        
        // Formatear fecha
        let fechaStr = "Hace un momento";
        if (post.timestamp) {
            const date = post.timestamp.toDate ? post.timestamp.toDate() : new Date(post.timestamp);
            fechaStr = date.toLocaleDateString() + " " + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }

        postCard.innerHTML = `
            <div class="post-header">
                <div class="post-user">
                    <div class="post-user-avatar">${post.autor[0]}</div>
                    <div class="post-user-info">
                        <h5>${post.autor}</h5>
                        <span>${fechaStr}</span>
                    </div>
                </div>
                ${(state.isAdmin || post.autorEmail === state.currentUser?.email) ? `
                    <button class="post-action-btn" onclick="eliminarPost('${post.id}')" style="color: var(--text-muted);">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                ` : ''}
            </div>
            <p class="post-text">${post.texto}</p>
            ${post.media ? `
                <div class="post-media">
                    ${post.media.match(/\.(mp4|webm|ogg)$/i) ? `
                        <video src="${post.media}" controls></video>
                    ` : `
                        <img src="${post.media}" alt="Post Media">
                    `}
                </div>
            ` : ''}
            <div class="post-footer">
                <button class="post-action-btn ${isLiked ? 'active' : ''}" onclick="toggleLikePost('${post.id}')">
                    <i class="fa-${isLiked ? 'solid' : 'regular'} fa-heart"></i> ${post.likes?.length || 0}
                </button>
                <button class="post-action-btn" onclick="toggleCommentsSection('${post.id}')">
                    <i class="fa-regular fa-comment"></i> Comentar
                </button>
            </div>
            
            <!-- Sección de comentarios -->
            <div class="comments-section" id="comments-${post.id}">
                <div class="comments-list" id="comments-list-${post.id}">
                    <!-- Comentarios dinámicos del post -->
                </div>
                <form onsubmit="agregarComentarioPost(event, '${post.id}')" class="comment-input-row">
                    <input type="text" placeholder="Escribe un comentario..." required class="form-control" style="font-size: 0.8rem; padding: 0.4rem 0.6rem;">
                    <button type="submit" class="btn btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;"><i class="fa-solid fa-paper-plane"></i></button>
                </form>
            </div>
        `;
        container.appendChild(postCard);
    });
    renderComentariosPosts();
}

async function toggleLikePost(postId) {
    if (!state.currentUser) return;
    try {
        await window.db.toggleLikePost(postId, state.currentUser.uid);
    } catch(err) {
        console.error(err);
    }
}

async function eliminarPost(postId) {
    if (confirm("¿Estás seguro de que quieres eliminar esta publicación?")) {
        try {
            await window.db.eliminarPost(postId);
        } catch(err) {
            console.error(err);
        }
    }
}

function toggleCommentsSection(postId) {
    const section = document.getElementById(`comments-${postId}`);
    if (section) section.classList.toggle('active');
}

async function agregarComentarioPost(e, postId) {
    e.preventDefault();
    if (!state.currentUser) return;
    
    const input = e.target.querySelector('input');
    const text = input.value.trim();
    if (!text) return;
    
    const comment = {
        postId: postId,
        autor: state.currentUser.email.split('@')[0].toUpperCase(),
        texto: text
    };
    
    try {
        await window.db.agregarComentario(comment);
        input.value = "";
    } catch(err) {
        console.error(err);
    }
}

function renderComentariosPosts() {
    state.posts.forEach(post => {
        const commentsListContainer = document.getElementById(`comments-list-${post.id}`);
        if (!commentsListContainer) return;
        commentsListContainer.innerHTML = "";
        
        const postComments = state.comments.filter(c => c.postId === post.id);
        postComments.forEach(comm => {
            const row = document.createElement('div');
            row.className = 'comment-row';
            row.innerHTML = `<strong>${comm.autor}:</strong> ${comm.texto}`;
            commentsListContainer.appendChild(row);
        });
    });
}

// --- ÁLBUM PANINI ---
function actualizarFiltrosCategoriasPanini() {
    const container = document.getElementById('panini-category-filters');
    if (!container) return;
    container.innerHTML = "";
    
    const cats = state.categorias.filter(c => c.sedeId === state.activeSedeId);
    
    if (cats.length === 0) return;
    
    // Si no hay categoría seleccionada, seleccionar la primera por defecto
    if (!state.activePaniniCategoriaId && cats.length > 0) {
        state.activePaniniCategoriaId = cats[0].id;
    }
    
    cats.forEach((c, index) => {
        const pill = document.createElement('button');
        pill.type = "button";
        pill.className = `category-pill ${state.activePaniniCategoriaId === c.id ? 'active' : ''}`;
        pill.innerText = c.nombre;
        pill.onclick = () => {
            state.activePaniniCategoriaId = c.id;
            actualizarFiltrosCategoriasPanini();
            renderPaniniGrid();
        };
        container.appendChild(pill);
    });
}

function renderPaniniGrid() {
    const grid = document.getElementById('panini-cards-grid');
    if (!grid) return;
    grid.innerHTML = "";
    
    if (!state.activePaniniCategoriaId) {
        grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">Selecciona una categoría para ver los jugadores.</p>`;
        return;
    }
    
    const cat = state.categorias.find(c => c.id === state.activePaniniCategoriaId);
    if (!cat) return;
    
    // Filtrar alumnos que pertenezcan al rango de nacimiento de la categoría activa
    const alumnosFiltrados = state.alumnos.filter(alu => {
        if (alu.sedeId !== state.activeSedeId) return false;
        if (!alu.fechaNacimiento) return false;
        const anioNac = parseInt(alu.fechaNacimiento.split('-')[0], 10);
        return anioNac >= cat.anioInicio && anioNac <= cat.anioFin;
    });
    
    if (alumnosFiltrados.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--text-muted);">
                <i class="fa-solid fa-users" style="font-size: 2rem; margin-bottom: 0.5rem; color: var(--color-orange);"></i>
                <p>No hay integrantes registrados en este rango de edad.</p>
            </div>
        `;
        return;
    }
    
    alumnosFiltrados.forEach((alu, idx) => {
        const card = document.createElement('div');
        card.className = "panini-card";
        
        const photoUrl = alu.fotoUrl || "";
        const apodo = alu.apodo || "Jaguar";
        const posicion = alu.posicion || "Jugador";
        const camiseta = alu.camiseta || "--";
        
        card.innerHTML = `
            <div class="panini-card-header">
                <span class="panini-number">#${idx + 1}</span>
                <img src="https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=50" class="panini-logo">
            </div>
            <div class="panini-photo-frame">
                ${photoUrl ? `
                    <img src="${photoUrl}" class="panini-photo" alt="${alu.nombre}">
                ` : `
                    <i class="fa-solid fa-user-ninja panini-photo-placeholder"></i>
                `}
            </div>
            <div class="panini-info">
                <h6 class="panini-name">${alu.nombre.split(' ')[0]}</h6>
                <div class="panini-subtext">
                    <span>${posicion}</span>
                    <span>${apodo}</span>
                    <span>${camiseta !== '--' ? `N°${camiseta}` : ''}</span>
                </div>
            </div>
            ${state.isAdmin ? `
                <button onclick="abrirModalEditarPanini('${alu.id}', '${apodo}', '${posicion}', '${camiseta}', '${photoUrl}')" style="position: absolute; bottom: 5px; right: 5px; background: rgba(0,0,0,0.6); color: #fff; border: none; border-radius: 4px; padding: 0.2rem 0.4rem; font-size: 0.65rem; cursor: pointer; z-index: 10;">
                    <i class="fa-solid fa-edit"></i>
                </button>
            ` : ''}
        `;
        grid.appendChild(card);
    });
}

function abrirModalEditarPanini(id, apodo, posicion, camiseta, fotoUrl) {
    document.getElementById('edit-panini-id').value = id;
    document.getElementById('edit-panini-apodo').value = apodo === 'Jaguar' ? '' : apodo;
    document.getElementById('edit-panini-posicion').value = posicion === 'Jugador' ? 'Delantero' : posicion;
    document.getElementById('edit-panini-camiseta').value = camiseta === '--' ? '' : camiseta;
    document.getElementById('edit-panini-foto').value = fotoUrl;
    
    document.getElementById('modal-editar-panini').classList.add('active');
}

async function guardarDatosPanini(e) {
    e.preventDefault();
    const id = document.getElementById('edit-panini-id').value;
    const apodo = document.getElementById('edit-panini-apodo').value.trim();
    const posicion = document.getElementById('edit-panini-posicion').value;
    const camiseta = parseInt(document.getElementById('edit-panini-camiseta').value, 10);
    const fotoUrl = document.getElementById('edit-panini-foto').value.trim();
    
    try {
        await window.db.actualizarDatosPaniniAlumno(id, {
            apodo: apodo || 'Jaguar',
            posicion,
            camiseta: isNaN(camiseta) ? '--' : camiseta,
            fotoUrl
        });
        closeModal('modal-editar-panini');
        renderPaniniGrid();
    } catch(err) {
        console.error(err);
    }
}

// --- LIVE STREAMING Y CHAT ---
function abrirModalIniciarStream() {
    document.getElementById('modal-iniciar-stream').classList.add('active');
}

async function guardarNuevaTransmision(e) {
    e.preventDefault();
    const titulo = document.getElementById('stream-titulo').value.trim();
    const url = document.getElementById('stream-url').value.trim();
    
    try {
        await window.db.iniciarTransmision({
            titulo,
            url,
            autor: state.currentUser?.email || "Admin"
        });
        closeModal('modal-iniciar-stream');
        document.getElementById('form-iniciar-stream').reset();
    } catch(err) {
        console.error(err);
    }
}

function actualizarEstadoTransmision() {
    const activeStream = state.livestreams.find(s => s.active === true);
    
    const placeholder = document.getElementById('stream-inactive-placeholder');
    const activeView = document.getElementById('stream-active-view');
    const iframe = document.getElementById('stream-iframe');
    
    if (activeStream) {
        state.activeStreamId = activeStream.id;
        placeholder.style.display = 'none';
        activeView.style.display = 'block';
        
        // Si la URL es diferente, cargarla en el iframe
        if (iframe.src !== activeStream.url) {
            iframe.src = activeStream.url;
        }
        
        // Agregar botón de detener stream si es administrador
        const existingStopBtn = document.getElementById('btn-detener-stream');
        if (state.isAdmin && !existingStopBtn) {
            const stopBtn = document.createElement('button');
            stopBtn.id = 'btn-detener-stream';
            stopBtn.className = 'btn btn-primary';
            stopBtn.style.position = 'absolute';
            stopBtn.style.top = '10px';
            stopBtn.style.right = '10px';
            stopBtn.style.zIndex = '10';
            stopBtn.style.background = '#ef4444';
            stopBtn.innerHTML = `<i class="fa-solid fa-stop"></i> Detener En Vivo`;
            stopBtn.onclick = () => detenerStream(activeStream.id);
            document.getElementById('video-stream-container').appendChild(stopBtn);
        }
    } else {
        state.activeStreamId = null;
        placeholder.style.display = 'flex';
        activeView.style.display = 'none';
        iframe.src = "";
        
        const stopBtn = document.getElementById('btn-detener-stream');
        if (stopBtn) stopBtn.remove();
    }
    renderChatLiveStream();
}

async function detenerStream(id) {
    if (confirm("¿Deseas dar por terminado este partido en vivo?")) {
        try {
            await window.db.terminarTransmision(id);
        } catch(err) {
            console.error(err);
        }
    }
}

async function enviarMensajeChat(e) {
    e.preventDefault();
    if (!state.currentUser) return;
    
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    
    const message = {
        postId: state.activeStreamId || 'general_chat',
        autor: state.currentUser.email.split('@')[0].toUpperCase(),
        texto: text
    };
    
    try {
        await window.db.agregarComentario(message);
        input.value = "";
    } catch(err) {
        console.error(err);
    }
}

function renderChatLiveStream() {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;
    container.innerHTML = "";
    
    const targetChatId = state.activeStreamId || 'general_chat';
    const streamComments = state.comments.filter(c => c.postId === targetChatId);
    
    streamComments.forEach(comm => {
        const row = document.createElement('div');
        row.className = 'comment-row';
        row.innerHTML = `<strong>${comm.autor}:</strong> ${comm.texto}`;
        container.appendChild(row);
    });
    
    // Auto scroll al fondo del chat
    container.scrollTop = container.scrollHeight;
}

// --- UTILIDADES ---
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function obtenerFechaActualStr() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}
