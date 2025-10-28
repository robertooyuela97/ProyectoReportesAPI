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
 * Renderiza los datos del reporte en la tabla HTML.
 * @param {string} title Título del reporte.
 * @param {Array<Object>} data Datos del reporte (array de objetos).
 */
function renderReporte(title, data) {
    reportTitle.textContent = title;
    tableHeader.innerHTML = '';
    tableBody.innerHTML = '';
    
    if (!data || data.length === 0) {
        reportTable.classList.add('hidden');
        initialMessage.classList.remove('hidden');
        initialMessage.textContent = `No se encontraron datos para el reporte de ${title} en la empresa seleccionada.`;
        return;
    }

    // 1. Crear encabezados (usa las claves del primer objeto)
    const headers = Object.keys(data[0]);
    headers.forEach(header => {
        const th = document.createElement('th');
        // Quitar guiones bajos y capitalizar el primer carácter para el display
        th.textContent = header.replace(/_/g, ' ').toUpperCase();
        th.className = 'px-4 py-3 text-xs font-semibold tracking-wider text-left text-gray-600 uppercase border-b-2 border-gray-200 bg-gray-100';
        tableHeader.appendChild(th);
    });

    // 2. Llenar el cuerpo de la tabla
    data.forEach((row) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-red-50 transition duration-150';
        
        headers.forEach(header => {
            const td = document.createElement('td');
            let value = row[header] || '';

            // Formato especial para valores numéricos (asumiendo que los que tienen punto decimal son montos)
            if (!isNaN(value) && value !== '') {
                // Convertir a número antes de formatear
                const numValue = parseFloat(value);
                // Si es decimal, usar formato monetario (español)
                if (value.toString().includes('.') || value.toString().includes(',')) {
                    // Usamos HNL (Lempiras Hondureñas) como moneda, puedes cambiar el código
                    value = new Intl.NumberFormat('es-HN', {
                        style: 'currency',
                        currency: 'HNL', 
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    }).format(numValue);
                    td.className = 'px-4 py-3 whitespace-nowrap text-right font-mono';
                } else {
                    // Si es un entero, solo mostrarlo (ej. IDs)
                    td.className = 'px-4 py-3 whitespace-nowrap text-center';
                }
            } else {
                 // Texto (ej. Nombre_empresa, etc.)
                td.className = 'px-4 py-3 whitespace-nowrap text-left text-gray-700';
            }
            
            td.textContent = value;
            tr.appendChild(td);
        });
        tableBody.appendChild(tr);
    });

    // 3. Mostrar la tabla
    reportTable.classList.remove('hidden');
    initialMessage.classList.add('hidden');
}

// --- Funciones de Fetch y Lógica de Negocio ---

/**
 * Obtiene los datos del reporte usando la nueva API genérica.
 * @param {string} viewName El nombre de la vista SQL a consultar (ej: 'vw_activo_corriente_combinada').
 * @param {string} reportTitleDisplay El título a mostrar al usuario.
 */
async function fetchReporte(viewName, reportTitleDisplay) {
    // CLAVE DE LA SOLUCIÓN: Obtener y validar el ID de la empresa seleccionada
    const empresaId = empresaSelect.value;
    
    // VALIDACIÓN REFORZADA: Si el ID es inválido (vacío o placeholder), mostramos error y detenemos la ejecución.
    if (!empresaId || empresaId === "placeholder") {
        reportTitle.textContent = "Error: Seleccione una empresa válida.";
        initialMessage.classList.remove('hidden');
        initialMessage.textContent = "Por favor, seleccione una empresa de la lista desplegable antes de generar un reporte.";
        reportTable.classList.add('hidden');
        toggleLoading(false); // Asegurar que el spinner esté oculto
        return;
    }

    toggleLoading(true);

    try {
        // La URL incluye el filtro obligatorio 'empresa_id'
        const url = `/api/reporte-vista/${viewName}?empresa_id=${empresaId}`;
        
        const response = await fetch(url);
        const result = await response.json();
        
        if (result.status === 'success') {
            renderReporte(reportTitleDisplay, result.data);
        } else {
            console.error('Error al obtener reporte:', result.message, result.detail);
            reportTitle.textContent = `Error al cargar: ${reportTitleDisplay}`;
            initialMessage.classList.remove('hidden');
            // Mostramos el mensaje del servidor, incluyendo el error de "empresa_id es requerido" si se cuela
            initialMessage.textContent = `Fallo en el servidor: ${result.message} ${result.detail || ''}`;
            reportTable.classList.add('hidden');
        }

    } catch (error) {
        console.error('Error de red al intentar obtener el reporte:', error);
        reportTitle.textContent = `Error de red.`;
        initialMessage.classList.remove('hidden');
        initialMessage.textContent = `Error de conexión: No se pudo contactar al servidor. (${error.message})`;
        reportTable.classList.add('hidden');
    } finally {
        toggleLoading(false);
    }
}

/**
 * Inicializa el selector de empresas y selecciona la primera por defecto.
 */
async function fetchEmpresas() {
    try {
        const response = await fetch('/api/empresas');
        const result = await response.json();
        
        empresaSelect.innerHTML = '';
        
        if (result.status === 'success' && result.data.length > 0) {
            
            // 1. Añadir una opción de placeholder (deshabilitada y seleccionada)
            const placeholderOption = document.createElement('option');
            placeholderOption.value = 'placeholder';
            placeholderOption.textContent = 'Seleccione una Empresa...';
            placeholderOption.disabled = true;
            placeholderOption.selected = true;
            empresaSelect.appendChild(placeholderOption);

            // 2. Llenar con datos reales
            let firstEmpresaId = null;
            result.data.forEach(empresa => {
                const option = document.createElement('option');
                option.value = empresa.REG_Empresa;
                option.textContent = `${empresa.Nombre_empresa} (ID: ${empresa.REG_Empresa})`;
                empresaSelect.appendChild(option);

                // Capturamos el ID de la primera empresa para seleccionarla si es necesario
                if (firstEmpresaId === null) {
                    firstEmpresaId = empresa.REG_Empresa;
                }
            });
            
            // 3. Seleccionar la primera empresa disponible si hay datos
            if (firstEmpresaId) {
                 // Forzamos la selección de la primera empresa para evitar el envío de valor vacío ""
                 empresaSelect.value = firstEmpresaId;
                 // Quitamos la opción 'Seleccione una Empresa...' de la vista si seleccionamos la primera
                 placeholderOption.selected = false;
            }

            initialMessage.textContent = "Empresas cargadas. Ahora, seleccione un componente del balance para generar el reporte.";
            
        } else {
            empresaSelect.innerHTML = '<option value="">No hay empresas disponibles</option>';
            initialMessage.textContent = "No se pudo cargar la lista de empresas. Verifique la conexión a la base de datos.";
        }
    } catch (error) {
        empresaSelect.innerHTML = '<option value="">Error de conexión de API</option>';
        initialMessage.textContent = "Error de red: No se pudo contactar al servidor de la API para obtener las empresas.";
        console.error('Error fetching empresas:', error);
    }
}


// --- Event Listeners ---

// 1. Inicializar la lista de empresas al cargar la página
window.addEventListener('load', fetchEmpresas);

// 2. Manejar los clics en los botones de reporte
reportButtons.forEach(button => {
    button.addEventListener('click', () => {
        const viewName = button.getAttribute('data-view');
        const reportTitleDisplay = button.textContent.trim();
        
        // Remover el estilo activo de todos los botones
        reportButtons.forEach(btn => btn.classList.remove('ring-4', 'ring-red-400'));
        // Añadir el estilo activo al botón actual
        button.classList.add('ring-4', 'ring-red-400');
        
        fetchReporte(viewName, reportTitleDisplay);
    });
});

// 3. CLAVE DE USABILIDAD: Recargar el reporte si se cambia la empresa seleccionada
empresaSelect.addEventListener('change', () => {
    // Identificar el botón activo actualmente
    const activeBtn = document.querySelector('.report-btn.ring-4');
    if (activeBtn) {
        // Si hay un reporte activo, lo recargamos con la nueva empresa
        const viewName = activeBtn.getAttribute('data-view');
        const reportTitleDisplay = activeBtn.textContent.trim();
        fetchReporte(viewName, reportTitleDisplay);
    } else {
        // Si no hay reporte activo, solo actualizamos el mensaje inicial
        initialMessage.classList.remove('hidden');
        initialMessage.textContent = `Empresa cambiada a ID ${empresaSelect.value}. Seleccione un componente del balance.`;
        reportTable.classList.add('hidden');
    }
});


// --- Funciones de Exportación (Se modificó alert() por console.error) ---

/**
 * Exporta los datos de la tabla visible a un archivo Excel.
 */
function exportTableToExcel(tableID, filename = '') {
    if (reportTable.classList.contains('hidden')) {
        console.error("No hay reporte visible para exportar.");
        return;
    }
    const finalFilename = filename.trim().replace(/ /g, '_') || 'Reporte_Contable';
    // tableToExcel es una función global de la librería cargada en el HTML
    TableToExcel.convert(document.getElementById(tableID), {
        name: `${finalFilename}.xlsx`,
        sheet: {
            name: 'Reporte'
        }
    });
}

/**
 * Exporta los datos de la tabla visible a un archivo PDF.
 */
async function exportTableToPDF(tableID, filename = '') {
    if (reportTable.classList.contains('hidden')) {
        console.error("No hay reporte visible para exportar.");
        return;
    }
    toggleLoading(true);
    const finalFilename = filename.trim().replace(/ /g, '_') || 'Reporte_Contable';

    // Asegurarse de que solo la tabla visible se capture
    const input = document.getElementById(tableID);
    
    // Configuración para jspdf
    const { jsPDF } = window.jspdf;
    
    try {
        const canvas = await html2canvas(input, {
            scale: 2, // Mejora la calidad del renderizado
            logging: true,
            useCORS: true
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('l', 'mm', 'a4'); // 'l' for landscape, A4
        const imgWidth = 280; // A4 landscape width in mm minus margins (297 - 17)
        const pageHeight = pdf.internal.pageSize.getHeight();
        const imgHeight = canvas.height * imgWidth / canvas.width;
        let heightLeft = imgHeight;
        let position = 5; // Margen superior

        // Añadir título y fecha al inicio del PDF
        pdf.setFontSize(18);
        pdf.text(filename, 10, position + 5);
        pdf.setFontSize(10);
        pdf.text(`Fecha de Generación: ${new Date().toLocaleDateString()}`, 10, position + 10);
        position += 20;

        // Bucle para añadir páginas si la tabla es muy larga
        pdf.addImage(imgData, 'PNG', 5, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft >= 0) {
            position = heightLeft - imgImg;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 5, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }

        pdf.save(`${finalFilename}.pdf`);
        
    } catch (e) {
        console.error("Error al generar PDF:", e);
        // Usar console.error en lugar de alert()
        console.error("Error al generar el PDF. Intente exportar a Excel.");
    } finally {
        toggleLoading(false);
    }
}
