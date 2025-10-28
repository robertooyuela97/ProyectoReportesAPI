/**
 * Lógica de conexión y manipulación del DOM para la aplicación de Reportes Contables.
 * * NOTA: Esta versión utiliza la nueva API genérica /api/reporte-vista/<view_name>
 * para obtener datos de vistas SQL, filtrando siempre por Empresa ID.
 */

// --- Variables DOM ---
const empresaSelect = document.getElementById('empresa-select');
const reportButtons = document.querySelectorAll('.report-btn');
const reportTitle = document.getElementById('report-title');
const reportContent = document.getElementById('report-content');
const loadingMessage = document.getElementById('loading-message');
const initialMessage = document.getElementById('initial-message');
const reportTable = document.getElementById('report-table');
const tableHeader = document.getElementById('table-header');
const tableBody = document.getElementById('table-body');
const reportCard = document.getElementById('report-card');
const excelExportBtn = document.getElementById('excel-export-btn');
const pdfExportBtn = document.getElementById('pdf-export-btn');

// Estado del reporte activo para recargar al cambiar de empresa
let activeReport = {
    viewName: null,
    reportTitle: 'Seleccione un reporte para empezar'
};

// --- Utilidades de Visualización ---

/**
 * Muestra el spinner de carga y oculta el contenido del reporte.
 * @param {boolean} isLoading 
 */
function toggleLoading(isLoading) {
    loadingMessage.classList.toggle('hidden', !isLoading);
    reportTable.classList.add('hidden');
    initialMessage.classList.add('hidden');
    reportCard.classList.toggle('opacity-50', isLoading);
    
    // Deshabilitar botones de exportación mientras carga
    excelExportBtn.disabled = isLoading;
    pdfExportBtn.disabled = isLoading;
}

/**
 * Formatea un valor como moneda hondureña (HNL).
 * @param {string|number} value 
 * @returns {string}
 */
function formatCurrency(value) {
    const num = parseFloat(String(value).replace(/[^0-9.-]+/g, ""));
    if (isNaN(num)) return value; // Devuelve el valor original si no es un número

    return num.toLocaleString('es-HN', {
        style: 'currency',
        currency: 'HNL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

/**
 * Renderiza los datos del reporte en la tabla HTML.
 * @param {any[]} reportData - Array de objetos (filas) recibidos de la API.
 */
function renderReportTable(reportData) {
    // 1. Manejo de Encabezados
    if (reportData.length === 0) {
        tableHeader.innerHTML = '<th>No hay datos para esta empresa o vista.</th>';
        tableBody.innerHTML = '';
        reportTable.classList.remove('hidden');
        excelExportBtn.disabled = true;
        pdfExportBtn.disabled = true;
        return;
    }

    const headers = Object.keys(reportData[0]);
    
    tableHeader.innerHTML = headers.map(header => 
        `<th class="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider bg-gray-100">${header.replace(/_/g, ' ')}</th>`
    ).join('');

    // 2. Renderizar Datos
    tableBody.innerHTML = reportData.map(rowObject => {
        const rowValues = Object.values(rowObject);
        
        // Heurística simple para determinar si es una fila de total
        const isTotalRow = rowValues.some(val => 
            typeof val === 'string' && (val.toLowerCase().includes('total') || val.toLowerCase().includes('sum'))
        );
        
        const rowClass = isTotalRow ? 'bg-yellow-50 font-bold text-gray-900 border-t-2 border-yellow-300' : 'bg-white text-gray-800 hover:bg-gray-50';
        
        return `<tr class="${rowClass}">` + rowValues.map(cell => {
            // Intenta formatear como moneda si el valor parece numérico
            let formattedCell = formatCurrency(cell);
            // Si el formato falló, usa el valor original o vacío
            if (formattedCell === cell) {
                formattedCell = cell === null || cell === undefined ? '' : cell;
            }
            
            return `<td class="px-6 py-4 whitespace-nowrap text-sm">${formattedCell}</td>`;
        }).join('') + '</tr>';
    }).join('');

    // 3. Mostrar la tabla y habilitar exportación
    reportTable.classList.remove('hidden');
    excelExportBtn.disabled = false;
    pdfExportBtn.disabled = false;
}


// --- LÓGICA DE CONEXIÓN A FLASK API ---

/**
 * Llama al endpoint de Flask para obtener la lista de empresas.
 */
async function fetchEmpresas() {
    try {
        const response = await fetch('/api/empresas');
        const result = await response.json();
        
        if (result.status === 'success' && result.data && result.data.length > 0) {
            return result.data.map(empresa => ({
                id: empresa.REG_Empresa,
                name: empresa.Nombre_empresa
            }));
        } else {
            console.error("Error al obtener empresas:", result.message || "Respuesta API inesperada.");
            return [];
        }
    } catch (error) {
        console.error('Fallo la conexión con el API /api/empresas:', error);
        reportTitle.textContent = `ERROR DE CONEXIÓN: No se pudo conectar al servidor de Flask.`;
        return [];
    }
}

/**
 * Llama al endpoint genérico de Flask para obtener el reporte de una vista SQL.
 * @param {string} viewName - El nombre de la vista SQL a consultar (ej: view_Balance_Comprobacion).
 * @param {number} companyId - El ID de la empresa para filtrar.
 */
async function fetchReporte(viewName, companyId) {
    toggleLoading(true);
    const endpoint = `/api/reporte-vista/${viewName}?empresa_id=${companyId}`;
    
    try {
        const response = await fetch(endpoint);
        const result = await response.json();
        
        if (result.status === 'success') {
            return result.data;
        } else {
            // Manejar errores de SQL como 'Vista no encontrada' (404)
            throw new Error(result.message || "Error desconocido al cargar el reporte.");
        }
    } catch (error) {
        console.error('Error en fetchReporte:', error);
        // Mostrar mensaje de error en el título del reporte
        reportTitle.textContent = `ERROR: ${error.message}`;
        reportTable.classList.add('hidden'); // Ocultar tabla si hay error
        initialMessage.classList.remove('hidden'); // Mostrar el área de contenido vacío
        return null;
    } finally {
        toggleLoading(false);
    }
}

// --- LÓGICA DE UI Y EVENTOS ---

/**
 * Maneja el clic en los botones de reporte.
 * @param {Event} event 
 */
const handleReportButtonClick = async (event) => {
    const reportBtn = event.currentTarget;
    const viewName = reportBtn.getAttribute('data-report');
    const reportTitleText = reportBtn.getAttribute('data-title');
    
    const companySelect = document.getElementById('empresa-select');
    const companyId = companySelect.value;
    const companyName = companySelect.options[companySelect.selectedIndex].text;

    if (!companyId) {
        reportTitle.textContent = 'Error: Seleccione una empresa válida.';
        return;
    }
    
    // 1. Actualizar estado activo
    activeReport.viewName = viewName;
    activeReport.reportTitle = reportTitleText;

    // 2. Ejecutar fetch
    const data = await fetchReporte(viewName, companyId);
    
    if (data) {
        reportTitle.textContent = `${reportTitleText} - Empresa: ${companyName}`;
        renderReportTable(data);
    } else {
        // Si data es null, el error ya se mostró en fetchReporte
    }
};

/**
 * Carga las empresas en el selector.
 */
const loadCompanies = async () => {
    const companies = await fetchEmpresas();
    const select = document.getElementById('empresa-select');
    select.innerHTML = ''; // Limpiar opciones existentes

    if (companies.length === 0) {
        select.innerHTML = '<option value="" disabled selected>No se encontraron empresas.</option>';
        reportTitle.textContent = 'Error al cargar empresas. Revise la conexión SQL y la tabla Principal.';
        return;
    }

    companies.forEach(company => {
        const option = document.createElement('option');
        option.value = company.id;
        option.textContent = company.name;
        select.appendChild(option);
    });

    // Seleccionar la primera por defecto e inicializar el título
    select.value = companies[0].id;
    reportTitle.textContent = 'Seleccione un reporte para la empresa ' + companies[0].name;
};


// --- FUNCIONES DE EXPORTACIÓN (EXISTENTES) ---

// Exportar a Excel
window.exportTableToExcel = (tableId, filename = 'reporte') => {
    const table = document.getElementById(tableId);
    if (table.classList.contains('hidden') || table.tBodies[0].rows.length === 0) {
         console.warn("No hay tabla visible o datos para exportar a Excel.");
         return;
    }
    // Asume que TableToExcel está cargado globalmente (desde index.html)
    TableToExcel.convert(table, {
        name: `${filename}.xlsx`,
        sheet: {
            name: 'Reporte'
        }
    });
};

// Exportar a PDF (Usando html2canvas y jspdf.autotable para mejor calidad)
window.exportTableToPDF = async (tableId, filename = 'reporte') => {
    const table = document.getElementById(tableId);
    if (table.classList.contains('hidden') || table.tBodies[0].rows.length === 0) {
         console.warn("No hay tabla visible o datos para exportar a PDF.");
         return;
    }
    
    // La librería jspdf.umd.min.js expone jsPDF globalmente
    const { jsPDF } = window.jspdf; 
    const doc = new jsPDF('l', 'mm', 'a4'); // 'l' para horizontal, A4
    
    const finalFilename = filename.replace(/[^a-z0-9]/gi, '_');

    doc.text(filename, 14, 15);
    
    // Usar la función autoTable para generar la tabla a partir del elemento HTML
    doc.autoTable({ 
        html: `#${tableId}`,
        startY: 20, // Empieza la tabla después del título
        theme: 'striped',
        headStyles: { fillColor: [200, 50, 50] }, // Color para encabezados
        styles: { fontSize: 8 },
        margin: { top: 10, left: 10, right: 10, bottom: 10 }
    });

    doc.save(`${finalFilename}.pdf`);
};

// --- INICIALIZACIÓN DE LA APP ---
window.onload = () => {
    // 1. Cargar las empresas
    loadCompanies();

    // 2. Asignar Eventos a Botones de Reporte
    document.querySelectorAll('.report-btn').forEach(button => {
        button.addEventListener('click', handleReportButtonClick);
    });

    // 3. Asignar Evento al Selector de Empresa
    document.getElementById('empresa-select').addEventListener('change', async (e) => {
        const selectedName = e.target.options[e.target.selectedIndex].text;
        reportTitle.textContent = `Seleccione un reporte para la empresa ${selectedName}`;
        
        // Si había un reporte activo, recargarlo con la nueva empresa
        if (activeReport.viewName) {
            // Actualizamos el título inmediatamente
            reportTitle.textContent = `${activeReport.reportTitle} - Empresa: ${selectedName} (Recargando...)`;
            
            // Recargamos el reporte
            const data = await fetchReporte(activeReport.viewName, e.target.value);
            
            if (data) {
                reportTitle.textContent = `${activeReport.reportTitle} - Empresa: ${selectedName}`;
                renderReportTable(data);
            } else {
                // Si falla, el título ya tiene el mensaje de error
            }

        } else {
            // Si no había reporte activo, limpiar la vista
            document.getElementById('report-table').classList.add('hidden');
            document.getElementById('initial-message').classList.remove('hidden');
            excelExportBtn.disabled = true;
            pdfExportBtn.disabled = true;
        }
    });
};
