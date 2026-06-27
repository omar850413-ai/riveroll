/**
 * app.js - Lógica de Negocio Corporativa de la Academia & Gym Riveroll v3.0
 * Control de navegación en cascada, dictado por voz, cámara web en vivo,
 * ciclo de cobros en tres estados con abonos morados, y WhatsApp dinámico.
 */

// --- AUTO-LIMPIEZA DE CACHÉ PWA PARA CORREGIR ACCESO EN MÓVILES ---
if (localStorage.getItem('riveroll_pwa_version_clean') !== '8.0') {
    localStorage.setItem('riveroll_pwa_version_clean', '8.0');
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
    
    // Variables temporales para el flujo del modal de Abonos
    tempAbonoMiembroId: null,
    tempAbonoCampo: null
};

// Instancias globales para el control multimedia
let streamCamara = null;
let speechRecognitionInstancia = null;

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar el Listener de Autenticación de Firebase
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            // Usuario conectado
            state.currentUser = user;
            state.isSuperAdmin = (user.email === 'omar850413@gmail.com');
            window.db.setCurrentUser(user);
            
            // Ocultar Overlay de Autenticación
            document.getElementById('auth-overlay').style.display = 'none';
            
            // Suscribirse a las colecciones sólo si no se ha hecho
            if (!state.isSubscribed) {
                window.db.suscribir('sedes', (nuevasSedes) => {
                    state.sedes = nuevasSedes;
                    renderSedes();
                    actualizarSelectoresFiltros();
                    if (state.activeSedeId) actualizarEncabezadoDetalleSede();
                });

                window.db.suscribir('alumnos', (nuevosAlumnos) => {
                    state.alumnos = nuevosAlumnos;
                    if (state.activeSedeId) {
                        renderAlumnosDrilldown();
                        renderPlanillaCobrosSede();
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
                
                state.isSubscribed = true;
            }
            
            actualizarBotonEstadoNube();
        } else {
            // Usuario desconectado
            state.currentUser = null;
            state.isSuperAdmin = false;
            state.isSubscribed = false;
            window.db.setCurrentUser(null);
            
            // Limpiar datos
            state.sedes = [];
            state.alumnos = [];
            state.transacciones = [];
            state.activeSedeId = null;
            
            // Mostrar Overlay de Autenticación
            document.getElementById('auth-overlay').style.display = 'flex';
            switchAuthTab('login');
        }
    });
});

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
    state.activeSedeId = sedeId;
    state.activeSedeSubView = 'miembros';
    
    // Cambiar clases activas de sub-pestañas
    const btnMiembros = document.getElementById('subtab-miembros-btn');
    const btnConta = document.getElementById('subtab-contabilidad-btn');
    
    const sede = state.sedes.find(s => s.id === sedeId);
    if (!sede) return;
    
    const esSoccer = sede.rubro === 'soccer';
    
    // Adaptar colores de las pestañas internas
    btnMiembros.className = `sub-tab-btn active ${esSoccer ? 'soccer' : 'gym'}`;
    btnConta.className = `sub-tab-btn ${esSoccer ? 'soccer' : 'gym'}`;
    
    actualizarEncabezadoDetalleSede();
    
    // Alternar paneles de vista
    document.getElementById('panel-dashboard').classList.remove('active');
    document.getElementById('panel-detalle-sede').classList.add('active');
    
    // Resetear sub-vistas
    switchSedeView('miembros');
}

function volverAlDashboard() {
    state.activeSedeId = null;
    apagarCamara(); // Asegurar apagar la cámara si se dejó abierta
    
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
    state.activeSedeSubView = viewId;
    
    const btnMiembros = document.getElementById('subtab-miembros-btn');
    const btnConta = document.getElementById('subtab-contabilidad-btn');
    const btnTotales = document.getElementById('subtab-totales-btn');
    const btnTrabajadores = document.getElementById('subtab-trabajadores-btn');
    
    const sede = state.sedes.find(s => s.id === state.activeSedeId);
    const esSoccer = sede ? sede.rubro === 'soccer' : true;
    
    // Resetear clases
    btnMiembros.className = `sub-tab-btn ${esSoccer ? 'soccer' : 'gym'}`;
    btnConta.className = `sub-tab-btn ${esSoccer ? 'soccer' : 'gym'}`;
    btnTotales.className = `sub-tab-btn ${esSoccer ? 'soccer' : 'gym'}`;
    if (btnTrabajadores) btnTrabajadores.className = `sub-tab-btn ${esSoccer ? 'soccer' : 'gym'}`;
    
    // Ocultar todos los subpaneles
    document.getElementById('sub-panel-miembros').style.display = 'none';
    document.getElementById('sub-panel-contabilidad').style.display = 'none';
    document.getElementById('sub-panel-totales').style.display = 'none';
    const panelTrabajadores = document.getElementById('sub-panel-trabajadores');
    if (panelTrabajadores) panelTrabajadores.style.display = 'none';
    
    if (viewId === 'miembros') {
        btnMiembros.className = `sub-tab-btn active ${esSoccer ? 'soccer' : 'gym'}`;
        document.getElementById('sub-panel-miembros').style.display = 'block';
        renderAlumnosDrilldown();
    } else if (viewId === 'contabilidad') {
        btnConta.className = `sub-tab-btn active ${esSoccer ? 'soccer' : 'gym'}`;
        document.getElementById('sub-panel-contabilidad').style.display = 'block';
        renderPlanillaCobrosSede();
    } else if (viewId === 'totales') {
        btnTotales.className = `sub-tab-btn active ${esSoccer ? 'soccer' : 'gym'}`;
        document.getElementById('sub-panel-totales').style.display = 'block';
        renderResumenFinanzas();
        renderEgresosLista();
    } else if (viewId === 'trabajadores') {
        if (btnTrabajadores) btnTrabajadores.className = `sub-tab-btn active ${esSoccer ? 'soccer' : 'gym'}`;
        if (panelTrabajadores) panelTrabajadores.style.display = 'block';
        renderTrabajadoresGrid();
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
                            ? `<p><strong>Teléfono Tutor:</strong> <a href="https://wa.me/${miembro.tutorTelefono.startsWith('52') ? miembro.tutorTelefono : '52' + miembro.tutorTelefono}" target="_blank" style="color: #38bdf8; text-decoration: none;"><i class="fa-brands fa-whatsapp"></i> ${miembro.tutorTelefono}</a></p>
                               <p><strong>Tutor/Responsable:</strong> ${miembro.tutorNombre || '-'}</p>
                               <p><strong>Rama:</strong> ${miembro.rama || 'Mixto'}</p>
                               ${miembro.camiseta ? `<p><strong>Número de Camiseta:</strong> #${miembro.camiseta}</p>` : ''}`
                            : `<p><strong>Teléfono Suscriptor:</strong> <a href="https://wa.me/${miembro.telefonoSuscriptor.startsWith('52') ? miembro.telefonoSuscriptor : '52' + miembro.telefonoSuscriptor}" target="_blank" style="color: #38bdf8; text-decoration: none;"><i class="fa-brands fa-whatsapp"></i> ${miembro.telefonoSuscriptor}</a></p>
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
    const categoria = document.getElementById('alumno-categoria').value;
    const tutorNombre = document.getElementById('alumno-tutor').value;
    const tutorTelefono = document.getElementById('alumno-telefono').value;
    const camiseta = document.getElementById('alumno-camiseta') ? document.getElementById('alumno-camiseta').value : '';
    
    // Campos de Gimnasio
    const telefonoSuscriptor = document.getElementById('alumno-telefono-suscriptor') ? document.getElementById('alumno-telefono-suscriptor').value : '';
    const emergenciaNombre = document.getElementById('alumno-emergencia-nombre') ? document.getElementById('alumno-emergencia-nombre').value : '';
    const emergenciaTelefono = document.getElementById('alumno-emergencia-telefono') ? document.getElementById('alumno-emergencia-telefono').value : '';
    
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
        tutorNombre,
        tutorTelefono,
        rama,
        camiseta,
        
        // Gimnasio
        telefonoSuscriptor,
        emergenciaNombre,
        emergenciaTelefono,
        
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

function openAddAlumnoModal() {
    const Sede = state.sedes.find(s => s.id === state.activeSedeId);
    if (!Sede) return;
    const esSoccer = Sede.rubro === 'soccer';
    
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
    
    document.getElementById('modal-alumno-title').innerText = esSoccer ? "Editar Alumno (Fútbol)" : "Editar Suscriptor (Gym)";
    document.getElementById('edit-alumno-id').value = alumno.id;
    document.getElementById('alumno-nombre').value = alumno.nombre;
    document.getElementById('alumno-nacimiento').value = alumno.fechaNacimiento;
    document.getElementById('alumno-categoria').value = alumno.categoria;
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
        if (catInput) catInput.value = 'Adulto / Gym';
    } else {
        if (nacInput) {
            nacInput.required = true;
        }
        calcularCategoriaAuto();
    }
}

function calcularCategoriaAuto() {
    const fechaInput = document.getElementById('alumno-nacimiento');
    if (!fechaInput) return;
    const fecha = fechaInput.value;
    const Sede = state.sedes.find(s => s.id === state.activeSedeId);
    
    if (Sede && Sede.rubro === 'gym') {
        document.getElementById('alumno-categoria').value = 'Adulto / Gym';
        return;
    }
    
    if (!fecha) return;
    const anio = fecha.split('-')[0];
    document.getElementById('alumno-categoria').value = anio;
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

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    if (modalId === 'modal-alumno') {
        apagarCamara();
    }
}

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
    }
    
    printContent.innerHTML = bodyHtml;
    document.getElementById('modal-reporte-print').classList.add('active');
}

function descargarReportePDF(tipo = 'planilla') {
    const Sede = state.sedes.find(s => s.id === state.activeSedeId);
    if (!Sede) return;
    
    // Primero preparamos el reporte en el modal
    abrirVistaPreviaReporte(tipo);
    
    // Generar el PDF directamente con html2pdf
    const element = document.getElementById('reporte-print-content');
    const opt = {
        margin:       [0.4, 0.4, 0.4, 0.4],
        filename:     `Reporte_${tipo === 'planilla' ? 'Cobros' : 'Finanzas'}_${Sede.nombre.replace(/\s+/g, '_')}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, backgroundColor: '#ffffff', logging: false },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    
    // Ejecutar la conversión y descarga de forma fluida
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
    
    try {
        await firebase.auth().createUserWithEmailAndPassword(email, pass);
        alert("Cuenta creada con éxito.");
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
                    <span style="color: #fff; font-weight: 600;">${tr.emergencia?.nombre || 'No registrado'}</span>
                    <span style="color: var(--color-text-muted); font-size: 0.8rem; display: block; margin-top: 0.15rem;"><i class="fa-solid fa-phone"></i> ${tr.emergencia?.telefono || '-'}</span>
                </div>
            </div>
            
            <button class="btn btn-danger btn-sm" onclick="eliminarTrabajador('${tr.id}')" style="position: absolute; top: 1rem; right: 1rem; width: 30px; height: 30px; padding: 0; display: flex; align-items: center; justify-content: center; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2);">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;
        container.appendChild(card);
    });
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
