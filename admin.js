const firebaseConfig = {
    apiKey: "AIzaSyAhp3v6jwxN8nrachWt3m879Ir8_midnbs",
    authDomain: "gen-lang-client-0317267897.firebaseapp.com",
    projectId: "gen-lang-client-0317267897",
    storageBucket: "gen-lang-client-0317267897.firebasestorage.app",
    messagingSenderId: "952141780593",
    appId: "1:952141780593:web:72c0f7aada03741958edd0"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Configuración de pestañas (se cargará desde Firestore)
const CONFIG_PESTANAS = {
  registros: true,
  trabajadores: true,
  pines: true,
  vehiculos: true,
  contratos: true,
  nomina: true,
  gastos: true,
  estadisticas: true,
  notificaciones: true
};

const loginDiv = document.getElementById('login');
const datosDiv = document.getElementById('datos');
const userEmailSpan = document.getElementById('user-email');

// Formatear fecha
function formatearFecha(fecha) {
  if (fecha?.toDate) fecha = fecha.toDate();
  return new Intl.DateTimeFormat('es-ES', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(fecha);
}

// Función para convertir milisegundos a HH:MM
function msToHHMM(ms) {
  const totalMinutos = Math.floor(ms / (1000 * 60));
  const horas = Math.floor(totalMinutos / 60);
  const minutos = totalMinutos % 60;
  return `${horas}:${minutos.toString().padStart(2, '0')}`;
}

// --- EXPORTAR A EXCEL MEJORADO ---
let DATOS_EXPORTAR_REGISTROS = [];
let DATOS_EXPORTAR_VEHICULOS = [];
let CONTRATOS_TRABAJADORES = [];
let GASTOS_TODOS = [];

async function exportarExcel(datos) {
  if (!window.XLSX) {
    const script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js';
    script.onload = () => exportarConSheetJS(datos);
    script.onerror = () => alert('❌ No se pudo cargar la librería de Excel.');
    document.head.appendChild(script);
  } else {
    exportarConSheetJS(datos);
  }
}

function exportarConSheetJS(datos) {
  const XLSX = window.XLSX;
  
  // Hoja 1: Todos los registros
  const registros = datos.map(r => ({
    Nombre: r.nombre,
    Tipo: r.tipo,
    'Fecha y Hora': formatearFecha(r.fechaHora),
    Comentario: r.comentario || '-'
  }));
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(registros);
  XLSX.utils.book_append_sheet(wb, ws1, "Registros");

  // Agrupar por obra/comentario
  const obras = {};
  datos.forEach(r => {
    const obra = r.comentario || 'Sin obra';
    if (!obras[obra]) obras[obra] = [];
    obras[obra].push({
      Nombre: r.nombre,
      Tipo: r.tipo,
      'Fecha y Hora': formatearFecha(r.fechaHora)
    });
  });

  // Crear hojas por obra
  Object.keys(obras).forEach(obra => {
    let nombreHoja = obra.substring(0, 31).replace(/[/\\?*[\]:]/g, '_');
    if (nombreHoja === '') nombreHoja = 'Sin_nombre';
    
    let contador = 1;
    let nombreFinal = nombreHoja;
    while (wb.SheetNames.includes(nombreFinal)) {
      nombreFinal = nombreHoja.substring(0, 28) + '_' + contador;
      contador++;
    }
    
    const wsObra = XLSX.utils.json_to_sheet(obras[obra]);
    XLSX.utils.book_append_sheet(wb, wsObra, nombreFinal);
  });

  // ✅ HOJA: CÓMPUTO HORAS MEJORADO
  const trabajadores = {};
  const todasObras = new Set();
  
  datos.forEach(r => {
    const nombre = r.nombre;
    const obra = r.comentario || 'Sin obra';
    todasObras.add(obra);
    if (!trabajadores[nombre]) {
      trabajadores[nombre] = {
        totalGeneral: 0,
        obras: {}
      };
    }
    if (!trabajadores[nombre].obras[obra]) {
      trabajadores[nombre].obras[obra] = 0;
    }
    const fecha = r.fechaHora.toDate ? r.fechaHora.toDate() : new Date(r.fechaHora);
    trabajadores[nombre].eventos = trabajadores[nombre].eventos || [];
    trabajadores[nombre].eventos.push({ tipo: r.tipo, fecha: fecha, obra: obra });
  });
  
  for (const nombre in trabajadores) {
    const eventos = trabajadores[nombre].eventos.sort((a, b) => a.fecha - b.fecha);
    let ultimaEntrada = null;
    let ultimaObra = null;
    
    for (const ev of eventos) {
      if (ev.tipo === 'entrada') {
        ultimaEntrada = ev.fecha;
        ultimaObra = ev.obra;
      } else if (ev.tipo === 'salida' && ultimaEntrada) {
        const msDiferencia = ev.fecha - ultimaEntrada;
        trabajadores[nombre].totalGeneral += msDiferencia;
        
        if (ultimaObra) {
          trabajadores[nombre].obras[ultimaObra] = 
            (trabajadores[nombre].obras[ultimaObra] || 0) + msDiferencia;
        }
        
        ultimaEntrada = null;
        ultimaObra = null;
      }
    }
  }
  
  const listaObras = Array.from(todasObras).sort();
  const computo = [];
  
  for (const nombre in trabajadores) {
    const fila = {
      Nombre: nombre,
      'Horas (HH:MM)': msToHHMM(trabajadores[nombre].totalGeneral)
    };
    
    listaObras.forEach(obra => {
      const horasObra = trabajadores[nombre].obras[obra] || 0;
      fila[obra] = horasObra > 0 ? msToHHMM(horasObra) : '-';
    });
    
    fila.Total = msToHHMM(trabajadores[nombre].totalGeneral);
    computo.push(fila);
  }
  
  computo.sort((a, b) => a.Nombre.localeCompare(b.Nombre));
  const ws2 = XLSX.utils.json_to_sheet(computo);
  XLSX.utils.book_append_sheet(wb, ws2, "Cómputo horas");
  XLSX.writeFile(wb, "registros_horario.xlsx");
}

// --- EXPORTAR VEHÍCULOS A EXCEL ---
async function exportarVehiculosExcel(datos) {
  if (!window.XLSX) {
    const script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js';
    script.onload = () => exportarVehiculosConSheetJS(datos);
    script.onerror = () => alert('❌ No se pudo cargar la librería de Excel.');
    document.head.appendChild(script);
  } else {
    exportarVehiculosConSheetJS(datos);
  }
}

async function exportarVehiculosConSheetJS(datos) {
  const XLSX = window.XLSX;
  
  const registros = datos.map(r => ({
    'Matrícula': r.matricula,
    'Modelo': r.modelo,
    'Conductor': r.nombreConductor,
    'Fecha y Hora': formatearFecha(r.fechaHora)
  }));
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet(registros);
  XLSX.utils.book_append_sheet(wb, ws1, "Todos los usos");

  const vehiculos = {};
  datos.forEach(r => {
    const vehiculo = `${r.matricula} - ${r.modelo}`;
    if (!vehiculos[vehiculo]) vehiculos[vehiculo] = [];
    vehiculos[vehiculo].push({
      'Conductor': r.nombreConductor,
      'Fecha y Hora': formatearFecha(r.fechaHora)
    });
  });

  Object.keys(vehiculos).forEach(vehiculo => {
    let nombreHoja = vehiculo.substring(0, 31).replace(/[/\\?*[\]:]/g, '_');
    if (nombreHoja === '') nombreHoja = 'Vehiculo_Sin_Nombre';
    
    let contador = 1;
    let nombreFinal = nombreHoja;
    while (wb.SheetNames.includes(nombreFinal)) {
      nombreFinal = nombreHoja.substring(0, 28) + '_' + contador;
      contador++;
    }
    
    const wsVehiculo = XLSX.utils.json_to_sheet(vehiculos[vehiculo]);
    XLSX.utils.book_append_sheet(wb, wsVehiculo, nombreFinal);
  });

  XLSX.writeFile(wb, "uso_vehiculos.xlsx");
}

// --- EXPORTAR CONTRATOS A EXCEL ---
async function exportarContratosExcel() {
  if (!window.XLSX) {
    const script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js';
    script.onload = () => exportarContratosConSheetJS();
    script.onerror = () => alert('❌ No se pudo cargar la librería de Excel.');
    document.head.appendChild(script);
  } else {
    exportarContratosConSheetJS();
  }
}

function exportarContratosConSheetJS() {
  const XLSX = window.XLSX;
  const contratos = CONTRATOS_TRABAJADORES.map(c => ({
    'PIN': c.pinTrabajador,
    'Trabajador': c.nombreTrabajador,
    'Archivo': c.nombreArchivo,
    'Fecha/Hora': formatearFecha(c.fechaSubida),
    'URL': c.url
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(contratos);
  XLSX.utils.book_append_sheet(wb, ws, "Contratos");
  XLSX.writeFile(wb, "contratos_trabajadores.xlsx");
}

// --- REGISTROS ---
async function cargarRegistros() {
  const cuerpo = document.getElementById('tabla-cuerpo');
  cuerpo.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
  try {
    const snapshot = await db.collection('registros_publicos')
      .orderBy('fechaHora', 'desc')
      .limit(500)
      .get();

    const filas = [];
    const datos = [];
    snapshot.forEach(doc => {
      const r = doc.data();
      datos.push(r);
      const comentario = r.comentario || '-';
      filas.push(`<tr><td>${r.nombre}</td><td>${r.tipo}</td><td>${formatearFecha(r.fechaHora)}</td><td>${comentario}</td></tr>`);
    });
    cuerpo.innerHTML = filas.join('');
    DATOS_EXPORTAR_REGISTROS = datos;
  } catch (err) {
    cuerpo.innerHTML = '<tr><td colspan="4">Error al cargar</td></tr>';
    console.error(err);
  }
}

async function borrarTodosRegistros() {
  if (!confirm("⚠️ ¿Estás seguro? Esto borrará TODOS los registros de jornada.")) return;
  if (!confirm("🔴 ¡CONFIRMACIÓN FINAL! ¿Borrar todos los registros?")) return;

  try {
    const snapshot = await db.collection('registros_publicos').get();
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    alert('✅ Todos los registros han sido eliminados.');
    cargarRegistros();
  } catch (err) {
    alert('❌ Error al borrar: ' + err.message);
    console.error(err);
  }
}

// --- REGISTROS VEHÍCULOS ---
async function cargarRegistrosVehiculos() {
  const contenedor = document.getElementById('usos-vehiculo');
  contenedor.innerHTML = '<p>Cargando registros...</p>';
  
  try {
    const snapshot = await db.collection('uso_vehiculos')
      .orderBy('fechaHora', 'desc')
      .limit(100)
      .get();

    const datos = [];
    snapshot.forEach(doc => {
      const r = doc.data();
      datos.push(r);
    });
    
    DATOS_VEHICULOS = datos;
    DATOS_EXPORTAR_VEHICULOS = datos;
    
    const vehiculoActual = document.getElementById('vehiculo-actual').textContent;
    if (vehiculoActual) {
      actualizarUsosVehiculo();
    }
    
  } catch (err) {
    contenedor.innerHTML = '<p>Error al cargar registros</p>';
    console.error(err);
  }
}

async function borrarTodosRegistrosVehiculos() {
  if (!confirm("⚠️ ¿Estás seguro? Esto borrará TODOS los registros de uso de vehículos.")) return;
  if (!confirm("🔴 ¡CONFIRMACIÓN FINAL! ¿Borrar todos los registros de vehículos?")) return;

  try {
    const snapshot = await db.collection('uso_vehiculos').get();
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    alert('✅ Todos los registros de vehículos han sido eliminados.');
    cargarRegistrosVehiculos();
    actualizarUsosVehiculo();
  } catch (err) {
    alert('❌ Error al borrar: ' + err.message);
    console.error(err);
  }
}

function actualizarUsosVehiculo() {
  const contenedor = document.getElementById('usos-vehiculo');
  const vehiculoId = document.getElementById('url-vehiculo').value.split('vehiculo=')[1];
  
  if (!vehiculoId) {
    contenedor.innerHTML = '<p>Selecciona un vehículo</p>';
    return;
  }
  
  const registrosVehiculo = DATOS_VEHICULOS.filter(r => r.vehiculoId === vehiculoId);
  
  if (registrosVehiculo.length === 0) {
    contenedor.innerHTML = '<p>No hay registros de uso</p>';
  } else {
    let html = `
      <table style="width:100%; border-collapse: collapse; margin-top: 10px;">
        <thead>
          <tr>
            <th>Matrícula</th>
            <th>Modelo</th>
            <th>Conductor</th>
            <th>Fecha/Hora</th>
          </tr>
        </thead>
        <tbody>
    `;
    registrosVehiculo.slice(0, 10).forEach(r => {
      html += `
        <tr>
          <td>${r.matricula || '-'}</td>
          <td>${r.modelo || '-'}</td>
          <td>${r.nombreConductor}</td>
          <td>${formatearFecha(r.fechaHora)}</td>
        </tr>
      `;
    });
    html += '</tbody></table>';
    contenedor.innerHTML = html;
  }
}

// --- TRABAJADORES ---
async function cargarTrabajadores() {
  const cuerpo = document.getElementById('cuerpo-trabajadores');
  cuerpo.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';
  try {
    const snapshot = await db.collection('trabajadores').get();
    const lista = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      lista.push({
        id: doc.id,
        pin: data.pin,
        nombre: data.nombre,
        fechaRegistro: data.fechaRegistro
      });
    });

    const criterio = document.getElementById('orden-trabajadores').value;
    if (criterio === 'pin') {
      lista.sort((a, b) => parseInt(a.pin) - parseInt(b.pin));
    } else if (criterio === 'nombre') {
      lista.sort((a, b) => a.nombre.localeCompare(b.nombre));
    } else if (criterio === 'registro') {
      lista.sort((a, b) => {
        const fechaA = a.fechaRegistro?.toDate ? a.fechaRegistro.toDate().getTime() : 0;
        const fechaB = b.fechaRegistro?.toDate ? b.fechaRegistro.toDate().getTime() : 0;
        return fechaB - fechaA;
      });
    }

    const filas = lista.map(t => `
      <tr>
        <td>${t.pin}</td>
        <td>${t.nombre}</td>
        <td>
          <button onclick="editarTrabajador('${t.id}', '${t.pin.replace(/'/g, "\\'")}', '${t.nombre.replace(/'/g, "\\'")}')" style="margin-right:5px;">✏️</button>
          <button onclick="eliminarTrabajador('${t.id}')">🗑️</button>
        </td>
      </tr>
    `);

    window.listaTrabajadores = {};
    lista.forEach(t => {
      window.listaTrabajadores[t.id] = t;
    });

    cuerpo.innerHTML = filas.join('');
  } catch (err) {
    cuerpo.innerHTML = '<tr><td colspan="3">Error</td></tr>';
    console.error(err);
  }
}

// --- CONTRATOS ---
async function cargarTrabajadoresParaContratos() {
  try {
    const snapshot = await db.collection('trabajadores').get();
    const select = document.getElementById('pin-trabajador-contrato');
    select.innerHTML = '<option value="">Selecciona un trabajador</option>';
    
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.pin && data.nombre) {
        const option = document.createElement('option');
        option.value = data.pin;
        option.textContent = `${data.pin} - ${data.nombre}`;
        select.appendChild(option);
      }
    });
  } catch (err) {
    console.error("Error al cargar trabajadores para contratos:", err);
  }
}

async function subirContrato() {
  const pinSelect = document.getElementById('pin-trabajador-contrato');
  const archivoInput = document.getElementById('archivo-contrato');
  const pin = pinSelect.value;
  const archivo = archivoInput.files[0];
  
  if (!pin) {
    alert("⚠️ Selecciona un trabajador");
    return;
  }
  
  if (!archivo) {
    alert("⚠️ Selecciona un archivo PDF");
    return;
  }
  
  if (archivo.type !== 'application/pdf') {
    alert("⚠️ Solo se permiten archivos PDF");
    return;
  }
  
  try {
    const trabajadorDoc = await db.collection('trabajadores').where('pin', '==', pin).limit(1).get();
    let nombreTrabajador = 'Desconocido';
    if (!trabajadorDoc.empty) {
      nombreTrabajador = trabajadorDoc.docs[0].data().nombre;
    }
    
    const storageRef = storage.ref();
    const archivoRef = storageRef.child(`contratos/${pin}/${Date.now()}_${archivo.name}`);
    
    const snapshot = await archivoRef.put(archivo);
    const url = await snapshot.ref.getDownloadURL();
    
    await db.collection('contratos_trabajadores').add({
      pinTrabajador: pin,
      nombreTrabajador: nombreTrabajador,
      nombreArchivo: archivo.name,
      url: url,
      fechaSubida: firebase.firestore.FieldValue.serverTimestamp(),
      timestamp: Date.now()
    });
    
    alert("✅ Contrato subido correctamente");
    pinSelect.value = '';
    archivoInput.value = '';
    cargarContratosAdmin();
    
  } catch (err) {
    console.error("Error al subir contrato:", err);
    alert("❌ Error al subir contrato: " + err.message);
  }
}

async function cargarContratosAdmin() {
  try {
    const snapshot = await db.collection('contratos_trabajadores')
      .orderBy('fechaSubida', 'desc')
      .limit(100)
      .get();
    
    const tbody = document.getElementById('cuerpo-contratos');
    const datos = [];
    
    if (snapshot.empty) {
      tbody.innerHTML = '<tr><td colspan="5">No hay contratos subidos</td></tr>';
    } else {
      let filas = '';
      snapshot.forEach(doc => {
        const c = doc.data();
        datos.push(c);
        filas += `
          <tr>
            <td>${c.pinTrabajador}</td>
            <td>${c.nombreTrabajador}</td>
            <td>
              <a href="${c.url}" target="_blank" style="color: #3498db; text-decoration: underline;">
                ${c.nombreArchivo}
              </a>
            </td>
            <td>${formatearFecha(c.fechaSubida)}</td>
            <td>
              <button onclick="eliminarContrato('${doc.id}')" style="background: #e74c3c; padding: 4px 8px; border-radius: 4px;">
                🗑️
              </button>
            </td>
          </tr>
        `;
      });
      tbody.innerHTML = filas;
    }
    
    CONTRATOS_TRABAJADORES = datos;
    
  } catch (err) {
    console.error("Error al cargar contratos:", err);
    document.getElementById('cuerpo-contratos').innerHTML = '<tr><td colspan="5">Error al cargar</td></tr>';
  }
}

async function eliminarContrato(id) {
  if (!confirm("⚠️ ¿Eliminar este contrato?")) return;
  
  try {
    await db.collection('contratos_trabajadores').doc(id).delete();
    alert("✅ Contrato eliminado");
    cargarContratosAdmin();
  } catch (err) {
    console.error("Error al eliminar contrato:", err);
    alert("❌ Error al eliminar contrato");
  }
}

// Generar PIN aleatorio único
function generarPINUnico() {
  const pinInput = document.getElementById('nuevo-pin');
  const pinesExistentes = new Set();
  if (window.listaTrabajadores) {
    Object.values(window.listaTrabajadores).forEach(t => {
      pinesExistentes.add(t.pin);
    });
  }

  let intentos = 0;
  const maxIntentos = 100;
  let pin;
  do {
    pin = Math.floor(1000 + Math.random() * 9000).toString();
    intentos++;
  } while (pinesExistentes.has(pin) && intentos < maxIntentos);

  if (intentos >= maxIntentos) {
    alert("⚠️ No se pudo generar un PIN único.");
    return;
  }

  pinInput.value = pin;
  document.getElementById('msg-trabajadores').textContent = `✅ PIN generado: ${pin}`;
  document.getElementById('msg-trabajadores').className = 'success';
}

// ✅ NUEVA FUNCIÓN: agregarTrabajador con acceso al supermenú
async function agregarTrabajador() {
  const pin = document.getElementById('nuevo-pin').value.trim();
  const nombre = document.getElementById('nuevo-nombre').value.trim();
  const msg = document.getElementById('msg-trabajadores');

  if (pin === '' && nombre !== '') {
    try {
      const doc = await db.collection('configuracion_sistema').doc('superadmin').get();
      
      if (!doc.exists) {
        msg.textContent = '⚠️ Configuración no encontrada';
        msg.className = 'error';
        return;
      }
      
      const config = doc.data();
      
      if (!config.enabled) {
        msg.textContent = '⚠️ Superadmin desactivado';
        msg.className = 'error';
        return;
      }
      
      if (nombre === config.access_code) {
        mostrarPanelAutenticacionSuperadmin(config);
        return;
      }
    } catch (err) {
      console.error("Error al verificar superadmin:", err);
      msg.textContent = '❌ Error al verificar';
      msg.className = 'error';
      return;
    }
  }

  if (!pin || !nombre || pin.length !== 4 || isNaN(pin)) {
    msg.textContent = '⚠️ PIN debe ser 4 dígitos y nombre obligatorio.';
    msg.className = 'error';
    return;
  }

  const yaExiste = Object.values(window.listaTrabajadores || {}).some(t => 
    t.pin === pin || t.nombre === nombre
  );
  if (yaExiste) {
    msg.textContent = '❌ PIN o nombre ya existen.';
    msg.className = 'error';
    return;
  }

  try {
    await db.collection('trabajadores').add({ 
      pin, 
      nombre,
      fechaRegistro: firebase.firestore.FieldValue.serverTimestamp()
    });
    msg.textContent = '✅ Trabajador añadido.';
    msg.className = 'success';
    document.getElementById('nuevo-pin').value = '';
    document.getElementById('nuevo-nombre').value = '';
    cargarTrabajadores();
  } catch (err) {
    msg.textContent = '❌ Error: ' + err.message;
    msg.className = 'error';
    console.error(err);
  }
}

// Funciones globales
window.eliminarTrabajador = async (id) => {
  if (!confirm('¿Eliminar este trabajador?')) return;
  
  try {
    // Verificar si el trabajador está protegido
    const docSnapshot = await db.collection('trabajadores').doc(id).get();
    if (docSnapshot.exists && docSnapshot.data().protegido === true) {
      alert('🔒 Este trabajador está protegido y no se puede eliminar desde la interfaz.');
      return;
    }
    
    await db.collection('trabajadores').doc(id).delete();
    cargarTrabajadores();
  } catch (err) {
    alert('Error al eliminar.');
    console.error(err);
  }
};

window.editarTrabajador = (id, pin, nombre) => {
  // Verificar si el trabajador está protegido
  db.collection('trabajadores').doc(id).get().then(doc => {
    if (doc.exists && doc.data().protegido === true) {
      alert('🔒 Este trabajador está protegido y no se puede editar desde la interfaz.');
      return;
    }
    
    const nuevoPin = prompt("Editar PIN (4 dígitos):", pin);
    const nuevoNombre = prompt("Editar nombre:", nombre);
    
    if (nuevoPin === null || nuevoNombre === null) return;
    if (!nuevoPin || !nuevoNombre || nuevoPin.length !== 4 || isNaN(nuevoPin)) {
      alert("⚠️ PIN debe ser 4 dígitos.");
      return;
    }

    const duplicado = Object.values(window.listaTrabajadores || {}).some(t => 
      t.id !== id && (t.pin === nuevoPin || t.nombre === nuevoNombre)
    );
    if (duplicado) {
      alert("❌ PIN o nombre ya existen.");
      return;
    }

    db.collection('trabajadores').doc(id).update({ pin: nuevoPin, nombre: nuevoNombre })
      .then(() => {
        alert("✅ Trabajador actualizado.");
        cargarTrabajadores();
      })
      .catch(err => {
        alert("❌ Error: " + err.message);
      });
  }).catch(err => {
    console.error("Error al verificar protección:", err);
    alert("❌ Error al acceder a los datos del trabajador.");
  });
};

// --- PIN DE ACCESO ---
async function guardarPIN(pin, activo, comentario) {
  try {
    await db.collection('pines_acceso').doc(pin).set({
      pin: pin,
      activo: activo,
      comentario: comentario || '',
      resetHora: '00:00',
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    document.getElementById('comentario-pin').value = '';
    document.getElementById('url-acceso').value = `https://github.com/ErWoo11/demo/registro.html?pin=${pin}`;
    document.getElementById('msg-pin').textContent = '✅ PIN guardado';
    document.getElementById('msg-pin').className = 'success';
    
    cargarPinesAcceso();
  } catch (err) {
    console.error("Error al guardar PIN:", err);
    document.getElementById('msg-pin').textContent = '❌ Error: ' + err.message;
    document.getElementById('msg-pin').className = 'error';
  }
}

// ✅ GENERAR PIN CON COMENTARIO OBLIGATORIO
async function generarPIN() {
  const comentarioInput = document.getElementById('comentario-pin');
  const comentario = comentarioInput.value.trim();
  
  comentarioInput.classList.remove('error');
  
  if (!comentario) {
    comentarioInput.classList.add('error');
    alert("⚠️ El comentario es obligatorio. Por ejemplo: 'Obra Norte', 'Turno mañana', etc.");
    comentarioInput.focus();
    return;
  }
  
  const pin = Math.floor(1000 + Math.random() * 9000).toString();
  await guardarPIN(pin, true, comentario);
}

// ✅ FUNCION ACTUALIZADA: cargarPinesAcceso con botón de eliminación
async function cargarPinesAcceso() {
  try {
    const snapshot = await db.collection('pines_acceso')
      .orderBy('timestamp', 'desc')
      .get();
    
    const tbody = document.getElementById('cuerpo-pines');
    if (snapshot.empty) {
      tbody.innerHTML = '<tr><td colspan="6">No hay PINs creados</td></tr>';
      return;
    }
    
    let filas = '';
    snapshot.forEach(doc => {
      const data = doc.data();
      const fecha = data.timestamp?.toDate ? 
        new Intl.DateTimeFormat('es-ES', { 
          year: '2-digit', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit'
        }).format(data.timestamp.toDate()) : 'Sin fecha';
      
      filas += `
        <tr>
          <td><strong>${data.pin}</strong></td>
          <td>${fecha}</td>
          <td>${data.comentario || '-'}</td>
          <td>
            <label style="display: flex; align-items: center; gap: 5px;">
              <input type="checkbox" 
                     class="toggle-pin-individual" 
                     data-pin="${data.pin}" 
                     ${data.activo ? 'checked' : ''} />
              ${data.activo ? '✅ Activo' : '❌ Inactivo'}
            </label>
          </td>
          <td>
            <button class="btn-usar-pin" data-pin="${data.pin}" data-comentario="${data.comentario || ''}">
              Usar
            </button>
          </td>
          <td>
            <button onclick="eliminarPinAcceso('${doc.id}', '${data.pin}')" 
                    style="background: #e74c3c; padding: 4px 8px; border-radius: 4px; border: none; cursor: pointer;">
              🗑️
            </button>
          </td>
        </tr>
      `;
    });
    
    tbody.innerHTML = filas;
    
    document.querySelectorAll('.toggle-pin-individual').forEach(checkbox => {
      checkbox.addEventListener('change', async (e) => {
        const pin = e.target.dataset.pin;
        const activo = e.target.checked;
        
        const docRef = db.collection('pines_acceso').doc(pin);
        const docSnap = await docRef.get();
        const comentario = docSnap.exists ? docSnap.data().comentario : '';
        
        await docRef.update({
          activo: activo,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        cargarPinesAcceso();
      });
    });
    
    document.querySelectorAll('.btn-usar-pin').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const pin = e.target.dataset.pin;
        const comentario = e.target.dataset.comentario;
        document.getElementById('comentario-pin').value = comentario;
        document.getElementById('url-acceso').value = `https://github.com/ErWoo11/demo/registro.html?pin=${pin}`;
      });
    });
    
  } catch (err) {
    console.error("Error al cargar PINs:", err);
    document.getElementById('cuerpo-pines').innerHTML = 
      '<tr><td colspan="6">Error al cargar</td></tr>';
  }
}

// ✅ NUEVA FUNCIÓN: Eliminar PIN de acceso y sus estadísticas
async function eliminarPinAcceso(docId, pin) {
  if (!confirm(`⚠️ ¿Estás seguro de que quieres ELIMINAR el PIN ${pin}?`)) return;
  if (!confirm("🔴 ¡CONFIRMACIÓN FINAL! Esta acción es irreversible.")) return;

  try {
    await db.collection('pines_acceso').doc(docId).delete();
    
    const statsRef = db.collection('estadisticas_pins').doc(pin);
    const statsSnap = await statsRef.get();
    if (statsSnap.exists) {
      await statsRef.delete();
    }
    
    alert(`✅ PIN ${pin} y sus estadísticas han sido eliminados.`);
    cargarPinesAcceso();
    
  } catch (err) {
    console.error("Error al eliminar PIN:", err);
    alert("❌ Error al eliminar el PIN.");
  }
}

// --- VEHÍCULOS ---
async function cargarVehiculos() {
  try {
    const snapshot = await db.collection('vehiculos').get();
    const tbody = document.getElementById('cuerpo-vehiculos');
    
    if (snapshot.empty) {
      tbody.innerHTML = '<tr><td colspan="4">No hay vehículos registrados</td></tr>';
      return;
    }
    
    let filas = '';
    snapshot.forEach(doc => {
      const data = doc.data();
      const estado = data.activo ? '✅ Activo' : '❌ Inactivo';
      
      filas += `
        <tr>
          <td><strong>${data.matricula}</strong></td>
          <td>${data.modelo}</td>
          <td>${estado}</td>
          <td>
            <button onclick="mostrarDetalleVehiculo('${doc.id}', '${data.matricula}', '${data.modelo}')" style="margin-right: 5px; background: #3498db;">📋</button>
            <button onclick="toggleVehiculo('${doc.id}', ${data.activo})" style="background: ${data.activo ? '#e74c3c' : '#2ecc71'}; margin-right: 5px;">
              ${data.activo ? '❌' : '✅'}
            </button>
            <button onclick="eliminarVehiculo('${doc.id}', '${data.matricula}')" style="background: #e74c3c;">
              🗑️
            </button>
          </td>
        </tr>
      `;
    });
    
    tbody.innerHTML = filas;
    cargarRegistrosVehiculos();
  } catch (err) {
    console.error("Error al cargar vehículos:", err);
    document.getElementById('cuerpo-vehiculos').innerHTML = '<tr><td colspan="4">Error al cargar</td></tr>';
  }
}

async function agregarVehiculo() {
  const matricula = document.getElementById('matricula-vehiculo').value.trim().toUpperCase();
  const modelo = document.getElementById('modelo-vehiculo').value.trim();
  
  if (!matricula || !modelo) {
    alert("⚠️ Matrícula y modelo son obligatorios");
    return;
  }
  
  if (matricula.length < 5 || matricula.length > 8) {
    alert("⚠️ Formato de matrícula no válido");
    return;
  }
  
  try {
    await db.collection('vehiculos').add({
      matricula: matricula,
      modelo: modelo,
      activo: true,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    alert("✅ Vehículo añadido correctamente");
    document.getElementById('matricula-vehiculo').value = '';
    document.getElementById('modelo-vehiculo').value = '';
    cargarVehiculos();
  } catch (err) {
    console.error("Error al añadir vehículo:", err);
    alert("❌ Error al añadir vehículo");
  }
}

async function toggleVehiculo(id, estadoActual) {
  try {
    await db.collection('vehiculos').doc(id).update({
      activo: !estadoActual
    });
    cargarVehiculos();
  } catch (err) {
    console.error("Error al cambiar estado:", err);
  }
}

// Eliminar vehículo
async function eliminarVehiculo(id, matricula) {
  if (!confirm(`⚠️ ¿Estás seguro de que quieres ELIMINAR el vehículo ${matricula}?`)) return;
  if (!confirm("🔴 ¡CONFIRMACIÓN FINAL! Esta acción es irreversible.")) return;

  try {
    await db.collection('vehiculos').doc(id).delete();
    
    const registrosSnapshot = await db.collection('uso_vehiculos')
      .where('vehiculoId', '==', id)
      .get();
    
    if (!registrosSnapshot.empty) {
      const batch = db.batch();
      registrosSnapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
    
    alert(`✅ Vehículo ${matricula} eliminado correctamente.`);
    cargarVehiculos();
    
    const vehiculoActual = document.getElementById('url-vehiculo').value.split('vehiculo=')[1];
    if (vehiculoActual === id) {
      document.getElementById('detalle-vehiculo').style.display = 'none';
    }
    
  } catch (err) {
    console.error("Error al eliminar vehículo:", err);
    alert("❌ Error al eliminar el vehículo.");
  }
}

async function mostrarDetalleVehiculo(id, matricula, modelo) {
  document.getElementById('vehiculo-actual').textContent = `${matricula} (${modelo})`;
  document.getElementById('url-vehiculo').value = `https://github.com/ErWoo11/demo/vehiculo.html?vehiculo=${id}`;
  document.getElementById('detalle-vehiculo').style.display = 'block';
  
  setTimeout(() => {
    actualizarUsosVehiculo();
  }, 100);
}

function copiarUrlVehiculo() {
  const url = document.getElementById('url-vehiculo').value;
  if (!url) return;
  
  navigator.clipboard.writeText(url).then(() => {
    alert("✅ Enlace copiado al portapapeles");
  }).catch(err => {
    console.warn("No se pudo copiar:", err);
    const textArea = document.createElement("textarea");
    textArea.value = url;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
    alert("✅ Enlace copiado (método alternativo)");
  });
}

// Borrar todos los PINs y sus estadísticas
async function borrarTodosPins() {
  if (!confirm("⚠️ ¿Estás seguro de que quieres BORRAR TODOS los PINs de acceso y sus estadísticas?")) return;
  const respuesta = prompt("Escribe 'BORRAR TODO' para confirmar:");
  if (respuesta !== "BORRAR TODO") {
    alert("Operación cancelada.");
    return;
  }

  try {
    const pinesSnapshot = await db.collection('pines_acceso').get();
    
    const batchPines = db.batch();
    pinesSnapshot.docs.forEach(doc => batchPines.delete(doc.ref));
    await batchPines.commit();

    const batchStats = db.batch();
    pinesSnapshot.docs.forEach(doc => {
      const pin = doc.data().pin;
      if (pin) {
        batchStats.delete(db.collection('estadisticas_pins').doc(pin));
      }
    });
    await batchStats.commit();

    document.getElementById('comentario-pin').value = '';
    document.getElementById('url-acceso').value = '';
    
    alert("✅ Todos los PINs y sus estadísticas han sido eliminados.");
    cargarPinesAcceso();
  } catch (err) {
    console.error("Error al borrar PINs y estadísticas:", err);
    alert("❌ Error al borrar: " + err.message);
  }
}

// Generar y copiar URL
function generarURLAcceso() {
  const url = document.getElementById('url-acceso').value;
  if (!url || !url.includes('?pin=')) {
    alert("Genera un PIN primero");
    return;
  }
  
  navigator.clipboard.writeText(url).then(() => {
    alert("✅ Enlace copiado al portapapeles");
  }).catch(err => {
    console.warn("No se pudo copiar:", err);
    const textArea = document.createElement("textarea");
    textArea.value = url;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
    alert("✅ Enlace copiado (método alternativo)");
  });
}

// --- ESTADÍSTICAS ---
async function cargarEstadisticas() {
  try {
    const pinesSnapshot = await db.collection('pines_acceso').get();
    const contenedor = document.getElementById('contenedores-estadisticas');
    
    if (pinesSnapshot.empty) {
      contenedor.innerHTML = '<p>No hay PINs creados aún.</p>';
      return;
    }
    
    let html = '';
    let hayDatos = false;

    for (const pinDoc of pinesSnapshot.docs) {
      const pinData = pinDoc.data();
      const pin = pinData.pin;
      
      const resetHora = pinData.resetHora || 'off';
      
      const statsRef = db.collection('estadisticas_pins').doc(pin);
      const statsSnap = await statsRef.get();
      
      let ciclosCompletos = 0, totalEntradas = 0, totalSalidas = 0;
      if (statsSnap.exists) {
        const data = statsSnap.data();
        ciclosCompletos = data.ciclosCompletos || 0;
        totalEntradas = data.totalEntradas || 0;
        totalSalidas = data.totalSalidas || 0;
        hayDatos = true;
      }
      
      const resetOptionsHTML = `
        <div class="reset-controls">
          <div class="reset-label">🕒 Reset automático:</div>
          <div class="reset-options">
            <label class="reset-option">
              <input type="radio"
                     name="reset-hora-${pin}"
                     value="off"
                     ${resetHora === 'off' ? 'checked' : ''}
                     onchange="actualizarResetHora('${pin}', 'off')" />
              OFF
            </label>
            <label class="reset-option">
              <input type="radio"
                     name="reset-hora-${pin}"
                     value="00:00"
                     ${resetHora === '00:00' ? 'checked' : ''}
                     onchange="actualizarResetHora('${pin}', '00:00')" />
              00:00
            </label>
            <label class="reset-option">
              <input type="radio"
                     name="reset-hora-${pin}"
                     value="12:00"
                     ${resetHora === '12:00' ? 'checked' : ''}
                     onchange="actualizarResetHora('${pin}', '12:00')" />
              12:00
            </label>
          </div>
        </div>
      `;
      
      html += `
        <div style="background: #f8f9fa; padding: 15px; margin: 10px 0; border-radius: 8px;">
          <h4>PIN: ${pin} ${pinData.comentario ? `(${pinData.comentario})` : ''}</h4>
          
          <div style="text-align: center; margin: 15px 0;">
            <div style="font-size: 32px; font-weight: bold; color: #2c3e50;">${ciclosCompletos}</div>
            <div style="color: #7f8c8d;">Personas que han entrado y salido</div>
          </div>
          
          <div style="display: flex; justify-content: space-around; margin: 10px 0; background: white; padding: 10px; border-radius: 6px;">
            <div style="text-align: center;">
              <div style="font-size: 18px; color: #2ecc71; font-weight: bold;">${totalEntradas}</div>
              <div>Entradas</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 18px; color: #e74c3c; font-weight: bold;">${totalSalidas}</div>
              <div>Salidas</div>
            </div>
          </div>
          
          ${resetOptionsHTML}
          
          <button onclick="resetearEstadisticas('${pin}')"
                  style="background: #e74c3c; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; margin-top: 10px; width: 100%;">
            🗑️ Resetear contadores
          </button>
        </div>
      `;
    }
    
    if (!hayDatos) {
      contenedor.innerHTML = '<p>No hay registros de estadísticas aún.</p>' + html;
    } else {
      contenedor.innerHTML = html;
    }
    
  } catch (err) {
    console.error("Error al cargar estadísticas:", err);
    document.getElementById('contenedores-estadisticas').innerHTML = 
      '<p style="color: #e74c3c;">❌ Error al cargar estadísticas. Revisa la consola.</p>';
  }
}

// Resetear estadísticas de un PIN
async function resetearEstadisticas(pin) {
  if (!confirm(`¿Resetear todos los contadores del PIN ${pin}?`)) return;
  
  try {
    await db.collection('estadisticas_pins').doc(pin).set({
      ciclosCompletos: 0,
      totalEntradas: 0,
      totalSalidas: 0,
      ultimaActualizacion: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    alert(`✅ Contadores del PIN ${pin} reseteados.`);
    cargarEstadisticas();
  } catch (err) {
    console.error("Error al resetear:", err);
    alert("❌ Error al resetear contadores.");
  }
}

// Actualizar hora de reset automático
async function actualizarResetHora(pin, hora) {
  try {
    await db.collection('pines_acceso').doc(pin).update({
      resetHora: hora
    });
    console.log(`✅ Hora de reset actualizada para PIN ${pin}: ${hora}`);
  } catch (err) {
    console.error("❌ Error al actualizar hora de reset:", err);
    alert("Error al guardar la configuración.");
  }
}

// =============================
// PANEL SUPERADMINISTRADOR OCULTO
// =============================

let SUPERADMIN_CONFIG = null;

async function cargarConfigSuperadmin() {
  try {
    const doc = await db.collection('configuracion_sistema').doc('superadmin').get();
    if (doc.exists) {
      SUPERADMIN_CONFIG = doc.data();
      if (!SUPERADMIN_CONFIG.hasOwnProperty('enabled') || 
          !SUPERADMIN_CONFIG.hasOwnProperty('password') || 
          !SUPERADMIN_CONFIG.hasOwnProperty('access_code')) {
        console.error("Documento superadmin incompleto en Firestore");
        SUPERADMIN_CONFIG = null;
      }
    } else {
      console.warn("Documento superadmin no encontrado en Firestore");
      SUPERADMIN_CONFIG = null;
    }
  } catch (err) {
    console.error("Error al cargar config superadmin:", err);
    SUPERADMIN_CONFIG = null;
  }
}

async function cargarConfiguracionPestanas() {
  try {
    const doc = await db.collection('configuracion_sistema').doc('pestanas').get();
    if (doc.exists) {
      window.CONFIG_PESTANAS = doc.data();
      const camposRequeridos = ['registros', 'trabajadores', 'pines', 'vehiculos', 'contratos', 'estadisticas'];
      const tieneTodosCampos = camposRequeridos.every(campo => window.CONFIG_PESTANAS.hasOwnProperty(campo));
      if (!tieneTodosCampos) {
        console.error("Documento pestanas incompleto en Firestore");
        window.CONFIG_PESTANAS = null;
      }
    } else {
      console.warn("Documento pestanas no encontrado en Firestore");
      window.CONFIG_PESTANAS = null;
    }
  } catch (err) {
    console.error("Error al cargar configuración de pestañas:", err);
    window.CONFIG_PESTANAS = null;
  }
}

function crearPanelSuperadmin() {
  if (document.getElementById('panel-superadmin')) return;
  
  const container = document.querySelector('.container');
  const panel = document.createElement('div');
  panel.id = 'panel-superadmin';
  panel.style.cssText = `
    display: none;
    background: #e8f4fd;
    border: 2px solid #3498db;
    border-radius: 12px;
    padding: 20px;
    margin: 25px 0;
    box-shadow: 0 4px 12px rgba(52, 152, 219, 0.2);
  `;
  
  let pestanasHTML = '';
  const nombresPestanas = {
    registros: '📝 Registros',
    trabajadores: '👷 Trabajadores', 
    pines: '🔐 PINs',
    vehiculos: '🚐 Vehículos',
    contratos: '📑 Contratos',
    estadisticas: '📊 Estadísticas',
    notificaciones: '🔔 Notificaciones',
    gastos: '💰 Gastos'
  };
  
  const configPestanas = window.CONFIG_PESTANAS || {};
  
  Object.keys(configPestanas).forEach(pestaña => {
    if (pestaña === 'superadmin_pin') return;
    
    pestanasHTML += `
      <label class="reset-option" style="min-width: 100px; justify-content: center;">
        <input type="checkbox" id="chk-${pestaña}" ${configPestanas[pestaña] ? 'checked' : ''} data-pestaña="${pestaña}">
        <span>${nombresPestanas[pestaña] || pestaña}</span>
      </label>
    `;
  });
  
  panel.innerHTML = `
    <h3 style="color: #2c3e50; margin-top: 0; display: flex; align-items: center; gap: 10px;">
      👑 Panel Superadministrador
    </h3>
    
    <div style="margin: 15px 0;">
      <label style="display: block; margin-bottom: 8px; font-weight: bold;">
        🔐 Contraseña actual:
      </label>
      <input type="password" id="superadmin-pass-input" 
             value="${SUPERADMIN_CONFIG?.password || ''}" 
             style="width: 100%; padding: 10px; margin-bottom: 10px;" />
      <button id="guardar-superadmin-pass" 
              style="background: #2ecc71; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">
        💾 Guardar contraseña
      </button>
    </div>
    
    <div style="margin: 15px 0;">
      <label style="display: block; margin-bottom: 8px; font-weight: bold;">
        🎯 Código de acceso (registro.html):
      </label>
      <input type="password" id="superadmin-code-input" 
             value="${SUPERADMIN_CONFIG?.access_code || ''}" 
             style="width: 100%; padding: 10px; margin-bottom: 10px;" />
      <button id="guardar-superadmin-code" 
              style="background: #9b59b6; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">
        💾 Guardar código
      </button>
    </div>
    
    <div style="margin: 15px 0;">
      <label style="display: block; margin-bottom: 8px; font-weight: bold;">
        🚦 Estado del superadmin:
      </label>
      <div style="display: flex; justify-content: center; gap: 8px; flex-wrap: wrap;">
        <label class="reset-option">
          <input type="radio" name="superadmin-enabled" value="true" ${SUPERADMIN_CONFIG?.enabled ? 'checked' : ''}>
          <span>Activado</span>
        </label>
        <label class="reset-option">
          <input type="radio" name="superadmin-enabled" value="false" ${!SUPERADMIN_CONFIG?.enabled ? 'checked' : ''}>
          <span>Desactivado</span>
        </label>
      </div>
      <button id="guardar-superadmin-estado" 
              style="background: #e74c3c; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; margin-top: 10px; width: 100%;">
        💾 Guardar estado
      </button>
    </div>
    
    <div style="margin: 15px 0;">
      <label style="display: block; margin-bottom: 8px; font-weight: bold;">
        📋 Configuración de pestañas:
      </label>
      <div style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 10px;">
        ${pestanasHTML}
      </div>
      <button id="guardar-config-pestanas" 
              style="background: #3498db; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; margin-top: 10px; width: 100%;">
        💾 Guardar configuración de pestañas
      </button>
    </div>
    
    <button id="cerrar-panel-superadmin" 
            style="background: #7f8c8d; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; margin-top: 15px; width: 100%;">
      ❌ Cerrar panel
    </button>
  `;
  
  container.insertBefore(panel, container.firstChild);
  
  document.getElementById('guardar-superadmin-pass').onclick = guardarPasswordSuperadmin;
  document.getElementById('guardar-superadmin-code').onclick = guardarCodeSuperadmin;
  document.getElementById('guardar-superadmin-estado').onclick = guardarEstadoSuperadmin;
  document.getElementById('guardar-config-pestanas').onclick = guardarConfiguracionPestanas;
  document.getElementById('cerrar-panel-superadmin').onclick = cerrarPanelSuperadmin;
}

async function guardarPasswordSuperadmin() {
  const nuevaPass = document.getElementById('superadmin-pass-input').value.trim();
  if (!nuevaPass) {
    alert("⚠️ La contraseña no puede estar vacía");
    return;
  }
  
  try {
    await db.collection('configuracion_sistema').doc('superadmin').update({
      password: nuevaPass
    });
    await cargarConfigSuperadmin();
    alert("✅ Contraseña actualizada");
  } catch (err) {
    console.error("Error al guardar contraseña:", err);
    alert("❌ Error al guardar la contraseña");
  }
}

async function guardarCodeSuperadmin() {
  const nuevoCode = document.getElementById('superadmin-code-input').value.trim();
  if (!nuevoCode) {
    alert("⚠️ El código no puede estar vacío");
    return;
  }
  
  try {
    await db.collection('configuracion_sistema').doc('superadmin').update({
      access_code: nuevoCode
    });
    await cargarConfigSuperadmin();
    alert("✅ Código de acceso actualizado");
  } catch (err) {
    console.error("Error al guardar código:", err);
    alert("❌ Error al guardar el código");
  }
}

async function guardarEstadoSuperadmin() {
  const enabled = document.querySelector('input[name="superadmin-enabled"]:checked').value === 'true';
  
  try {
    await db.collection('configuracion_sistema').doc('superadmin').update({
      enabled: enabled
    });
    await cargarConfigSuperadmin();
    alert(enabled ? "✅ Superadmin activado" : "✅ Superadmin desactivado");
  } catch (err) {
    console.error("Error al guardar estado:", err);
    alert("❌ Error al guardar el estado");
  }
}

async function guardarConfiguracionPestanas() {
  const checkboxes = document.querySelectorAll('#panel-superadmin input[type="checkbox"][data-pestaña]');
  const nuevaConfig = {};
  
  checkboxes.forEach(checkbox => {
    nuevaConfig[checkbox.dataset.pestaña] = checkbox.checked;
  });
  
  try {
    await db.collection('configuracion_sistema').doc('pestanas').set(nuevaConfig);
    await cargarConfiguracionPestanas();
    alert("✅ Configuración de pestañas guardada");
    generarPestanas();
  } catch (err) {
    console.error("Error al guardar configuración de pestañas:", err);
    alert("❌ Error al guardar la configuración");
  }
}

function cerrarPanelSuperadmin() {
  const panel = document.getElementById('panel-superadmin');
  if (panel) {
    panel.style.display = 'none';
    panel.remove();
  }
  
  const trigger = document.getElementById('superadmin-trigger');
  if (trigger) {
    trigger.value = '';
    trigger.type = 'text';
    trigger.placeholder = 'Código secreto...';
    trigger.style.display = 'none';
  }
  
  const passInput = document.getElementById('superadmin-pass-input');
  const codeInput = document.getElementById('superadmin-code-input');
  if (passInput) passInput.value = '';
  if (codeInput) codeInput.value = '';
}

function mostrarPanelAutenticacionSuperadmin(config) {
  const overlay = document.createElement('div');
  overlay.id = 'superadmin-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
  `;
  
  const panel = document.createElement('div');
  panel.style.cssText = `
    background: white;
    padding: 30px;
    border-radius: 15px;
    text-align: center;
    max-width: 90%;
    width: 300px;
  `;
  
  panel.innerHTML = `
    <h3 style="color: #2c3e50; margin-top: 0;">👑 Super Administrador</h3>
    <p style="margin: 15px 0; color: #7f8c8d;">Código secreto...</p>
    
    <input type="password" id="contrasena-superadmin-input" 
           placeholder="••••••••" 
           style="width: 100%; padding: 12px; margin: 10px 0; border: 2px solid #ddd; border-radius: 6px; font-size: 16px;" />
    
    <button id="verificar-contrasena-superadmin" 
            style="background: #3498db; color: white; border: none; padding: 12px 20px; border-radius: 6px; cursor: pointer; margin-top: 15px; width: 100%;">
      Acceder
    </button>
    
    <button id="cerrar-panel-autenticacion" 
            style="background: #7f8c8d; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; margin-top: 10px; width: 100%;">
      Cancelar
    </button>
  `;
  
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  
  document.getElementById('verificar-contrasena-superadmin').onclick = async () => {
    const contrasena = document.getElementById('contrasena-superadmin-input').value.trim();
    
    if (contrasena === config.password) {
      overlay.remove();
      document.getElementById('nuevo-pin').value = '';
      document.getElementById('nuevo-nombre').value = '';
      document.getElementById('msg-trabajadores').textContent = '';
      document.getElementById('msg-trabajadores').className = '';
      crearPanelSuperadmin();
      document.getElementById('panel-superadmin').style.display = 'block';
    } else {
      alert("❌ Contraseña incorrecta");
    }
  };
  
  document.getElementById('cerrar-panel-autenticacion').onclick = () => {
    overlay.remove();
    document.getElementById('nuevo-pin').value = '';
    document.getElementById('nuevo-nombre').value = '';
    document.getElementById('msg-trabajadores').textContent = '';
    document.getElementById('msg-trabajadores').className = '';
  };
  
  document.getElementById('contrasena-superadmin-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('verificar-contrasena-superadmin').click();
    }
  });
}

// ✅ Generar pestañas dinámicamente según configuración
async function generarPestanas() {
  if (!window.CONFIG_PESTANAS) {
    await cargarConfiguracionPestanas();
  }
  
  const container = document.getElementById('pestanas-container');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (!window.CONFIG_PESTANAS) {
    container.innerHTML = '<div style="padding: 20px; color: #e74c3c;">❌ Error: Configuración de pestañas no encontrada en Firestore</div>';
    return;
  }
  
  const pestanas = [
    { id: 'registros', nombre: '📝 Registros' },
    { id: 'trabajadores', nombre: '👷 Gestión de Trabajadores' },
    { id: 'pines', nombre: '🔐 PINs de acceso' },
    { id: 'vehiculos', nombre: '🚐 Flota Vehículos' },
    { id: 'contratos', nombre: '📑 Contratos' },
    { id: 'estadisticas', nombre: '📊 Estadísticas' },
    { id: 'notificaciones', nombre: '🔔 Notificaciones' },
    { id: 'gastos', nombre: '💰 Gestión de Gastos' }
  ];
  
  pestanas.forEach(pestaña => {
    if (window.CONFIG_PESTANAS && window.CONFIG_PESTANAS[pestaña.id]) {
      const btn = document.createElement('button');
      btn.className = 'tab-btn';
      btn.dataset.tab = pestaña.id;
      btn.textContent = pestaña.nombre;
      btn.addEventListener('click', manejarClickPestana);
      container.appendChild(btn);
    } else {
      const btn = document.createElement('button');
      btn.className = 'tab-btn disabled';
      btn.disabled = true;
      btn.innerHTML = `${pestaña.nombre.split(' ')[0]} <span class="info-icon" title="Esta función está deshabilitada. Para habilitarla, contacte con el administrador.">ℹ️</span>`;
      container.appendChild(btn);
    }
  });
  
  let primeraHabilitada = null;
  if (window.CONFIG_PESTANAS) {
    for (const pestaña of pestanas) {
      if (window.CONFIG_PESTANAS[pestaña.id]) {
        primeraHabilitada = pestaña.id;
        break;
      }
    }
  }
  
  if (primeraHabilitada) {
    const botonActivo = document.querySelector(`[data-tab="${primeraHabilitada}"]`);
    if (botonActivo) {
      botonActivo.classList.add('active');
      manejarClickPestana({ target: botonActivo });
    }
  }
}

// ✅ Manejar click en pestañas
function manejarClickPestana(e) {
  document.querySelectorAll('.tab-btn:not(.disabled)').forEach(b => b.classList.remove('active'));
  e.target.classList.add('active');
  const tab = e.target.dataset.tab;

  document.getElementById('tab-registros').classList.add('hidden');
  document.getElementById('tab-trabajadores').classList.add('hidden');
  document.getElementById('tab-pines').classList.add('hidden');
  document.getElementById('tab-vehiculos').classList.add('hidden');
  document.getElementById('tab-contratos').classList.add('hidden');
  document.getElementById('tab-estadisticas').classList.add('hidden');
  document.getElementById('tab-notificaciones').classList.add('hidden');
  document.getElementById('tab-gastos').classList.add('hidden');

  document.getElementById(`tab-${tab}`).classList.remove('hidden');

  if (tab === 'trabajadores') cargarTrabajadores();
  if (tab === 'pines') cargarPinesAcceso();
  if (tab === 'vehiculos') cargarVehiculos();
  if (tab === 'contratos') {
    cargarTrabajadoresParaContratos();
    cargarContratosAdmin();
  }
  if (tab === 'estadisticas') {
    document.getElementById('contenedores-estadisticas').innerHTML = 
      '<p>Presiona "Cargar contadores" para ver las estadísticas.</p>';
  }
  if (tab === 'notificaciones') {
    cargarDestinatariosNotificaciones();
    cargarHistorialNotificaciones();
  }
  if (tab === 'gastos') {
    cargarGastosAdmin();
  }
}

// --- AUTENTICACIÓN ---
document.getElementById('btn-login').addEventListener('click', async () => {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const msg = document.getElementById('msg-login');
  if (!email || !password) {
    msg.textContent = 'Introduce email y contraseña';
    msg.className = 'error';
    return;
  }
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    msg.textContent = 'Error: ' + err.message;
    msg.className = 'error';
  }
});

document.getElementById('logout').addEventListener('click', () => auth.signOut());

auth.onAuthStateChanged(user => {
  if (user) {
    loginDiv.classList.add('hidden');
    datosDiv.classList.remove('hidden');
    userEmailSpan.textContent = user.email;
    cargarRegistros();
  } else {
    loginDiv.classList.remove('hidden');
    datosDiv.classList.add('hidden');
  }
});

// --- BOTONES ---
document.getElementById('cargar').addEventListener('click', cargarRegistros);
document.getElementById('borrar-registros').addEventListener('click', borrarTodosRegistros);
document.getElementById('exportar').addEventListener('click', () => {
  if (DATOS_EXPORTAR_REGISTROS?.length) exportarExcel(DATOS_EXPORTAR_REGISTROS);
  else alert('No hay datos para exportar.');
});

document.getElementById('cargar-vehiculos-detalle').addEventListener('click', cargarRegistrosVehiculos);
document.getElementById('borrar-registros-vehiculos-detalle').addEventListener('click', borrarTodosRegistrosVehiculos);
document.getElementById('exportar-vehiculos-detalle').addEventListener('click', () => {
  if (DATOS_EXPORTAR_VEHICULOS?.length) exportarVehiculosExcel(DATOS_EXPORTAR_VEHICULOS);
  else alert('No hay datos de vehículos para exportar.');
});

document.getElementById('btn-subir-contrato').addEventListener('click', subirContrato);
document.getElementById('cargar-contratos-admin').addEventListener('click', cargarContratosAdmin);
document.getElementById('exportar-contratos').addEventListener('click', exportarContratosExcel);
document.getElementById('btn-agregar').addEventListener('click', agregarTrabajador);
document.getElementById('btn-agregar-vehiculo').addEventListener('click', agregarVehiculo);
document.getElementById('btn-generar-pin').addEventListener('click', generarPINUnico);
document.getElementById('orden-trabajadores').addEventListener('change', cargarTrabajadores);
document.getElementById('generar-pin').addEventListener('click', generarPIN);
document.getElementById('borrar-todos-pins').addEventListener('click', borrarTodosPins);
document.getElementById('generar-url').addEventListener('click', generarURLAcceso);
document.getElementById('copiar-url-vehiculo').addEventListener('click', copiarUrlVehiculo);
document.getElementById('cargar-contadores').addEventListener('click', cargarEstadisticas);

Promise.all([
  cargarConfigSuperadmin(),
  cargarConfiguracionPestanas()
]).then(() => {
  generarPestanas();
});

document.getElementById('logo').onerror = function() {
  this.classList.add('fallback');
  this.textContent = 'LC';
};

window.eliminarTrabajador = eliminarTrabajador;
window.editarTrabajador = editarTrabajador;
window.mostrarDetalleVehiculo = mostrarDetalleVehiculo;
window.toggleVehiculo = toggleVehiculo;
window.eliminarVehiculo = eliminarVehiculo;
window.eliminarContrato = eliminarContrato;
window.resetearEstadisticas = resetearEstadisticas;
window.actualizarResetHora = actualizarResetHora;
window.eliminarPinAcceso = eliminarPinAcceso;

// =============================
// NOTIFICACIONES INTERNAS AVANZADAS
// =============================

let LISTA_TRABAJADORES = [];
let LISTA_OBRAS = [];

async function cargarDestinatariosNotificaciones() {
  try {
    const trabajadoresSnapshot = await db.collection('trabajadores').get();
    LISTA_TRABAJADORES = [];
    trabajadoresSnapshot.forEach(doc => {
      const data = doc.data();
      LISTA_TRABAJADORES.push({
        id: doc.id,
        pin: data.pin,
        nombre: data.nombre
      });
    });
    
    const registrosSnapshot = await db.collection('registros_publicos')
      .where('comentario', '!=', '')
      .limit(500)
      .get();
    
    const obrasSet = new Set();
    registrosSnapshot.forEach(doc => {
      const comentario = doc.data().comentario;
      if (comentario) {
        obrasSet.add(comentario);
      }
    });
    
    LISTA_OBRAS = Array.from(obrasSet).sort();
    actualizarSelectoresDestinatarios();
    
  } catch (err) {
    console.error("Error al cargar destinatarios:", err);
  }
}

function actualizarSelectoresDestinatarios() {
  // Selector individual
  const selectIndividual = document.getElementById('destinatario-individual');
  selectIndividual.innerHTML = '<option value="">Selecciona un trabajador</option>';
  LISTA_TRABAJADORES.forEach(trab => {
    const option = document.createElement('option');
    option.value = trab.pin;
    option.textContent = `${trab.pin} - ${trab.nombre}`;
    selectIndividual.appendChild(option);
  });
  
  // ✅ Selector múltiple con estilo de reseteo de contadores
  const contenedorMultiples = document.getElementById('destinatarios-multiples').firstElementChild;
  contenedorMultiples.innerHTML = '';
  
  // Contenedor con estilo responsive
  const opcionesContainer = document.createElement('div');
  opcionesContainer.className = 'reset-options';
  opcionesContainer.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    margin-top: 10px;
  `;
  
  LISTA_TRABAJADORES.forEach(trab => {
    const label = document.createElement('label');
    label.className = 'reset-option';
    label.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: white;
      border-radius: 6px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      cursor: pointer;
      min-width: 120px;
      justify-content: center;
      flex: 0 0 auto;
    `;
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = trab.pin;
    checkbox.id = `chk-${trab.pin}`;
    checkbox.style.margin = '0';
    
    const texto = document.createElement('span');
    texto.textContent = `${trab.pin} - ${trab.nombre}`;
    texto.style.fontSize = '13px';
    texto.style.color = '#2c3e50';
    
    label.appendChild(checkbox);
    label.appendChild(texto);
    opcionesContainer.appendChild(label);
  });
  
  contenedorMultiples.appendChild(opcionesContainer);
  
  // Selector por obra
  const selectObra = document.getElementById('destinatario-obra');
  selectObra.innerHTML = '<option value="">Selecciona una obra</option>';
  LISTA_OBRAS.forEach(obra => {
    const option = document.createElement('option');
    option.value = obra;
    option.textContent = obra;
    selectObra.appendChild(option);
  });
}

document.getElementById('tipo-destinatario').addEventListener('change', (e) => {
  const tipo = e.target.value;
  document.getElementById('destinatario-individual').style.display = tipo === 'individual' ? 'block' : 'none';
  document.getElementById('destinatarios-multiples').style.display = tipo === 'multiples' ? 'block' : 'none';
  document.getElementById('destinatario-obra').style.display = tipo === 'obra' ? 'block' : 'none';
});

async function enviarNotificacionInterna() {
  const titulo = document.getElementById('notificacion-titulo').value.trim();
  const mensaje = document.getElementById('notificacion-mensaje').value.trim();
  const tipoDestinatario = document.getElementById('tipo-destinatario').value;
  const msgDiv = document.getElementById('mensaje-notificacion');
  
  if (!titulo || !mensaje) {
    msgDiv.textContent = '⚠️ Título y mensaje son obligatorios';
    msgDiv.className = 'msg error';
    msgDiv.style.display = 'block';
    return;
  }
  
  let destinatarios = [];
  let tipoDestino = '';
  
  if (tipoDestinatario === 'todos') {
    destinatarios = ['todos'];
    tipoDestino = 'todos';
  } else if (tipoDestinatario === 'individual') {
    const pinIndividual = document.getElementById('destinatario-individual').value;
    if (!pinIndividual) {
      msgDiv.textContent = '⚠️ Selecciona un trabajador';
      msgDiv.className = 'msg error';
      msgDiv.style.display = 'block';
      return;
    }
    destinatarios = [pinIndividual];
    tipoDestino = 'individual';
  } else if (tipoDestinatario === 'multiples') {
    const checkboxes = document.querySelectorAll('#destinatarios-multiples input[type="checkbox"]:checked');
    if (checkboxes.length === 0) {
      msgDiv.textContent = '⚠️ Selecciona al menos un trabajador';
      msgDiv.className = 'msg error';
      msgDiv.style.display = 'block';
      return;
    }
    destinatarios = Array.from(checkboxes).map(cb => cb.value);
    tipoDestino = 'multiples';
  } else if (tipoDestinatario === 'obra') {
    const obra = document.getElementById('destinatario-obra').value;
    if (!obra) {
      msgDiv.textContent = '⚠️ Selecciona una obra';
      msgDiv.className = 'msg error';
      msgDiv.style.display = 'block';
      return;
    }
    destinatarios = [obra];
    tipoDestino = 'obra';
  }
  
  try {
    msgDiv.style.display = 'block';
    msgDiv.className = 'msg success';
    msgDiv.textContent = '📤 Enviando notificación...';
    
    await db.collection('notificaciones_internas').add({
      titulo: titulo,
      mensaje: mensaje,
      destinatarios: destinatarios,
      tipoDestino: tipoDestino,
      leidos: {},
      fechaEnvio: firebase.firestore.FieldValue.serverTimestamp(),
      enviadoPor: auth.currentUser?.email || 'Sistema'
    });
    
    document.getElementById('notificacion-titulo').value = '';
    document.getElementById('notificacion-mensaje').value = '';
    document.getElementById('tipo-destinatario').value = 'todos';
    document.getElementById('destinatario-individual').style.display = 'none';
    document.getElementById('destinatarios-multiples').style.display = 'none';
    document.getElementById('destinatario-obra').style.display = 'none';
    
    msgDiv.textContent = '✅ Notificación enviada correctamente';
    msgDiv.className = 'success';
    
    setTimeout(() => {
      msgDiv.style.display = 'none';
    }, 3000);
    
    cargarHistorialNotificaciones();
    
  } catch (err) {
    console.error("Error al enviar notificación:", err);
    msgDiv.textContent = '❌ Error: ' + err.message;
    msgDiv.className = 'error';
    msgDiv.style.display = 'block';
  }
}

async function cargarHistorialNotificaciones() {
  try {
    const snapshot = await db.collection('notificaciones_internas')
      .orderBy('fechaEnvio', 'desc')
      .limit(50)
      .get();
    
    const tbody = document.getElementById('cuerpo-notificaciones');
    
    if (snapshot.empty) {
      tbody.innerHTML = '<tr><td colspan="5">No hay notificaciones enviadas</td></tr>';
      return;
    }
    
    const pinesDestinatarios = new Set();
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.tipoDestino === 'individual' || data.tipoDestino === 'multiples') {
        data.destinatarios.forEach(pin => pinesDestinatarios.add(pin));
      }
    });
    
    const trabajadoresMap = new Map();
    if (pinesDestinatarios.size > 0) {
      const trabajadoresSnapshot = await db.collection('trabajadores')
        .where('pin', 'in', Array.from(pinesDestinatarios))
        .get();
      
      trabajadoresSnapshot.forEach(doc => {
        const data = doc.data();
        trabajadoresMap.set(data.pin, data.nombre);
      });
    }
    
    let filas = '';
    snapshot.forEach(doc => {
      const n = doc.data();
      const fecha = n.fechaEnvio?.toDate ? 
        new Intl.DateTimeFormat('es-ES', { 
          day: '2-digit', month: '2-digit', year: '2-digit',
          hour: '2-digit', minute: '2-digit'
        }).format(n.fechaEnvio.toDate()) : 'Sin fecha';
      
      let destinoTexto = '';
      if (n.tipoDestino === 'todos') {
        destinoTexto = '🌍 Todos los trabajadores';
      } else if (n.tipoDestino === 'individual') {
        const nombre = trabajadoresMap.get(n.destinatarios[0]) || 'Desconocido';
        destinoTexto = `👤 ${n.destinatarios[0]} - ${nombre}`;
      } else if (n.tipoDestino === 'multiples') {
        const nombres = n.destinatarios.map(pin => {
          const nombre = trabajadoresMap.get(pin) || 'Desconocido';
          return `${pin} - ${nombre}`;
        });
        destinoTexto = `👥 ${nombres.length} trabajadores`;
      } else if (n.tipoDestino === 'obra') {
        destinoTexto = `🏗️ Obra: ${n.destinatarios[0]}`;
      }
      
      filas += `
        <tr>
          <td><strong>${n.titulo || 'Sin título'}</strong></td>
          <td>${n.mensaje.substring(0, 50)}${n.mensaje.length > 50 ? '...' : ''}</td>
          <td style="text-align: left;">${destinoTexto}</td>
          <td>${fecha}</td>
          <td>
            <button onclick="eliminarNotificacion('${doc.id}')" style="background: #e74c3c; padding: 4px 8px; border-radius: 4px;">
              🗑️
            </button>
          </td>
        </tr>
      `;
    });
    
    tbody.innerHTML = filas;
    
  } catch (err) {
    console.error("Error al cargar historial de notificaciones:", err);
    document.getElementById('cuerpo-notificaciones').innerHTML = '<tr><td colspan="5">Error al cargar</td></tr>';
  }
}

async function eliminarNotificacion(id) {
  if (!confirm("⚠️ ¿Eliminar esta notificación?")) return;
  try {
    await db.collection('notificaciones_internas').doc(id).delete();
    alert("✅ Notificación eliminada");
    cargarHistorialNotificaciones();
  } catch (err) {
    console.error("Error al eliminar notificación:", err);
    alert("❌ Error al eliminar notificación");
  }
}

// Eventos de notificaciones
document.getElementById('enviar-notificacion')?.addEventListener('click', enviarNotificacionInterna);

// =============================
// GESTIÓN DE GASTOS
// =============================

async function cargarGastosAdmin() {
  try {
    const snapshot = await db.collection('gastos_trabajadores')
      .orderBy('fechaRegistro', 'desc')
      .limit(100)
      .get();
    
    const tbody = document.getElementById('cuerpo-gastos-admin');
    
    if (snapshot.empty) {
      tbody.innerHTML = '<tr><td colspan="9">No hay gastos registrados</td></tr>';
      GASTOS_TODOS = [];
      return;
    }
    
    const pines = new Set();
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.pinTrabajador) {
        pines.add(data.pinTrabajador);
      }
    });
    
    const trabajadoresMap = new Map();
    if (pines.size > 0) {
      const trabajadoresSnapshot = await db.collection('trabajadores')
        .where('pin', 'in', Array.from(pines))
        .get();
      
      trabajadoresSnapshot.forEach(doc => {
        const data = doc.data();
        trabajadoresMap.set(data.pin, data.nombre);
      });
    }
    
    let filas = '';
    const datosExportar = [];
    
    snapshot.forEach(doc => {
      const g = doc.data();
      const nombreTrabajador = trabajadoresMap.get(g.pinTrabajador) || 'Desconocido';
      const fecha = g.fechaRegistro?.toDate ? formatearFecha(g.fechaRegistro) : 'Sin fecha';
      const colorFila = g.leido ? '#d4edda' : '#ffebcd';
      
      const importeFormateado = g.importe ? 
        new Intl.NumberFormat('es-ES', { 
          style: 'currency', 
          currency: 'EUR',
          minimumFractionDigits: 2
        }).format(g.importe) : 'N/A';
      
      const botonOjo = g.imagenUrl ? 
        `<a href="${g.imagenUrl}" target="_blank" title="Ver imagen" style="display: inline-block; padding: 6px 12px; background: #3498db; color: white; text-decoration: none; border-radius: 4px; font-size: 14px;">
          👁️ Ver
        </a>` : 
        '-';
      
      filas += `
        <tr style="background-color: ${colorFila};">
          <td>${g.pinTrabajador}</td>
          <td>${nombreTrabajador}</td>
          <td><strong>${g.titulo}</strong></td>
          <td>${g.concepto.substring(0, 40)}${g.concepto.length > 40 ? '...' : ''}</td>
          <td>${importeFormateado}</td>
          <td>${fecha}</td>
          <td>
            <label style="display: flex; align-items: center; gap: 5px;">
              <input type="checkbox" 
                     class="toggle-gasto-leido" 
                     data-id="${doc.id}" 
                     ${g.leido ? 'checked' : ''} />
              ${g.leido ? '✅ Leído' : '⏳ Pendiente'}
            </label>
          </td>
          <td>${botonOjo}</td>
          <td>
            <button onclick="eliminarGasto('${doc.id}')" 
                    style="background: #e74c3c; padding: 4px 8px; border-radius: 4px; border: none; cursor: pointer;">
              🗑️
            </button>
          </td>
        </tr>
      `;
      
      datosExportar.push({
        pin: g.pinTrabajador,
        trabajador: nombreTrabajador,
        titulo: g.titulo,
        concepto: g.concepto,
        importe: importeFormateado,
        fecha: fecha,
        leido: g.leido ? 'Sí' : 'No',
        imagen: g.imagenUrl || '-'
      });
    });
    
    tbody.innerHTML = filas;
    GASTOS_TODOS = datosExportar;
    
    document.querySelectorAll('.toggle-gasto-leido').forEach(checkbox => {
      checkbox.addEventListener('change', async (e) => {
        const id = e.target.dataset.id;
        const leido = e.target.checked;
        
        try {
          await db.collection('gastos_trabajadores').doc(id).update({
            leido: leido,
            fechaLectura: leido ? firebase.firestore.FieldValue.serverTimestamp() : null
          });
          
          if (document.querySelector('.tab-btn.active')?.dataset.tab === 'gastos') {
            cargarGastosAdmin();
          }
        } catch (err) {
          console.error("Error al actualizar estado:", err);
          alert("❌ Error al actualizar estado");
        }
      });
    });
    
  } catch (err) {
    console.error("Error al cargar gastos:", err);
    document.getElementById('cuerpo-gastos-admin').innerHTML = '<tr><td colspan="9">Error al cargar gastos</td></tr>';
  }
}

async function eliminarGasto(id) {
  if (!confirm("⚠️ ¿Eliminar este registro de gasto?")) return;
  
  try {
    await db.collection('gastos_trabajadores').doc(id).delete();
    alert("✅ Registro de gasto eliminado");
    cargarGastosAdmin();
  } catch (err) {
    console.error("Error al eliminar gasto:", err);
    alert("❌ Error al eliminar gasto");
  }
}

async function exportarGastosExcel() {
  if (!window.XLSX) {
    const script = document.createElement('script');
    script.src = 'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js';
    script.onload = () => exportarGastosConSheetJS();
    script.onerror = () => alert('❌ No se pudo cargar la librería de Excel.');
    document.head.appendChild(script);
  } else {
    exportarGastosConSheetJS();
  }
}

function exportarGastosConSheetJS() {
  if (GASTOS_TODOS.length === 0) {
    alert("No hay datos para exportar");
    return;
  }
  
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(GASTOS_TODOS);
  XLSX.utils.book_append_sheet(wb, ws, "Gastos");
  XLSX.writeFile(wb, "gastos_trabajadores.xlsx");
}

document.getElementById('cargar-gastos-admin')?.addEventListener('click', cargarGastosAdmin);
document.getElementById('exportar-gastos-excel')?.addEventListener('click', exportarGastosExcel);