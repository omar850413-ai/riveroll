/**
 * app.js - Lógica de Negocio Corporativa de la Academia & Gym Riveroll v3.0
 * Control de navegación en cascada, dictado por voz, cámara web en vivo,
 * ciclo de cobros en tres estados con abonos morados, y WhatsApp dinámico.
 */

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
    // 1. Suscribirse a las colecciones de base de datos híbrida
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
    });

    // 2. Configurar botón de estado de la nube
    actualizarBotonEstadoNube();
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
    
    const sede = state.sedes.find(s => s.id === state.activeSedeId);
    const esSoccer = sede ? sede.rubro === 'soccer' : true;
    
    if (viewId === 'miembros') {
        btnMiembros.className = `sub-tab-btn active ${esSoccer ? 'soccer' : 'gym'}`;
        btnConta.className = `sub-tab-btn ${esSoccer ? 'soccer' : 'gym'}`;
        
        document.getElementById('sub-panel-miembros').style.display = 'block';
        document.getElementById('sub-panel-contabilidad').style.display = 'none';
        renderAlumnosDrilldown();
    } else {
        btnConta.className = `sub-tab-btn active ${esSoccer ? 'soccer' : 'gym'}`;
        btnMiembros.className = `sub-tab-btn ${esSoccer ? 'soccer' : 'gym'}`;
        
        document.getElementById('sub-panel-miembros').style.display = 'none';
        document.getElementById('sub-panel-contabilidad').style.display = 'block';
        renderPlanillaCobrosSede();
    }
}

// --- RENDER DE MIEMBROS DE LA SEDE ACTIVA ---
function renderAlumnosDrilldown() {
    const container = document.getElementById('miembros-lista-drilldown');
    if (!container) return;
    container.innerHTML = '';
    
    const sede = state.sedes.find(s => s.id === state.activeSedeId);
    if (!sede) return;
    
    const esSoccer = sede.rubro === 'soccer';
    
    // Filtrar miembros vinculados a la sede activa
    const miembrosSede = state.alumnos.filter(a => a.sedeId === state.activeSedeId);
    
    if (miembrosSede.length === 0) {
        container.innerHTML = `<div class="glass-panel" style="text-align: center; color: var(--color-text-muted); width: 100%;">No hay miembros registrados en este centro aún. Haz clic en el botón superior para agregar.</div>`;
        return;
    }
    
    if (esSoccer) {
        // --- GRUPOS POR AÑO DE NACIMIENTO (FÚTBOL) ---
        const categoriasMap = {};
        miembrosSede.forEach(alumno => {
            if (!categoriasMap[alumno.categoria]) {
                categoriasMap[alumno.categoria] = [];
            }
            categoriasMap[alumno.categoria].push(alumno);
        });
        
        const categoriasOrdenadas = Object.keys(categoriasMap).sort((a, b) => b - a);
        
        categoriasOrdenadas.forEach(cat => {
            const section = document.createElement('div');
            section.className = 'category-section';
            
            section.innerHTML = `
                <div class="category-header">
                    <div class="category-title">
                        <i class="fa-solid fa-futbol"></i> Categoría ${cat}
                        <span class="category-badge">${categoriasMap[cat].length} Alumno(s)</span>
                    </div>
                </div>
                <div class="students-grid" id="grid-cat-${cat}"></div>
            `;
            container.appendChild(section);
            
            const grid = document.getElementById(`grid-cat-${cat}`);
            categoriasMap[cat].forEach(alumno => {
                const card = createMiembroCard(alumno, true);
                grid.appendChild(card);
            });
        });
    } else {
        // --- LISTADO DIRECTO (GIMNASIO) ---
        const section = document.createElement('div');
        section.className = 'category-section';
        section.innerHTML = `
            <div class="category-header">
                <div class="category-title" style="color: var(--color-gym);">
                    <i class="fa-solid fa-dumbbell"></i> Suscriptores Activos
                </div>
            </div>
            <div class="students-grid" id="grid-gym-drilldown"></div>
        `;
        container.appendChild(section);
        
        const grid = document.getElementById('grid-gym-drilldown');
        miembrosSede.forEach(suscriptor => {
            const card = createMiembroCard(suscriptor, false);
            grid.appendChild(card);
        });
    }
}

// Generador de Tarjeta de Miembro en la Vista de Detalle Sede
function createMiembroCard(miembro, esSoccer) {
    const card = document.createElement('div');
    card.className = `student-card ${esSoccer ? 'border-soccer' : 'border-gym'}`;
    
    const avatarHtml = miembro.foto 
        ? `<img src="${miembro.foto}" alt="${miembro.nombre}" class="student-avatar">`
        : `<div class="student-avatar-placeholder"><i class="fa-solid ${esSoccer ? 'fa-user' : 'fa-dumbbell'}"></i></div>`;
        
    card.innerHTML = `
        <div>
            <div class="student-info-main">
                ${avatarHtml}
                <div class="student-details-txt">
                    <h3>${miembro.nombre}</h3>
                    <p><i class="fa-solid fa-phone"></i> Tel: ${miembro.tutorTelefono}</p>
                    <p><i class="fa-solid fa-user-shield"></i> ${esSoccer ? 'Tutor' : 'Contacto'}: ${miembro.tutorNombre}</p>
                    <span>${esSoccer ? `Rama: ${miembro.rama || 'Mixto'} | Categoria: ${miembro.categoria}` : `Perfil: Suscriptor`}</span>
                </div>
            </div>
        </div>
        
        <div class="student-card-actions">
            <button class="btn btn-outline btn-sm" onclick="openEditAlumnoModal('${miembro.id}')" style="flex: 1;">
                <i class="fa-solid fa-pen-to-square"></i> Editar
            </button>
            <button class="btn btn-danger btn-sm" onclick="eliminarMiembro('${miembro.id}')" style="background: rgba(239, 68, 68, 0.15); color: var(--color-danger); border: 1px solid rgba(239, 68, 68, 0.2); padding: 0.4rem; border-radius: 8px;">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        </div>
    `;
    return card;
}

// --- PLANILLA DE COBROS Y CONTABILIDAD (3 ESTADOS CON ABONO MORADO) ---
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
                <button class="planilla-payment-btn ${pagoInsc.status}" onclick="togglePagoTresEstados('${miembro.id}', 'inscripcion')">
                    ${pagoInsc.texto}
                </button>
            </td>
            <td>
                <button class="planilla-payment-btn ${pagoMayo.status}" onclick="togglePagoTresEstados('${miembro.id}', '2026-05')">
                    ${pagoMayo.texto}
                </button>
            </td>
            <td>
                <button class="planilla-payment-btn ${pagoJunio.status}" onclick="togglePagoTresEstados('${miembro.id}', '2026-06')">
                    ${pagoJunio.texto}
                </button>
            </td>
            <td style="text-align: center;">
                <button class="btn btn-outline btn-sm" onclick="enviarRecordatorioWhatsApp('${miembro.id}')" title="Enviar Recordatorio de Adeudo por WhatsApp">
                    <i class="fa-brands fa-whatsapp" style="color: var(--color-primary); font-size: 1.1rem;"></i> Recordar
                </button>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
}

// Convertidor para estructurar el objeto de pago y su texto dinámico
function obtenerEstatusPagoObjeto(pagoCampo) {
    // Si viene en formato antiguo de texto directo
    if (typeof pagoCampo === 'string') {
        if (pagoCampo === 'pagado') return { status: 'pagado', texto: 'pagado' };
        if (pagoCampo === 'adeudo') return { status: 'no-pagado', texto: 'adeudar' };
        return { status: 'no-pagado', texto: 'no pagado' };
    }
    // Formato estructurado nuevo v3.0
    if (pagoCampo && typeof pagoCampo === 'object') {
        if (pagoCampo.status === 'pagado') return { status: 'pagado', texto: 'pagado' };
        if (pagoCampo.status === 'abonado') return { status: 'abonado', texto: `Abono $${pagoCampo.abono}` };
        return { status: 'no-pagado', texto: 'no pagado' };
    }
    
    // Por defecto es No Pagado
    return { status: 'no-pagado', texto: 'no pagado' };
}

// --- CICLO DE COBRO DE TRES ESTADOS ---
async function togglePagoTresEstados(miembroId, campo) {
    const miembro = state.alumnos.find(a => a.id === miembroId);
    if (!miembro) return;
    
    const Sede = state.sedes.find(s => s.id === miembro.sedeId);
    if (!Sede) return;
    
    // Obtener costo de referencia
    const costoSede = campo === 'inscripcion' ? Sede.inscripcion : Sede.mensualidad;
    
    let actualObj = null;
    if (campo === 'inscripcion') {
        actualObj = miembro.pagos.inscripcion;
    } else {
        if (!miembro.pagos.mensualidades[campo]) {
            miembro.pagos.mensualidades[campo] = { status: 'no-pagado', abono: 0 };
        }
        actualObj = miembro.pagos.mensualidades[campo];
    }
    
    // Normalizar objeto si venía en formato de texto antiguo
    if (typeof actualObj === 'string') {
        actualObj = { 
            status: actualObj === 'pagado' ? 'pagado' : 'no-pagado', 
            abono: 0 
        };
    }
    if (!actualObj) {
        actualObj = { status: 'no-pagado', abono: 0 };
    }
    
    // Alternar estados: no-pagado -> pagado -> abonado -> no-pagado
    if (actualObj.status === 'no-pagado') {
        // Pasar a Pagado
        actualObj.status = 'pagado';
        actualObj.abono = 0;
        
        // Registrar ingreso en caja
        await window.db.agregarTransaccion({
            id: 't_' + Date.now(),
            tipo: 'ingreso',
            categoria: campo === 'inscripcion' ? 'Inscripción' : 'Mensualidad',
            monto: costoSede,
            descripcion: `Pago completo ${campo === 'inscripcion' ? 'inscripción' : 'mensualidad ' + obtenerNombreMes(campo)} de ${miembro.nombre} (${Sede.nombre})`,
            fecha: obtenerFechaActualStr()
        });
        
        guardarPagoModificado(miembroId, campo, actualObj);
    } else if (actualObj.status === 'pagado') {
        // Abrir modal de abonos para pasar a Abonado (Morado)
        state.tempAbonoMiembroId = miembroId;
        state.tempAbonoCampo = campo;
        document.getElementById('abono-monto-input').value = '';
        document.getElementById('modal-abono-monto').classList.add('active');
    } else {
        // Abonado -> No Pagado
        actualObj.status = 'no-pagado';
        actualObj.abono = 0;
        guardarPagoModificado(miembroId, campo, actualObj);
    }
}

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
            fecha: obtenerFechaActualStr()
        });
        
        guardarPagoModificado(miembroId, campo, pagoObj);
    } else {
        const pagoObj = { status: 'abonado', abono: monto };
        
        // Registrar el abono parcial en caja
        await window.db.agregarTransaccion({
            id: 't_' + Date.now(),
            tipo: 'ingreso',
            categoria: 'Abono',
            monto: monto,
            descripcion: `Abono parcial para ${campo === 'inscripcion' ? 'inscripción' : 'mensualidad ' + obtenerNombreMes(campo)} de ${miembro.nombre} ($${monto} abonado de $${costoSede})`,
            fecha: obtenerFechaActualStr()
        });
        
        guardarPagoModificado(miembroId, campo, pagoObj);
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
    
    const mensaje = `Hola ${miembro.tutorNombre}, le saludamos de ${Sede.nombre}. Le recordamos amablemente el estado administrativo de su hijo ${miembro.nombre}.\n\n*Detalle de Adeudos:*\n${desgloseText.map(t => `• ${t}`).join('\n')}\n\n*Total Pendiente: $${totalAdeudo}*\n\nLe solicitamos su valioso apoyo para realizar el pago correspondiente mediante transferencia. ¡Muchas gracias por su confianza de siempre!`;
    
    const formattedPhone = miembro.tutorTelefono.startsWith('52') ? miembro.tutorTelefono : `52${miembro.tutorTelefono}`;
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
    const rubro = document.getElementById('sede-rubro').value;
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
    
    if (id) {
        await window.db.actualizarSede(id, datosSede);
    } else {
        await window.db.agregarSede(datosSede);
    }
    
    document.getElementById('form-sede').reset();
    state.base64SedeLogo = '';
    document.getElementById('sede-upload-preview').src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'><rect width='60' height='60' fill='%23111827'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='8' fill='%236B7280'>Logo</text></svg>";
    closeModal('modal-sede');
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
    document.getElementById('sede-corte').valueAsDate = new Date();
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
    document.getElementById('sede-rubro').value = Sede.rubro;
    document.getElementById('sede-inscripcion').value = Sede.inscripcion;
    document.getElementById('sede-mensualidad').value = Sede.mensualidad;
    document.getElementById('sede-corte').value = Sede.fechaCorte || '';
    
    state.base64SedeLogo = Sede.logo || '';
    document.getElementById('sede-upload-preview').src = Sede.logo || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'><rect width='60' height='60' fill='%23111827'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='8' fill='%236B7280'>Logo</text></svg>";
    
    document.getElementById('modal-sede').classList.add('active');
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
        document.getElementById('label-tutor').innerHTML = `<i class="fa-solid fa-user-shield"></i> Tutor / Responsable`;
        document.getElementById('alumno-nacimiento').required = true;
    } else {
        document.getElementById('group-futbol-extra').style.display = 'none';
        document.getElementById('label-tutor').innerHTML = `<i class="fa-solid fa-user-shield"></i> Contacto de Emergencia`;
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
        document.getElementById('label-tutor').innerHTML = `<i class="fa-solid fa-user-shield"></i> Tutor / Responsable`;
        
        // Poner check al radio
        const radios = document.getElementsByName('alumno-rama');
        for (let i = 0; i < radios.length; i++) {
            if (radios[i].value === (alumno.rama || 'Mixto')) {
                radios[i].checked = true;
            }
        }
    } else {
        document.getElementById('group-futbol-extra').style.display = 'none';
        document.getElementById('label-tutor').innerHTML = `<i class="fa-solid fa-user-shield"></i> Contacto de Emergencia`;
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
