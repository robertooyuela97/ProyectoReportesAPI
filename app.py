import os 
import pyodbc
from flask import Flask, jsonify, request, render_template # Solo necesitamos render_template
from flask_cors import CORS
from datetime import date
import json

# 🟢 CORRECCIÓN: ESPECIFICAR LA RUTA ABSOLUTA PARA LAS PLANTILLAS
# Esto ayuda a que el servidor Azure (que a menudo tiene rutas relativas confusas)
# encuentre la carpeta 'templates/' y los archivos en 'static/' correctamente.
template_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), 'templates'))

app = Flask(
    __name__, 
    template_folder=template_dir, # Usar la ruta absoluta para templates
    static_folder='static', 
    static_url_path='/static'
)
CORS(app)

# --- Configuracion de Azure SQL (USANDO VARIABLES DE ENTORNO) ---
# Lee las variables del entorno. 
SERVER = os.environ.get('DB_SERVER', 'grupo2-bd2-ergj.database.windows.net')
DATABASE = os.environ.get('DB_NAME', 'ProyectoContable_G2BD2')
USERNAME = os.environ.get('DB_USER', 'grupo2')
PASSWORD = os.environ.get('DB_PASSWORD', 'Grupobd.2') 

# 🟢 CORRECCIÓN CRÍTICA PARA AZURE LINUX: Usar el driver FreeTDS que viene preinstalado
# En Azure App Services con Linux, es más fiable usar este driver.
DRIVER_AZURE = '{ODBC Driver 17 for SQL Server}' # Mantenemos el nombre original como fallback/comentario
DRIVER_LINUX_COMPATIBLE = '{ODBC Driver 17 for SQL Server}' # A veces Azure lo reconoce, otras veces no.
# Si el problema persiste después de este cambio, reemplace la línea de abajo con:
# DRIVER_LINUX_COMPATIBLE = 'FreeTDS' 

# 🟢 Nuevo formato de cadena de conexión para mayor compatibilidad con Azure
CONNECTION_STRING = (
    f'DRIVER={DRIVER_LINUX_COMPATIBLE};'
    f'SERVER={SERVER};'
    f'DATABASE={DATABASE};'
    f'UID={USERNAME};'
    f'PWD={PASSWORD};'
    f'Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;'
)
# -------------------------------------------------------------

def ejecutar_stored_procedure(sp_name, params=None):
    """Funcion generica para ejecutar un PS y devolver los datos."""
    conn = None
    try:
        conn = pyodbc.connect(CONNECTION_STRING)
        cursor = conn.cursor()
        
        # Preparar la llamada al PS (ej: {CALL SP_Generar_BalanceFinanciero(?)})
        placeholders = ', '.join('?' for _ in params) if params else ''
        sp_call = f"{{CALL {sp_name}({placeholders})}}"
        
        # Imprimir la llamada para depuración en los logs de Azure
        print(f"DEBUG: Ejecutando SP: {sp_call} con parámetros: {params}")

        cursor.execute(sp_call, params or [])
        
        # Obtener los nombres de las columnas
        column_names = [column[0] for column in cursor.description]
        
        # Mapear los resultados
        reporte_data = []
        for row in cursor.fetchall():
            # Convertir todos los tipos de datos a cadenas (incluyendo fechas)
            processed_row = [str(item) if item is not None else item for item in row]
            reporte_data.append(dict(zip(column_names, processed_row)))

        return {"status": "success", "reporte": sp_name, "data": reporte_data}

    except pyodbc.Error as ex:
        # Manejo de error específico de SQL (Firewall/Credenciales)
        error_msg = str(ex)
        
        # Mensajes de error comunes de pyodbc/Azure/SQL
        if 'Login failed' in error_msg or 'firewall' in error_msg or 'Access denied' in error_msg or 'Permission denied' in error_msg or 'No such file or directory' in error_msg:
            # Si contiene 'No such file or directory', es un error del driver ODBC
            if 'No such file or directory' in error_msg:
                 message = "Error crítico de DRIVER ODBC. Asegúrese de que 'ODBC Driver 17 for SQL Server' esté instalado en el ambiente de Azure, o pruebe a cambiar a 'FreeTDS'."
            else:
                 message = "Error de Firewall de Azure, Credenciales o DNS del servidor. Verifique el acceso del App Service al SQL Server."
        else:
            # Error genérico de SQL
            message = f"Error de SQL desconocido: {error_msg}"
            
        print(f"ERROR: {message}") # Registrar el error en los logs de Azure
        return {"status": "error", "message": message}
        
    finally:
        if conn:
            conn.close()


# --- RUTA RAÍZ (SERVIR INTERFAZ HTML) ---
@app.route('/')
def home():
    # Ahora, Flask usará la ruta absoluta definida en 'template_folder'
    return render_template('index.html') 
# ---------------------------------------------


# --- Endpoint 1: Balance Financiero ---
@app.route('/api/balance-financiero', methods=['GET'])
def balance_financiero_api():
    # Asumimos Empresa ID = 1 por defecto
    resultado = ejecutar_stored_procedure("SP_Generar_BalanceFinanciero", params=[1])
    
    if resultado['status'] == 'error':
        return jsonify(resultado), 500
    
    return jsonify(resultado)

# --- Endpoint 2: Balance de Comprobación ---
@app.route('/api/balance-comprobacion', methods=['GET'])
def balance_comprobacion_api():
    resultado = ejecutar_stored_procedure("SP_Generar_BalanceComprobacion", params=[1])
    
    if resultado['status'] == 'error':
        return jsonify(resultado), 500
    
    return jsonify(resultado)


# --- Endpoint 3: Estado de Resultados ---
@app.route('/api/estado-resultados', methods=['GET'])
def estado_resultados_api():
    resultado = ejecutar_stored_procedure("SP_Generar_EstadoResultados", params=[1])
    
    if resultado['status'] == 'error':
        return jsonify(resultado), 500
    
    return jsonify(resultado)


# --- Endpoint 4: Movimientos de Cuentas (con parámetros de URL) ---
@app.route('/api/movimientos-cuentas', methods=['GET'])
def movimientos_cuentas_api():
    # Obtener parámetros de la URL: /api/movimientos-cuentas?cuenta=Bancos&inicio=2024-01-01&fin=2024-12-31
    empresa_id = 1
    cuenta = request.args.get('cuenta', 'Bancos') 
    fecha_inicio = request.args.get('inicio', '2023-01-01') 
    fecha_fin = request.args.get('fin', '2025-12-31')
    
    params = [empresa_id, cuenta, fecha_inicio, fecha_fin]
    
    resultado = ejecutar_stored_procedure("SP_Generar_MovimientosCuentas", params=params)
    
    if resultado['status'] == 'error':
        return jsonify(resultado), 500
    
    return jsonify(resultado)

# Si ejecuta el archivo directamente (para pruebas locales)
if __name__ == '__main__':
    # Flask usa el puerto 5000 por defecto, pero en Azure usará el puerto que le asigne el App Service.
    app.run(debug=True)
