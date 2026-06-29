/**
 * app.js - Lógica de Negocio Corporativa de la Academia & Gym Riveroll v3.0
 * Control de navegación en cascada, dictado por voz, cámara web en vivo,
 * ciclo de cobros en tres estados con abonos morados, y WhatsApp dinámico.
 */

// --- AUTO-LIMPIEZA DE CACHÉ PWA PARA CORREGIR ACCESO EN MÓVILES ---
if (localStorage.getItem('riveroll_pwa_version_clean') !== '26.0') {
    localStorage.setItem('riveroll_pwa_version_clean', '26.0');
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            for (let registration of registrations) {
                registration.unregister();
            }
        });
    }
    if ('caches' in window) {
        caches.keys().then(names => {
            for (let name of names) caches.delete(name);
        });
    }
    setTimeout(() => {
        window.location.reload();
    }, 500);
}


// --- ESTADO GLOBAL DE LA APLICACIÓN ---
const state = {
    activeSedeId: null,      // Sede actualmente seleccionada en drill-down
    activeSedeSubView: 'miembros', // Sub-vista interna: 'miembros' o 'contabilidad'
    sedes: [],
    alumnos: [],
    transacciones: [],
    partidos: [],
    base64Foto: '',
    base64SedeLogo: '',
    trabajadores: [],
    actividades: [],
    tempReporteTipo: 'planilla',
    categorias: [],
    asistencias: [],
    activeCategoriaId: null,
    
    // Variables temporales para el flujo del modal de Abonos
    tempAbonoMiembroId: null,
    tempAbonoCampo: null
};

// Instancias globales para el control multimedia
let streamCamara = null;
let speechRecognitionInstancia = null;

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    history.replaceState({ view: 'dashboard' }, "");
    // Inicializar el Listener de Autenticación de Firebase
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            const userEmail = user.email.toLowerCase();
            const isSuperAdmin = SUPER_ADMINS.includes(userEmail);
            
            if (isSuperAdmin) {
                state.currentUser = user;
                state.isSuperAdmin = true;
                window.db.setCurrentUser(user);
                
                document.getElementById('auth-overlay').style.display = 'none';
                
                const userApprovalBtn = document.getElementById('btn-aceptar-usuarios');
                if (userApprovalBtn) {
                    userApprovalBtn.style.display = 'inline-flex';
                }
                
                suscribirColecciones();
                actualizarBotonEstadoNube();
                
                // Guardar/actualizar datos del superadmin de forma silenciosa en segundo plano
                if (window.db && window.db.isNubeActiva() && firebase.apps.length > 0) {
                    const firestoreDb = firebase.firestore();
                    firestoreDb.collection("users").doc(user.uid).set({
                        name: user.email.split('@')[0].toUpperCase(),
                        email: user.email,
                        approved: true,
                        isAdmin: true
                    }).catch(err => console.log("Error silencioso al registrar superadmin:", err));
                }
                return;
            }
            
            if (window.db && window.db.isNubeActiva() && firebase.apps.length > 0) {
                const firestoreDb = firebase.firestore();
                firestoreDb.collection("users").doc(user.uid).get().then(doc => {
                    let currentUserData;
                    if (doc.exists) {
                        currentUserData = doc.data();
                        let needsUpdate = false;
                        let updatedFields = {};
                        
                        if (currentUserData.isAdmin !== isSuperAdmin) {
                            currentUserData.isAdmin = isSuperAdmin;
                            updatedFields.isAdmin = isSuperAdmin;
                            needsUpdate = true;
                        }
                        if (isSuperAdmin && currentUserData.approved !== true) {
                            currentUserData.approved = true;
                            updatedFields.approved = true;
                            needsUpdate = true;
                        }
                        if (currentUserData.approved === undefined) {
                            currentUserData.approved = true;
                            updatedFields.approved = true;
                            needsUpdate = true;
                        }
                        
                        if (needsUpdate) {
                            firestoreDb.collection("users").doc(user.uid).update(updatedFields).catch(err => console.log(err));
                        }
                        
                        if (currentUserData.approved !== true) {
                            firebase.auth().signOut();
                            alert("TU CUENTA ESTÁ PENDIENTE DE APROBACIÓN POR EL ADMINISTRADOR.");
                            return;
                        }
                    } else {
                        // Si el documento de usuario no existe en Firestore pero el login es exitoso,
                        // significa que es un usuario ya registrado previamente (anterior al sistema de aprobación).
                        // Se le auto-aprueba para no bloquear su acceso y conservar su academia/gimnasio.
                        currentUserData = {
                            name: user.email.split('@')[0].toUpperCase(),
                            email: user.email,
                            approved: true,
                            isAdmin: isSuperAdmin
                        };
                        firestoreDb.collection("users").doc(user.uid).set(currentUserData).catch(err => console.log(err));
                    }
                    
                    state.currentUser = user;
                    state.isSuperAdmin = isSuperAdmin;
                    window.db.setCurrentUser(user);
                    
                    document.getElementById('auth-overlay').style.display = 'none';
                    
                    const userApprovalBtn = document.getElementById('btn-aceptar-usuarios');
                    if (userApprovalBtn) {
                        userApprovalBtn.style.display = isSuperAdmin ? 'inline-flex' : 'none';
                    }
                    
                    suscribirColecciones();
                    actualizarBotonEstadoNube();
                }).catch(err => {
                    firebase.auth().signOut();
                    alert("ERROR AL CARGAR DATOS DE USUARIO: " + err.message);
                });
            } else {
                state.currentUser = user;
                state.isSuperAdmin = isSuperAdmin;
                window.db.setCurrentUser(user);
                document.getElementById('auth-overlay').style.display = 'none';
                
                const userApprovalBtn = document.getElementById('btn-aceptar-usuarios');
                if (userApprovalBtn) {
                    userApprovalBtn.style.display = isSuperAdmin ? 'inline-flex' : 'none';
                }
                
                suscribirColecciones();
                actualizarBotonEstadoNube();
            }
        } else {
            state.currentUser = null;
            state.isSuperAdmin = false;
            state.isSubscribed = false;
            window.db.setCurrentUser(null);
            
            state.sedes = [];
            state.alumnos = [];
            state.transacciones = [];
            state.activeSedeId = null;
            
            document.getElementById('auth-overlay').style.display = 'flex';
            switchAuthTab('login');
            
            const userApprovalBtn = document.getElementById('btn-aceptar-usuarios');
            if (userApprovalBtn) {
                userApprovalBtn.style.display = 'none';
            }
        }
    });
});

function suscribirColecciones() {
    if (!state.isSubscribed) {
        window.db.suscribir('sedes', (nuevasSedes) => {
            state.sedes = nuevasSedes;
            renderSedes();
            actualizarSelectoresFiltros();
            if (state.activeSedeId) actualizarEncabezadoDetalleSede();
            intentarRestaurarNavegacion();
        });

        window.db.suscribir('alumnos', (nuevosAlumnos) => {
            state.alumnos = nuevosAlumnos;
            if (state.activeSedeId) {
                renderAlumnosDrilldown();
                renderPlanillaCobrosSede();
                if (state.activeSedeSubView === 'categorias' && state.activeCategoriaId) {
                    cargarPaseAsistenciaCategoria();
                } else if (state.activeSedeSubView === 'asistencias-gym') {
                    cargarPaseAsistenciaGym();
                }
            }
        });

        window.db.suscribir('transacciones', (nuevasTransacciones) => {
            state.transacciones = nuevasTransacciones;
            if (state.activeSedeId) {
                renderResumenFinanzas();
                renderEgresosLista();
            }
        });

        window.db.suscribir('trabajadores', (nuevosTrabajadores) => {
            state.trabajadores = nuevosTrabajadores;
            if (state.activeSedeId) {
                renderTrabajadoresGrid();
                actualizarSelectoresTrabajadores();
            }
        });

        window.db.suscribir('actividades', (nuevasActividades) => {
            state.actividades = nuevasActividades;
            if (state.activeSedeId) {
                renderActividadesRollTable();
            }
        });

        window.db.suscribir('categorias', (nuevasCategorias) => {
            state.categorias = nuevasCategorias;
            if (state.activeSedeId) {
                renderCategoriasSidebar();
                if (state.activeCategoriaId) cargarPaseAsistenciaCategoria();
            }
            intentarRestaurarNavegacion();
        });

        window.db.suscribir('asistencias', (nuevasAsistencias) => {
            state.asistencias = nuevasAsistencias;
            if (state.activeSedeId) {
                if (state.activeSedeSubView === 'categorias' && state.activeCategoriaId) {
                    cargarPaseAsistenciaCategoria();
                } else if (state.activeSedeSubView === 'asistencias-gym') {
                    cargarPaseAsistenciaGym();
                }
            }
        });
        
        state.isSubscribed = true;
    }
}

let restorationAttempted = false;

function intentarRestaurarNavegacion() {
    if (restorationAttempted) return;
    
    const savedSedeId = localStorage.getItem('riveroll_active_sede_id');
    if (!savedSedeId) return; 
    
    const nuevasSedes = state.sedes || [];
    if (nuevasSedes.length === 0 || !nuevasSedes.some(s => s.id === savedSedeId)) return;
    
    const savedSubView = localStorage.getItem('riveroll_active_sub_view');
    const savedCatId = localStorage.getItem('riveroll_active_categoria_id');
    
    if (savedSubView === 'categorias' && savedCatId && savedCatId !== 'todas') {
        const nuevasCats = state.categorias || [];
        if (nuevasCats.length === 0 || !nuevasCats.some(c => c.id === savedCatId)) return;
    }
    
    // Todos los datos requeridos ya se encuentran en el estado en memoria! Procedemos a restaurar la vista completa
    restorationAttempted = true;
    ejecutarIrADetalleSinPush(savedSedeId, true);
    
    if (savedSubView) {
        switchSedeView(savedSubView);
        if (savedSubView === 'categorias' && savedCatId) {
            seleccionarCategoria(savedCatId);
        }
    }
}

// --- ACTUALIZAR BOTÓN ESTADO DE LA NUBE ---
function actualizarBotonEstadoNube() {
    const btn = document.getElementById('btn-estado-nube');
    if (!btn) return;
    const activa = window.db.isNubeActiva();
    
    if (activa) {
        btn.innerHTML = `<i class="fa-solid fa-cloud" style="color: var(--color-primary);"></i> Nube Activa`;
        btn.classList.add('glow-soccer');
        btn.style.borderColor = 'var(--color-primary)';
    } else {
        btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Conectar Nube`;
        btn.classList.remove('glow-soccer');
        btn.style.borderColor = 'var(--border-color)';
    }
}

// --- RENDERIZACIÓN DE SEDES (DASHBOARD INICIAL) ---
function renderSedes() {
    const grid = document.getElementById('sedes-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    if (state.sedes.length === 0) {
        grid.innerHTML = `<div class="glass-panel" style="text-align: center; color: var(--color-text-muted); width: 100%; grid-column: 1 / -1;">No hay centros o sedes registradas. Haz clic en "Agregar Centro" para comenzar.</div>`;
        return;
    }
    
    state.sedes.forEach(sede => {
        const card = document.createElement('div');
        const esSoccer = sede.rubro === 'soccer';
        card.className = `student-card ${esSoccer ? 'border-soccer' : 'border-gym'}`;
        card.style.cursor = 'pointer';
        
        // Logotipo personalizado o default
        const logoUrl = sede.logo || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'><rect width='60' height='60' fill='%231f2937'/><path d='M30 15c8.2 0 15 6.8 15 15s-6.8 15-15 15-15-6.8-15-15 6.8-15 15-15z' fill='%239CA3AF'/></svg>";
        
        card.innerHTML = `
            <div onclick="irADetalleSede('${sede.id}')">
                <div class="sede-card-header">
                    <img src="${logoUrl}" alt="${sede.nombre}" class="sede-logo-preview">
                    <div>
                        <h3 style="font-family: var(--font-title); font-size: 1.3rem; font-weight: 800; color: #fff;">${sede.nombre}</h3>
                        <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: ${esSoccer ? 'var(--color-primary)' : 'var(--color-gym)'};">
                            <i class="fa-solid ${esSoccer ? 'fa-futbol' : 'fa-dumbbell'}"></i> ${esSoccer ? 'Academia de Fútbol' : 'Gimnasio'}
                        </span>
                    </div>
                </div>
                <div style="background: rgba(0,0,0,0.15); padding: 0.75rem; border-radius: 12px; font-size: 0.85rem; margin-bottom: 1rem;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
                        <span style="color: var(--color-text-muted);">Inscripción:</span>
                        <strong style="color: #fff;">$${sede.inscripcion}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
                        <span style="color: var(--color-text-muted);">Mensualidad:</span>
                        <strong style="color: #fff;">$${sede.mensualidad}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 0.35rem; margin-top: 0.35rem;">
                        <span style="color: var(--color-text-muted);">Día de Corte:</span>
                        <strong style="color: var(--color-accent);">${formatearFechaSencilla(sede.fechaCorte)}</strong>
                    </div>
                </div>
            </div>
            <div style="display: flex; gap: 0.5rem; z-index: 10;">
                <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); openEditSedeModal('${sede.id}')" style="flex: 1; padding: 0.4rem; font-size: 0.8rem;">
                    <i class="fa-solid fa-pen-to-square"></i> Editar
                </button>
                <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); eliminarSede('${sede.id}')" style="flex: 1; padding: 0.4rem; font-size: 0.8rem; background: rgba(239, 68, 68, 0.15); color: var(--color-danger); border: 1px solid rgba(239, 68, 68, 0.2);">
                    <i class="fa-solid fa-trash-can"></i> Eliminar
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

// --- NAVEGACIÓN EN CASCADA (DRILL-DOWN) ---
function irADetalleSede(sedeId) {
    if (!history.state || history.state.view !== 'detalle' || history.state.sedeId !== sedeId) {
        history.pushState({ view: 'detalle', sedeId: sedeId }, "");
    }
    ejecutarIrADetalleSinPush(sedeId);
}

function ejecutarIrADetalleSinPush(sedeId, isRestoring = false) {
    state.activeSedeId = sedeId;
    
    if (!isRestoring) {
        state.activeSedeSubView = 'miembros';
        // Guardar estado en localStorage
        localStorage.setItem('riveroll_active_sede_id', sedeId);
        localStorage.setItem('riveroll_active_sub_view', 'miembros');
        localStorage.removeItem('riveroll_active_categoria_id');
        restorationAttempted = false;
    }
    
    const btnMiembros = document.getElementById('subtab-miembros-btn');
    const btnConta = document.getElementById('subtab-contabilidad-btn');
    const btnTotales = document.getElementById('subtab-totales-btn');
    const btnTrabajadores = document.getElementById('subtab-trabajadores-btn');
    const btnCats = document.getElementById('subtab-categorias-btn');
    const btnAsistGym = document.getElementById('subtab-asistencias-gym-btn');
    
    const sede = state.sedes.find(s => s.id === sedeId);
    if (!sede) return;
    
    const esSoccer = sede.rubro === 'soccer';
    
    btnMiembros.className = `sub-tab-btn active ${esSoccer ? 'soccer' : 'gym'}`;
    btnConta.className = `sub-tab-btn ${esSoccer ? 'soccer' : 'gym'}`;
    if (btnTotales) btnTotales.className = `sub-tab-btn ${esSoccer ? 'soccer' : 'gym'}`;
    if (btnTrabajadores) btnTrabajadores.className = `sub-tab-btn ${esSoccer ? 'soccer' : 'gym'}`;
    if (btnCats) {
        btnCats.className = `sub-tab-btn ${esSoccer ? 'soccer' : 'gym'}`;
        btnCats.style.display = esSoccer ? 'inline-flex' : 'none';
    }
    if (btnAsistGym) {
        btnAsistGym.className = `sub-tab-btn ${esSoccer ? 'soccer' : 'gym'}`;
        btnAsistGym.style.display = !esSoccer ? 'inline-flex' : 'none';
    }
    
    actualizarEncabezadoDetalleSede();
    
    document.getElementById('panel-dashboard').classList.remove('active');
    document.getElementById('panel-detalle-sede').classList.add('active');
    
    switchSedeView('miembros');
}

function volverAlDashboard() {
    if (history.state && history.state.view === 'detalle') {
        history.back();
    } else {
        ejecutarVolverAlDashboardSinPush();
    }
}

function ejecutarVolverAlDashboardSinPush() {
    state.activeSedeId = null;
    apagarCamara();
    apagarCamaraTrabajador();
    
    // Limpiar estado en localStorage
    localStorage.removeItem('riveroll_active_sede_id');
    localStorage.removeItem('riveroll_active_sub_view');
    localStorage.removeItem('riveroll_active_categoria_id');
    document.body.classList.remove('focus-attendance-mode');
    restorationAttempted = false;
    
    document.getElementById('panel-detalle-sede').classList.remove('active');
    document.getElementById('panel-dashboard').classList.add('active');
    renderSedes();
}

function actualizarEncabezadoDetalleSede() {
    const sede = state.sedes.find(s => s.id === state.activeSedeId);
    if (!sede) return;
    
    const esSoccer = sede.rubro === 'soccer';
    
    // Elementos del encabezado
    document.getElementById('detalle-sede-nombre').innerText = sede.nombre;
    document.getElementById('detalle-sede-rubro-corte').innerHTML = `
        Rubro: <strong>${esSoccer ? 'Academia de Fútbol' : 'Gimnasio'}</strong> | 
        Fecha de Corte: <strong style="color: var(--color-accent);">${formatearFechaSencilla(sede.fechaCorte)}</strong>
    `;
    
    const logoImg = document.getElementById('detalle-sede-logo');
    logoImg.src = sede.logo || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'><rect width='60' height='60' fill='%231f2937'/></svg>";
    
    // Generar botón de acción dinámico
    const accionesContainer = document.getElementById('detalle-sede-acciones');
    accionesContainer.innerHTML = esSoccer 
        ? `<button class="btn btn-primary" onclick="openAddAlumnoModal()"><i class="fa-solid fa-user-plus"></i> Agregar Alumno</button>`
        : `<button class="btn btn-gym" onclick="openAddAlumnoModal()"><i class="fa-solid fa-dumbbell"></i> Agregar Suscriptor</button>`;
}

function switchSedeView(viewId) {
    try {
        state.activeSedeSubView = viewId;
        localStorage.setItem('riveroll_active_sub_view', viewId);
        
        const btnMiembros = document.getElementById('subtab-miembros-btn');
        const btnConta = document.getElementById('subtab-contabilidad-btn');
        const btnTotales = document.getElementById('subtab-totales-btn');
        const btnTrabajadores = document.getElementById('subtab-trabajadores-btn');
        const btnCats = document.getElementById('subtab-categorias-btn');
        const btnAsistGym = document.getElementById('subtab-asistencias-gym-btn');
        
        const sede = state.sedes.find(s => s.id === state.activeSedeId);
        const esSoccer = sede ? sede.rubro === 'soccer' : true;
        
        if (btnMiembros) btnMiembros.className = `sub-tab-btn ${esSoccer ? 'soccer' : 'gym'}`;
        if (btnConta) btnConta.className = `sub-tab-btn ${esSoccer ? 'soccer' : 'gym'}`;
        if (btnTotales) btnTotales.className = `sub-tab-btn ${esSoccer ? 'soccer' : 'gym'}`;
        if (btnTrabajadores) btnTrabajadores.className = `sub-tab-btn ${esSoccer ? 'soccer' : 'gym'}`;
        if (btnCats) btnCats.className = `sub-tab-btn ${esSoccer ? 'soccer' : 'gym'}`;
        if (btnAsistGym) btnAsistGym.className = `sub-tab-btn ${esSoccer ? 'soccer' : 'gym'}`;
        
        const btnBack = document.getElementById('subtab-back-btn');
        if (viewId === 'miembros' || viewId === 'miembros-btn') {
            if (btnBack) btnBack.style.display = 'none';
            if (btnMiembros) btnMiembros.style.display = 'inline-flex';
            if (btnConta) btnConta.style.display = esSoccer ? 'inline-flex' : 'none';
            if (btnTotales) btnTotales.style.display = 'inline-flex';
            if (btnTrabajadores) btnTrabajadores.style.display = 'inline-flex';
            if (btnCats) btnCats.style.display = esSoccer ? 'inline-flex' : 'none';
            if (btnAsistGym) btnAsistGym.style.display = !esSoccer ? 'inline-flex' : 'none';
        } else {
            if (btnMiembros) btnMiembros.style.display = 'none';
            if (btnConta) btnConta.style.display = 'none';
            if (btnTotales) btnTotales.style.display = 'none';
            if (btnTrabajadores) btnTrabajadores.style.display = 'none';
            if (btnCats) btnCats.style.display = 'none';
            if (btnAsistGym) btnAsistGym.style.display = 'none';
            
            if (btnBack) btnBack.style.display = 'inline-flex';
            if (viewId === 'contabilidad' && btnConta) btnConta.style.display = 'inline-flex';
            if (viewId === 'totales' && btnTotales) btnTotales.style.display = 'inline-flex';
            if (viewId === 'trabajadores' && btnTrabajadores) btnTrabajadores.style.display = 'inline-flex';
            if (viewId === 'categorias' && btnCats) btnCats.style.display = 'inline-flex';
            if (viewId === 'asistencias-gym' && btnAsistGym) btnAsistGym.style.display = 'inline-flex';
        }
        
        const pMiembros = document.getElementById('sub-panel-miembros');
        const pConta = document.getElementById('sub-panel-contabilidad');
        const pTotales = document.getElementById('sub-panel-totales');
        const pTrabajadores = document.getElementById('sub-panel-trabajadores');
        const pCats = document.getElementById('sub-panel-categorias');
        const pAsistGym = document.getElementById('sub-panel-asistencias-gym');
        
        if (pMiembros) pMiembros.style.display = 'none';
        if (pConta) pConta.style.display = 'none';
        if (pTotales) pTotales.style.display = 'none';
        if (pTrabajadores) pTrabajadores.style.display = 'none';
        if (pCats) pCats.style.display = 'none';
        if (pAsistGym) pAsistGym.style.display = 'none';
        
        if (viewId === 'miembros') {
            if (btnMiembros) btnMiembros.className = `sub-tab-btn active ${esSoccer ? 'soccer' : 'gym'}`;
            if (pMiembros) pMiembros.style.display = 'block';
            renderAlumnosDrilldown();
        } else if (viewId === 'contabilidad') {
            if (btnConta) btnConta.className = `sub-tab-btn active ${esSoccer ? 'soccer' : 'gym'}`;
            if (pConta) pConta.style.display = 'block';
            renderPlanillaCobrosSede();
        } else if (viewId === 'totales') {
            if (btnTotales) btnTotales.className = `sub-tab-btn active ${esSoccer ? 'soccer' : 'gym'}`;
            if (pTotales) pTotales.style.display = 'block';
            renderResumenFinanzas();
            renderEgresosLista();
        } else if (viewId === 'trabajadores') {
            if (btnTrabajadores) btnTrabajadores.className = `sub-tab-btn active ${esSoccer ? 'soccer' : 'gym'}`;
            if (pTrabajadores) pTrabajadores.style.display = 'block';
            renderTrabajadoresGrid();
        } else if (viewId === 'categorias') {
            if (btnCats) btnCats.className = `sub-tab-btn active ${esSoccer ? 'soccer' : 'gym'}`;
            if (pCats) pCats.style.display = 'block';
            
            // Ajustar vista inicial móvil/escritorio
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
                document.getElementById('categorias-sidebar-col').style.display = 'block';
                document.getElementById('categorias-detalle-container').style.display = 'none';
                document.getElementById('btn-volver-categorias').style.display = 'none';
                const subTabs = document.querySelector('.sub-tabs-container');
                if (subTabs) subTabs.style.display = 'flex';
            } else {
                document.getElementById('categorias-sidebar-col').style.display = 'block';
                document.getElementById('categorias-detalle-container').style.display = 'block';
                document.getElementById('btn-volver-categorias').style.display = 'none';
            }
            
            renderCategoriasSidebar();
        } else if (viewId === 'asistencias-gym') {
            if (btnAsistGym) btnAsistGym.className = `sub-tab-btn active ${esSoccer ? 'soccer' : 'gym'}`;
            if (pAsistGym) pAsistGym.style.display = 'block';
            
            // Forzar fecha actual y activar modo enfoque
            document.body.classList.add('focus-attendance-mode');
            const btnVolverGym = document.getElementById('btn-volver-gym');
            if (btnVolverGym) btnVolverGym.style.display = 'block';
            
            const dateInput = document.getElementById('asistencias-fecha-select-gym');
            if (dateInput && !dateInput.value) {
                dateInput.value = obtenerFechaActualStr();
            }
            cargarPaseAsistenciaGym();
        }
    } catch (e) {
        alert("ERROR en switchSedeView: " + e.message + "\nStack: " + e.stack);
        console.error("Error en switchSedeView:", e);
    }
}

// --- RENDER DE MIEMBROS DE LA SEDE ACTIVA (ALINEACIÓN EN LISTA COLAPSABLE) ---
function renderAlumnosDrilldown() {
    const container = document.getElementById('miembros-lista-drilldown');
    if (!container) return;
    container.innerHTML = '';
    
    const sede = state.sedes.find(s => s.id === state.activeSedeId);
    if (!sede) return;
    
    const esSoccer = sede.rubro === 'soccer';
    const miembrosSede = state.alumnos.filter(a => a.sedeId === state.activeSedeId);
    
    if (miembrosSede.length === 0) {
        container.innerHTML = `<div class="glass-panel" style="text-align: center; color: var(--color-text-muted); width: 100%;">No hay integrantes registrados en este centro aún. Haz clic en el botón superior para agregar.</div>`;
        return;
    }
    
    // Contenedor principal de la alineación
    const listWrapper = document.createElement('div');
    listWrapper.className = 'alignment-list-container';
    container.appendChild(listWrapper);
    
    miembrosSede.forEach((miembro, index) => {
        const row = document.createElement('div');
        row.className = 'alignment-row';
        row.id = `roster-row-${miembro.id}`;
        
        const avatarHtml = miembro.foto 
            ? `<img src="${miembro.foto}" class="small-avatar-circle">`
            : `<div class="small-avatar-placeholder"><i class="fa-solid ${esSoccer ? 'fa-user' : 'fa-dumbbell'}"></i></div>`;
            
        row.innerHTML = `
            <div class="alignment-header-click" onclick="toggleRosterRow('${miembro.id}')">
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <span style="font-weight: bold; color: var(--color-accent); font-family: monospace; font-size: 1.1rem;">${(index + 1).toString().padStart(2, '0')}</span>
                    <h3>${miembro.nombre}</h3>
                    ${esSoccer ? `<span style="font-size: 0.75rem; background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 0.15rem 0.5rem; border-radius: 6px; font-weight: bold; margin-right: 0.5rem;">Cat. ${miembro.categoria}</span>` : ''}
                    ${esSoccer && miembro.camiseta ? `<span style="font-size: 0.75rem; background: rgba(205, 162, 80, 0.15); color: var(--color-accent); padding: 0.15rem 0.5rem; border-radius: 6px; font-weight: bold;"><i class="fa-solid fa-shirt"></i> #${miembro.camiseta}</span>` : ''}
                </div>
                <i class="fa-solid fa-chevron-down alignment-arrow-icon"></i>
            </div>
            
            <div class="alignment-body-details">
                <div class="alignment-body-content">
                    ${avatarHtml}
                    <div class="details-grid-text">
                        <p><strong>Fecha de Nacimiento:</strong> ${miembro.fechaNacimiento ? formatearFechaSencilla(miembro.fechaNacimiento) : 'No registrada'}</p>
                        ${esSoccer 
                            ? `<p><strong>Teléfono Tutor:</strong> <a href="https://wa.me/${(miembro.tutorTelefono || '').startsWith('52') ? miembro.tutorTelefono : '52' + (miembro.tutorTelefono || '')}" target="_blank" style="color: #38bdf8; text-decoration: none;"><i class="fa-brands fa-whatsapp"></i> ${miembro.tutorTelefono || ''}</a></p>
                               <p><strong>Tutor/Responsable:</strong> ${miembro.tutorNombre || '-'}</p>
                               <p><strong>Rama:</strong> ${miembro.rama || 'Mixto'}</p>
                               ${miembro.camiseta ? `<p><strong>Número de Camiseta:</strong> #${miembro.camiseta}</p>` : ''}`
                            : `<p><strong>Teléfono Suscriptor:</strong> <a href="https://wa.me/${(miembro.telefonoSuscriptor || '').startsWith('52') ? miembro.telefonoSuscriptor : '52' + (miembro.telefonoSuscriptor || '')}" target="_blank" style="color: #38bdf8; text-decoration: none;"><i class="fa-brands fa-whatsapp"></i> ${miembro.telefonoSuscriptor || ''}</a></p>
                               <p><strong>Contacto de Emergencia:</strong> ${miembro.emergenciaNombre || '-'} (${miembro.emergenciaTelefono || '-'})</p>`
                        }
                    </div>
                    
                    <div style="display: flex; gap: 0.5rem; align-self: center;">
                        <button class="btn btn-outline btn-sm" onclick="openEditAlumnoModal('${miembro.id}')" style="padding: 0.5rem 1rem; border-color: #38bdf8; color: #38bdf8;">
                            <i class="fa-solid fa-pen-to-square"></i> Editar
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="eliminarMiembro('${miembro.id}')" style="background: rgba(239, 68, 68, 0.15); color: var(--color-danger); border: 1px solid rgba(239, 68, 68, 0.2); padding: 0.5rem;">
                            <i class="fa-solid fa-trash-can"></i> Eliminar
                        </button>
                    </div>
                </div>
            </div>
        `;
        listWrapper.appendChild(row);
    });
}

function toggleRosterRow(miembroId) {
    const row = document.getElementById(`roster-row-${miembroId}`);
    if (!row) return;
    
    const isOpen = row.classList.contains('open');
    
    // Cerrar todas las demás filas primero para efecto acordeón limpio
    document.querySelectorAll('.alignment-row').forEach(r => r.classList.remove('open'));
    
    if (!isOpen) {
        row.classList.add('open');
    }
}

// --- PLANILLA DE COBROS Y CONTABILIDAD ---
function renderPlanillaCobrosSede() {
    const tbody = document.getElementById('planilla-sede-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const sede = state.sedes.find(s => s.id === state.activeSedeId);
    if (!sede) return;
    
    const miembrosSede = state.alumnos.filter(a => a.sedeId === state.activeSedeId);
    
    if (miembrosSede.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">No hay registros contables en este centro.</td></tr>`;
        return;
    }
    
    miembrosSede.forEach(miembro => {
        const tr = document.createElement('tr');
        
        // Obtener estatus y monto de abonos
        const pagoInsc = obtenerEstatusPagoObjeto(miembro.pagos.inscripcion);
        const pagoMayo = obtenerEstatusPagoObjeto(miembro.pagos.mensualidades['2026-05']);
        const pagoJunio = obtenerEstatusPagoObjeto(miembro.pagos.mensualidades['2026-06']);
        
        tr.innerHTML = `
            <td style="font-weight: 600; color: #fff;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    ${miembro.foto ? `<img src="${miembro.foto}" style="width: 35px; height: 35px; border-radius: 50%; object-fit: cover;">` : `<div style="width: 35px; height: 35px; border-radius: 50%; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: var(--color-text-muted); border: 1px dashed rgba(255,255,255,0.1);"><i class="fa-solid ${sede.rubro === 'soccer' ? 'fa-user' : 'fa-dumbbell'}"></i></div>`}
                    <div>
                        <span>${miembro.nombre}</span>
                        ${sede.rubro === 'soccer' ? `<small style="display: block; color: var(--color-accent); font-weight: 700;">Cat. ${miembro.categoria}</small>` : ''}
                    </div>
                </div>
            </td>
            <td>
                <button class="planilla-payment-btn ${pagoInsc.status}" 
                        onclick="handlePaymentSingleClick('${miembro.id}', 'inscripcion')" 
                        ondblclick="handlePaymentDoubleClick('${miembro.id}', 'inscripcion')" 
                        title="Un clic: Pagar/Adeudar | Doble clic: Abonar">
                    ${pagoInsc.texto}
                </button>
            </td>
            <td>
                <button class="planilla-payment-btn ${pagoMayo.status}" 
                        onclick="handlePaymentSingleClick('${miembro.id}', '2026-05')" 
                        ondblclick="handlePaymentDoubleClick('${miembro.id}', '2026-05')" 
                        title="Un clic: Pagar/Adeudar | Doble clic: Abonar">
                    ${pagoMayo.texto}
                </button>
            </td>
            <td>
                <button class="planilla-payment-btn ${pagoJunio.status}" 
                        onclick="handlePaymentSingleClick('${miembro.id}', '2026-06')" 
                        ondblclick="handlePaymentDoubleClick('${miembro.id}', '2026-06')" 
                        title="Un clic: Pagar/Adeudar | Doble clic: Abonar">
                    ${pagoJunio.texto}
                </button>
            </td>
            <td style="text-align: center; white-space: nowrap;">
                <button class="btn btn-outline btn-sm" onclick="enviarRecordatorioWhatsApp('${miembro.id}')" title="Cobrar Adeudos por WhatsApp" style="margin-right: 0.35rem; border-color: var(--color-danger); color: var(--color-danger); background: rgba(239, 68, 68, 0.02);">
                    <i class="fa-brands fa-whatsapp"></i> Cobrar
                </button>
                <button class="btn btn-outline btn-sm" onclick="enviarComprobanteWhatsApp('${miembro.id}')" title="Enviar Comprobante de Pago por WhatsApp" style="border-color: #38bdf8; color: #38bdf8; background: rgba(56, 189, 248, 0.02);">
                    <i class="fa-solid fa-receipt"></i> Ticket
                </button>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
}

// Convertidor para estructurar el objeto de pago y su texto dinámico
function obtenerEstatusPagoObjeto(pagoCampo) {
    if (typeof pagoCampo === 'string') {
        if (pagoCampo === 'pagado') return { status: 'pagado', texto: 'pagado' };
        if (pagoCampo === 'adeudo') return { status: 'no-pagado', texto: 'adeudar' };
        return { status: 'no-pagado', texto: 'no pagado' };
    }
    if (pagoCampo && typeof pagoCampo === 'object') {
        if (pagoCampo.status === 'pagado') return { status: 'pagado', texto: 'pagado' };
        if (pagoCampo.status === 'abonado') return { status: 'abonado', texto: `Abono $${pagoCampo.abono}` };
        return { status: 'no-pagado', texto: 'no pagado' };
    }
    return { status: 'no-pagado', texto: 'no pagado' };
}

// Variables para prevenir conflicto entre un clic y doble clic
let clickTimer = null;

// --- CLIC SENCILLO: PASA A VERDE (PAGADO) O ROJO (PENDIENTE) ---
function handlePaymentSingleClick(miembroId, campo) {
    if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
        return; // Detener flujo para dejar que actúe el Double Click
    }
    
    clickTimer = setTimeout(async () => {
        clickTimer = null;
        
        const miembro = state.alumnos.find(a => a.id === miembroId);
        if (!miembro) return;
        
        const Sede = state.sedes.find(s => s.id === miembro.sedeId);
        if (!Sede) return;
        
        const costoSede = campo === 'inscripcion' ? Sede.inscripcion : Sede.mensualidad;
        let actualObj = campo === 'inscripcion' ? miembro.pagos.inscripcion : miembro.pagos.mensualidades[campo];
        
        // Normalizar
        if (typeof actualObj === 'string') {
            actualObj = { status: actualObj === 'pagado' ? 'pagado' : 'no-pagado', abono: 0 };
        }
        if (!actualObj) actualObj = { status: 'no-pagado', abono: 0 };
        
        if (actualObj.status === 'no-pagado' || actualObj.status === 'abonado') {
            // Cambiar a Pagado (Verde)
            actualObj.status = 'pagado';
            actualObj.abono = 0;
            
            // Agregar transacción
            await window.db.agregarTransaccion({
                id: 't_' + Date.now(),
                tipo: 'ingreso',
                categoria: campo === 'inscripcion' ? 'Inscripción' : 'Mensualidad',
                monto: costoSede,
                descripcion: `Pago completo ${campo === 'inscripcion' ? 'inscripción' : 'mensualidad ' + obtenerNombreMes(campo)} de ${miembro.nombre} (${Sede.nombre})`,
                fecha: obtenerFechaActualStr(),
                sedeId: Sede.id
            });
            
            await guardarPagoModificado(miembroId, campo, actualObj);
            
            // Mostrar ticket dinámico
            mostrarTicketPago(miembroId, campo, costoSede);
        } else {
            // Si estaba pagado, regresar a No Pagado (Rojo)
            actualObj.status = 'no-pagado';
            actualObj.abono = 0;
            await guardarPagoModificado(miembroId, campo, actualObj);
        }
    }, 250); // Pequeño delay de tolerancia para doble clic
}

// --- DOBLE CLIC: PASA A MORADO (ABONADO) ---
function handlePaymentDoubleClick(miembroId, campo) {
    if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
    }
    
    state.tempAbonoMiembroId = miembroId;
    state.tempAbonoCampo = campo;
    
    document.getElementById('abono-monto-input').value = '';
    document.getElementById('modal-abono-monto').classList.add('active');
}
// --- TICKET GENERADOR DE COMPROBANTES DE PAGO Y VISTA PREVIA DE PDF ---
async function guardarAbonoMonto() {
    const monto = parseFloat(document.getElementById('abono-monto-input').value) || 0;
    if (monto <= 0) {
        alert("Ingresa un monto válido.");
        return;
    }
    
    const miembroId = state.tempAbonoMiembroId;
    const campo = state.tempAbonoCampo;
    const miembro = state.alumnos.find(a => a.id === miembroId);
    if (!miembro) return;
    
    const Sede = state.sedes.find(s => s.id === miembro.sedeId);
    const costoSede = campo === 'inscripcion' ? Sede.inscripcion : Sede.mensualidad;
    
    if (monto >= costoSede) {
        alert(`El monto del abono es igual o mayor a la cuota ($${costoSede}). Se registrará como Pagado en su totalidad.`);
        const pagoObj = { status: 'pagado', abono: 0 };
        
        await window.db.agregarTransaccion({
            id: 't_' + Date.now(),
            tipo: 'ingreso',
            categoria: campo === 'inscripcion' ? 'Inscripción' : 'Mensualidad',
            monto: costoSede,
            descripcion: `Pago completo ${campo === 'inscripcion' ? 'inscripción' : 'mensualidad ' + obtenerNombreMes(campo)} de ${miembro.nombre} (${Sede.nombre})`,
            fecha: obtenerFechaActualStr(),
            sedeId: Sede.id
        });
        
        await guardarPagoModificado(miembroId, campo, pagoObj);
        mostrarTicketPago(miembroId, campo, costoSede);
    } else {
        const pagoObj = { status: 'abonado', abono: monto };
        
        await window.db.agregarTransaccion({
            id: 't_' + Date.now(),
            tipo: 'ingreso',
            categoria: 'Abono',
            monto: monto,
            descripcion: `Abono parcial para ${campo === 'inscripcion' ? 'inscripción' : 'mensualidad ' + obtenerNombreMes(campo)} de ${miembro.nombre} ($${monto} abonado de $${costoSede})`,
            fecha: obtenerFechaActualStr(),
            sedeId: Sede.id
        });
        
        await guardarPagoModificado(miembroId, campo, pagoObj);
        mostrarTicketPago(miembroId, campo, monto);
    }
    
    closeModal('modal-abono-monto');
}

async function guardarPagoModificado(miembroId, campo, pagoObjeto) {
    const miembro = state.alumnos.find(a => a.id === miembroId);
    if (!miembro) return;
    
    if (campo === 'inscripcion') {
        miembro.pagos.inscripcion = pagoObjeto;
    } else {
        miembro.pagos.mensualidades[campo] = pagoObjeto;
    }
    
    await window.db.actualizarAlumno(miembroId, miembro);
}

// --- COMANDO DE VOZ PARA DICTADO DE NOMBRE ---
function activarDictadoVoz(inputId) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("El dictado por voz no es soportado por tu navegador. Se recomienda Google Chrome o Safari.");
        return;
    }
    
    const inputEl = document.getElementById(inputId);
    const micBtn = document.getElementById('btn-mic-dictado');
    
    if (speechRecognitionInstancia) {
        speechRecognitionInstancia.stop();
        return;
    }
    
    speechRecognitionInstancia = new SpeechRecognition();
    speechRecognitionInstancia.lang = 'es-MX';
    speechRecognitionInstancia.interimResults = false;
    speechRecognitionInstancia.maxAlternatives = 1;
    
    speechRecognitionInstancia.onstart = () => {
        micBtn.classList.add('listening');
    };
    
    speechRecognitionInstancia.onresult = (event) => {
        const transcripcion = event.results[0][0].transcript;
        // Limpiar el texto dictado y colocar primera letra en mayúscula
        const limpio = transcripcion.replace(/[.]/g, '');
        inputEl.value = limpio.charAt(0).toUpperCase() + limpio.slice(1);
    };
    
    speechRecognitionInstancia.onerror = (e) => {
        console.error("Error en Speech Recognition:", e);
        micBtn.classList.remove('listening');
    };
    
    speechRecognitionInstancia.onend = () => {
        micBtn.classList.remove('listening');
        speechRecognitionInstancia = null;
    };
    
    speechRecognitionInstancia.start();
}

// --- TOMA DE FOTOGRAFÍA EN VIVO (CÁMARA) ---
async function activarCamaraEnVivo() {
    const video = document.getElementById('video-stream');
    const areaTrabajo = document.getElementById('camera-work-area');
    
    try {
        streamCamara = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" },
            audio: false
        });
        
        video.srcObject = streamCamara;
        areaTrabajo.style.display = 'block';
    } catch (err) {
        console.error("Error al acceder a la cámara:", err);
        alert("No se pudo acceder a la cámara del dispositivo. Asegúrate de otorgar los permisos necesarios.");
    }
}

function capturarFotoCamara() {
    const video = document.getElementById('video-stream');
    const canvas = document.getElementById('hidden-canvas');
    const preview = document.getElementById('upload-preview');
    
    if (!video.srcObject) return;
    
    // Ajustar dimensiones del canvas al video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Capturar la imagen actual en el canvas
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Obtener en base64
    const dataUrl = canvas.toDataURL('image/jpeg');
    state.base64Foto = dataUrl;
    preview.src = dataUrl;
    
    apagarCamara();
}

function apagarCamara() {
    const video = document.getElementById('video-stream');
    const areaTrabajo = document.getElementById('camera-work-area');
    
    if (streamCamara) {
        streamCamara.getTracks().forEach(track => track.stop());
        streamCamara = null;
    }
    
    video.srcObject = null;
    areaTrabajo.style.display = 'none';
}

// --- RECORDATORIO DE COBRO DE WHATSAPP ---
function enviarRecordatorioWhatsApp(miembroId) {
    const miembro = state.alumnos.find(a => a.id === miembroId);
    if (!miembro) return;
    
    const Sede = state.sedes.find(s => s.id === miembro.sedeId);
    if (!Sede) return;
    
    const esSoccer = Sede.rubro === 'soccer';
    const cuotaMensual = Sede.mensualidad;
    const cuotaInscripcion = Sede.inscripcion;
    
    // Calcular deudas reales y detallar el mensaje
    let deudaInscripcion = 0;
    let deudasMeses = [];
    let desgloseText = [];
    let totalAdeudo = 0;
    
    // 1. Inscripción
    const pInsc = miembro.pagos.inscripcion;
    if (typeof pInsc === 'string') {
        if (pInsc === 'adeudo' || pInsc === 'pendiente') {
            deudaInscripcion = cuotaInscripcion;
            totalAdeudo += cuotaInscripcion;
            desgloseText.push(`Inscripción: $${cuotaInscripcion}`);
        }
    } else if (pInsc && typeof pInsc === 'object') {
        if (pInsc.status === 'no-pagado') {
            deudaInscripcion = cuotaInscripcion;
            totalAdeudo += cuotaInscripcion;
            desgloseText.push(`Inscripción: $${cuotaInscripcion}`);
        } else if (pInsc.status === 'abonado') {
            const restante = cuotaInscripcion - pInsc.abono;
            deudaInscripcion = restante;
            totalAdeudo += restante;
            desgloseText.push(`Restante Inscripción (Abonó $${pInsc.abono}): $${restante}`);
        }
    }
    
    // 2. Mensualidades
    Object.entries(miembro.pagos.mensualidades).forEach(([mes, valor]) => {
        let status = 'pendiente';
        let abono = 0;
        
        if (typeof valor === 'string') {
            status = valor === 'pagado' ? 'pagado' : 'no-pagado';
        } else if (valor && typeof valor === 'object') {
            status = valor.status;
            abono = valor.abono || 0;
        }
        
        if (status === 'no-pagado' || status === 'pendiente') {
            totalAdeudo += cuotaMensual;
            desgloseText.push(`Mensualidad ${obtenerNombreMes(mes)}: $${cuotaMensual}`);
        } else if (status === 'abonado') {
            const restante = cuotaMensual - abono;
            totalAdeudo += restante;
            desgloseText.push(`Restante ${obtenerNombreMes(mes)} (Abonó $${abono}): $${restante}`);
        }
    });
    
    if (totalAdeudo === 0) {
        alert("El miembro se encuentra al corriente de sus pagos.");
        return;
    }
    
    let mensaje = '';
    let targetPhone = '';
    
    if (Sede.rubro !== 'soccer') {
        targetPhone = miembro.telefonoSuscriptor || '';
        mensaje = `Hola ${miembro.nombre}, le saludamos de *${Sede.nombre}*. Le recordamos amablemente el estado administrativo de su suscripción.\n\n*Detalle de Adeudos:*\n${desgloseText.map(t => `• ${t}`).join('\n')}\n\n*Total Pendiente: $${totalAdeudo}*\n\nLe solicitamos su valioso apoyo para realizar el pago correspondiente. ¡Muchas gracias por su confianza de siempre!`;
    } else {
        targetPhone = miembro.tutorTelefono || '';
        mensaje = `Hola ${miembro.tutorNombre}, le saludamos de *${Sede.nombre}*. Le recordamos amablemente el estado administrativo de su hijo *${miembro.nombre}*.\n\n*Detalle de Adeudos:*\n${desgloseText.map(t => `• ${t}`).join('\n')}\n\n*Total Pendiente: $${totalAdeudo}*\n\nLe solicitamos su valioso apoyo para realizar el pago correspondiente mediante transferencia. ¡Muchas gracias por su confianza de siempre!`;
    }
    
    const formattedPhone = targetPhone.startsWith('52') ? targetPhone : `52${targetPhone}`;
    window.open(`https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(mensaje)}`, '_blank');
}

// --- MÉTODOS DE ESCRITURA Y FORMULARIOS ---
async function saveAlumno(event) {
    event.preventDefault();
    
    const id = document.getElementById('edit-alumno-id').value;
    const nombre = document.getElementById('alumno-nombre').value;
    const fechaNacimiento = document.getElementById('alumno-nacimiento').value;
    const categoriaId = document.getElementById('alumno-categoria').value;
    let categoria = '';
    const Sede = state.sedes.find(s => s.id === state.activeSedeId);
    if (Sede && Sede.rubro === 'gym') {
        categoria = 'Adulto / Gym';
    } else {
        if (categoriaId === 'auto') {
            categoria = fechaNacimiento ? fechaNacimiento.split('-')[0] : '';
        } else {
            const cat = state.categorias.find(c => c.id === categoriaId);
            categoria = cat ? cat.nombre : '';
        }
    }
    const tutorNombre = document.getElementById('alumno-tutor').value;
    const tutorTelefono = document.getElementById('alumno-telefono').value;
    const camiseta = document.getElementById('alumno-camiseta') ? document.getElementById('alumno-camiseta').value : '';
    
    // Campos de Gimnasio
    const telefonoSuscriptor = document.getElementById('alumno-telefono-suscriptor') ? document.getElementById('alumno-telefono-suscriptor').value : '';
    const emergenciaNombre = document.getElementById('alumno-emergencia-nombre') ? document.getElementById('alumno-emergencia-nombre').value : '';
    const emergenciaTelefono = document.getElementById('alumno-emergencia-telefono') ? document.getElementById('alumno-emergencia-telefono').value : '';
    const horario = document.getElementById('alumno-horario') ? document.getElementById('alumno-horario').value.trim() : '';
    
    // Obtener rama activa de fútbol si existe
    let rama = 'Mixto';
    const radios = document.getElementsByName('alumno-rama');
    if (radios && radios.length > 0) {
        for (let i = 0; i < radios.length; i++) {
            if (radios[i].checked) {
                rama = radios[i].value;
                break;
            }
        }
    }
    
    const nuevoMiembro = {
        nombre,
        sedeId: state.activeSedeId,
        fechaNacimiento,
        categoria,
        categoriaId,
        tutorNombre,
        tutorTelefono,
        rama,
        camiseta,
        
        // Gimnasio
        telefonoSuscriptor,
        emergenciaNombre,
        emergenciaTelefono,
        horario,
        
        foto: state.base64Foto,
        pagos: id ? state.alumnos.find(a => a.id === id).pagos : {
            inscripcion: { status: 'no-pagado', abono: 0 },
            mensualidades: {
                '2026-05': { status: 'no-pagado', abono: 0 },
                '2026-06': { status: 'no-pagado', abono: 0 }
            }
        }
    };
    
    if (id) {
        await window.db.actualizarAlumno(id, nuevoMiembro);
    } else {
        await window.db.agregarAlumno(nuevoMiembro);
    }
    
    // Resetear formulario
    document.getElementById('form-alumno').reset();
    state.base64Foto = '';
    document.getElementById('upload-preview').src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'><rect width='80' height='80' fill='%23111827'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='10' fill='%236B7280'>Vista Previa</text></svg>";
    
    closeModal('modal-alumno');
}

async function eliminarMiembro(id) {
    const miembro = state.alumnos.find(a => a.id === id);
    if (!miembro) return;
    
    if (confirm(`¿Estás seguro de eliminar permanentemente a "${miembro.nombre}"?`)) {
        await window.db.eliminarAlumno(id);
    }
}

async function saveSede(event) {
    event.preventDefault();
    
    const id = document.getElementById('edit-sede-id').value;
    const nombre = document.getElementById('sede-nombre').value;
    const rubroSelect = document.getElementById('sede-rubro').value;
    const rubroOtro = document.getElementById('sede-rubro-otro').value;
    const rubro = rubroSelect === 'otro' ? rubroOtro : rubroSelect;
    
    const inscripcion = parseFloat(document.getElementById('sede-inscripcion').value);
    const mensualidad = parseFloat(document.getElementById('sede-mensualidad').value);
    const fechaCorte = document.getElementById('sede-corte').value;
    
    const datosSede = {
        nombre,
        rubro,
        inscripcion,
        mensualidad,
        fechaCorte,
        logo: state.base64SedeLogo
    };
    
    try {
        if (id) {
            await window.db.actualizarSede(id, datosSede);
        } else {
            await window.db.agregarSede(datosSede);
        }
        
        document.getElementById('form-sede').reset();
        document.getElementById('group-rubro-otro').style.display = 'none';
        state.base64SedeLogo = '';
        document.getElementById('sede-upload-preview').src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'><rect width='60' height='60' fill='%23111827'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='8' fill='%236B7280'>Logo</text></svg>";
        closeModal('modal-sede');
    } catch (err) {
        alert("Error al guardar sede: " + err.message);
    }
}

async function eliminarSede(id) {
    const Sede = state.sedes.find(s => s.id === id);
    if (!Sede) return;
    
    const miembrosVinculados = state.alumnos.filter(a => a.sedeId === id);
    if (miembrosVinculados.length > 0) {
        if (!confirm(`Advertencia: Hay ${miembrosVinculados.length} miembros vinculados a la sede "${Sede.nombre}". Si la eliminas, estos miembros quedarán sin sede asignada. ¿Deseas continuar con la eliminación de esta sede?`)) {
            return;
        }
    } else {
        if (!confirm(`¿Estás seguro de eliminar permanentemente la sede "${Sede.nombre}"?`)) {
            return;
        }
    }
    await window.db.eliminarSede(id);
    if (state.activeSedeId === id) volverAlDashboard();
}

// --- CONFIGURACIÓN DE BASE DE DATOS EN LA NUBE ---
function openConfigNubeModal() {
    const config = window.db.obtenerConfigActual();
    const errorDiv = document.getElementById('nube-mensaje-error');
    errorDiv.style.display = 'none';
    
    if (config) {
        document.getElementById('fb-apiKey').value = config.apiKey || '';
        document.getElementById('fb-authDomain').value = config.authDomain || '';
        document.getElementById('fb-projectId').value = config.projectId || '';
        document.getElementById('fb-storageBucket').value = config.storageBucket || '';
        document.getElementById('fb-messagingSenderId').value = config.messagingSenderId || '';
        document.getElementById('fb-appId').value = config.appId || '';
        document.getElementById('btn-desconectar-nube').style.display = 'block';
    } else {
        document.getElementById('form-config-nube').reset();
        document.getElementById('btn-desconectar-nube').style.display = 'none';
    }
    
    document.getElementById('modal-config-nube').classList.add('active');
}

function guardarConfigNube(event) {
    event.preventDefault();
    const errorDiv = document.getElementById('nube-mensaje-error');
    errorDiv.style.display = 'none';
    
    const config = {
        apiKey: document.getElementById('fb-apiKey').value,
        authDomain: document.getElementById('fb-authDomain').value,
        projectId: document.getElementById('fb-projectId').value,
        storageBucket: document.getElementById('fb-storageBucket').value,
        messagingSenderId: document.getElementById('fb-messagingSenderId').value,
        appId: document.getElementById('fb-appId').value
    };
    
    try {
        window.db.conectarFirebase(config);
        closeModal('modal-config-nube');
        actualizarBotonEstadoNube();
        alert("¡Conexión establecida con Firebase Firestore!");
    } catch (err) {
        errorDiv.innerText = `Error al conectar: ${err.message}`;
        errorDiv.style.display = 'block';
    }
}

function desconectarBaseDeDatosNube() {
    if (confirm("¿Estás seguro de desconectarte de la nube y retornar al almacenamiento local?")) {
        window.db.desconectarFirebase();
        closeModal('modal-config-nube');
        actualizarBotonEstadoNube();
        alert("Desconectado. Operando de nuevo con almacenamiento local del navegador.");
    }
}

// --- AUXILIARES Y RENDER ---
function openAddSedeModal() {
    document.getElementById('modal-sede-title').innerText = "Registrar Nueva Sede / Negocio";
    document.getElementById('edit-sede-id').value = "";
    document.getElementById('form-sede').reset();
    document.getElementById('sede-corte').value = "1 al 5 de cada mes";
    document.getElementById('group-rubro-otro').style.display = 'none';
    document.getElementById('sede-rubro-otro').required = false;
    state.base64SedeLogo = '';
    document.getElementById('sede-upload-preview').src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'><rect width='60' height='60' fill='%23111827'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='8' fill='%236B7280'>Logo</text></svg>";
    document.getElementById('modal-sede').classList.add('active');
}

function openEditSedeModal(id) {
    const Sede = state.sedes.find(s => s.id === id);
    if (!Sede) return;
    
    document.getElementById('modal-sede-title').innerText = "Editar Sede / Negocio";
    document.getElementById('edit-sede-id').value = Sede.id;
    document.getElementById('sede-nombre').value = Sede.nombre;
    
    const selectRubro = document.getElementById('sede-rubro');
    const inputOtro = document.getElementById('sede-rubro-otro');
    const groupOtro = document.getElementById('group-rubro-otro');
    
    if (Sede.rubro === 'soccer' || Sede.rubro === 'gym') {
        selectRubro.value = Sede.rubro;
        groupOtro.style.display = 'none';
        inputOtro.required = false;
        inputOtro.value = '';
    } else {
        selectRubro.value = 'otro';
        groupOtro.style.display = 'block';
        inputOtro.required = true;
        inputOtro.value = Sede.rubro;
    }
    
    document.getElementById('sede-inscripcion').value = Sede.inscripcion;
    document.getElementById('sede-mensualidad').value = Sede.mensualidad;
    document.getElementById('sede-corte').value = Sede.fechaCorte || '1 al 5 de cada mes';
    
    state.base64SedeLogo = Sede.logo || '';
    document.getElementById('sede-upload-preview').src = Sede.logo || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'><rect width='60' height='60' fill='%23111827'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='8' fill='%236B7280'>Logo</text></svg>";
    
    document.getElementById('modal-sede').classList.add('active');
}

function toggleRubroOtro() {
    const rubro = document.getElementById('sede-rubro').value;
    const groupOtro = document.getElementById('group-rubro-otro');
    const inputOtro = document.getElementById('sede-rubro-otro');
    if (rubro === 'otro') {
        groupOtro.style.display = 'block';
        inputOtro.required = true;
    } else {
        groupOtro.style.display = 'none';
        inputOtro.required = false;
        inputOtro.value = '';
    }
}

function popularCategoriaSelect(currentVal = 'auto') {
    const select = document.getElementById('alumno-categoria');
    if (!select) return;
    
    const Sede = state.sedes.find(s => s.id === state.activeSedeId);
    if (Sede && Sede.rubro === 'gym') {
        select.innerHTML = '<option value="auto">Adulto / Gym</option>';
        select.value = 'auto';
        return;
    }
    
    const cats = state.categorias.filter(c => c.sedeId === state.activeSedeId);
    select.innerHTML = '<option value="auto">AUTOMÁTICA (SEGÚN EDAD)</option>';
    cats.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.innerText = c.nombre.toUpperCase();
        select.appendChild(opt);
    });
    
    select.value = currentVal || 'auto';
}

function openAddAlumnoModal() {
    const Sede = state.sedes.find(s => s.id === state.activeSedeId);
    if (!Sede) return;
    const esSoccer = Sede.rubro === 'soccer';
    
    popularCategoriaSelect('auto');
    
    document.getElementById('modal-alumno-title').innerText = esSoccer ? "Agregar Alumno (Fútbol)" : "Agregar Suscriptor (Gym)";
    document.getElementById('edit-alumno-id').value = "";
    document.getElementById('form-alumno').reset();
    state.base64Foto = '';
    document.getElementById('upload-preview').src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'><rect width='80' height='80' fill='%23111827'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='10' fill='%236B7280'>Vista Previa</text></svg>";
    
    // Adaptar campos visualmente según rubro
    if (esSoccer) {
        document.getElementById('group-futbol-extra').style.display = 'block';
        document.getElementById('group-tutor-fields').style.display = 'grid';
        document.getElementById('group-gimnasio-extra').style.display = 'none';
        
        document.getElementById('alumno-tutor').required = true;
        document.getElementById('alumno-telefono').required = true;
        document.getElementById('alumno-telefono-suscriptor').required = false;
        
        document.getElementById('alumno-nacimiento').required = true;
    } else {
        document.getElementById('group-futbol-extra').style.display = 'none';
        document.getElementById('group-tutor-fields').style.display = 'none';
        document.getElementById('group-gimnasio-extra').style.display = 'block';
        
        document.getElementById('alumno-tutor').required = false;
        document.getElementById('alumno-telefono').required = false;
        document.getElementById('alumno-telefono-suscriptor').required = true;
        
        document.getElementById('alumno-nacimiento').required = false;
    }
    
    document.getElementById('modal-alumno').classList.add('active');
    handleSedeChangeEnFormulario();
}

function openEditAlumnoModal(id) {
    const alumno = state.alumnos.find(a => a.id === id);
    if (!alumno) return;
    
    const Sede = state.sedes.find(s => s.id === state.activeSedeId);
    const esSoccer = Sede ? Sede.rubro === 'soccer' : true;
    
    popularCategoriaSelect(alumno.categoriaId || 'auto');
    
    document.getElementById('modal-alumno-title').innerText = esSoccer ? "Editar Alumno (Fútbol)" : "Editar Suscriptor (Gym)";
    document.getElementById('edit-alumno-id').value = alumno.id;
    document.getElementById('alumno-nombre').value = alumno.nombre;
    document.getElementById('alumno-nacimiento').value = alumno.fechaNacimiento;
    document.getElementById('alumno-tutor').value = alumno.tutorNombre;
    document.getElementById('alumno-telefono').value = alumno.tutorTelefono;
    
    if (esSoccer) {
        document.getElementById('group-futbol-extra').style.display = 'block';
        document.getElementById('group-tutor-fields').style.display = 'grid';
        document.getElementById('group-gimnasio-extra').style.display = 'none';
        
        document.getElementById('alumno-tutor').required = true;
        document.getElementById('alumno-telefono').required = true;
        document.getElementById('alumno-telefono-suscriptor').required = false;
        
        document.getElementById('alumno-tutor').value = alumno.tutorNombre || '';
        document.getElementById('alumno-telefono').value = alumno.tutorTelefono || '';
        document.getElementById('alumno-camiseta').value = alumno.camiseta || '';
        
        // Poner check al radio
        const radios = document.getElementsByName('alumno-rama');
        for (let i = 0; i < radios.length; i++) {
            if (radios[i].value === (alumno.rama || 'Mixto')) {
                radios[i].checked = true;
            }
        }
    } else {
        document.getElementById('group-futbol-extra').style.display = 'none';
        document.getElementById('group-tutor-fields').style.display = 'none';
        document.getElementById('group-gimnasio-extra').style.display = 'block';
        
        document.getElementById('alumno-tutor').required = false;
        document.getElementById('alumno-telefono').required = false;
        document.getElementById('alumno-telefono-suscriptor').required = true;
        
        document.getElementById('alumno-telefono-suscriptor').value = alumno.telefonoSuscriptor || '';
        document.getElementById('alumno-emergencia-nombre').value = alumno.emergenciaNombre || '';
        document.getElementById('alumno-emergencia-telefono').value = alumno.emergenciaTelefono || '';
        if (document.getElementById('alumno-horario')) {
            document.getElementById('alumno-horario').value = alumno.horario || '';
        }
    }
    
    state.base64Foto = alumno.foto || '';
    document.getElementById('upload-preview').src = alumno.foto || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'><rect width='80' height='80' fill='%23111827'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='10' fill='%236B7280'>Vista Previa</text></svg>";
    
    document.getElementById('modal-alumno').classList.add('active');
    handleSedeChangeEnFormulario();
}

function handleSedeChangeEnFormulario() {
    const Sede = state.sedes.find(s => s.id === state.activeSedeId);
    const nacInput = document.getElementById('alumno-nacimiento');
    const catInput = document.getElementById('alumno-categoria');
    
    if (Sede && Sede.rubro === 'gym') {
        if (nacInput) {
            nacInput.required = false;
        }
        if (catInput) {
            catInput.innerHTML = '<option value="auto">Adulto / Gym</option>';
            catInput.value = 'auto';
        }
    } else {
        if (nacInput) {
            nacInput.required = true;
        }
        calcularCategoriaAuto();
    }
}

function calcularCategoriaAuto() {
    const select = document.getElementById('alumno-categoria');
    if (select) {
        select.value = 'auto';
    }
}

function actualizarSelectoresFiltros() {
    // Mantener sincronía de categorías por si se abre otro modal en el futuro
}

function previewImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        state.base64Foto = e.target.result;
        document.getElementById('upload-preview').src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function previewSedeLogo(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        state.base64SedeLogo = e.target.result;
        document.getElementById('sede-upload-preview').src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function openModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) {
        el.classList.add('active');
        if (!history.state || history.state.modalId !== modalId) {
            history.pushState({ view: 'modal', modalId: modalId }, "");
        }
    }
}

function closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) {
        el.classList.remove('active');
        if (modalId === 'modal-alumno') {
            apagarCamara();
        }
        if (modalId === 'modal-trabajador') {
            apagarCamaraTrabajador();
        }
        if (history.state && history.state.view === 'modal' && history.state.modalId === modalId) {
            history.back();
        }
    }
}

window.addEventListener('popstate', (event) => {
    const activeModals = document.querySelectorAll('.modal-overlay.active');
    if (activeModals.length > 0) {
        activeModals.forEach(modal => {
            modal.classList.remove('active');
            if (modal.id === 'modal-alumno') apagarCamara();
            if (modal.id === 'modal-trabajador') apagarCamaraTrabajador();
        });
        return;
    }

    if (event.state) {
        if (event.state.view === 'dashboard') {
            ejecutarVolverAlDashboardSinPush();
        } else if (event.state.view === 'detalle') {
            ejecutarIrADetalleSinPush(event.state.sedeId);
        }
    } else {
        ejecutarVolverAlDashboardSinPush();
    }
});

function obtenerNombreMes(fechaStr) {
    const partes = fechaStr.split('-');
    if (partes.length < 2) return fechaStr;
    const mesNum = parseInt(partes[1]);
    const meses = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    return meses[mesNum - 1] || fechaStr;
}

function formatearFechaSencilla(fechaStr) {
    if (!fechaStr) return '-';
    const partes = fechaStr.split('-');
    if (partes.length < 3) return fechaStr;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function obtenerFechaActualStr() {
    const d = new Date();
    const anio = d.getFullYear();
    let mes = d.getMonth() + 1;
    let dia = d.getDate();
    if (mes < 10) mes = '0' + mes;
    if (dia < 10) dia = '0' + dia;
    return `${anio}-${mes}-${dia}`;
}

// --- LOGICA DE TICKET DIGITAL Y REPORTE DE IMPRESIÓN (PDF) ---
function mostrarTicketPago(miembroId, campo, monto) {
    const miembro = state.alumnos.find(a => a.id === miembroId);
    if (!miembro) return;
    
    const Sede = state.sedes.find(s => s.id === miembro.sedeId);
    if (!Sede) return;
    
    // Rellenar datos en el Modal del Ticket
    document.getElementById('ticket-sede-nombre').innerText = Sede.nombre;
    document.getElementById('ticket-alumno-nombre').innerText = miembro.nombre;
    document.getElementById('ticket-fecha').innerText = formatearFechaSencilla(obtenerFechaActualStr());
    document.getElementById('ticket-concepto').innerText = campo === 'inscripcion' ? 'Cuota de Inscripción' : `Mensualidad de ${obtenerNombreMes(campo)}`;
    document.getElementById('ticket-monto').innerText = `$${monto}`;
    
    // Cargar Logo de la Sede si existe, o usar el oficial por defecto
    const logoImg = document.getElementById('ticket-sede-logo');
    logoImg.src = Sede.logo || "logo.jpg";
    
    document.getElementById('modal-ticket-pago').classList.add('active');
}

function descargarTicketDesdeModal() {
    const element = document.getElementById('ticket-capture-area');
    const alumnoNombre = document.getElementById('ticket-alumno-nombre').innerText || 'Integrante';
    const opt = {
        margin:       [0.4, 0.4, 0.4, 0.4],
        filename:     `Ticket_Pago_${alumnoNombre.replace(/\s+/g, '_')}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, backgroundColor: '#ffffff', logging: false },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
}

function descargarReporteDesdeModal() {
    descargarReportePDF(state.tempReporteTipo || 'planilla');
}

function abrirVistaPreviaReporte(tipo = 'planilla') {
    state.tempReporteTipo = tipo;
    const Sede = state.sedes.find(s => s.id === state.activeSedeId);
    if (!Sede) return;
    
    // Rellenar encabezados
    document.getElementById('reporte-sede-nombre').innerText = Sede.nombre;
    document.getElementById('reporte-sede-rubro-pago').innerText = `Giro: ${Sede.rubro === 'soccer' ? 'Academia de Fútbol' : 'Gimnasio/Otros'} | Rango de Pago: ${Sede.fechaCorte || '1 al 5 de cada mes'}`;
    document.getElementById('reporte-fecha-actual').innerText = formatearFechaSencilla(obtenerFechaActualStr());
    
    const logoImg = document.getElementById('reporte-sede-logo');
    logoImg.src = Sede.logo || "logo.jpg";
    
    const printContent = document.getElementById('reporte-print-content');
    
    // Guardar contenedor de la tabla dinámica
    let bodyHtml = '';
    
    if (tipo === 'planilla') {
        const miembrosSede = state.alumnos.filter(a => a.sedeId === state.activeSedeId);
        
        let filas = '';
        if (miembrosSede.length === 0) {
            filas = `<tr><td colspan="4" style="text-align: center; padding: 1rem; color: #555;">No hay integrantes registrados.</td></tr>`;
        } else {
            miembrosSede.forEach(miembro => {
                const pInsc = obtenerEstatusPagoObjeto(miembro.pagos.inscripcion);
                const pMayo = obtenerEstatusPagoObjeto(miembro.pagos.mensualidades['2026-05']);
                const pJunio = obtenerEstatusPagoObjeto(miembro.pagos.mensualidades['2026-06']);
                
                filas += `
                    <tr>
                        <td style="padding: 0.75rem; font-weight: bold; border-bottom: 1px solid #eee; color: #000;">
                            ${miembro.nombre}
                            ${Sede.rubro === 'soccer' ? `<small style="display:block; color: #555;">Cat: ${miembro.categoria}</small>` : ''}
                        </td>
                        <td style="padding: 0.75rem; border-bottom: 1px solid #eee; text-transform: uppercase; font-weight: bold; color: ${pInsc.status === 'pagado' ? '#10b981' : pInsc.status === 'abonado' ? '#8b5cf6' : '#ef4444'}">
                            ${pInsc.texto}
                        </td>
                        <td style="padding: 0.75rem; border-bottom: 1px solid #eee; text-transform: uppercase; font-weight: bold; color: ${pMayo.status === 'pagado' ? '#10b981' : pMayo.status === 'abonado' ? '#8b5cf6' : '#ef4444'}">
                            ${pMayo.texto}
                        </td>
                        <td style="padding: 0.75rem; border-bottom: 1px solid #eee; text-transform: uppercase; font-weight: bold; color: ${pJunio.status === 'pagado' ? '#10b981' : pJunio.status === 'abonado' ? '#8b5cf6' : '#ef4444'}">
                            ${pJunio.texto}
                        </td>
                    </tr>
                `;
            });
        }
        
        bodyHtml = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #ddd; padding-bottom: 1rem; margin-bottom: 1.5rem; color: #000;">
                <div>
                    <h2 style="font-size: 1.8rem; font-weight: 900; margin: 0; color: #000;">${Sede.nombre}</h2>
                    <p style="margin: 0.25rem 0 0 0; color: #555; font-size: 0.9rem;">Giro: ${Sede.rubro === 'soccer' ? 'Academia de Fútbol' : 'Gimnasio/Otros'} | Rango de Pago: ${Sede.fechaCorte || '1 al 5 de cada mes'}</p>
                </div>
                <img src="${Sede.logo || 'logo.jpg'}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;">
            </div>
            <h4 style="margin-bottom: 1rem; font-weight: bold; text-transform: uppercase; color: #000;">Control de Cobros y Mensualidades</h4>
            <table style="width: 100%; border-collapse: collapse; color: #000;">
                <thead>
                    <tr style="border-bottom: 2px solid #000; text-align: left;">
                        <th style="padding: 0.5rem; color: #000;">Integrante</th>
                        <th style="padding: 0.5rem; color: #000;">Inscripción</th>
                        <th style="padding: 0.5rem; color: #000;">Mayo</th>
                        <th style="padding: 0.5rem; color: #000;">Junio</th>
                    </tr>
                </thead>
                <tbody>
                    ${filas}
                </tbody>
            </table>
            <div style="margin-top: 2rem; border-top: 1px solid #ddd; padding-top: 1rem; font-size: 0.8rem; color: #666; text-align: center;">
                Reporte de cobros generado el ${formatearFechaSencilla(obtenerFechaActualStr())}. Corporativo Riveroll.
            </div>
        `;
    } else if (tipo === 'totales') {
        const txsSede = state.transacciones.filter(t => t.sedeId === state.activeSedeId);
        let totalIngresos = 0;
        let totalEgresos = 0;

        txsSede.forEach(t => {
            const monto = parseFloat(t.monto) || 0;
            if (t.tipo === 'ingresos' || t.tipo === 'ingreso') totalIngresos += monto;
            else if (t.tipo === 'egresos' || t.tipo === 'egreso') totalEgresos += monto;
        });

        const balanceNeto = totalIngresos - totalEgresos;
        const egresosSede = txsSede.filter(t => t.tipo === 'egreso' || t.tipo === 'egresos');
        
        let egresosFilas = '';
        if (egresosSede.length === 0) {
            egresosFilas = `<tr><td colspan="3" style="text-align: center; padding: 1rem; color: #555;">No hay egresos registrados.</td></tr>`;
        } else {
            egresosSede.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
            egresosSede.forEach(eg => {
                egresosFilas += `
                    <tr>
                        <td style="padding: 0.75rem; border-bottom: 1px solid #eee; color: #000; font-weight: bold;">${eg.descripcion}</td>
                        <td style="padding: 0.75rem; border-bottom: 1px solid #eee; color: #555;">${formatearFechaSencilla(eg.fecha)}</td>
                        <td style="padding: 0.75rem; border-bottom: 1px solid #eee; color: #ef4444; font-weight: bold;">-$${eg.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                    </tr>
                `;
            });
        }

        bodyHtml = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #ddd; padding-bottom: 1rem; margin-bottom: 1.5rem; color: #000;">
                <div>
                    <h2 style="font-size: 1.8rem; font-weight: 900; margin: 0; color: #000;">${Sede.nombre}</h2>
                    <p style="margin: 0.25rem 0 0 0; color: #555; font-size: 0.9rem;">Giro: ${Sede.rubro === 'soccer' ? 'Academia de Fútbol' : 'Gimnasio/Otros'} | Resumen de Totales</p>
                </div>
                <img src="${Sede.logo || 'logo.jpg'}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;">
            </div>
            
            <h4 style="margin-bottom: 1rem; font-weight: bold; text-transform: uppercase; color: #000;">Balance de Caja y Totales</h4>
            
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 2rem; color: #000;">
                <div style="border: 1px solid #ddd; padding: 1rem; border-radius: 8px;">
                    <div style="font-size: 0.75rem; color: #666; font-weight: bold; text-transform: uppercase;">Ingresos Totales</div>
                    <div style="font-size: 1.4rem; font-weight: 900; color: #10b981; margin-top: 0.25rem;">$${totalIngresos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                </div>
                <div style="border: 1px solid #ddd; padding: 1rem; border-radius: 8px;">
                    <div style="font-size: 0.75rem; color: #666; font-weight: bold; text-transform: uppercase;">Egresos Totales</div>
                    <div style="font-size: 1.4rem; font-weight: 900; color: #ef4444; margin-top: 0.25rem;">$${totalEgresos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                </div>
                <div style="border: 1px solid #ddd; padding: 1rem; border-radius: 8px; background: #f9fafb;">
                    <div style="font-size: 0.75rem; color: #666; font-weight: bold; text-transform: uppercase;">Balance Neto</div>
                    <div style="font-size: 1.4rem; font-weight: 900; color: ${balanceNeto < 0 ? '#ef4444' : '#1e3a8a'}; margin-top: 0.25rem;">$${balanceNeto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
                </div>
            </div>
            
            <h4 style="margin-bottom: 1rem; font-weight: bold; text-transform: uppercase; color: #000;">Historial Detallado de Egresos</h4>
            <table style="width: 100%; border-collapse: collapse; color: #000;">
                <thead>
                    <tr style="border-bottom: 2px solid #000; text-align: left;">
                        <th style="padding: 0.5rem; color: #000;">Concepto / Profesor</th>
                        <th style="padding: 0.5rem; color: #000;">Fecha</th>
                        <th style="padding: 0.5rem; color: #000;">Monto</th>
                    </tr>
                </thead>
                <tbody>
                    ${egresosFilas}
                </tbody>
            </table>
            <div style="margin-top: 2rem; border-top: 1px solid #ddd; padding-top: 1rem; font-size: 0.8rem; color: #666; text-align: center;">
                Reporte de totales generado el ${formatearFechaSencilla(obtenerFechaActualStr())}. Corporativo Riveroll.
            </div>
        `;
    } else if (tipo === 'soccer') {
        const cat = state.categorias.find(c => c.id === state.activeCategoriaId);
        if (!cat) return;
        const dateInput = document.getElementById('asistencias-fecha-select');
        const fechaSeleccionada = dateInput ? dateInput.value || obtenerFechaActualStr() : obtenerFechaActualStr();
        const weekStr = getWeekString(new Date(fechaSeleccionada + 'T00:00:00'));
        const weekDates = getDatesOfWeek(weekStr);
        const alumnosCat = state.alumnos.filter(alu => {
            if (alu.sedeId !== state.activeSedeId) return false;
            if (alu.categoriaId === cat.id) return true;
            if (alu.categoriaId && alu.categoriaId !== 'auto') return false;
            if (!alu.fechaNacimiento) return false;
            const anioNac = parseInt(alu.fechaNacimiento.split('-')[0], 10);
            return anioNac >= cat.anioInicio && anioNac <= cat.anioFin;
        });

        const asistenciasSemana = state.asistencias.filter(a => a.semana === weekStr && a.categoriaId === cat.id);

        let diasHeaders = '';
        cat.diasEntrenamiento.forEach(dia => {
            const fechaDia = weekDates[dia];
            const labelFecha = fechaDia ? fechaDia.split('-').slice(1).join('/') : '';
            diasHeaders += `<th style="padding: 0.5rem; color: #000; border-bottom: 2px solid #000; text-align: center; font-size: 0.8rem;">${dia}<br><small style="color: #666; font-size: 0.65rem;">${labelFecha}</small></th>`;
        });

        let filas = '';
        if (alumnosCat.length === 0) {
            filas = `<tr><td colspan="${cat.diasEntrenamiento.length + 2}" style="text-align: center; padding: 1.5rem; color: #555;">No hay alumnos registrados en el rango de esta categoría (${cat.anioInicio}-${cat.anioFin}).</td></tr>`;
        } else {
            alumnosCat.forEach(alu => {
                let asistColumnas = '';
                let faltasSemanales = 0;
                cat.diasEntrenamiento.forEach(dia => {
                    const fechaDia = weekDates[dia];
                    const asistFecha = asistenciasSemana.find(a => a.fecha === fechaDia);
                    const estado = (asistFecha && asistFecha.registros) ? asistFecha.registros[alu.id] : 'falta';
                    if (estado === 'asistencia') {
                        asistColumnas += `<td style="padding: 0.5rem; border-bottom: 1px solid #eee; text-align: center; color: #10b981; font-weight: bold; font-size: 0.85rem;">SI</td>`;
                    } else {
                        asistColumnas += `<td style="padding: 0.5rem; border-bottom: 1px solid #eee; text-align: center; color: #ef4444; font-weight: bold; font-size: 0.85rem;">NO</td>`;
                        faltasSemanales++;
                    }
                });

                filas += `
                    <tr>
                        <td style="padding: 0.6rem; font-weight: bold; border-bottom: 1px solid #eee; color: #000; text-transform: uppercase; font-size: 0.85rem;">
                            ${alu.nombre}
                            <small style="display:block; color: #666; font-size: 0.65rem;">AÑO NAC: ${alu.fechaNacimiento ? alu.fechaNacimiento.split('-')[0] : 'N/A'}</small>
                        </td>
                        ${asistColumnas}
                        <td style="padding: 0.6rem; border-bottom: 1px solid #eee; text-align: center; font-weight: bold; color: ${faltasSemanales > 0 ? '#ef4444' : '#10b981'}; font-size: 0.85rem;">${faltasSemanales}</td>
                    </tr>
                `;
            });
        }

        const fechaInicio = weekDates["Lunes"];
        const fechaFin = weekDates["Sábado"];
        const rangeText = `DEL ${fechaInicio.split('-').reverse().slice(0, 2).join('/')} AL ${fechaFin.split('-').reverse().slice(0, 2).join('/')}`;

        bodyHtml = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #ddd; padding-bottom: 1rem; margin-bottom: 1.5rem; color: #000;">
                <div>
                    <h2 style="font-size: 1.8rem; font-weight: 900; margin: 0; color: #000;">${Sede.nombre}</h2>
                    <p style="margin: 0.25rem 0 0 0; color: #555; font-size: 0.9rem;">Categoría: ${cat.nombre.toUpperCase()} | Rango de Edad: ${cat.anioInicio}-${cat.anioFin}</p>
                    <p style="margin: 0.25rem 0 0 0; color: #1e3b8a; font-size: 0.85rem; font-weight: bold; text-transform: uppercase;">ASISTENCIAS DE LA SEMANA: ${rangeText}</p>
                </div>
                <img src="${Sede.logo || 'logo.jpg'}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;">
            </div>
            
            <h4 style="margin-bottom: 1rem; font-weight: bold; text-transform: uppercase; color: #000; font-size: 1.1rem; text-align: center;">Control de Asistencia Semanal</h4>
            <table style="width: 100%; border-collapse: collapse; color: #000;">
                <thead>
                    <tr style="text-align: left;">
                        <th style="padding: 0.5rem; color: #000; border-bottom: 2px solid #000; font-size: 0.85rem;">Alumno</th>
                        ${diasHeaders}
                        <th style="padding: 0.5rem; color: #ef4444; border-bottom: 2px solid #000; text-align: center; font-size: 0.85rem;">Faltas (${rangeText})</th>
                    </tr>
                </thead>
                <tbody>
                    ${filas}
                </tbody>
            </table>
            <div style="margin-top: 2rem; border-top: 1px solid #ddd; padding-top: 1rem; font-size: 0.8rem; color: #666; text-align: center;">
                Reporte de asistencias generado el ${formatearFechaSencilla(obtenerFechaActualStr())}. Corporativo Riveroll.
            </div>
        `;
    } else if (tipo === 'gym') {
        const dateInput = document.getElementById('asistencias-fecha-select-gym');
        const fechaSeleccionada = dateInput ? dateInput.value || obtenerFechaActualStr() : obtenerFechaActualStr();
        const weekStr = getWeekString(new Date(fechaSeleccionada + 'T00:00:00'));
        const weekDates = getDatesOfWeek(weekStr);
        const alumnosGym = state.alumnos.filter(alu => alu.sedeId === state.activeSedeId);
        const asistenciasSemana = state.asistencias.filter(a => a.semana === weekStr && a.categoriaId === 'gym');
        const diasEntrenamiento = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

        let diasHeaders = '';
        diasEntrenamiento.forEach(dia => {
            const fechaDia = weekDates[dia];
            const labelFecha = fechaDia ? fechaDia.split('-').slice(1).join('/') : '';
            diasHeaders += `<th style="padding: 0.5rem; color: #000; border-bottom: 2px solid #000; text-align: center; font-size: 0.8rem;">${dia.substring(0,3)}<br><small style="color: #666; font-size: 0.65rem;">${labelFecha}</small></th>`;
        });

        let filas = '';
        if (alumnosGym.length === 0) {
            filas = `<tr><td colspan="8" style="text-align: center; padding: 1.5rem; color: #555;">No hay integrantes registrados en el gimnasio.</td></tr>`;
        } else {
            alumnosGym.forEach(alu => {
                let asistColumnas = '';
                let faltasSemanales = 0;
                diasEntrenamiento.forEach(dia => {
                    const fechaDia = weekDates[dia];
                    const asistFecha = asistenciasSemana.find(a => a.fecha === fechaDia);
                    const estado = (asistFecha && asistFecha.registros) ? asistFecha.registros[alu.id] : 'falta';
                    if (estado === 'asistencia') {
                        asistColumnas += `<td style="padding: 0.5rem; border-bottom: 1px solid #eee; text-align: center; color: #10b981; font-weight: bold; font-size: 0.85rem;">SI</td>`;
                    } else {
                        asistColumnas += `<td style="padding: 0.5rem; border-bottom: 1px solid #eee; text-align: center; color: #ef4444; font-weight: bold; font-size: 0.85rem;">NO</td>`;
                        faltasSemanales++;
                    }
                });

                filas += `
                    <tr>
                        <td style="padding: 0.6rem; font-weight: bold; border-bottom: 1px solid #eee; color: #000; text-transform: uppercase; font-size: 0.85rem;">
                            ${alu.nombre}
                        </td>
                        ${asistColumnas}
                        <td style="padding: 0.6rem; border-bottom: 1px solid #eee; text-align: center; font-weight: bold; color: ${faltasSemanales > 0 ? '#ef4444' : '#10b981'}; font-size: 0.85rem;">${faltasSemanales}</td>
                    </tr>
                `;
            });
        }

        const fechaInicio = weekDates["Lunes"];
        const fechaFin = weekDates["Sábado"];
        const rangeText = `DEL ${fechaInicio.split('-').reverse().slice(0, 2).join('/')} AL ${fechaFin.split('-').reverse().slice(0, 2).join('/')}`;

        bodyHtml = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #ddd; padding-bottom: 1rem; margin-bottom: 1.5rem; color: #000;">
                <div>
                    <h2 style="font-size: 1.8rem; font-weight: 900; margin: 0; color: #000;">${Sede.nombre}</h2>
                    <p style="margin: 0.25rem 0 0 0; color: #555; font-size: 0.9rem;">Registro General de Asistencias - Gimnasio</p>
                    <p style="margin: 0.25rem 0 0 0; color: #1e3b8a; font-size: 0.85rem; font-weight: bold; text-transform: uppercase;">ASISTENCIAS DE LA SEMANA: ${rangeText}</p>
                </div>
                <img src="${Sede.logo || 'logo.jpg'}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;">
            </div>
            
            <h4 style="margin-bottom: 1rem; font-weight: bold; text-transform: uppercase; color: #000; font-size: 1.1rem; text-align: center;">Reporte General de Asistencias</h4>
            <table style="width: 100%; border-collapse: collapse; color: #000;">
                <thead>
                    <tr style="text-align: left;">
                        <th style="padding: 0.5rem; color: #000; border-bottom: 2px solid #000; font-size: 0.85rem;">Integrante</th>
                        ${diasHeaders}
                        <th style="padding: 0.5rem; color: #ef4444; border-bottom: 2px solid #000; text-align: center; font-size: 0.85rem;">Faltas (${rangeText})</th>
                    </tr>
                </thead>
                <tbody>
                    ${filas}
                </tbody>
            </table>
            <div style="margin-top: 2rem; border-top: 1px solid #ddd; padding-top: 1rem; font-size: 0.8rem; color: #666; text-align: center;">
                Reporte de asistencias generado el ${formatearFechaSencilla(obtenerFechaActualStr())}. Corporativo Riveroll.
            </div>
        `;
    }
    
    printContent.innerHTML = bodyHtml;
    document.getElementById('modal-reporte-print').classList.add('active');
}

function descargarReportePDF(tipo = 'planilla') {
    const Sede = state.sedes.find(s => s.id === state.activeSedeId);
    if (!Sede) return;
    
    // Primero preparamos el reporte en el modal
    abrirVistaPreviaReporte(tipo);
    
    const element = document.getElementById('reporte-print-content');
    const esHorizontal = (tipo === 'soccer' || tipo === 'gym');
    
    let filename = `Reporte_${tipo === 'planilla' ? 'Cobros' : tipo === 'totales' ? 'Finanzas' : 'Asistencias'}_${Sede.nombre.replace(/\s+/g, '_')}.pdf`;
    
    const opt = {
        margin:       [0.3, 0.3, 0.3, 0.3],
        filename:     filename,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, backgroundColor: '#ffffff', logging: false },
        jsPDF:        { unit: 'in', format: 'letter', orientation: esHorizontal ? 'landscape' : 'portrait' }
    };
    
    html2pdf().set(opt).from(element).save().then(() => {
        console.log("PDF generado y descargado con éxito.");
    });
}

function enviarComprobanteWhatsApp(miembroId) {
    const miembro = state.alumnos.find(a => a.id === miembroId);
    if (!miembro) return;
    
    const Sede = state.sedes.find(s => s.id === miembro.sedeId);
    if (!Sede) return;
    
    let ultimoConcepto = '';
    let ultimoMonto = 0;
    let esAbono = '0';
    
    // Obtener los estatus
    const pJunio = obtenerEstatusPagoObjeto(miembro.pagos.mensualidades['2026-06']);
    const pMayo = obtenerEstatusPagoObjeto(miembro.pagos.mensualidades['2026-05']);
    const pInsc = obtenerEstatusPagoObjeto(miembro.pagos.inscripcion);
    
    // Evaluar en orden de prioridad el último pago registrado
    if (pJunio.status === 'pagado') {
        ultimoConcepto = 'Mensualidad de Junio';
        ultimoMonto = Sede.mensualidad;
    } else if (pJunio.status === 'abonado') {
        ultimoConcepto = 'Mensualidad de Junio';
        ultimoMonto = miembro.pagos.mensualidades['2026-06'].abono || 0;
        esAbono = '1';
    } else if (pMayo.status === 'pagado') {
        ultimoConcepto = 'Mensualidad de Mayo';
        ultimoMonto = Sede.mensualidad;
    } else if (pMayo.status === 'abonado') {
        ultimoConcepto = 'Mensualidad de Mayo';
        ultimoMonto = miembro.pagos.mensualidades['2026-05'].abono || 0;
        esAbono = '1';
    } else if (pInsc.status === 'pagado') {
        ultimoConcepto = 'Cuota de Inscripción';
        ultimoMonto = Sede.inscripcion;
    } else if (pInsc.status === 'abonado') {
        ultimoConcepto = 'Cuota de Inscripción';
        ultimoMonto = miembro.pagos.inscripcion.abono || 0;
        esAbono = '1';
    }
    
    if (!ultimoConcepto) {
        alert("El integrante no cuenta con ningún pago registrado para generar un comprobante.");
        return;
    }
    
    const fechaActual = formatearFechaSencilla(obtenerFechaActualStr());
    
    // Construir la URL del comprobante web interactivo
    const origin = window.location.origin.includes('localhost') ? 'https://riveroll.vercel.app' : window.location.origin;
    const ticketUrl = `${origin}/ticket.html?s=${encodeURIComponent(Sede.nombre)}&i=${encodeURIComponent(miembro.nombre)}&c=${encodeURIComponent(ultimoConcepto)}&m=${encodeURIComponent(ultimoMonto)}&f=${encodeURIComponent(fechaActual)}&a=${esAbono}`;
    
    // Redactar mensaje con el enlace directo al comprobante
    let mensaje = '';
    let targetPhone = '';
    
    if (Sede.rubro !== 'soccer') {
        targetPhone = miembro.telefonoSuscriptor || '';
        mensaje = `Hola ${miembro.nombre}, le saludamos de *${Sede.nombre}*. Adjuntamos el comprobante oficial de pago para su suscripción:\n\n👉 *Ver Ticket Digital:* ${ticketUrl}\n\n¡Le agradecemos enormemente su pago puntual y la confianza brindada a nuestra institución!`;
    } else {
        targetPhone = miembro.tutorTelefono || '';
        mensaje = `Hola ${miembro.tutorNombre}, le saludamos de *${Sede.nombre}*. Adjuntamos el comprobante oficial de pago para su hijo *${miembro.nombre}*:\n\n👉 *Ver Ticket Digital:* ${ticketUrl}\n\n¡Le agradecemos enormemente su pago puntual y la confianza brindada a nuestra institución!`;
    }
    
    // Abrir chat de WhatsApp
    const formattedPhone = targetPhone.startsWith('52') ? targetPhone : `52${targetPhone}`;
    window.open(`https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(mensaje)}`, '_blank');
}

// --- REGISTRO DEL SERVICE WORKER (PWA INSTALABLE) ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registrado con éxito como PWA.'))
            .catch(err => console.warn('Error al registrar Service Worker PWA:', err));
    });
}

// --- METODOS DE AUTENTICACION DE USUARIOS (FIREBASE AUTH) ---
function switchAuthTab(tab) {
    // Ocultar todos los paneles
    document.getElementById('form-auth-login').style.display = 'none';
    document.getElementById('form-auth-register').style.display = 'none';
    document.getElementById('form-auth-recover').style.display = 'none';
    
    // Desactivar botones de pestañas
    document.getElementById('tab-login').classList.remove('active');
    document.getElementById('tab-register').classList.remove('active');
    
    if (tab === 'login') {
        document.getElementById('form-auth-login').style.display = 'block';
        document.getElementById('tab-login').classList.add('active');
        document.getElementById('auth-tabs-group').style.display = 'flex';
    } else if (tab === 'register') {
        document.getElementById('form-auth-register').style.display = 'block';
        document.getElementById('tab-register').classList.add('active');
        document.getElementById('auth-tabs-group').style.display = 'flex';
    } else if (tab === 'recover') {
        document.getElementById('form-auth-recover').style.display = 'block';
        document.getElementById('auth-tabs-group').style.display = 'none'; // ocultar pestañas en recuperación
    }
}

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const eyeIcon = document.getElementById(inputId + '-eye');
    if (!input || !eyeIcon) return;
    
    if (input.type === 'password') {
        input.type = 'text';
        eyeIcon.classList.remove('fa-eye-slash');
        eyeIcon.classList.add('fa-eye');
    } else {
        input.type = 'password';
        eyeIcon.classList.remove('fa-eye');
        eyeIcon.classList.add('fa-eye-slash');
    }
}

async function handleAuthLogin(event) {
    event.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    
    try {
        await firebase.auth().signInWithEmailAndPassword(email, pass);
    } catch (error) {
        console.error("Error al iniciar sesión:", error);
        let errorMsg = "Credenciales incorrectas. Verifica tu correo y contraseña.";
        if (error.code === "auth/user-not-found") errorMsg = "Este usuario no existe.";
        if (error.code === "auth/wrong-password") errorMsg = "Contraseña incorrecta.";
        alert("Error de Inicio de Sesión: " + errorMsg);
    }
}

async function handleAuthRegister(event) {
    event.preventDefault();
    const email = document.getElementById('register-email').value;
    const pass = document.getElementById('register-password').value;
    
    if (pass.length < 6) {
        alert("La contraseña debe tener mínimo 6 caracteres.");
        return;
    }
    
    const isInitialAdmin = SUPER_ADMINS.includes(email.toLowerCase());
    
    try {
        const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, pass);
        const user = userCredential.user;
        
        if (window.db && window.db.isNubeActiva() && firebase.apps.length > 0) {
            const firestoreDb = firebase.firestore();
            await firestoreDb.collection("users").doc(user.uid).set({
                name: email.split('@')[0].toUpperCase(),
                email: email,
                approved: isInitialAdmin,
                isAdmin: isInitialAdmin
            });
        }
        
        if (isInitialAdmin) {
            alert("Cuenta de Administrador creada con éxito. Iniciando sesión...");
        } else {
            alert("Solicitud de cuenta registrada con éxito. Tu cuenta debe ser aprobada por el administrador antes de poder ingresar.");
            await firebase.auth().signOut();
        }
    } catch (error) {
        console.error("Error al registrar usuario:", error);
        let errorMsg = error.message;
        if (error.code === "auth/email-already-in-use") errorMsg = "Este correo ya está registrado por otra cuenta.";
        alert("Error de Registro: " + errorMsg);
    }
}

async function handleAuthRecover(event) {
    event.preventDefault();
    const email = document.getElementById('recover-email').value;
    
    try {
        await firebase.auth().sendPasswordResetEmail(email);
        alert("¡Enlace de recuperación enviado!\n\nRevisa tu bandeja de entrada o correo no deseado.");
        switchAuthTab('login');
    } catch (error) {
        console.error("Error al recuperar contraseña:", error);
        alert("Error: No se pudo enviar el correo. Revisa si el email es correcto.");
    }
}

function handleAuthLogout() {
    if (confirm("¿Estás seguro de que deseas cerrar sesión?")) {
        firebase.auth().signOut();
    }
}

// --- CONTROL Y REGISTRO DE FINANZAS (INGRESOS, EGRESOS Y BALANCE) ---
function renderResumenFinanzas() {
    const totalIngresosEl = document.getElementById('finanzas-total-ingresos');
    const totalEgresosEl = document.getElementById('finanzas-total-egresos');
    const balanceNetoEl = document.getElementById('finanzas-balance-neto');
    if (!totalIngresosEl || !totalEgresosEl || !balanceNetoEl) return;

    // Filtrar transacciones de esta sede
    const txsSede = state.transacciones.filter(t => t.sedeId === state.activeSedeId);

    let totalIngresos = 0;
    let totalEgresos = 0;

    txsSede.forEach(t => {
        const monto = parseFloat(t.monto) || 0;
        if (t.tipo === 'ingresos' || t.tipo === 'ingreso') {
            totalIngresos += monto;
        } else if (t.tipo === 'egresos' || t.tipo === 'egreso') {
            totalEgresos += monto;
        }
    });

    const balanceNeto = totalIngresos - totalEgresos;

    totalIngresosEl.innerText = `$${totalIngresos.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    totalEgresosEl.innerText = `$${totalEgresos.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    balanceNetoEl.innerText = `$${balanceNeto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    if (balanceNeto < 0) {
        balanceNetoEl.style.color = '#ef4444'; // Rojo si es negativo
    } else {
        balanceNetoEl.style.color = 'var(--color-accent)'; // Amarillo oro si es positivo
    }
}

async function registrarEgreso(event) {
    event.preventDefault();
    const concepto = document.getElementById('egreso-concepto').value;
    const monto = parseFloat(document.getElementById('egreso-monto').value) || 0;
    const fecha = document.getElementById('egreso-fecha').value;

    if (monto <= 0) {
        alert("El monto debe ser mayor que 0.");
        return;
    }

    try {
        await window.db.agregarTransaccion({
            id: 't_' + Date.now(),
            tipo: 'egreso',
            categoria: 'Pago Profesor',
            descripcion: concepto,
            monto: monto,
            fecha: fecha,
            sedeId: state.activeSedeId
        });
        
        document.getElementById('form-egreso').reset();
        alert("Egreso registrado con éxito.");
    } catch (error) {
        console.error("Error al registrar egreso:", error);
        alert("Error al guardar el egreso. Inténtalo de nuevo.");
    }
}

function renderEgresosLista() {
    const tbody = document.getElementById('egresos-lista-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const egresosSede = state.transacciones.filter(t => t.sedeId === state.activeSedeId && (t.tipo === 'egreso' || t.tipo === 'egresos'));

    if (egresosSede.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--color-text-muted); padding: 1.5rem;">No hay egresos registrados en este centro.</td></tr>`;
        return;
    }

    // Ordenar por fecha descendente
    egresosSede.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    egresosSede.forEach(eg => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="color: #fff; font-weight: 600;">${eg.descripcion}</td>
            <td style="color: var(--color-text-muted);">${formatearFechaSencilla(eg.fecha)}</td>
            <td style="color: #ef4444; font-weight: 700;">-$${eg.monto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td style="text-align: center;">
                <button class="btn btn-danger btn-sm" onclick="eliminarEgreso('${eg.id}')" style="background: rgba(239, 68, 68, 0.15); color: var(--color-danger); border: 1px solid rgba(239, 68, 68, 0.2); padding: 0.25rem 0.5rem;">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function eliminarEgreso(transaccionId) {
    if (confirm("¿Estás seguro de que deseas eliminar este egreso del historial?")) {
        try {
            await window.db.eliminarTransaccion(transaccionId);
        } catch (error) {
            console.error("Error al eliminar egreso:", error);
            alert("No se pudo eliminar el egreso.");
        }
    }
}

// =========================================================================
// MÓDULO DE TRABAJADORES Y ROLL DE ACTIVIDADES
// =========================================================================
let streamTrabajador = null;
let fotoTrabajadorBase64 = '';

function openAddTrabajadorModal() {
    document.getElementById('form-trabajador').reset();
    document.getElementById('edit-trabajador-id').value = '';
    fotoTrabajadorBase64 = '';
    
    // Configurar campos condicionales
    const Sede = state.sedes.find(s => s.id === state.activeSedeId);
    const esSoccer = Sede ? Sede.rubro === 'soccer' : true;
    
    if (esSoccer) {
        document.getElementById('group-futbol-trabajador').style.display = 'block';
        document.getElementById('group-gimnasio-trabajador').style.display = 'none';
        document.getElementById('trabajador-categoria').required = true;
        document.getElementById('trabajador-horario').required = false;
    } else {
        document.getElementById('group-futbol-trabajador').style.display = 'none';
        document.getElementById('group-gimnasio-trabajador').style.display = 'block';
        document.getElementById('trabajador-categoria').required = false;
        document.getElementById('trabajador-horario').required = true;
    }
    
    // Restablecer preview de imagen
    document.getElementById('upload-preview-trabajador').src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'><rect width='80' height='80' fill='%23111827'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='10' fill='%236B7280'>Vista Previa</text></svg>";
    
    apagarCamaraTrabajador();
    openModal('modal-trabajador');
}

function previewTrabajadorImage(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            fotoTrabajadorBase64 = e.target.result;
            document.getElementById('upload-preview-trabajador').src = fotoTrabajadorBase64;
        };
        reader.readAsDataURL(file);
    }
}

async function encenderCamaraTrabajador() {
    try {
        const container = document.getElementById('camara-contenedor-trabajador');
        const video = document.getElementById('video-stream-trabajador');
        container.style.display = 'block';
        
        streamTrabajador = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: false
        });
        video.srcObject = streamTrabajador;
    } catch (err) {
        console.error("Error al encender cámara de trabajador:", err);
        alert("No se pudo acceder a la cámara.");
    }
}

function capturarFotoTrabajador() {
    const video = document.getElementById('video-stream-trabajador');
    const canvas = document.getElementById('hidden-canvas-trabajador');
    if (!streamTrabajador || !video) return;
    
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    fotoTrabajadorBase64 = canvas.toDataURL('image/jpeg');
    document.getElementById('upload-preview-trabajador').src = fotoTrabajadorBase64;
    apagarCamaraTrabajador();
}

function apagarCamaraTrabajador() {
    const container = document.getElementById('camara-contenedor-trabajador');
    const video = document.getElementById('video-stream-trabajador');
    if (container) container.style.display = 'none';
    if (streamTrabajador) {
        streamTrabajador.getTracks().forEach(track => track.stop());
        streamTrabajador = null;
    }
    if (video) video.srcObject = null;
}

async function saveTrabajador(e) {
    e.preventDefault();
    const Sede = state.sedes.find(s => s.id === state.activeSedeId);
    if (!Sede) return;
    
    const esSoccer = Sede.rubro === 'soccer';
    const nombre = document.getElementById('trabajador-nombre').value.trim();
    const telefono = document.getElementById('trabajador-telefono').value.trim();
    const direccion = document.getElementById('trabajador-direccion').value.trim();
    const emergNombre = document.getElementById('trabajador-emergencia-nombre').value.trim();
    const emergTel = document.getElementById('trabajador-emergencia-telefono').value.trim();
    
    const trabajadorData = {
        nombre,
        telefono,
        direccion,
        emergencia: {
            nombre: emergNombre,
            telefono: emergTel
        },
        foto: fotoTrabajadorBase64 || '',
        sedeId: state.activeSedeId
    };
    
    if (esSoccer) {
        trabajadorData.categoria = document.getElementById('trabajador-categoria').value.trim();
    } else {
        trabajadorData.horario = document.getElementById('trabajador-horario').value.trim();
    }
    
    try {
        await window.db.agregarTrabajador(trabajadorData);
        closeModal('modal-trabajador');
        apagarCamaraTrabajador();
        alert("Trabajador registrado con éxito.");
    } catch (err) {
        console.error("Error al registrar trabajador:", err);
        alert("No se pudo guardar el trabajador.");
    }
}

function renderTrabajadoresGrid() {
    try {
        const container = document.getElementById('trabajadores-lista-grid');
        if (!container) return;
        container.innerHTML = '';
        
        const Sede = state.sedes.find(s => s.id === state.activeSedeId);
        const esSoccer = Sede ? Sede.rubro === 'soccer' : true;
        
        const lista = (state.trabajadores || []).filter(t => t.sedeId === state.activeSedeId);
        
        if (lista.length === 0) {
            container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--color-text-muted); padding: 2rem;">No hay trabajadores registrados en este centro.</div>`;
            return;
        }
        
        lista.forEach(tr => {
            const placeholderImg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%231f2937'/><path d='M50 50a15 15 0 1 0 0-30 15 15 0 0 0 0 30zm0 10c-20 0-30 10-30 20h60c0-10-10-20-30-20z' fill='%234B5563'/></svg>";
            const fotoSrc = tr.foto || placeholderImg;
            
            const card = document.createElement('div');
            card.className = "glass-panel student-card";
            card.style.padding = "1.25rem";
            card.style.display = "flex";
            card.style.flexDirection = "column";
            card.style.gap = "1rem";
            card.style.position = "relative";
            
            const emergNombre = (tr.emergencia ? tr.emergencia.nombre : '') || 'No registrado';
            const emergTel = (tr.emergencia ? tr.emergencia.telefono : '') || '-';
            
            card.innerHTML = `
                <div style="display: flex; gap: 1rem; align-items: center;">
                    <img src="${fotoSrc}" style="width: 65px; height: 65px; border-radius: 50%; object-fit: cover; border: 2px solid ${esSoccer ? '#10b981' : '#f59e0b'};">
                    <div style="flex: 1; overflow: hidden;">
                        <h4 style="color: #fff; font-family: var(--font-title); font-size: 1.1rem; margin: 0; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${tr.nombre}</h4>
                        <span style="font-size: 0.8rem; color: var(--color-text-muted); display: block; margin-top: 0.25rem;">
                            <i class="fa-solid fa-phone"></i> ${tr.telefono}
                        </span>
                    </div>
                </div>
                
                <div style="font-size: 0.85rem; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem;">
                    <div><strong>Dirección:</strong> <span style="color: var(--color-text-muted);">${tr.direccion}</span></div>
                    ${esSoccer 
                        ? `<div><strong>Categoría:</strong> <span style="color: #10b981; font-weight: bold;">${tr.categoria || 'Sin especificar'}</span></div>`
                        : `<div><strong>Horario:</strong> <span style="color: #f59e0b; font-weight: bold;">${tr.horario || 'Sin especificar'}</span></div>`
                    }
                    <div style="background: rgba(255,255,255,0.02); padding: 0.5rem 0.75rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); margin-top: 0.25rem;">
                        <span style="font-size: 0.75rem; font-weight: bold; color: var(--color-text-muted); display: block; text-transform: uppercase;">Contacto de Emergencia</span>
                        <span style="color: #fff; font-weight: 600;">${emergNombre}</span>
                        <span style="color: var(--color-text-muted); font-size: 0.8rem; display: block; margin-top: 0.15rem;"><i class="fa-solid fa-phone"></i> ${emergTel}</span>
                    </div>
                </div>
                
                <button class="btn btn-danger btn-sm" onclick="eliminarTrabajador('${tr.id}')" style="position: absolute; top: 1rem; right: 1rem; width: 30px; height: 30px; padding: 0; display: flex; align-items: center; justify-content: center; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2);">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            `;
            container.appendChild(card);
        });
    } catch (e) {
        alert("Error al renderizar trabajadores: " + e.message);
    }
}

async function eliminarTrabajador(id) {
    if (confirm("¿Estás seguro de que deseas dar de baja a este trabajador?")) {
        try {
            await window.db.eliminarTrabajador(id);
            alert("Trabajador dado de baja.");
        } catch (err) {
            console.error("Error al eliminar trabajador:", err);
        }
    }
}

function openActividadesRollModal() {
    actualizarSelectoresTrabajadores();
    renderActividadesRollTable();
    openModal('modal-actividades-roll');
}

function actualizarSelectoresTrabajadores() {
    const select = document.getElementById('actividad-trabajador');
    if (!select) return;
    select.innerHTML = '';
    
    const lista = (state.trabajadores || []).filter(t => t.sedeId === state.activeSedeId);
    if (lista.length === 0) {
        select.innerHTML = `<option value="">Agrega primero un trabajador</option>`;
        return;
    }
    
    lista.forEach(tr => {
        const option = document.createElement('option');
        option.value = tr.id;
        option.innerText = tr.nombre;
        select.appendChild(option);
    });
}

async function registrarActividadRoll(e) {
    e.preventDefault();
    const trabajadorId = document.getElementById('actividad-trabajador').value;
    const actividadNombre = document.getElementById('actividad-nombre').value.trim();
    const dia = document.getElementById('actividad-dia').value;
    const hora = document.getElementById('actividad-hora').value;
    
    if (!trabajadorId) {
        alert("Selecciona un trabajador válido.");
        return;
    }
    
    const trabajador = state.trabajadores.find(t => t.id === trabajadorId);
    if (!trabajador) return;
    
    const nuevaActividad = {
        trabajadorId: trabajador.id,
        trabajadorNombre: trabajador.nombre,
        actividad: actividadNombre,
        dia: dia,
        hora: hora,
        sedeId: state.activeSedeId,
        fecha: new Date().toISOString()
    };
    
    try {
        await window.db.agregarActividad(nuevaActividad);
        document.getElementById('form-actividad-programar').reset();
        alert("Actividad asignada con éxito al Roll.");
    } catch (err) {
        console.error("Error al registrar actividad:", err);
    }
}

function renderActividadesRollTable() {
    const tbody = document.getElementById('actividades-roll-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const lista = (state.actividades || []).filter(a => a.sedeId === state.activeSedeId);
    
    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--color-text-muted); padding: 1.5rem;">No hay actividades programadas.</td></tr>`;
        return;
    }
    
    // Ordenar actividades por Día de la semana
    const ordenDias = { "Lunes": 1, "Martes": 2, "Miércoles": 3, "Jueves": 4, "Viernes": 5, "Sábado": 6, "Domingo": 7 };
    lista.sort((a, b) => (ordenDias[a.dia] || 99) - (ordenDias[b.dia] || 99));
    
    lista.forEach(act => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="color: #fff; font-weight: 600;">${act.trabajadorNombre}</td>
            <td style="color: var(--color-text-muted);">${act.actividad}</td>
            <td style="color: #38bdf8; font-weight: 700;">${act.dia}</td>
            <td style="color: #fff;">${act.hora} hrs</td>
            <td style="text-align: center;">
                <button class="btn btn-danger btn-sm" onclick="eliminarActividadRoll('${act.id}')" style="background: rgba(239, 68, 68, 0.15); color: var(--color-danger); border: 1px solid rgba(239, 68, 68, 0.2); padding: 0.25rem 0.5rem;">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function eliminarActividadRoll(id) {
    if (confirm("¿Estás seguro de que deseas eliminar esta actividad del roll?")) {
        try {
            await window.db.eliminarActividad(id);
        } catch (err) {
            console.error("Error al eliminar actividad:", err);
        }
    }
}

// --- USER APPROVAL MODAL LOGIC (SUPER ADMIN ONLY) ---
function openUserApprovalModal() {
    const isSuperAdmin = state.currentUser && SUPER_ADMINS.includes(state.currentUser.email.toLowerCase());
    if (!isSuperAdmin) {
        alert("ACCESO DENEGADO: NO TIENES PERMISOS DE ADMINISTRADOR.");
        return;
    }
    document.getElementById("modal-aceptar-usuarios").classList.add("active");
    loadUsersForApproval();
}

function loadUsersForApproval() {
    const container = document.getElementById("user-approval-list");
    if (!container) return;
    container.innerHTML = `<div style="text-align: center; color: #9ca3af; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> CARGANDO USUARIOS...</div>`;
    
    if (firebase.apps.length > 0) {
        const firestoreDb = firebase.firestore();
        firestoreDb.collection("users").get()
            .then(querySnapshot => {
                container.innerHTML = "";
                let usersList = [];
                querySnapshot.forEach(doc => {
                    usersList.push({ id: doc.id, ...doc.data() });
                });
                
                // Filter out the current user and the creator (omar850413@gmail.com) from the list
                const otherUsers = usersList.filter(u => u.id !== state.currentUser.uid && (u.email || "").toLowerCase() !== 'omar850413@gmail.com');
                
                if (otherUsers.length === 0) {
                    container.innerHTML = `<p style="text-align: center; color: #9ca3af; padding: 2rem; font-size: 0.9rem;">NO HAY OTROS USUARIOS REGISTRADOS EN EL SISTEMA.</p>`;
                    return;
                }
                
                otherUsers.forEach(user => {
                    const userCard = document.createElement("div");
                    userCard.style = "background: rgba(255, 255, 255, 0.02); padding: 1rem; border-radius: 12px; border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; gap: 1rem;";
                    
                    const isApproved = user.approved === true;
                    
                    userCard.innerHTML = `
                        <div style="flex-grow: 1;">
                            <h5 style="margin:0; font-size: 0.95rem; font-weight:600; text-transform: uppercase; color: #fff;">${user.name || 'SIN NOMBRE'}</h5>
                            <p style="margin: 0.2rem 0 0 0; font-size: 0.8rem; color: #9ca3af; text-transform: uppercase;">${user.email}</p>
                            <span class="badge ${isApproved ? 'badge-accent' : 'badge-danger'}" style="display: inline-block; margin-top: 0.4rem; font-size: 0.65rem; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: bold; background: ${isApproved ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}; color: ${isApproved ? '#10b981' : '#ef4444'};">
                                ${isApproved ? 'APROBADO' : 'PENDIENTE'}
                            </span>
                        </div>
                        <div style="display: flex; gap: 0.5rem; flex-shrink: 0;">
                            ${isApproved ? 
                                `<button class="btn" style="padding: 0.35rem 0.7rem; font-size: 0.75rem; background: #374151; color: #fff;" onclick="setUserApprovalStatus('${user.id}', false)">BLOQUEAR</button>` :
                                `<button class="btn btn-accent" style="padding: 0.35rem 0.7rem; font-size: 0.75rem;" onclick="setUserApprovalStatus('${user.id}', true)">APROBAR</button>`
                            }
                            <button class="btn btn-outline" style="padding: 0.35rem 0.7rem; font-size: 0.75rem; border-color: var(--color-danger); color: var(--color-danger); background: rgba(239, 68, 68, 0.05);" onclick="deleteUserAccount('${user.id}')"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    `;
                    container.appendChild(userCard);
                });
            })
            .catch(err => {
                container.innerHTML = `<p style="color: var(--color-danger); text-align: center;">ERROR AL CARGAR USUARIOS: ${err.message.toUpperCase()}</p>`;
            });
    }
}

function setUserApprovalStatus(userId, approvedStatus) {
    if (firebase.apps.length > 0) {
        const firestoreDb = firebase.firestore();
        firestoreDb.collection("users").doc(userId).update({ approved: approvedStatus })
            .then(() => {
                alert(approvedStatus ? "USUARIO APROBADO CON ÉXITO" : "ACCESO DE USUARIO REVOCADO");
                loadUsersForApproval();
            })
            .catch(err => {
                alert("ERROR: " + err.message.toUpperCase());
            });
    }
}

function deleteUserAccount(userId) {
    if (confirm("¿ESTÁS SEGURO DE QUE DESEAS ELIMINAR ESTE USUARIO DE LA BASE DE DATOS?")) {
        if (firebase.apps.length > 0) {
            const firestoreDb = firebase.firestore();
            firestoreDb.collection("users").doc(userId).delete()
                .then(() => {
                    alert("USUARIO ELIMINADO CON ÉXITO");
                    loadUsersForApproval();
                })
                .catch(err => {
                    alert("ERROR AL ELIMINAR: " + err.message.toUpperCase());
                });
        }
    }
}

// --- UTILIDAD DE FECHAS (SEMANAS) ---
function getWeekString(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return d.getUTCFullYear() + "-W" + String(weekNo).padStart(2, '0');
}

// Obtener las fechas de los días de una semana específica (de lunes a domingo)
function getDatesOfWeek(weekStr) {
    const parts = weekStr.split('-W');
    const year = parseInt(parts[0], 10);
    const week = parseInt(parts[1], 10);
    
    const simple = new Date(year, 0, 1 + (week - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = simple;
    if (dow <= 4) {
        ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    } else {
        ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
    }
    
    const dates = {};
    const diasNombres = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
    for (let i = 0; i < 7; i++) {
        const d = new Date(ISOweekStart);
        d.setDate(ISOweekStart.getDate() + i);
        
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        
        dates[diasNombres[i]] = `${yyyy}-${mm}-${dd}`;
    }
    return dates;
}

// --- CATEGORÍAS (FÚTBOL) ---
function openAddCategoriaModal() {
    document.getElementById('edit-categoria-id').value = "";
    document.getElementById('modal-categoria-title').innerHTML = '<i class="fa-solid fa-folder-plus"></i> Crear Nueva Categoría';
    document.getElementById('form-categoria').reset();
    document.getElementById('modal-categoria').classList.add('active');
}

function openEditCategoriaModal() {
    const cat = state.categorias.find(c => c.id === state.activeCategoriaId);
    if (!cat) return;
    
    document.getElementById('edit-categoria-id').value = cat.id;
    document.getElementById('modal-categoria-title').innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Editar Categoría';
    document.getElementById('cat-nombre').value = cat.nombre;
    
    // Marcar checkboxes correspondientes
    const checkboxes = document.querySelectorAll('input[name="cat-dias"]');
    checkboxes.forEach(cb => {
        cb.checked = cat.diasEntrenamiento.includes(cb.value);
    });
    
    document.getElementById('modal-categoria').classList.add('active');
}

async function guardarNuevaCategoria(event) {
    event.preventDefault();
    const id = document.getElementById('edit-categoria-id').value;
    const nombre = document.getElementById('cat-nombre').value.trim();
    
    // Extraer los años de 4 dígitos del nombre automáticamente
    const matches = nombre.match(/\b\d{4}\b/g);
    if (!matches || matches.length === 0) {
        alert("Escribe el año de nacimiento en el nombre de la categoría (ej: 2015 o 2015-2016) para que la app agrupe a los alumnos automáticamente.");
        return;
    }
    const years = matches.map(y => parseInt(y, 10));
    const anioInicio = Math.min(...years);
    const anioFin = Math.max(...years);
    
    const checkboxes = document.querySelectorAll('input[name="cat-dias"]:checked');
    const dias = Array.from(checkboxes).map(cb => cb.value);
    
    if (dias.length === 0) {
        alert("Selecciona al menos un día de entrenamiento.");
        return;
    }
    
    const datos = {
        nombre,
        anioInicio,
        anioFin,
        diasEntrenamiento: dias,
        sedeId: state.activeSedeId
    };
    
    try {
        if (id) {
            await window.db.actualizarCategoria(id, datos);
            alert("Categoría actualizada con éxito.");
            
            // Actualizar la cabecera detalle si era la categoría activa
            if (state.activeCategoriaId === id) {
                document.getElementById('cat-detalle-nombre').innerText = nombre.toUpperCase();
                document.getElementById('cat-detalle-meta').innerText = `RANGO DE EDAD: ${anioInicio} - ${anioFin} | ENTRENAMIENTOS: ${dias.join(', ')}`;
            }
        } else {
            await window.db.agregarCategoria(datos);
            alert("Categoría creada con éxito.");
        }
        closeModal('modal-categoria');
        document.getElementById('form-categoria').reset();
    } catch (err) {
        console.error("Error al guardar categoría:", err);
    }
}

function renderCategoriasSidebar() {
    const sidebar = document.getElementById('categorias-lista-sidebar');
    if (!sidebar) return;
    sidebar.innerHTML = "";
    
    // Botón especial para Ver Todas las Categorías
    const btnTodas = document.createElement('button');
    btnTodas.type = "button";
    const isTodasActive = state.activeCategoriaId === 'todas';
    btnTodas.className = `btn btn-full ${isTodasActive ? 'active' : ''}`;
    btnTodas.style = `text-align: left; padding: 0.9rem 1.2rem; border: ${isTodasActive ? '2px solid #f97316' : '1px solid var(--border-color)'}; background: ${isTodasActive ? 'rgba(249, 115, 22, 0.25) !important' : 'rgba(255, 255, 255, 0.03) !important'}; margin-bottom: 0.75rem; font-size: 1.05rem; display: flex; flex-direction: column; gap: 0.25rem; text-transform: uppercase; border-radius: 12px; transition: all 0.2s; box-shadow: 0 4px 12px rgba(0,0,0,0.15);`;
    btnTodas.innerHTML = `
        <strong style="color: #fff; font-size: 1.1rem; font-weight: bold;"><i class="fa-solid fa-layer-group"></i> Todas las Categorías</strong>
        <span style="font-size: 0.78rem; color: ${isTodasActive ? '#fff' : 'var(--color-text-muted)'}; font-weight: 500;">Pase de lista general de la sede</span>
    `;
    btnTodas.onclick = () => seleccionarCategoria('todas');
    sidebar.appendChild(btnTodas);
    
    const cats = state.categorias.filter(c => c.sedeId === state.activeSedeId);
    
    if (cats.length === 0) {
        sidebar.innerHTML = `<p style="text-align: center; color: var(--color-text-muted); font-size: 0.85rem; padding: 1rem;">NO HAY CATEGORÍAS CREADAS</p>`;
        return;
    }
    
    cats.forEach(c => {
        const btn = document.createElement('button');
        btn.type = "button";
        const isActive = state.activeCategoriaId === c.id;
        btn.className = `btn btn-full ${isActive ? 'active' : ''}`;
        
        // Estilo de naranja tenue/suave
        btn.style = `text-align: left; padding: 0.9rem 1.2rem; border: ${isActive ? '2px solid #f97316' : '1px solid rgba(249, 115, 22, 0.2)'}; background: ${isActive ? 'rgba(249, 115, 22, 0.25) !important' : 'rgba(249, 115, 22, 0.08) !important'}; margin-bottom: 0.75rem; font-size: 1.05rem; display: flex; flex-direction: column; gap: 0.35rem; text-transform: uppercase; border-radius: 12px; transition: all 0.2s; box-shadow: 0 4px 12px rgba(0,0,0,0.15);`;
        
        btn.innerHTML = `
            <strong style="color: #fff; font-size: 1.1rem; font-weight: bold;">${c.nombre}</strong>
            <span style="font-size: 0.78rem; color: ${isActive ? '#fff' : '#fdba74'}; font-weight: 500;"><i class="fa-solid fa-calendar"></i> RANGO: ${c.anioInicio}-${c.anioFin} (${c.diasEntrenamiento.join(', ')})</span>
        `;
        
        btn.onclick = () => seleccionarCategoria(c.id);
        sidebar.appendChild(btn);
    });
}

function seleccionarCategoria(id) {
    state.activeCategoriaId = id;
    localStorage.setItem('riveroll_active_categoria_id', id);
    renderCategoriasSidebar();
    
    // Activar modo enfoque (ocultar cabeceras y menús)
    document.body.classList.add('focus-attendance-mode');
    
    // Ajustar vista móvil/escritorio para pantalla completa
    document.getElementById('categorias-sidebar-col').style.display = 'none';
    document.getElementById('categorias-detalle-container').style.display = 'block';
    document.getElementById('btn-volver-categorias').style.display = 'block';

    document.getElementById('categorias-placeholder').style.display = 'none';
    document.getElementById('categoria-detalle-contenido').style.display = 'block';
    
    const isTodas = id === 'todas';
    const btnEliminar = document.getElementById('btn-eliminar-categoria-selected');
    
    if (isTodas) {
        document.getElementById('cat-detalle-nombre').innerText = "TODAS LAS CATEGORÍAS";
        document.getElementById('cat-detalle-meta').innerText = "LISTA COMPLETA DE ALUMNOS DE LA ACADEMIA";
        if (btnEliminar) btnEliminar.style.display = 'none';
    } else {
        const cat = state.categorias.find(c => c.id === id);
        if (cat) {
            document.getElementById('cat-detalle-nombre').innerText = cat.nombre.toUpperCase();
            document.getElementById('cat-detalle-meta').innerText = `RANGO DE EDAD: ${cat.anioInicio} - ${cat.anioFin} | ENTRENAMIENTOS: ${cat.diasEntrenamiento.join(', ')}`;
            if (btnEliminar) btnEliminar.style.display = 'inline-flex';
        }
    }
    
    // Sincronizar valor en el selector
    const selectCat = document.getElementById('asistencias-categoria-select');
    if (selectCat) {
        selectCat.value = id;
    }
    
    const dateInput = document.getElementById('asistencias-fecha-select');
    if (dateInput && !dateInput.value) {
        dateInput.value = obtenerFechaActualStr();
    }
    
    cargarPaseAsistenciaCategoria();
}

function seleccionarCategoriaDesdeFiltro() {
    const selectCat = document.getElementById('asistencias-categoria-select');
    if (!selectCat) return;
    const catId = selectCat.value;
    
    state.activeCategoriaId = catId;
    localStorage.setItem('riveroll_active_categoria_id', catId);
    
    // Actualizamos los textos de la cabecera
    const isTodas = catId === 'todas';
    const btnEliminar = document.getElementById('btn-eliminar-categoria-selected');
    
    if (isTodas) {
        document.getElementById('cat-detalle-nombre').innerText = "TODAS LAS CATEGORÍAS";
        document.getElementById('cat-detalle-meta').innerText = "LISTA COMPLETA DE ALUMNOS DE LA ACADEMIA";
        if (btnEliminar) btnEliminar.style.display = 'none';
    } else {
        const cat = state.categorias.find(c => c.id === catId);
        if (cat) {
            document.getElementById('cat-detalle-nombre').innerText = cat.nombre.toUpperCase();
            document.getElementById('cat-detalle-meta').innerText = `RANGO DE EDAD: ${cat.anioInicio} - ${cat.anioFin} | ENTRENAMIENTOS: ${cat.diasEntrenamiento.join(', ')}`;
            if (btnEliminar) btnEliminar.style.display = 'inline-flex';
        }
    }
    
    renderCategoriasSidebar();
    cargarPaseAsistenciaCategoria();
}

function volverAListaCategorias() {
    // Desactivar modo enfoque
    document.body.classList.remove('focus-attendance-mode');
    localStorage.removeItem('riveroll_active_categoria_id');
    
    document.getElementById('categorias-sidebar-col').style.display = 'block';
    document.getElementById('categorias-detalle-container').style.display = 'none';
    document.getElementById('btn-volver-categorias').style.display = 'none';
    
    // Restaurar barra de navegación interna si existe
    const subTabs = document.querySelector('.sub-tabs-container');
    if (subTabs) subTabs.style.display = 'flex';
    
    state.activeCategoriaId = null;
    renderCategoriasSidebar();
}

function volverAlMenuGym() {
    document.body.classList.remove('focus-attendance-mode');
    const btnVolverGym = document.getElementById('btn-volver-gym');
    if (btnVolverGym) btnVolverGym.style.display = 'none';
    switchSedeView('miembros');
}

function toggleAsistenciaDraft(aluId, fechaDia, button) {
    if (!state.asistenciaDraft) {
        state.asistenciaDraft = {};
    }
    if (!state.asistenciaDraft[fechaDia]) {
        state.asistenciaDraft[fechaDia] = {};
    }
    
    const estadoActual = state.asistenciaDraft[fechaDia][aluId] || 'falta';
    const nuevoEstado = estadoActual === 'asistencia' ? 'falta' : 'asistencia';
    state.asistenciaDraft[fechaDia][aluId] = nuevoEstado;
    
    const esAsistencia = nuevoEstado === 'asistencia';
    button.innerText = esAsistencia ? 'PRESENTE' : 'FALTA';
    button.style = `min-width: 120px; font-weight: bold; border-radius: 20px; padding: 0.5rem 1rem; transition: all 0.2s; ${esAsistencia ? 'background-color: rgba(16, 185, 129, 0.15) !important; color: #10b981 !important; border: 1px solid #10b981;' : 'background-color: rgba(239, 68, 68, 0.15) !important; color: #ef4444 !important; border: 1px solid #ef4444;'}`;
}

function toggleAsistenciaDraftGym(aluId, fechaDia, button) {
    if (!state.asistenciaDraftGym) {
        state.asistenciaDraftGym = {};
    }
    if (!state.asistenciaDraftGym[fechaDia]) {
        state.asistenciaDraftGym[fechaDia] = {};
    }
    
    const estadoActual = state.asistenciaDraftGym[fechaDia][aluId] || 'falta';
    const nuevoEstado = estadoActual === 'asistencia' ? 'falta' : 'asistencia';
    state.asistenciaDraftGym[fechaDia][aluId] = nuevoEstado;
    
    const esAsistencia = nuevoEstado === 'asistencia';
    button.innerText = esAsistencia ? 'PRESENTE' : 'FALTA';
    button.style = `min-width: 120px; font-weight: bold; border-radius: 20px; padding: 0.5rem 1rem; transition: all 0.2s; ${esAsistencia ? 'background-color: rgba(16, 185, 129, 0.15) !important; color: #10b981 !important; border: 1px solid #10b981;' : 'background-color: rgba(239, 68, 68, 0.15) !important; color: #ef4444 !important; border: 1px solid #ef4444;'}`;
}

async function eliminarCategoriaSeleccionada() {
    if (confirm("¿Estás seguro de que deseas eliminar esta categoría? Se conservarán los alumnos en la vista general de miembros pero se borrará la agrupación y configuración de entrenamientos.")) {
        try {
            await window.db.eliminarCategoria(state.activeCategoriaId);
            state.activeCategoriaId = null;
            document.getElementById('categorias-placeholder').style.display = 'block';
            document.getElementById('categoria-detalle-contenido').style.display = 'none';
            volverAListaCategorias();
        } catch (err) {
            console.error("Error al eliminar categoría:", err);
        }
    }
}

// --- PASE DE ASISTENCIA (CATEGORÍA FÚTBOL) ---
function cargarPaseAsistenciaCategoria() {
    const isTodas = state.activeCategoriaId === 'todas';
    const cat = isTodas 
        ? { id: 'todas', nombre: 'TODAS LAS CATEGORÍAS', diasEntrenamiento: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"], anioInicio: 2000, anioFin: 2030 } 
        : state.categorias.find(c => c.id === state.activeCategoriaId);
        
    if (!cat) return;
    
    const container = document.getElementById('lista-asistencia-tarjetas');
    if (!container) return;
    
    const dateInput = document.getElementById('asistencias-fecha-select');
    if (!dateInput) return;
    const fechaSeleccionada = dateInput.value;
    if (!fechaSeleccionada) return;
    
    // Llenar el selector de categorías en la cabecera
    const selectCat = document.getElementById('asistencias-categoria-select');
    if (selectCat) {
        const catsSede = state.categorias.filter(c => c.sedeId === state.activeSedeId);
        const currentVal = selectCat.value || state.activeCategoriaId;
        
        // Regenerar opciones si cambió el número de categorías
        const currentOptions = Array.from(selectCat.options).map(o => o.value).filter(v => v !== 'todas');
        const changed = currentOptions.length !== catsSede.length || !catsSede.every(c => currentOptions.includes(c.id));
        
        if (changed) {
            selectCat.innerHTML = '<option value="todas">TODAS LAS CATEGORÍAS</option>';
            catsSede.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.innerText = c.nombre.toUpperCase();
                selectCat.appendChild(opt);
            });
            selectCat.value = currentVal;
        }
    }
    
    // Obtener la semana y día de la semana correspondientes a la fecha elegida
    const fechaObj = new Date(fechaSeleccionada + 'T00:00:00');
    const weekStr = getWeekString(fechaObj);
    const weekDates = getDatesOfWeek(weekStr);
    
    const diasMap = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const diaSemana = diasMap[fechaObj.getDay()];
    const esDiaEntrenamiento = cat.diasEntrenamiento.includes(diaSemana);
    
    // Inicializar el borrador semanal si cambió de semana o categoría
    if (!state.asistenciaDraft || state.asistenciaDraft._weekStr !== weekStr || state.asistenciaDraft._catId !== cat.id) {
        state.asistenciaDraft = {
            _weekStr: weekStr,
            _catId: cat.id
        };
        
        if (isTodas) {
            const catsSede = state.categorias.filter(c => c.sedeId === state.activeSedeId);
            const catsIds = catsSede.map(c => c.id);
            const asistenciasSemana = state.asistencias.filter(a => a.semana === weekStr && (catsIds.includes(a.categoriaId) || a.categoriaId === 'todas'));
            
            cat.diasEntrenamiento.forEach(dia => {
                const fDia = weekDates[dia];
                state.asistenciaDraft[fDia] = {};
            });
            
            asistenciasSemana.forEach(dbDiaEntry => {
                const fDia = dbDiaEntry.fecha;
                if (!state.asistenciaDraft[fDia]) state.asistenciaDraft[fDia] = {};
                if (dbDiaEntry.registros) {
                    state.asistenciaDraft[fDia] = { ...state.asistenciaDraft[fDia], ...dbDiaEntry.registros };
                }
            });
        } else {
            const asistenciasSemana = state.asistencias.filter(a => a.semana === weekStr && a.categoriaId === cat.id);
            cat.diasEntrenamiento.forEach(dia => {
                const fDia = weekDates[dia];
                state.asistenciaDraft[fDia] = {};
                const dbDiaEntry = asistenciasSemana.find(a => a.fecha === fDia);
                if (dbDiaEntry && dbDiaEntry.registros) {
                    state.asistenciaDraft[fDia] = { ...dbDiaEntry.registros };
                }
            });
            
            if (!state.asistenciaDraft[fechaSeleccionada]) {
                state.asistenciaDraft[fechaSeleccionada] = {};
                const dbDiaEntry = state.asistencias.find(a => a.fecha === fechaSeleccionada && a.categoriaId === cat.id);
                if (dbDiaEntry && dbDiaEntry.registros) {
                    state.asistenciaDraft[fechaSeleccionada] = { ...dbDiaEntry.registros };
                }
            }
        }
    }
    
    container.innerHTML = "";
    
    // Si no es día configurado de entrenamiento, mostrar una advertencia amistosa
    if (!esDiaEntrenamiento) {
        const warning = document.createElement('div');
        warning.style = "background: rgba(205,162,80,0.1); border: 1px solid var(--color-accent); color: var(--color-accent); padding: 0.75rem; border-radius: 8px; font-size: 0.8rem; text-align: center; text-transform: uppercase; font-weight: bold; margin-bottom: 0.5rem;";
        warning.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Hoy es ${diaSemana.toUpperCase()}. No es día de entrenamiento oficial (${cat.diasEntrenamiento.join(', ').toUpperCase()}).`;
        container.appendChild(warning);
    }
    
    const selectCatElement = document.getElementById('asistencias-categoria-select');
    const catFiltroVal = selectCatElement ? selectCatElement.value : 'todas';
    
    let alumnosCat = [];
    if (catFiltroVal === 'todas') {
        alumnosCat = state.alumnos.filter(alu => alu.sedeId === state.activeSedeId);
    } else {
        const c = state.categorias.find(x => x.id === catFiltroVal);
        if (c) {
            alumnosCat = state.alumnos.filter(alu => {
                if (alu.sedeId !== state.activeSedeId) return false;
                if (alu.categoriaId === c.id) return true;
                if (alu.categoriaId && alu.categoriaId !== 'auto') return false;
                if (!alu.fechaNacimiento) return false;
                const anioNac = parseInt(alu.fechaNacimiento.split('-')[0], 10);
                return anioNac >= c.anioInicio && anioNac <= c.anioFin;
            });
        }
    }
    
    if (alumnosCat.length === 0) {
        container.innerHTML += `<div style="text-align: center; color: #9ca3af; padding: 2rem;">NO HAY INTEGRANTES QUE CORRESPONDAN A ESTA SELECCIÓN</div>`;
        return;
    }
    
    alumnosCat.forEach(alu => {
        if (!state.asistenciaDraft[fechaSeleccionada]) {
            state.asistenciaDraft[fechaSeleccionada] = {};
        }
        const estado = state.asistenciaDraft[fechaSeleccionada][alu.id] || 'falta';
        const esAsistencia = estado === 'asistencia';
        const bgBtn = esAsistencia ? 'background-color: rgba(16, 185, 129, 0.15) !important; color: #10b981 !important; border: 1px solid #10b981;' : 'background-color: rgba(239, 68, 68, 0.15) !important; color: #ef4444 !important; border: 1px solid #ef4444;';
        
        const card = document.createElement('div');
        card.style = "display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); padding: 0.75rem 1rem; border-radius: 12px; border: 1px solid var(--border-color); gap: 1rem;";
        card.innerHTML = `
            <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem;">
                <span style="font-weight: bold; color: #fff; font-size: 0.95rem; text-transform: uppercase; word-break: break-word; line-height: 1.2;">${alu.nombre}</span>
                <span style="font-size: 0.75rem; color: var(--color-text-muted);">AÑO NAC: ${alu.fechaNacimiento ? alu.fechaNacimiento.split('-')[0] : 'N/A'}</span>
            </div>
            <div style="flex-shrink: 0;">
                <button type="button" class="btn btn-sm" style="min-width: 110px; font-weight: bold; border-radius: 20px; padding: 0.5rem 1rem; transition: all 0.2s; ${bgBtn}" onclick="toggleAsistenciaDraft('${alu.id}', '${fechaSeleccionada}', this)">
                    ${esAsistencia ? 'PRESENTE' : 'FALTA'}
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

async function guardarAsistenciaCategoria() {
    const isTodas = state.activeCategoriaId === 'todas';
    const cat = isTodas ? { id: 'todas' } : state.categorias.find(c => c.id === state.activeCategoriaId);
    if (!cat) return;
    
    const dateInput = document.getElementById('asistencias-fecha-select');
    if (!dateInput) return;
    const fechaSeleccionada = dateInput.value;
    if (!fechaSeleccionada) return;
    
    const fechaObj = new Date(fechaSeleccionada + 'T00:00:00');
    const weekStr = getWeekString(fechaObj);
    
    try {
        const fechasBorrador = Object.keys(state.asistenciaDraft).filter(k => k !== '_weekStr' && k !== '_catId');
        
        if (isTodas) {
            // Si es "todas", agrupamos por la categoría correcta del alumno en base a su año de nacimiento
            const catsSede = state.categorias.filter(c => c.sedeId === state.activeSedeId);
            
            for (const f of fechasBorrador) {
                const registrosCompletos = state.asistenciaDraft[f] || {};
                
                // Agrupar registros por categoría
                const registrosPorCat = {};
                catsSede.forEach(c => {
                    registrosPorCat[c.id] = {};
                });
                
                Object.keys(registrosCompletos).forEach(aluId => {
                    const alu = state.alumnos.find(a => a.id === aluId);
                    if (alu) {
                        let matchedCat = null;
                        if (alu.categoriaId && alu.categoriaId !== 'auto') {
                            matchedCat = catsSede.find(c => c.id === alu.categoriaId);
                        } else if (alu.fechaNacimiento) {
                            const anioNac = parseInt(alu.fechaNacimiento.split('-')[0], 10);
                            matchedCat = catsSede.find(c => anioNac >= c.anioInicio && anioNac <= c.anioFin);
                        }
                        if (matchedCat && registrosPorCat[matchedCat.id]) {
                            registrosPorCat[matchedCat.id][aluId] = registrosCompletos[aluId];
                        }
                    }
                });
                
                // Guardar cada categoría que tenga registros en la base de datos
                for (const cId of Object.keys(registrosPorCat)) {
                    await window.db.guardarAsistencia({
                        fecha: f,
                        semana: weekStr,
                        categoriaId: cId,
                        sedeId: state.activeSedeId,
                        registros: registrosPorCat[cId]
                    });
                }
            }
        } else {
            // Guardado tradicional de una sola categoría
            for (const f of fechasBorrador) {
                const registros = state.asistenciaDraft[f] || {};
                await window.db.guardarAsistencia({
                    fecha: f,
                    semana: weekStr,
                    categoriaId: cat.id,
                    sedeId: state.activeSedeId,
                    registros: registros
                });
            }
        }
        alert("Asistencias de la semana guardadas correctamente.");
    } catch (err) {
        console.error("Error al guardar asistencias:", err);
        alert("Error al guardar asistencias: " + err.message);
    }
}

// --- PASE DE ASISTENCIA (GIMNASIO) ---
function cargarPaseAsistenciaGym() {
    const container = document.getElementById('lista-asistencia-tarjetas-gym');
    if (!container) return;
    
    const dateInput = document.getElementById('asistencias-fecha-select-gym');
    if (!dateInput) return;
    const fechaSeleccionada = dateInput.value;
    if (!fechaSeleccionada) return;
    
    const fechaObj = new Date(fechaSeleccionada + 'T00:00:00');
    const weekStr = getWeekString(fechaObj);
    const weekDates = getDatesOfWeek(weekStr);
    
    const suscriptores = state.alumnos.filter(alu => alu.sedeId === state.activeSedeId);
    
    // 1. Obtener todos los horarios únicos de los suscriptores activos para llenar el selector
    const selectHorario = document.getElementById('asistencias-horario-select-gym');
    if (selectHorario) {
        const valorActual = selectHorario.value;
        const horariosUnicos = [...new Set(suscriptores.map(a => a.horario || '').filter(h => h.trim() !== ''))];
        
        // Solo regenerar si las opciones han cambiado
        const currentOptions = Array.from(selectHorario.options).map(o => o.value).filter(v => v !== '');
        const changed = currentOptions.length !== horariosUnicos.length || !horariosUnicos.every(h => currentOptions.includes(h));
        
        if (changed) {
            selectHorario.innerHTML = '<option value="">TODOS LOS HORARIOS</option>';
            horariosUnicos.sort().forEach(h => {
                const opt = document.createElement('option');
                opt.value = h;
                opt.innerText = h.toUpperCase();
                selectHorario.appendChild(opt);
            });
            if (horariosUnicos.includes(valorActual)) {
                selectHorario.value = valorActual;
            }
        }
    }

    const horarioFiltrado = selectHorario ? selectHorario.value : '';
    const suscriptoresFiltrados = horarioFiltrado 
        ? suscriptores.filter(alu => (alu.horario || '').toLowerCase() === horarioFiltrado.toLowerCase())
        : suscriptores;

    container.innerHTML = "";
    
    if (suscriptoresFiltrados.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: #9ca3af; padding: 2rem;">NO HAY INTEGRANTES O SUSCRIPTORES REGISTRADOS EN ESTE GIMNASIO CON EL CRITERIO SELECCIONADO</div>`;
        return;
    }
    
    const diasGym = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    
    if (!state.asistenciaDraftGym || state.asistenciaDraftGym._weekStr !== weekStr) {
        state.asistenciaDraftGym = {
            _weekStr: weekStr
        };
        const asistenciasSemana = state.asistencias.filter(a => a.semana === weekStr && a.categoriaId === 'gym');
        diasGym.forEach(dia => {
            const fDia = weekDates[dia];
            state.asistenciaDraftGym[fDia] = {};
            const dbDiaEntry = asistenciasSemana.find(a => a.fecha === fDia);
            if (dbDiaEntry && dbDiaEntry.registros) {
                state.asistenciaDraftGym[fDia] = { ...dbDiaEntry.registros };
            }
        });
        
        if (!state.asistenciaDraftGym[fechaSeleccionada]) {
            state.asistenciaDraftGym[fechaSeleccionada] = {};
            const dbDiaEntry = state.asistencias.find(a => a.fecha === fechaSeleccionada && a.categoriaId === 'gym');
            if (dbDiaEntry && dbDiaEntry.registros) {
                state.asistenciaDraftGym[fechaSeleccionada] = { ...dbDiaEntry.registros };
            }
        }
    }
    
    suscriptoresFiltrados.forEach(alu => {
        if (!state.asistenciaDraftGym[fechaSeleccionada]) {
            state.asistenciaDraftGym[fechaSeleccionada] = {};
        }
        const estado = state.asistenciaDraftGym[fechaSeleccionada][alu.id] || 'falta';
        const esAsistencia = estado === 'asistencia';
        const bgBtn = esAsistencia ? 'background-color: rgba(16, 185, 129, 0.15) !important; color: #10b981 !important; border: 1px solid #10b981;' : 'background-color: rgba(239, 68, 68, 0.15) !important; color: #ef4444 !important; border: 1px solid #ef4444;';
        
        const card = document.createElement('div');
        card.style = "display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.02); padding: 0.75rem 1rem; border-radius: 12px; border: 1px solid var(--border-color); gap: 1rem;";
        card.innerHTML = `
            <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem;">
                <span style="font-weight: bold; color: #fff; font-size: 0.95rem; text-transform: uppercase; word-break: break-word; line-height: 1.2;">${alu.nombre}</span>
                <span style="font-size: 0.75rem; color: var(--color-text-muted);">SUSCRIPTOR ACTIVO ${alu.horario ? `| HORARIO: ${alu.horario.toUpperCase()}` : ''}</span>
            </div>
            <div style="flex-shrink: 0;">
                <button type="button" class="btn btn-sm" style="min-width: 110px; font-weight: bold; border-radius: 20px; padding: 0.5rem 1rem; transition: all 0.2s; ${bgBtn}" onclick="toggleAsistenciaDraftGym('${alu.id}', '${fechaSeleccionada}', this)">
                    ${esAsistencia ? 'PRESENTE' : 'FALTA'}
                </button>
            </div>
        `;
        container.appendChild(card);
    });
}

async function guardarAsistenciaGym() {
    const dateInput = document.getElementById('asistencias-fecha-select-gym');
    if (!dateInput) return;
    const fechaSeleccionada = dateInput.value;
    if (!fechaSeleccionada) return;
    
    const fechaObj = new Date(fechaSeleccionada + 'T00:00:00');
    const weekStr = getWeekString(fechaObj);
    
    try {
        const fechasBorrador = Object.keys(state.asistenciaDraftGym).filter(k => k !== '_weekStr');
        
        for (const f of fechasBorrador) {
            const registros = state.asistenciaDraftGym[f] || {};
            await window.db.guardarAsistencia({
                fecha: f,
                semana: weekStr,
                categoriaId: 'gym',
                sedeId: state.activeSedeId,
                registros: registros
            });
        }
        alert("Asistencias de la semana guardadas correctamente.");
    } catch (err) {
        console.error("Error al guardar asistencias del gimnasio:", err);
        alert("Error al guardar asistencias: " + err.message);
    }
}

// --- GENERACIÓN DE REPORTES PDF PROFESIONALES ---
function descargarAsistenciasPDF(tipo) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape'); // Formato horizontal
    
    const sede = state.sedes.find(s => s.id === state.activeSedeId);
    if (!sede) return;
    
    let weekStr = "";
    let catNombre = "";
    let diasEntrenamiento = [];
    let alumnos = [];
    let asistenciasSemana = [];
    
    if (tipo === 'soccer') {
        const cat = state.categorias.find(c => c.id === state.activeCategoriaId);
        if (!cat) return;
        
        const dateInput = document.getElementById('asistencias-fecha-select');
        const fechaSeleccionada = dateInput ? dateInput.value || obtenerFechaActualStr() : obtenerFechaActualStr();
        weekStr = getWeekString(new Date(fechaSeleccionada + 'T00:00:00'));
        catNombre = cat.nombre.toUpperCase();
        diasEntrenamiento = cat.diasEntrenamiento;
        
        alumnos = state.alumnos.filter(alu => {
            if (alu.sedeId !== state.activeSedeId) return false;
            if (alu.categoriaId === cat.id) return true;
            if (alu.categoriaId && alu.categoriaId !== 'auto') return false;
            if (!alu.fechaNacimiento) return false;
            const anioNac = parseInt(alu.fechaNacimiento.split('-')[0], 10);
            return anioNac >= cat.anioInicio && anioNac <= cat.anioFin;
        });
        
        asistenciasSemana = state.asistencias.filter(a => a.semana === weekStr && a.categoriaId === cat.id);
    } else {
        const dateInput = document.getElementById('asistencias-fecha-select-gym');
        const fechaSeleccionada = dateInput ? dateInput.value || obtenerFechaActualStr() : obtenerFechaActualStr();
        weekStr = getWeekString(new Date(fechaSeleccionada + 'T00:00:00'));
        catNombre = "ASISTENCIA GENERAL GIMNASIO";
        diasEntrenamiento = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
        
        alumnos = state.alumnos.filter(alu => alu.sedeId === state.activeSedeId);
        asistenciasSemana = state.asistencias.filter(a => a.semana === weekStr && a.categoriaId === 'gym');
    }
    
    if (!weekStr) {
        alert("Selecciona una semana antes de generar el PDF.");
        return;
    }
    
    const weekDates = getDatesOfWeek(weekStr);
    
    // --- DISEÑO DE ENCABEZADO ---
    // Banner superior oscuro
    doc.setFillColor(31, 41, 55);
    doc.rect(0, 0, 297, 35, 'F');
    
    // Nombre del Negocio
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(sede.nombre.toUpperCase(), 15, 18);
    
    // Subtítulo
    doc.setTextColor(205, 162, 80); // Color oro corporativo
    doc.setFontSize(10);
    doc.text(`REPORTE DE ASISTENCIA SEMANAL - CATEGORÍA: ${catNombre}`, 15, 25);
    doc.text(`SEMANA: ${weekStr}`, 15, 30);
    
    // Agregar Logo si existe en Base64
    const logoImg = sede.logo || state.base64SedeLogo;
    if (logoImg && (logoImg.startsWith('data:image') || logoImg.startsWith('http'))) {
        try {
            if (logoImg.startsWith('data:image')) {
                doc.addImage(logoImg, 'JPEG', 250, 5, 25, 25);
            }
        } catch (e) {
            console.log("No se pudo incrustar el logo en el PDF:", e);
        }
    }
    
    // Cabecera de la Tabla
    let startY = 45;
    doc.setFillColor(243, 244, 246);
    doc.rect(15, startY, 267, 10, 'F');
    
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Integrante", 18, startY + 7);
    
    let colX = 140;
    const colWidth = 20;
    diasEntrenamiento.forEach(dia => {
        const fechaDia = weekDates[dia];
        const labelFecha = fechaDia ? fechaDia.split('-').slice(1).join('/') : '';
        doc.text(`${dia.substring(0, 3)} (${labelFecha})`, colX, startY + 7);
        colX += colWidth;
    });
    
    doc.text("Asist.", 265, startY + 7);
    
    // Cuerpo de la Tabla
    doc.setFont("helvetica", "normal");
    let rowY = startY + 10;
    
    alumnos.forEach((alu, index) => {
        if (index % 2 === 0) {
            doc.setFillColor(249, 250, 251);
            doc.rect(15, rowY, 267, 8, 'F');
        }
        
        doc.setTextColor(31, 41, 55);
        doc.text(alu.nombre.toUpperCase(), 18, rowY + 5.5);
        
        let colValX = 140;
        let asistCount = 0;
        
        diasEntrenamiento.forEach(dia => {
            const fechaDia = weekDates[dia];
            const asistFecha = asistenciasSemana.find(a => a.fecha === fechaDia);
            const estado = (asistFecha && asistFecha.registros) ? asistFecha.registros[alu.id] : 'falta';
            
            if (estado === 'asistencia') {
                doc.setTextColor(16, 185, 129); // Verde
                doc.text("SI", colValX + 5, rowY + 5.5);
                asistCount++;
            } else {
                doc.setTextColor(239, 68, 68); // Rojo
                doc.text("NO", colValX + 5, rowY + 5.5);
            }
            colValX += colWidth;
        });
        
        doc.setTextColor(31, 41, 55);
        doc.text(asistCount.toString(), 268, rowY + 5.5);
        
        doc.setDrawColor(229, 231, 235);
        doc.line(15, rowY + 8, 282, rowY + 8);
        rowY += 8;
        
        if (rowY > 180) {
            doc.addPage('landscape');
            rowY = 20;
            
            doc.setFillColor(243, 244, 246);
            doc.rect(15, rowY, 267, 10, 'F');
            doc.setTextColor(31, 41, 55);
            doc.setFont("helvetica", "bold");
            doc.text("Integrante", 18, rowY + 7);
            let cx = 140;
            diasEntrenamiento.forEach(dia => {
                const fechaDia = weekDates[dia];
                const labelFecha = fechaDia ? fechaDia.split('-').slice(1).join('/') : '';
                doc.text(`${dia.substring(0, 3)} (${labelFecha})`, cx, rowY + 7);
                cx += colWidth;
            });
            doc.text("Asist.", 265, rowY + 7);
            doc.setFont("helvetica", "normal");
            rowY += 10;
        }
    });
    
    const filename = `Asistencias_${sede.nombre.replace(/\s+/g, '_')}_${weekStr}.pdf`;
    doc.save(filename);
}

