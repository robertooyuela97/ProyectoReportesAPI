/**
 * Lógica de conexión y manipulación del DOM para la aplicación de Reportes Contables.
 *
 * NOTA: Esta versión utiliza la nueva API genérica /api/reporte-vista/<view_name>
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

// --- Utilidades de Visualización ---

/**
 * Muestra el spinner de carga y oculta el contenido del reporte.
 * @param {boolean} isLoading Indica si debe mostrarse o no el spinner.
 */
function toggleLoading(isLoading) {
    loadingMessage.classList.toggle('hidden', !isLoading);
    reportTable.classList.add('hidden');
    initialMessage.classList.add('hidden');
    reportCard.classList.toggle('opacity-50', isLoading); // Añadir efecto de opacidad durante la carga
}

/**
 * Formatea un número como moneda (Lempira, 2 decimales).
 * Esta función es clave para evitar formatear el código de empresa.
 * @param {number|string} value El valor a formatear.
 * @returns {string} El valor formateado como L 1,000.00.
 */
function formatCurrency(value) {
    if (value === null || value === undefined) return '';
    const num = parseFloat(value);
    if (isNaN(num)) return value;

    // Formateo para la moneda Lempira (Honduras)
    return `L ${num.toLocaleString('es-HN', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    })}`;
}

/**
 * Renderiza los datos del reporte en la tabla HTML.
 * @param {string} reportType Tipo de reporte (usado para el título).
 * @param {Array<Object>} data Datos de la API.
 */
function renderReportTable(reportType, data) {
    tableBody.innerHTML = '';
    
    if (!data || data.length === 0) {
        reportContent.innerHTML = `<p class="error text-center">No se encontraron datos para la empresa seleccionada.</p>`;
        reportTable.classList.add('hidden');
        reportCard.classList.remove('hidden');
        return;
    }

    // Identificar las cabeceras (keys)
    const headers = Object.keys(data[0]);

    // Establecer cabeceras de la tabla
    tableHeader.innerHTML = `<tr>${headers.map(h => `<th>${h.replace(/_/g, ' ')}</th>`).join('')}</tr>`;

    // Procesar filas
    data.forEach(row => {
        const tr = document.createElement('tr');
        
        // Determinar si la fila es un total para aplicar estilo
        const isTotalRow = headers.some(h => h.toLowerCase().includes('total'));
        if (isTotalRow) {
            tr.classList.add('total-row');
        }

        headers.forEach(header => {
            const td = document.createElement('td');
            let value = row[header];

            // *** LÓGICA DE FORMATO ACTUALIZADA Y CORREGIDA ***
            const lowerHeader = header.toLowerCase();
            
            // 1. Evitar formatear el ID de la empresa (REG_Empresa o Empresa)
            if (lowerHeader.includes('empresa') || lowerHeader.includes('reg_')) {
                td.textContent = value; // Mostrar el ID tal cual
                td.classList.add('text-center');
            } 
            // 2. Aplicar formato de moneda solo a saldos y montos
            else if (lowerHeader.includes('saldo') || lowerHeader.includes('monto') || lowerHeader.includes('total')) {
                td.textContent = formatCurrency(value);
                td.classList.add('currency-value'); // Estilo para alinear a la derecha
            } 
            // 3. Para cualquier otro campo (Cuenta, Concepto, etc.)
            else {
                td.textContent = value;
            }

            tr.appendChild(td);
        });
        tableBody.appendChild(tr);
    });

    // Actualizar título y mostrar tabla
    reportTitle.textContent = reportType.replace(/_/g, ' ');
    reportContent.innerHTML = '';
    reportTable.classList.remove('hidden');
    reportCard.classList.remove('hidden');
}

/**
 * Muestra un mensaje de error en la tarjeta del reporte.
 * @param {string} message Mensaje de error.
 * @param {string} details Detalles técnicos del error.
 */
function displayError(message, details = '') {
    reportTitle.textContent = 'Error';
    reportContent.innerHTML = `
        <div class="error p-4 rounded-lg bg-red-100 border border-red-400">
            <p><strong>${message}</strong></p>
            <p class="text-sm mt-2">Detalle: ${details || 'No disponible'}</p>
            <p class="text-xs mt-1">Verifique la conexión a la base de datos o si las vistas existen.</p>
        </div>
    `;
    reportTable.classList.add('hidden');
    reportCard.classList.remove('hidden');
}


// --- Lógica de la API y Control de Eventos ---

/**
 * Obtiene la lista de empresas de la API de Flask y llena el selector.
 */
async function fetchEmpresas() {
    toggleLoading(true);
    try {
        const response = await fetch('/api/empresas');
        const result = await response.json();
        
        if (result.status === 'success' && result.data && result.data.length > 0) {
            empresaSelect.innerHTML = '<option value="" disabled selected>Seleccione una Empresa</option>';
            result.data.forEach(empresa => {
                // REG_Empresa es el valor (ID) y Nombre_empresa es el texto
                empresaSelect.innerHTML += `<option value="${empresa.REG_Empresa}">${empresa.Nombre_empresa}</option>`;
            });
            initialMessage.classList.remove('hidden');
        } else {
            displayError('Error al cargar empresas', 'La API no devolvió una lista de empresas válida o la tabla Principal está vacía.');
        }

    } catch (error) {
        console.error('Error de conexión al cargar empresas:', error);
        displayError('Error de conexión', 'No se pudo contactar al servidor Flask de la API.');
    } finally {
        toggleLoading(false);
    }
}

/**
 * Obtiene el reporte contable de la API de Flask.
 * @param {string} viewName Nombre de la vista SQL a consultar.
 */
async function fetchReporte(viewName) {
    const selectedOption = empresaSelect.options[empresaSelect.selectedIndex];
    const companyId = selectedOption ? selectedOption.value : null;
    
    if (!companyId) {
        alert('Por favor, seleccione una empresa primero.'); // Usar una alerta temporal para este control
        return;
    }

    // Desactivar el botón activo y activar el actual
    document.querySelector('.report-btn.active')?.classList.remove('active');
    document.querySelector(`[data-report="${viewName}"]`)?.classList.add('active');


    toggleLoading(true);
    const reportName = selectedOption.textContent;
    
    try {
        // La URL de la API espera el nombre de la vista en la ruta y el ID de empresa como query param
        const apiUrl = `/api/reporte-vista/${viewName}?empresa_id=${companyId}`;
        const response = await fetch(apiUrl);
        const result = await response.json();
        
        if (result.status === 'success') {
            renderReportTable(`Reporte: ${reportName} - ${viewName.replace(/view_/g, '')}`, result.data);
        } else {
            // Manejar errores de la API (incluyendo el 404 de vista no encontrada)
            displayError(result.message, result.detail || 'Ocurrió un error desconocido en el servidor.');
        }

    } catch (error) {
        console.error('Error en fetchReporte:', error);
        displayError('Error de conexión o de red', 'No se pudo obtener el reporte del servidor.');
    } finally {
        toggleLoading(false);
    }
}

/**
 * Inicializa los listeners de eventos.
 */
function setupEventListeners() {
    // 1. Listener para botones de Reporte
    reportButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const reportType = e.currentTarget.getAttribute('data-report');
            if (reportType) {
                fetchReporte(reportType);
            }
        });
    });

    // 2. Listener para selector de Empresa (limpiar reporte si cambia)
    empresaSelect.addEventListener('change', () => {
        document.querySelector('.report-btn.active')?.classList.remove('active');
        reportTitle.textContent = 'Reporte Contable';
        reportContent.innerHTML = '';
        reportTable.classList.add('hidden');
        initialMessage.classList.remove('hidden');
        reportCard.classList.remove('hidden');
    });

    // 3. Listener para Exportar a PDF (Solo si jsPDF y html2canvas están cargados)
    document.getElementById('export-pdf-btn').addEventListener('click', exportToPDF);
}

/**
 * Exporta el contenido del reporte visible a un PDF.
 */
function exportToPDF() {
    const companyName = empresaSelect.options[empresaSelect.selectedIndex]?.textContent || 'SinEmpresa';
    const filename = reportTitle.textContent || 'ReporteContable';
    const finalFilename = `${filename.replace(/[^a-z0-9]/gi, '_')}_${companyName.replace(/[^a-z0-9]/gi, '_')}`;

    const element = document.getElementById('report-card'); // Captura el contenedor del reporte
    
    html2canvas(element, {
        logging: true,
        useCORS: true,
        scale: 2 // Aumentar la escala para mejor calidad en el PDF
    }).then(canvas => {
        // Inicializar jsPDF en modo horizontal (A4)
        const pdf = new jspdf.jsPDF('l', 'mm', 'a4'); 
        
        const imgData = canvas.toDataURL('image/png');
        const pdfWidth = 287; // Ancho máximo A4 horizontal (297mm) con márgenes de 5mm
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        let heightLeft = pdfHeight;
        let position = 10; // Margen superior

        // Añadir información de la empresa y título
        pdf.setFontSize(18);
        pdf.text(filename, 148.5, position, null, null, 'center'); // Centrar título
        position += 10;
        pdf.setFontSize(10);
        pdf.text(`Empresa: ${companyName}`, 10, position);
        pdf.text(`Fecha de Generación: ${new Date().toLocaleDateString('es-HN')}`, 280, position, null, null, 'right');
        position += 10;
        
        // Agregar la imagen del Canvas
        pdf.addImage(imgData, 'PNG', 5, position, pdfWidth, pdfHeight);
        heightLeft -= 297 - position; // Restamos la altura de la página menos el margen superior

        // Manejar el contenido que desborda a otras páginas (si es muy largo)
        let pageCount = 1;
        while (heightLeft >= -20) { // Un pequeño margen negativo para capturar el final
            position -= 297; // Mueve la posición de inicio a la parte superior de la nueva página
            pdf.addPage();
            pageCount++;
            
            // Re-agregar encabezados de página
            pdf.setFontSize(10);
            pdf.text(`Página ${pageCount}`, 280, 5, null, null, 'right');
            
            // Agregar el resto de la imagen
            pdf.addImage(imgData, 'PNG', 5, position, pdfWidth, pdfHeight);
            heightLeft -= 297; 
        }

        pdf.save(`${finalFilename}.pdf`);
    }).catch(err => {
        console.error('Error al generar PDF:', err);
        alert('Error al generar el PDF. Revise la consola para más detalles.');
    });
}


// --- Inicialización ---

// Ejecutar inicialización al cargar la página
window.onload = function() {
    setupEventListeners();
    fetchEmpresas();
};
