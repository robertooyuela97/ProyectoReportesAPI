// script.js
// 🟢 CORRECCIÓN CRÍTICA: ELIMINAMOS API_BASE_URL
// Para Azure App Service, usamos rutas relativas (/api/...)
// Esto fuerza al navegador a llamar al mismo dominio (su URL de Azure).
// const API_BASE_URL = 'http://127.0.0.1:5000'; // ¡Línea ELIMINADA!

// Nombres de los contenedores para el manejo del menú
const REPORT_CONTAINERS = [
    'balance-financiero-container',
    'balance-comprobacion-container',
    'estado-resultados-container',
    'movimientos-cuentas-container'
];

/**
 * Función para mostrar solo el reporte seleccionado por el usuario.
 * @param {string} containerId - ID del contenedor a mostrar.
 * @param {string} buttonId - ID del botón presionado para darle estilo 'active'.
 */
function showReport(containerId, buttonId) {
    // 1. Ocultar todos los contenedores y remover la clase 'active' de todos los botones
    REPORT_CONTAINERS.forEach(id => {
        document.getElementById(id).style.display = 'none';
    });
    document.querySelectorAll('.navbar button').forEach(btn => {
        btn.classList.remove('active');
    });

    // 2. Mostrar el contenedor seleccionado
    document.getElementById(containerId).style.display = 'block';

    // 3. Establecer el botón como 'active'
    document.getElementById(buttonId).classList.add('active');
    
    // Si el reporte de movimientos es seleccionado, lo recargamos para mostrar los filtros activos
    if (containerId === 'movimientos-cuentas-container') {
        loadMovimientosCuentas(false); 
    }
}

async function fetchAndRenderReport(endpoint, tableId, statusId, headers) {
    const statusElement = document.getElementById(statusId);
    const tableBody = document.querySelector(`#${tableId} tbody`);
    tableBody.innerHTML = '';
    statusElement.textContent = `Cargando reporte...`;
    statusElement.className = 'success';
    
    try {
        // 🟢 CORRECCIÓN: Llamamos a la URL de forma RELATIVA.
        const response = await fetch(endpoint); 
        const data = await response.json();

        if (data.status === 'success') {
            statusElement.textContent = `Reporte '${data.reporte}' cargado.`;
            statusElement.className = 'success';
            
            data.data.forEach(item => {
                const row = tableBody.insertRow();
                headers.forEach(headerKey => {
                    const cell = row.insertCell();
                    const value = item[headerKey] || '0.00';
                    
                    if (headerKey === 'Total' || headerKey === 'Monto' || headerKey === 'TotalDebe' || headerKey === 'TotalHaber' || headerKey === 'Debe' || headerKey === 'Haber') {
                        // Formato de moneda (Lempiras, Honduras)
                        cell.textContent = parseFloat(value).toLocaleString('es-HN', {
                            style: 'currency',
                            currency: 'HNL', 
                            minimumFractionDigits: 2
                        });
                    } else {
                        cell.textContent = value;
                    }
                });
            });

        } else {
            // Este error indica un problema en el lado del servidor Flask/SQL (Firewall/Credenciales)
            statusElement.textContent = `Error en el Servidor SQL: ${data.message}`;
            statusElement.className = 'error';
        }

    } catch (error) {
        // Este error indica que la API de Flask no respondió (problema de ruteo/servidor apagado)
        statusElement.textContent = 'Error de conexión. ¿Está el servidor Flask corriendo?';
        statusElement.className = 'error';
    }
}

/**
 * Función para cargar el reporte de Movimientos de Cuentas.
 * @param {boolean} isManualClick - Indica si fue llamado por el botón 'Generar Reporte'.
 */
function loadMovimientosCuentas(isManualClick) {
    const cuenta = document.getElementById('cuenta').value;
    const inicio = document.getElementById('inicio').value;
    const fin = document.getElementById('fin').value;
    
    // El endpoint ya usa la ruta relativa /api/...
    const endpoint = `/api/movimientos-cuentas?cuenta=${cuenta}&inicio=${inicio}&fin=${fin}`;
    
    // Si fue llamado por el botón, mostramos el estado de carga
    if (isManualClick) {
        document.getElementById('status-mc').textContent = `Generando reporte para ${cuenta}...`;
    }
    
    fetchAndRenderReport(
        endpoint, 
        'movimientos-cuentas-table', 
        'status-mc', 
        ['REG_Movimiento', 'Fecha_movimiento', 'Detalle', 'Debe', 'Haber']
    );
}


// =========================================================================
// FUNCIONES DE EXPORTACIÓN A PDF Y EXCEL
// =========================================================================

/**
 * Exporta una tabla HTML a un archivo Excel (.xlsx) usando TableToExcel.
 * @param {string} tableId - ID del elemento <table> a exportar.
 * @param {string} filename - Nombre base del archivo de salida.
 */
function exportTableToExcel(tableId, filename) {
    const table = document.getElementById(tableId);
    if (table) {
        TableToExcel.convert(table, {
            name: `${filename}_${new Date().toLocaleDateString()}.xlsx`,
            sheet: {
                name: filename
            }
        });
        // 🟢 CORRECCIÓN: Evitar alert(). En Azure y otros ambientes, alert() es problemático.
        // Reemplazar con un mensaje en la consola. 
        console.log(`Reporte "${filename}" exportado a Excel. ¡Revisa tus descargas!`);
    }
}

/**
 * Exporta una tabla HTML a un archivo PDF usando html2canvas y jsPDF.
 * @param {string} tableId - ID del elemento <table> a exportar.
 * @param {string} filename - Nombre base del archivo de salida.
 */
function exportTableToPDF(tableId, filename) {
    const table = document.getElementById(tableId);
    if (table) {
        // Usar html2canvas para renderizar la tabla como una imagen
        html2canvas(table, { scale: 2 }).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4'); // 'p' = portrait, 'mm' = milímetros, 'a4' = tamaño

            const imgWidth = 210; // A4 width in mm
            const pageHeight = 295; // A4 height in mm
            const imgHeight = canvas.height * imgWidth / canvas.width;
            
            // 1. Agregar título y fecha
            pdf.setFontSize(16);
            pdf.text(filename.toUpperCase(), 105, 15, { align: 'center' });
            pdf.setFontSize(10);
            pdf.text(`Fecha de Generación: ${new Date().toLocaleDateString()}`, 105, 22, { align: 'center' });

            // 2. Agregar la imagen de la tabla al PDF (ajustado para que quepa en la página)
            pdf.addImage(imgData, 'PNG', 0, 30, imgWidth, imgHeight);

            // 3. Descargar el archivo
            pdf.save(`${filename}_${new Date().toLocaleDateString()}.pdf`);
            // 🟢 CORRECCIÓN: Evitar alert(). Reemplazar con console.log.
            console.log(`Reporte "${filename}" exportado a PDF. ¡Revisa tus descargas!`);
        });
    }
}


// =========================================================================
// INICIO: Lógica que se ejecuta al cargar la página
// =========================================================================

// 1. Cargamos todos los datos una sola vez para tenerlos disponibles
document.addEventListener('DOMContentLoaded', () => {
    // 🟢 Llamadas con ruta RELATIVA
    fetchAndRenderReport(
        '/api/balance-financiero', 
        'balance-financiero-table', 
        'status-bf', 
        ['Concepto', 'Total']
    );

    fetchAndRenderReport(
        '/api/balance-comprobacion', 
        'balance-comprobacion-table', 
        'status-bc', 
        ['Cuenta', 'TotalDebe', 'TotalHaber']
    );

    fetchAndRenderReport(
        '/api/estado-resultados', 
        'estado-resultados-table', 
        'status-er', 
        ['Concepto', 'Monto']
    );
    
    // 2. Cargamos el reporte de Movimientos con valores por defecto
    loadMovimientosCuentas(false);

    // 3. Mostramos el Balance Financiero como vista inicial
    showReport('balance-financiero-container', 'btn-bf');
});
