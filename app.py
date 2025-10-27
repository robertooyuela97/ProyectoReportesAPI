import os 
import pyodbc
from flask import Flask, jsonify, request, render_template 
from flask_cors import CORS
from datetime import date
import json

# 🟢 CONFIGURACIÓN DE RUTAS Y APP
# Usar ruta absoluta para templates/static para compatibilidad con Azure App Service
template_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), 'templates'))

app = Flask(
    __name__, 
    template_folder=template_dir, 
    static_folder='static', 
    static_url_path='/static'
)
CORS(app)

# --- Configuracion de Azure SQL (USANDO VARIABLES DE ENTORNO) ---
# Si las variables de entorno no existen en Azure Portal, usa los valores por defecto hardcodeados
SERVER = os.environ.get('DB_SERVER', 'grupo2-bd2-ergj.database.windows.net')
DATABASE = os.environ.get('DB_NAME', 'ProyectoContable_G2BD2')
USERNAME = os.environ.get('DB_USER', 'grupo2')
PASSWORD = os.environ.get('DB_PASSWORD', 'Grupobd.2') 
DRIVER = '{ODBC Driver 17 for SQL Server}' 

CONNECTION_STRING = (
    f'DRIVER={DRIVER};SERVER={SERVER};DATABASE={DATABASE};'
    f'UID={USERNAME};PWD={PASSWORD};'
    f'Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;'
)
# -------------------------------------------------------------

def ejecutar_stored_procedure(sp_name, params=None):
    """Funcion generica para ejecutar un PS y devolver los datos."""
    conn = None
    try:
        # DEBUG: Imprimir la cadena de conexión (sin contraseña) en los logs de Azure
        print(f"DEBUG_CONEXION: Intentando conectar a: {SERVER}/{DATABASE} con usuario: {USERNAME}")
        
        conn = pyodbc.connect(CONNECTION_STRING)
        cursor = conn.cursor()
        
        placeholders = ', '.join('?' for _ in params) if params else ''
        sp_call = f"{{CALL {sp_name}({placeholders})}}"
        
        cursor.execute(sp_call, params or [])
        
        column_names = [column[0] for column in cursor.description]
        
        reporte_data = []
        for row in cursor.fetchall():
            processed_row = [str(item) if item is not None else item for item in row]
            reporte_data.append(dict(zip(column_names, processed_row)))

        return {"status": "success", "reporte": sp_name, "data": reporte_data}

    except pyodbc.Error as ex:
        error_msg = str(ex)
        
        # Manejo de error específico de Azure
        if 'Login failed' in error_msg:
             message = "Error de CREDENCIALES (Usuario/Contraseña) o FIREWALL."
        elif 'ODBC Driver' in error_msg or 'file or directory' in error_msg:
             message = "Error de DRIVER ODBC. Azure no tiene el driver instalado o necesita FreeTDS."
        elif 'Connection Timeout' in error_msg:
             message = "Error de TIMEOUT. Posiblemente FIREWALL o el servidor SQL no está corriendo."
        else:
             message = f"Error de SQL desconocido: {error_msg}"
            
        print(f"CRITICAL ERROR: {message} -> Detalles: {error_msg}") 
        return {"status": "error", "message": message}
        
    finally:
        if conn:
            conn.close()


# --- RUTA RAÍZ (SERVIR INTERFAZ HTML) ---
@app.route('/')
def home():
    # ⚠️ Esto es lo que carga la interfaz web.
    return render_template('index.html') 
# ---------------------------------------------


# --- Endpoint 1: Balance Financiero ---
@app.route('/api/balance-financiero', methods=['GET'])
def balance_financiero_api():
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
    empresa_id = 1
    cuenta = request.args.get('cuenta', 'Bancos') 
    fecha_inicio = request.args.get('inicio', '2023-01-01') 
    fecha_fin = request.args.get('fin', '2025-12-31')
    
    params = [empresa_id, cuenta, fecha_inicio, fecha_fin]
    
    resultado = ejecutar_stored_procedure("SP_Generar_MovimientosCuentas", params=params)
    
    if resultado['status'] == 'error':
        return jsonify(resultado), 500
    
    return jsonify(resultado)


if __name__ == '__main__':
    app.run(debug=True)
