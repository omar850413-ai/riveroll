/**
 * app.js - Lógica de Negocio Corporativa de la Academia & Gym Riveroll
 * Implementa suscripción reactiva en tiempo real (Firebase/Local), control operativo,
 * y soporte completo de edición/eliminación de sedes.
 */

// --- ESTADO GLOBAL DE LA APLICACIÓN ---
const state = {
    activeTab: 'dashboard',
    activeSubTab: 'soccer', // Sub-pestaña de miembros: 'soccer' o 'gym'
    sedes: [],
    alumnos: [], // Miembros consolidados
    transacciones: [],
    partidos: [],
    base64Foto: ''
};

// Costo estándar por jugador para el arbitraje
const COSTO_ARBITRAJE_JUGADOR = 50;

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Suscribirse a las colecciones de datos (Sincronización en tiempo real)
    window.db.suscribir('sedes', (nuevasSedes) => {
        state.sedes = nuevasSedes;
        renderSedes();
        actualizarSelectoresFiltros();
        renderPlanillaPagos();
        renderCredenciales();
        updateKPIs();
    });

    window.db.suscribir('alumnos', (nuevosAlumnos) => {
        state.alumnos = nuevosAlumnos;
        renderAlumnosList();
        renderPlanillaPagos();
        renderCredenciales();
        actualizarSelectoresFiltros();
        renderDashboardLists();
        cargarDetallePartido();
        updateKPIs();
    });

    window.db.suscribir('transacciones', (nuevasTransacciones) => {
        state.transacciones = nuevasTransacciones;
        renderHistorialContabilidad();
        renderDashboardLists();
        updateKPIs();
    });

    window.db.suscribir('partidos', (nuevosPartidos) => {
        state.partidos = nuevosPartidos;
        renderPartidosSelector();
        cargarDetallePartido();
        updateKPIs();
    });

    // 2. Configurar fechas por defecto
    document.getElementById('gasto-fecha').valueAsDate = new Date();
    document.getElementById('partido-fecha').valueAsDate = new Date();

    // 3. Actualizar botón de estado de la nube
    actualizarBotonEstadoNube();
});

// --- ACTUALIZACIÓN DE INDICADORES (KPIs) ---
function updateKPIs() {
    const alumnosFutbol = state.alumnos.filter(a => {
        const Sede = state.sedes.find(s => s.id === a.sedeId);
        return Sede && Sede.rubro === 'soccer';
    });
    
    const suscriptoresGym = state.alumnos.filter(a => {
        const Sede = state.sedes.find(s => s.id === a.sedeId);
        return Sede && Sede.rubro === 'gym';
    });
    
    const mesActualStr = '2026-06';
    const ingresosMes = state.transacciones
        .filter(t => t.tipo === 'ingreso' && t.fecha.startsWith(mesActualStr))
        .reduce((sum, t) => sum + t.monto, 0);
        
    const totalAdeudos = state.alumnos.filter(a => {
        const tieneAdeudoInscripcion = a.pagos.inscripcion === 'adeudo';
        const tieneAdeudoMensualidades = Object.values(a.pagos.mensualidades).some(v => v === 'adeudo');
        return tieneAdeudoInscripcion || tieneAdeudoMensualidades;
    }).length;

    document.getElementById('kpi-futbol-alumnos').innerText = alumnosFutbol.length;
    document.getElementById('kpi-gym-suscriptores').innerText = suscriptoresGym.length;
    document.getElementById('kpi-ingresos-mes').innerText = `$${ingresosMes.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
    document.getElementById('kpi-adeudos-alumnos').innerText = totalAdeudos;
    
    const totalIngresos = state.transacciones.filter(t => t.tipo === 'ingreso').reduce((sum, t) => sum + t.monto, 0);
    const totalEgresos = state.transacciones.filter(t => t.tipo === 'egreso').reduce((sum, t) => sum + t.monto, 0);
    const balanceNeto = totalIngresos - totalEgresos;
    
    document.getElementById('caja-total-ingresos').innerText = `$${totalIngresos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
    document.getElementById('caja-total-egresos').innerText = `$${totalEgresos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
    
    const balanceEl = document.getElementById('caja-balance-neto');
    balanceEl.innerText = `$${balanceNeto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
    balanceEl.style.color = balanceNeto < 0 ? 'var(--color-danger)' : 'var(--color-primary)';
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

// --- LISTAS DEL DASHBOARD ---
function renderDashboardLists() {
    const cobrosContainer = document.getElementById('dashboard-cobros-pendientes');
    if (!cobrosContainer) return;
    cobrosContainer.innerHTML = '';
    
    const miembrosConAdeudo = state.alumnos.filter(a => {
        return a.pagos.inscripcion === 'adeudo' || 
               Object.values(a.pagos.mensualidades).some(v => v === 'adeudo');
    }).slice(0, 5);
    
    if (miembrosConAdeudo.length === 0) {
        cobrosContainer.innerHTML = `<p style="color: var(--color-text-muted); font-size: 0.9rem; text-align: center; padding: 1rem;">No hay adeudos urgentes.</p>`;
    } else {
        miembrosConAdeudo.forEach(miembro => {
            const deudas = [];
            if (miembro.pagos.inscripcion === 'adeudo') deudas.push('Inscripción');
            Object.entries(miembro.pagos.mensualidades).forEach(([mes, status]) => {
                if (status === 'adeudo') deudas.push(`Mensualidad ${obtenerNombreMes(mes)}`);
            });
            
            const item = document.createElement('div');
            item.style.display = 'flex';
            item.style.justifyContent = 'space-between';
            item.style.alignItems = 'center';
            item.style.background = 'rgba(255,255,255,0.02)';
            item.style.padding = '0.85rem 1rem';
            item.style.borderRadius = '10px';
            item.style.border = '1px solid rgba(239, 68, 68, 0.1)';
            
            item.innerHTML = `
                <div>
                    <h4 style="font-size: 0.95rem; font-weight: 700; color: #fff;">${miembro.nombre}</h4>
                    <p style="font-size: 0.75rem; color: var(--color-danger); font-weight: 600;">Adeuda: ${deudas.join(', ')}</p>
                </div>
                <button class="btn btn-danger btn-sm" onclick="enviarRecordatorioWhatsApp('${miembro.id}', 'adeudo')">
                    <i class="fa-brands fa-whatsapp"></i> Cobrar
                </button>
            `;
            cobrosContainer.appendChild(item);
        });
    }

    const transaccionesContainer = document.getElementById('dashboard-ultimas-transacciones');
    if (!transaccionesContainer) return;
    transaccionesContainer.innerHTML = '';
    const ultimasT = state.transacciones.slice(0, 5);
    
    if (ultimasT.length === 0) {
        transaccionesContainer.innerHTML = `<p style="color: var(--color-text-muted); font-size: 0.9rem; text-align: center; padding: 1rem;">Sin transacciones recientes.</p>`;
    } else {
        ultimasT.forEach(t => {
            const item = document.createElement('div');
            item.style.display = 'flex';
            item.style.justifyContent = 'space-between';
            item.style.alignItems = 'center';
            item.style.background = 'rgba(255,255,255,0.02)';
            item.style.padding = '0.85rem 1rem';
            item.style.borderRadius = '10px';
            item.style.border = '1px solid rgba(255,255,255,0.03)';
            
            const montoFormateado = `$${t.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
            const esIngreso = t.tipo === 'ingreso';
            
            item.innerHTML = `
                <div>
                    <h4 style="font-size: 0.9rem; font-weight: 700; color: #fff;">${t.descripcion}</h4>
                    <p style="font-size: 0.75rem; color: var(--color-text-muted);">${t.fecha} • ${t.categoria}</p>
                </div>
                <span class="${esIngreso ? 'badge-income' : 'badge-expense'}">
                    ${esIngreso ? '+' : '-'}${montoFormateado}
                </span>
            `;
            transaccionesContainer.appendChild(item);
        });
    }
}

// --- RENDER DE SEDES Y NEGOCIOS (CON EDITAR Y ELIMINAR) ---
function renderSedes() {
    const grid = document.getElementById('sedes-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    if (state.sedes.length === 0) {
        grid.innerHTML = `<div class="glass-panel" style="text-align: center; color: var(--color-text-muted); width: 100%;">No hay sedes o negocios registrados.</div>`;
        return;
    }
    
    state.sedes.forEach(sede => {
        const card = document.createElement('div');
        const esSoccer = sede.rubro === 'soccer';
        card.className = `student-card ${esSoccer ? 'border-soccer' : 'border-gym'}`;
        
        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                <div>
                    <h3 style="font-family: var(--font-title); font-size: 1.25rem; font-weight: 800; color: #fff;">${sede.nombre}</h3>
                    <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: ${esSoccer ? 'var(--color-primary)' : 'var(--color-gym)'};">
                        <i class="fa-solid ${esSoccer ? 'fa-futbol' : 'fa-dumbbell'}"></i> ${esSoccer ? 'Academia de Fútbol' : 'Gimnasio'}
                    </span>
                </div>
            </div>
            <div style="background: rgba(0,0,0,0.15); padding: 0.75rem; border-radius: 10px; font-size: 0.85rem; margin-bottom: 1rem;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.35rem;">
                    <span style="color: var(--color-text-muted);">Inscripción:</span>
                    <strong style="color: #fff;">$${sede.inscripcion}</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span style="color: var(--color-text-muted);">Mensualidad:</span>
                    <strong style="color: #fff;">$${sede.mensualidad}</strong>
                </div>
            </div>
            <div style="display: flex; gap: 0.5rem;">
                <button class="btn btn-outline btn-sm" onclick="openEditSedeModal('${sede.id}')" style="flex: 1; padding: 0.4rem 0.75rem; font-size: 0.8rem;">
                    <i class="fa-solid fa-pen-to-square"></i> Editar
                </button>
                <button class="btn btn-danger btn-sm" onclick="eliminarSede('${sede.id}')" style="flex: 1; padding: 0.4rem 0.75rem; font-size: 0.8rem; background: rgba(239, 68, 68, 0.15); color: var(--color-danger); border: 1px solid rgba(239, 68, 68, 0.2);">
                    <i class="fa-solid fa-trash-can"></i> Eliminar
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

// --- RENDER DE MIEMBROS / ALUMNOS (FÚTBOL O GYM) ---
function renderAlumnosList(miembrosFiltrados = null) {
    const listContainer = document.getElementById('alumnos-categorias-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';
    
    const origenMiembros = miembrosFiltrados || state.alumnos;
    
    const miembrosRubroActivo = origenMiembros.filter(m => {
        const Sede = state.sedes.find(s => s.id === m.sedeId);
        return Sede && Sede.rubro === state.activeSubTab;
    });
    
    if (miembrosRubroActivo.length === 0) {
        listContainer.innerHTML = `<div class="glass-panel" style="text-align: center; color: var(--color-text-muted);">No hay miembros registrados en este rubro.</div>`;
        return;
    }
    
    if (state.activeSubTab === 'soccer') {
        const categoriasMap = {};
        miembrosRubroActivo.forEach(alumno => {
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
                <div class="students-grid" id="grid-categoria-${cat}"></div>
            `;
            listContainer.appendChild(section);
            
            const grid = document.getElementById(`grid-categoria-${cat}`);
            categoriasMap[cat].forEach(alumno => {
                const card = createMiembroCard(alumno, 'soccer');
                grid.appendChild(card);
            });
        });
    } else {
        const section = document.createElement('div');
        section.className = 'category-section';
        section.innerHTML = `
            <div class="category-header">
                <div class="category-title" style="color: var(--color-gym);">
                    <i class="fa-solid fa-dumbbell"></i> Suscriptores Activos
                </div>
            </div>
            <div class="students-grid" id="grid-gym-general"></div>
        `;
        listContainer.appendChild(section);
        
        const grid = document.getElementById('grid-gym-general');
        miembrosRubroActivo.forEach(suscriptor => {
            const card = createMiembroCard(suscriptor, 'gym');
            grid.appendChild(card);
        });
    }
}

function createMiembroCard(miembro, rubro) {
    const card = document.createElement('div');
    const esSoccer = rubro === 'soccer';
    card.className = `student-card ${esSoccer ? 'border-soccer' : 'border-gym'}`;
    
    const Sede = state.sedes.find(s => s.id === miembro.sedeId);
    const SedeNombre = Sede ? Sede.nombre : 'Sin Sede';
    
    const avatarHtml = miembro.foto 
        ? `<img src="${miembro.foto}" alt="${miembro.nombre}" class="student-avatar">`
        : `<div class="student-avatar-placeholder"><i class="fa-solid ${esSoccer ? 'fa-user' : 'fa-dumbbell'}"></i></div>`;
        
    const pagoInsc = miembro.pagos.inscripcion;
    const pagoMayo = miembro.pagos.mensualidades['2026-05'] || 'pendiente';
    const pagoJunio = miembro.pagos.mensualidades['2026-06'] || 'pendiente';
    
    card.innerHTML = `
        <div>
            <div class="student-info-main">
                ${avatarHtml}
                <div class="student-details-txt">
                    <h3>${miembro.nombre}</h3>
                    <p style="font-size:0.75rem; color: ${esSoccer ? 'var(--color-primary)' : 'var(--color-gym)'}; font-weight:700;">${SedeNombre}</p>
                    <p><i class="fa-solid fa-user-shield"></i> Tutor: ${miembro.tutorNombre}</p>
                    <p><i class="fa-solid fa-phone"></i> Tel: ${miembro.tutorTelefono}</p>
                    <span>${esSoccer ? `Nacimiento: ${miembro.fechaNacimiento}` : `Plan de Gimnasio`}</span>
                </div>
            </div>
            
            <div class="payments-row">
                <div class="payment-toggle" onclick="togglePagoDirecto('${miembro.id}', 'inscripcion')">
                    <span>Insc.</span>
                    <div class="indicator-dot ${pagoInsc}" title="Clic para cambiar"></div>
                </div>
                <div class="payment-toggle" onclick="togglePagoDirecto('${miembro.id}', '2026-05')">
                    <span>Mayo</span>
                    <div class="indicator-dot ${pagoMayo}" title="Clic para cambiar"></div>
                </div>
                <div class="payment-toggle" onclick="togglePagoDirecto('${miembro.id}', '2026-06')">
                    <span>Junio</span>
                    <div class="indicator-dot ${pagoJunio}" title="Clic para cambiar"></div>
                </div>
            </div>
        </div>
        
        <div class="student-card-actions">
            <button class="btn btn-outline btn-sm" onclick="openEditAlumnoModal('${miembro.id}')" style="flex: 1;">
                <i class="fa-solid fa-pen-to-square"></i> Editar
            </button>
            <button class="btn ${esSoccer ? 'btn-primary' : 'btn-gym'} btn-sm" onclick="enviarRecordatorioWhatsApp('${miembro.id}', 'general')" style="flex: 1;">
                <i class="fa-brands fa-whatsapp"></i> WhatsApp
            </button>
            <button class="btn btn-danger btn-sm" onclick="eliminarMiembro('${miembro.id}')" style="background: rgba(239, 68, 68, 0.15); color: var(--color-danger); border: 1px solid rgba(239, 68, 68, 0.2); padding: 0.4rem; border-radius: 8px;" title="Eliminar Miembro">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        </div>
    `;
    return card;
}

// --- PLANILLA GENERAL DE COBROS ---
function renderPlanillaPagos() {
    const tbody = document.getElementById('planilla-pagos-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const filtroSede = document.getElementById('filtro-sede-pagos').value;
    
    const miembrosFiltrados = filtroSede === 'todas' 
        ? state.alumnos 
        : state.alumnos.filter(a => a.sedeId === filtroSede);
        
    if (miembrosFiltrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">No hay miembros para esta sede.</td></tr>`;
        return;
    }
    
    miembrosFiltrados.forEach(miembro => {
        const tr = document.createElement('tr');
        const Sede = state.sedes.find(s => s.id === miembro.sedeId);
        const SedeNombre = Sede ? Sede.nombre : 'Sede';
        const esSoccer = Sede && Sede.rubro === 'soccer';
        
        const pagoInsc = miembro.pagos.inscripcion;
        const pagoAbril = miembro.pagos.mensualidades['2026-04'] || 'pendiente';
        const pagoMayo = miembro.pagos.mensualidades['2026-05'] || 'pendiente';
        const pagoJunio = miembro.pagos.mensualidades['2026-06'] || 'pendiente';
        
        tr.innerHTML = `
            <td style="font-weight: 600;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    ${miembro.foto ? `<img src="${miembro.foto}" style="width: 35px; height: 35px; border-radius: 50%; object-fit: cover;">` : `<div style="width: 35px; height: 35px; border-radius: 50%; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; color: var(--color-text-muted); border: 1px dashed rgba(255,255,255,0.1);"><i class="fa-solid ${esSoccer ? 'fa-user' : 'fa-dumbbell'}"></i></div>`}
                    <div>
                        <span style="display: block; color: #fff;">${miembro.nombre}</span>
                        <small style="color: ${esSoccer ? 'var(--color-accent)' : 'var(--color-gym)'}; font-weight: 700;">${SedeNombre} ${esSoccer ? `(Cat. ${miembro.categoria})` : '(Gym)'}</small>
                    </div>
                </div>
            </td>
            <td>
                <div class="payment-toggle" style="align-items: flex-start;" onclick="togglePagoDirecto('${miembro.id}', 'inscripcion')">
                    <span class="indicator-dot ${pagoInsc}"></span>
                    <small style="font-size: 0.7rem; color: var(--color-text-muted); text-transform: capitalize;">${pagoInsc}</small>
                </div>
            </td>
            <td>
                <div class="payment-toggle" style="align-items: flex-start;" onclick="togglePagoDirecto('${miembro.id}', '2026-04')">
                    <span class="indicator-dot ${pagoAbril}"></span>
                    <small style="font-size: 0.7rem; color: var(--color-text-muted); text-transform: capitalize;">${pagoAbril}</small>
                </div>
            </td>
            <td>
                <div class="payment-toggle" style="align-items: flex-start;" onclick="togglePagoDirecto('${miembro.id}', '2026-05')">
                    <span class="indicator-dot ${pagoMayo}"></span>
                    <small style="font-size: 0.7rem; color: var(--color-text-muted); text-transform: capitalize;">${pagoMayo}</small>
                </div>
            </td>
            <td>
                <div class="payment-toggle" style="align-items: flex-start;" onclick="togglePagoDirecto('${miembro.id}', '2026-06')">
                    <span class="indicator-dot ${pagoJunio}"></span>
                    <small style="font-size: 0.7rem; color: var(--color-text-muted); text-transform: capitalize;">${pagoJunio}</small>
                </div>
            </td>
            <td style="text-align: center;">
                <div style="display: flex; gap: 0.5rem; justify-content: center;">
                    <button class="btn btn-outline btn-sm" onclick="enviarRecordatorioWhatsApp('${miembro.id}', 'adeudo')">
                        <i class="fa-brands fa-whatsapp" style="color: var(--color-danger);"></i> Cobro
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- CONMUTADOR DE PAGOS DE UN CLIC ---
async function togglePagoDirecto(miembroId, campo) {
    const alumnos = [...state.alumnos];
    const index = alumnos.findIndex(a => a.id === miembroId);
    if (index === -1) return;
    
    const miembro = alumnos[index];
    const Sede = state.sedes.find(s => s.id === miembro.sedeId);
    if (!Sede) return;
    
    const estados = ['pendiente', 'pagado', 'adeudo'];
    
    if (campo === 'inscripcion') {
        const actual = miembro.pagos.inscripcion || 'pendiente';
        const siguienteIndex = (estados.indexOf(actual) + 1) % estados.length;
        miembro.pagos.inscripcion = estados[siguienteIndex];
        
        if (miembro.pagos.inscripcion === 'pagado') {
            await window.db.agregarTransaccion({
                id: 't_' + Date.now(),
                tipo: 'ingreso',
                categoria: 'Inscripción',
                monto: Sede.inscripcion,
                descripcion: `Inscripción de ${miembro.nombre} (${Sede.nombre})`,
                fecha: obtenerFechaActualStr()
            });
        }
    } else {
        const actual = miembro.pagos.mensualidades[campo] || 'pendiente';
        const siguienteIndex = (estados.indexOf(actual) + 1) % estados.length;
        miembro.pagos.mensualidades[campo] = estados[siguienteIndex];
        
        if (miembro.pagos.mensualidades[campo] === 'pagado') {
            await window.db.agregarTransaccion({
                id: 't_' + Date.now(),
                tipo: 'ingreso',
                categoria: 'Mensualidad',
                monto: Sede.mensualidad,
                descripcion: `Mensualidad ${obtenerNombreMes(campo)} de ${miembro.nombre} (${Sede.nombre})`,
                fecha: obtenerFechaActualStr()
            });
        }
    }
    
    await window.db.actualizarAlumno(miembroId, miembro);
}

// --- HISTORIAL DE CONTABILIDAD ---
function renderHistorialContabilidad() {
    const tbody = document.getElementById('historial-caja-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (state.transacciones.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">No hay transacciones registradas.</td></tr>`;
        return;
    }
    
    state.transacciones.forEach(t => {
        const tr = document.createElement('tr');
        const esIngreso = t.tipo === 'ingreso';
        
        tr.innerHTML = `
            <td>${t.fecha}</td>
            <td>
                <span class="${esIngreso ? 'badge-income' : 'badge-expense'}">
                    ${t.tipo.toUpperCase()}
                </span>
            </td>
            <td style="font-weight: 600; color: #fff;">${t.categoria}</td>
            <td>${t.descripcion}</td>
            <td style="font-weight: 700; color: ${esIngreso ? 'var(--color-primary)' : 'var(--color-danger)'};">
                ${esIngreso ? '+' : '-'}$${t.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
            </td>
            <td>
                <button class="btn btn-outline btn-sm" onclick="eliminarTransaccion('${t.id}')" style="color: var(--color-danger); border-color: rgba(239,68,68,0.2);">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- GESTIÓN DE PARTIDOS Y ARBITRAJE ---
function renderPartidosSelector() {
    const select = document.getElementById('filtro-partido-activo');
    if (!select) return;
    const valorSeleccionado = select.value;
    select.innerHTML = '';
    
    if (state.partidos.length === 0) {
        select.innerHTML = '<option value="">No hay partidos registrados</option>';
        return;
    }
    
    state.partidos.forEach(p => {
        select.innerHTML += `<option value="${p.id}">${p.fecha} - Cat. ${p.categoria} vs ${p.rival}</option>`;
    });
    
    if (valorSeleccionado) {
        select.value = valorSeleccionado;
    }
}

function cargarDetallePartido() {
    const select = document.getElementById('filtro-partido-activo');
    if (!select) return;
    const partidoId = select.value;
    const tbody = document.getElementById('tabla-partido-tbody');
    const resumenContainer = document.getElementById('partido-info-resumen');
    
    if (!tbody) return;
    tbody.innerHTML = '';
    if (resumenContainer) resumenContainer.innerHTML = '';
    
    if (!partidoId) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">Registra o selecciona un partido para comenzar el control.</td></tr>`;
        return;
    }
    
    const partido = state.partidos.find(p => p.id === partidoId);
    if (!partido) return;
    
    const alumnosCategoria = state.alumnos.filter(a => {
        const Sede = state.sedes.find(s => s.id === a.sedeId);
        return a.categoria === partido.categoria && Sede && Sede.rubro === 'soccer';
    });
    
    if (alumnosCategoria.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">No hay alumnos registrados en la Categoría ${partido.categoria}.</td></tr>`;
        return;
    }
    
    let totalAsistencias = 0;
    let recaudadoArbitraje = 0;
    
    alumnosCategoria.forEach(alumno => {
        const reg = partido.asistencia[alumno.id] || { asistio: false, arbitraje: 'pendiente' };
        
        if (reg.asistio) totalAsistencias++;
        if (reg.arbitraje === 'pagado') recaudadoArbitraje += COSTO_ARBITRAJE_JUGADOR;
        
        const tr = document.createElement('tr');
        
        tr.innerHTML = `
            <td style="font-weight: 600; color: #fff;">${alumno.nombre}</td>
            <td><span class="category-badge">Cat. ${alumno.categoria}</span></td>
            <td style="text-align: center;">
                <div style="display: flex; justify-content: center;">
                    <div class="attendance-check ${reg.asistio ? 'checked' : ''}" onclick="toggleAsistenciaPartido('${partido.id}', '${alumno.id}')">
                        <i class="fa-solid fa-check"></i>
                    </div>
                </div>
            </td>
            <td style="text-align: center;">
                <div style="display: flex; justify-content: center;">
                    <div class="payment-toggle" onclick="toggleArbitrajePartido('${partido.id}', '${alumno.id}')">
                        <span class="indicator-dot ${reg.arbitraje}"></span>
                        <small style="font-size:0.7rem; color: var(--color-text-muted); text-transform:capitalize;">${reg.arbitraje}</small>
                    </div>
                </div>
            </td>
            <td style="text-align: center;">
                <button class="btn btn-primary btn-sm" onclick="enviarMensajeArbitraje('${alumno.id}', ${COSTO_ARBITRAJE_JUGADOR}, '${partido.rival}')">
                    <i class="fa-brands fa-whatsapp"></i> Cobrar
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    if (resumenContainer) {
        resumenContainer.innerHTML = `
            <h4 style="font-family: var(--font-title); font-size: 1.2rem; font-weight: 800; color: #fff;">vs ${partido.rival}</h4>
            <p style="font-size: 0.85rem; color: var(--color-text-muted);">
                Asistencia: <strong>${totalAsistencias} / ${alumnosCategoria.length}</strong> | Recaudado: <strong style="color: var(--color-primary);">$${recaudadoArbitraje}</strong>
            </p>
        `;
    }
}

async function toggleAsistenciaPartido(partidoId, alumnoId) {
    const partido = state.partidos.find(p => p.id === partidoId);
    if (!partido) return;
    
    if (!partido.asistencia[alumnoId]) {
        partido.asistencia[alumnoId] = { asistio: false, arbitraje: 'pendiente' };
    }
    
    partido.asistencia[alumnoId].asistio = !partido.asistencia[alumnoId].asistio;
    await window.db.actualizarPartido(partidoId, partido);
}

async function toggleArbitrajePartido(partidoId, alumnoId) {
    const partido = state.partidos.find(p => p.id === partidoId);
    if (!partido) return;
    
    if (!partido.asistencia[alumnoId]) {
        partido.asistencia[alumnoId] = { asistio: false, arbitraje: 'pendiente' };
    }
    
    const actual = partido.asistencia[alumnoId].arbitraje || 'pendiente';
    const siguiente = actual === 'pendiente' ? 'pagado' : 'pendiente';
    
    partido.asistencia[alumnoId].arbitraje = siguiente;
    
    if (siguiente === 'pagado') {
        const alumno = state.alumnos.find(a => a.id === alumnoId);
        const nombreAlumno = alumno ? alumno.nombre : 'Alumno';
        
        await window.db.agregarTransaccion({
            id: 't_' + Date.now(),
            tipo: 'ingreso',
            categoria: 'Arbitraje',
            monto: COSTO_ARBITRAJE_JUGADOR,
            descripcion: `Arbitraje de ${nombreAlumno} (vs ${partido.rival})`,
            fecha: obtenerFechaActualStr()
        });
    }
    
    await window.db.actualizarPartido(partidoId, partido);
}

// --- GESTIÓN DE MIEMBROS (EDITAR / ELIMINAR) ---
async function saveAlumno(event) {
    event.preventDefault();
    
    const id = document.getElementById('edit-alumno-id').value;
    const nombre = document.getElementById('alumno-nombre').value;
    const SedeId = document.getElementById('alumno-sede').value;
    const fechaNacimiento = document.getElementById('alumno-nacimiento').value;
    const categoria = document.getElementById('alumno-categoria').value;
    const tutorNombre = document.getElementById('alumno-tutor').value;
    const tutorTelefono = document.getElementById('alumno-telefono').value;
    
    const nuevoMiembro = {
        nombre,
        sedeId: SedeId,
        fechaNacimiento,
        categoria,
        tutorNombre,
        tutorTelefono,
        foto: state.base64Foto,
        pagos: id ? state.alumnos.find(a => a.id === id).pagos : {
            inscripcion: 'pendiente',
            mensualidades: {
                '2026-05': 'pendiente',
                '2026-06': 'pendiente'
            }
        }
    };
    
    if (id) {
        await window.db.actualizarAlumno(id, nuevoMiembro);
    } else {
        await window.db.agregarAlumno(nuevoMiembro);
    }
    
    document.getElementById('form-alumno').reset();
    state.base64Foto = '';
    document.getElementById('upload-preview').src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23111827'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='12' fill='%236B7280'>Vista Previa</text></svg>";
    
    closeModal('modal-alumno');
}

async function eliminarMiembro(id) {
    const miembro = state.alumnos.find(a => a.id === id);
    if (!miembro) return;
    
    if (confirm(`¿Estás seguro de eliminar permanentemente a "${miembro.nombre}"?`)) {
        await window.db.eliminarAlumno(id);
    }
}

// --- GESTIÓN DE SEDES (CREAR, EDITAR, ELIMINAR) ---
function openEditSedeModal(id) {
    const Sede = state.sedes.find(s => s.id === id);
    if (!Sede) return;
    
    document.getElementById('modal-sede-title').innerText = "Editar Sede / Negocio";
    document.getElementById('edit-sede-id').value = Sede.id;
    document.getElementById('sede-nombre').value = Sede.nombre;
    document.getElementById('sede-rubro').value = Sede.rubro;
    document.getElementById('sede-inscripcion').value = Sede.inscripcion;
    document.getElementById('sede-mensualidad').value = Sede.mensualidad;
    
    document.getElementById('modal-sede').classList.add('active');
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
}

async function saveSede(event) {
    event.preventDefault();
    
    const id = document.getElementById('edit-sede-id').value;
    const nombre = document.getElementById('sede-nombre').value;
    const rubro = document.getElementById('sede-rubro').value;
    const inscripcion = parseFloat(document.getElementById('sede-inscripcion').value);
    const mensualidad = parseFloat(document.getElementById('sede-mensualidad').value);
    
    const datosSede = {
        nombre,
        rubro,
        inscripcion,
        mensualidad
    };
    
    if (id) {
        await window.db.actualizarSede(id, datosSede);
    } else {
        await window.db.agregarSede(datosSede);
    }
    
    document.getElementById('form-sede').reset();
    closeModal('modal-sede');
}

// --- CREACIÓN DE PARTIDOS ---
async function savePartido(event) {
    event.preventDefault();
    
    const categoria = document.getElementById('partido-categoria').value;
    const rival = document.getElementById('partido-rival').value;
    const fecha = document.getElementById('partido-fecha').value;
    
    const nuevoPartido = {
        categoria,
        rival,
        fecha,
        asistencia: {}
    };
    
    await window.db.agregarPartido(nuevoPartido);
    document.getElementById('form-partido').reset();
    closeModal('modal-partido');
}

// --- CREACIÓN DE EGRESOS ---
async function saveTransaccion(event) {
    event.preventDefault();
    
    const categoria = document.getElementById('gasto-categoria').value;
    const monto = parseFloat(document.getElementById('gasto-monto').value);
    const descripcion = document.getElementById('gasto-descripcion').value;
    const fecha = document.getElementById('gasto-fecha').value;
    
    const nuevaT = {
        tipo: 'egreso',
        categoria,
        monto,
        descripcion,
        fecha
    };
    
    await window.db.agregarTransaccion(nuevaT);
    document.getElementById('form-transaccion').reset();
    closeModal('modal-transaccion');
}

async function eliminarTransaccion(id) {
    if (confirm('¿Desea eliminar esta transacción de caja?')) {
        await window.db.eliminarTransaccion(id);
    }
}

// --- RENDER DE CREDENCIALES ---
function renderCredenciales() {
    const galeria = document.getElementById('credenciales-galeria');
    if (!galeria) return;
    galeria.innerHTML = '';
    
    const filtroSede = document.getElementById('filtro-sede-credenciales').value;
    
    const miembrosFiltrados = filtroSede === 'todas' 
        ? state.alumnos 
        : state.alumnos.filter(a => a.sedeId === filtroSede);
        
    if (miembrosFiltrados.length === 0) {
        galeria.innerHTML = `<div class="glass-panel" style="text-align: center; color: var(--color-text-muted); width: 100%;">No hay miembros para mostrar.</div>`;
        return;
    }
    
    miembrosFiltrados.forEach(miembro => {
        const Sede = state.sedes.find(s => s.id === miembro.sedeId);
        if (!Sede) return;
        
        const esSoccer = Sede.rubro === 'soccer';
        const tieneAdeudoMortal = miembro.pagos.inscripcion === 'adeudo' || 
                                  miembro.pagos.mensualidades['2026-05'] === 'adeudo' ||
                                  miembro.pagos.inscripcion === 'pendiente';
        
        const estatusActivo = !tieneAdeudoMortal;
        const estatusTexto = estatusActivo ? 'activo' : 'inactivo';
        
        const qrContent = `Riveroll Corporativo | Sede: ${Sede.nombre} | Miembro: ${miembro.nombre} | Estatus: ${estatusTexto.toUpperCase()} | Emergencias: ${miembro.tutorNombre} (${miembro.tutorTelefono})`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(qrContent)}&color=070a13`;
        
        const cardEl = document.createElement('div');
        cardEl.className = `card-digital ${esSoccer ? 'soccer' : 'gym'}`;
        
        const fotoUrl = miembro.foto || "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%231f2937'/><path d='M50 50c11 0 20-9 20-20s-9-20-20-20-20 9-20 20 9 20 20 20zm0 8c-15 0-45 8-45 23v5h90v-5c0-15-30-23-45-23z' fill='%239CA3AF'/></svg>";
        
        cardEl.innerHTML = `
            <div class="card-header-badge">
                <span class="academy-title"><i class="fa-solid ${esSoccer ? 'fa-futbol' : 'fa-dumbbell'}"></i> ${esSoccer ? 'RIVEROLL FC' : 'RIVEROLL GYM'}</span>
                <span class="card-status-pill ${estatusTexto}">${estatusTexto}</span>
            </div>
            
            <div class="card-body">
                <img src="${fotoUrl}" alt="${miembro.nombre}" class="card-photo">
                <h3 class="card-name">${miembro.nombre}</h3>
                <span class="card-category">${esSoccer ? `CATEGORÍA ${miembro.categoria}` : `MEMBRESÍA FITNESS`}</span>
            </div>
            
            <div class="card-footer-info">
                <div class="card-emergency">
                    <label>${esSoccer ? 'Contacto Tutor' : 'Responsable'}</label>
                    <p>${miembro.tutorNombre}</p>
                    <p style="font-size: 0.75rem; color: ${esSoccer ? 'var(--color-accent)' : 'var(--color-gym)'};">${miembro.tutorTelefono}</p>
                </div>
                <div class="card-qr-container" title="Escanear vigencia">
                    <img src="${qrUrl}" alt="QR Status" style="width: 56px; height: 56px;">
                </div>
            </div>
        `;
        galeria.appendChild(cardEl);
    });
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

// --- ACTUALIZAR SELECTORES DE FILTROS ---
function actualizarSelectoresFiltros() {
    const selectSedeForm = document.getElementById('alumno-sede');
    if (!selectSedeForm) return;
    selectSedeForm.innerHTML = '';
    state.sedes.forEach(s => {
        selectSedeForm.innerHTML += `<option value="${s.id}">${s.nombre} (${s.rubro === 'soccer' ? 'Fútbol' : 'Gimnasio'})</option>`;
    });
    
    handleSedeChangeEnFormulario();

    const selectFiltroPagos = document.getElementById('filtro-sede-pagos');
    if (selectFiltroPagos) {
        const valorSeleccionadoPagos = selectFiltroPagos.value;
        selectFiltroPagos.innerHTML = '<option value="todas">Todas las Sedes</option>';
        state.sedes.forEach(s => {
            selectFiltroPagos.innerHTML += `<option value="${s.id}">${s.nombre}</option>`;
        });
        if (valorSeleccionadoPagos) selectFiltroPagos.value = valorSeleccionadoPagos;
    }

    const selectFiltroCreds = document.getElementById('filtro-sede-credenciales');
    if (selectFiltroCreds) {
        const valorSeleccionadoCreds = selectFiltroCreds.value;
        selectFiltroCreds.innerHTML = '<option value="todas">Todas las Sedes</option>';
        state.sedes.forEach(s => {
            selectFiltroCreds.innerHTML += `<option value="${s.id}">${s.nombre}</option>`;
        });
        if (valorSeleccionadoCreds) selectFiltroCreds.value = valorSeleccionadoCreds;
    }

    const selectPartidoCat = document.getElementById('partido-categoria');
    if (selectPartidoCat) {
        const categoriasSoccer = [...new Set(state.alumnos.filter(a => {
            const s = state.sedes.find(x => x.id === a.sedeId);
            return s && s.rubro === 'soccer';
        }).map(a => a.categoria))].sort();
        
        selectPartidoCat.innerHTML = '';
        categoriasSoccer.forEach(cat => {
            selectPartidoCat.innerHTML += `<option value="${cat}">Categoría ${cat}</option>`;
        });
    }
}

function handleSedeChangeEnFormulario() {
    const select = document.getElementById('alumno-sede');
    if (!select) return;
    const SedeId = select.value;
    const Sede = state.sedes.find(s => s.id === SedeId);
    const nacInput = document.getElementById('alumno-nacimiento');
    const catInput = document.getElementById('alumno-categoria');
    
    if (Sede && Sede.rubro === 'gym') {
        if (nacInput) {
            nacInput.required = false;
            nacInput.value = '';
        }
        if (catInput) catInput.value = 'Adulto / Gym';
    } else {
        if (nacInput) {
            nacInput.required = true;
        }
        calcularCategoriaAuto();
    }
}

// --- BUSCADOR Y FILTRADO ---
function filtrarAlumnos() {
    const Query = document.getElementById('buscar-alumno-input').value.toLowerCase();
    const filtrados = state.alumnos.filter(m => {
        return m.nombre.toLowerCase().includes(Query) || 
               m.tutorNombre.toLowerCase().includes(Query) || 
               m.categoria.toLowerCase().includes(Query);
    });
    renderAlumnosList(filtrados);
}

// --- CONTROL DE PESTAÑAS ---
function switchTab(tabId) {
    state.activeTab = tabId;
    
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.getAttribute('data-tab') === tabId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    document.querySelectorAll('.section-panel').forEach(panel => {
        if (panel.id === `panel-${tabId}`) {
            panel.classList.add('active');
        } else {
            panel.classList.remove('active');
        }
    });
}

function switchSubTab(subTabId) {
    state.activeSubTab = subTabId;
    
    const soccerBtn = document.getElementById('subtab-soccer-btn');
    const gymBtn = document.getElementById('subtab-gym-btn');
    
    if (subTabId === 'soccer') {
        soccerBtn.classList.add('active');
        gymBtn.classList.remove('active');
    } else {
        gymBtn.classList.add('active');
        soccerBtn.classList.remove('active');
    }
    
    renderAlumnosList();
}

// --- AUXILIARES ---
function calcularCategoriaAuto() {
    const fechaInput = document.getElementById('alumno-nacimiento');
    if (!fechaInput) return;
    const fecha = fechaInput.value;
    const selectSede = document.getElementById('alumno-sede');
    if (!selectSede) return;
    const SedeId = selectSede.value;
    const Sede = state.sedes.find(s => s.id === SedeId);
    
    if (Sede && Sede.rubro === 'gym') {
        document.getElementById('alumno-categoria').value = 'Adulto / Gym';
        return;
    }
    
    if (!fecha) return;
    const anio = fecha.split('-')[0];
    document.getElementById('alumno-categoria').value = anio;
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

function obtenerFechaActualStr() {
    const d = new Date();
    const anio = d.getFullYear();
    let mes = d.getMonth() + 1;
    let dia = d.getDate();
    if (mes < 10) mes = '0' + mes;
    if (dia < 10) dia = '0' + dia;
    return `${anio}-${mes}-${dia}`;
}

// --- MODALES ---
function openAddSedeModal() {
    document.getElementById('modal-sede-title').innerText = "Registrar Nueva Sede / Negocio";
    document.getElementById('edit-sede-id').value = "";
    document.getElementById('form-sede').reset();
    document.getElementById('modal-sede').classList.add('active');
}

function openAddAlumnoModal() {
    document.getElementById('modal-alumno-title').innerText = "Registrar Nuevo Miembro";
    document.getElementById('edit-alumno-id').value = "";
    document.getElementById('form-alumno').reset();
    state.base64Foto = '';
    document.getElementById('upload-preview').src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23111827'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='12' fill='%236B7280'>Vista Previa</text></svg>";
    
    document.getElementById('modal-alumno').classList.add('active');
    handleSedeChangeEnFormulario();
}

function openEditAlumnoModal(id) {
    const alumno = state.alumnos.find(a => a.id === id);
    if (!alumno) return;
    
    document.getElementById('modal-alumno-title').innerText = "Editar Miembro";
    document.getElementById('edit-alumno-id').value = alumno.id;
    document.getElementById('alumno-nombre').value = alumno.nombre;
    document.getElementById('alumno-sede').value = alumno.sedeId;
    document.getElementById('alumno-nacimiento').value = alumno.fechaNacimiento;
    document.getElementById('alumno-categoria').value = alumno.categoria;
    document.getElementById('alumno-tutor').value = alumno.tutorNombre;
    document.getElementById('alumno-telefono').value = alumno.tutorTelefono;
    
    state.base64Foto = alumno.foto || '';
    if (alumno.foto) {
        document.getElementById('upload-preview').src = alumno.foto;
    } else {
        document.getElementById('upload-preview').src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23111827'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='12' fill='%236B7280'>Vista Previa</text></svg>";
    }
    
    document.getElementById('modal-alumno').classList.add('active');
    handleSedeChangeEnFormulario();
}

function openAddPartidoModal() {
    document.getElementById('form-partido').reset();
    document.getElementById('partido-fecha').valueAsDate = new Date();
    document.getElementById('modal-partido').classList.add('active');
}

function openAddTransaccionModal() {
    document.getElementById('form-transaccion').reset();
    document.getElementById('gasto-fecha').valueAsDate = new Date();
    document.getElementById('modal-transaccion').classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
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
