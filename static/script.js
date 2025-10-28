// script.js
// 🟢 CORRECCIÓN CRÍTICA: ELIMINAMOS API_BASE_URL
// Para Azure App Service, usamos rutas relativas (/api/...)
// Esto fuerza al navegador a llamar al mismo dominio (su URL de Azure).

// Nombres de los contenedores para el manejo del menú (Se mantienen las rutas antiguas de ejemplo, pero el index.html usa las rutas de vistas)
const REPORT_CONTAINERS = [
    'report-content' // Ahora todo se renderiza en el área principal 'report-content'
];

// Mapeo de vistas (data-view) a títulos y a la vista SQL real (debe coincidir con Vistas[1].sql)
const VISTA_MAP = {
    // Activos
    'V_ActivoCorriente': {
        title: 'Reporte Activo Corriente',
        viewName: 'vw_Efectivo_y_Equivalente_Efectivo_Total' // Usaremos la primera vista detallada como ejemplo inicial.
    },
    'V_ActivoNoCorriente': {
        title: 'Reporte Activo No Corriente (Consolidado)',
        viewName: 'vw_activo_no_corriente_combinada' // Vista consolidada
    },
    // Pasivos (usaremos las vistas detalladas que ya proporcionaste)
    'V_PasivoCorriente': {
        title: 'Reporte Pasivo Corriente',
        viewName: 'vw_cuentas_y_documentos_por_pagar' // Usaremos una vista detallada como ejemplo
    },
    'V_PasivoNoCorriente': {
        title: 'Reporte Pasivo No Corriente (Pendiente)',
        viewName: 'vw_Pasivo_No_Corriente_Combinada' // Nombre tentativo para la vista pendiente
    },
    // Nuevas Vistas Adicionales que ya no se usarán directamente en el menú, pero se mantienen por si se necesitan
    'V_BalanceFinanciero': { title: 'Balance Financiero', endpoint: '/api/balance-financiero', headers: ['Concepto', 'Total'] },
    'V_BalanceComprobacion': { title: 'Balance de Comprobación', endpoint: '/api/balance-comprobacion', headers: ['Cuenta', 'TotalDebe', 'TotalHaber'] },
    'V_EstadoResultados': { title: 'Estado de Resultados', endpoint: '/api/estado-resultados', headers: ['Concepto', 'Monto'] }
};


/**
 * Función genérica para cargar y renderizar datos desde una vista SQL.
 * @param {string} viewName - Nombre de la vista SQL a consultar (ej: vw_activos_corrientes).
 * @param {string} reportTitle - Título a mostrar en el contenedor del reporte.
 */
async function loadComponenteBalance(viewName, reportTitle) {
    const reportTitleElement = document.getElementById('report-title');
    const reportContent = document.getElementById('report-content');
    const tableElement = document.getElementById('report-table');
    const tableHeader = document.getElementById('table-header');
    const tableBody = document.getElementById('table-body');
    const loadingMessage = document.getElementById('loading-message');
    const initialMessage = document.getElementById('initial-message');

    // 1. Mostrar estado de carga y ocultar otros elementos
    initialMessage.classList.add('hidden');
    tableElement.classList.add('hidden');
    loadingMessage.classList.remove('hidden');
    reportTitleElement.textContent = `Cargando: ${reportTitle}...`;

    const endpoint = `/api/reporte-vista/${viewName}`;
    
    try {
        const response = await fetch(endpoint); 
        const data = await response.json();

        if (data.status === 'success') {
            reportTitleElement.textContent = reportTitle;
            loadingMessage.classList.add('hidden');

            if (data.data.length === 0) {
                 reportContent.innerHTML = `<p class="text-center p-10 text-gray-500">No se encontraron datos para la vista: ${viewName}.</p>`;
                 return;
            }

            const items = data.data;
            const headers = Object.keys(items[0]);
            
            // 2. Limpiar y construir la cabecera de la tabla
            tableHeader.innerHTML = '';
            headers.forEach(headerKey => {
                const th = document.createElement('th');
                th.textContent = headerKey.replace(/_/g, ' '); // Reemplazar guiones bajos por espacios
                tableHeader.appendChild(th);
            });
            
            // 3. Limpiar y construir el cuerpo de la tabla
            tableBody.innerHTML = '';
            items.forEach(item => {
                const row = tableBody.insertRow();
                headers.forEach(headerKey => {
                    const cell = row.insertCell();
                    const value = item[headerKey] || '0.00';
                    
                    // Comprobar si la columna es un valor monetario (ej: termina en 'Total')
                    if (headerKey.includes('Total') || headerKey.includes('Capital') || !isNaN(parseFloat(value))) {
                        cell.classList.add('text-right', 'font-mono'); // Alineación para valores monetarios
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

            // 4. Mostrar la tabla
            tableElement.classList.remove('hidden');

        } else {
            // Error en el servidor Flask/SQL
            reportTitleElement.textContent = `Error al cargar ${reportTitle}`;
            reportContent.innerHTML = `<p class="text-center p-10 text-red-600">
                <i class="ph ph-warning-octagon text-4xl mr-2"></i>
                Error en la Base de Datos o Servidor: ${data.message}
            </p>`;
        }

    } catch (error) {
        // Error de conexión de red
        reportTitleElement.textContent = `Error de conexión`;
        reportContent.innerHTML = `<p class="text-center p-10 text-red-600">
            <i class="ph ph-link-break text-4xl mr-2"></i>
            No se pudo conectar con el servidor API de Flask.
        </p>`;
    }
}


// =========================================================================
// INICIO: Lógica que se ejecuta al cargar la página
// =========================================================================

document.addEventListener('DOMContentLoaded', () => {
    const reportButtonsContainer = document.getElementById('report-buttons');
    const initialMessage = document.getElementById('initial-message');

    // Manejar el clic en los botones de reporte
    reportButtonsContainer.addEventListener('click', (event) => {
        const button = event.target.closest('.report-btn');
        if (button) {
            const viewKey = button.getAttribute('data-view');
            const config = VISTA_MAP[viewKey];

            // 1. Desactivar todos los botones
            document.querySelectorAll('.report-btn').forEach(btn => {
                btn.classList.remove('ring-4', 'ring-offset-2', 'ring-yellow-500/50');
            });
            // 2. Activar el botón clicado
            button.classList.add('ring-4', 'ring-offset-2', 'ring-yellow-500/50');
            
            // 3. Cargar la vista
            if (config) {
                loadComponenteBalance(config.viewName, config.title);
            }
        }
    });
    
    // Dejamos el mensaje inicial a la espera de que el usuario haga clic.
    initialMessage.textContent = 'Seleccione uno de los cuatro componentes (Activo Corriente, Activo No Corriente, Pasivo Corriente, Pasivo No Corriente) para cargar sus datos.';

    // Seleccionar y cargar la vista por defecto (Activo Corriente) al inicio
    const defaultButton = document.querySelector('[data-view="V_ActivoCorriente"]');
    if (defaultButton) {
        defaultButton.click(); // Simula el clic en el botón de Activo Corriente
    }
});


// =========================================================================
// Nota: Las funciones de exportación (exportTableToExcel, exportTableToPDF) 
// y la lógica de Movimientos de Cuentas no se modifican ya que no son parte
// del cambio de componente de balance. Simplemente se omiten aquí por brevedad,
// pero se deben mantener en el archivo script.js real.
// =========================================================================