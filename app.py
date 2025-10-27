import os 
import pyodbc
from flask import Flask, jsonify, request, send_file, render_template # 🟢 IMPORTAR render_template
from flask_cors import CORS
from datetime import date
import json

# 🟢 CORRECCIÓN: Inicialización explícita de la carpeta estática.
# Esto asegura que Azure pueda servir los archivos dentro de /static/
app = Flask(__name__, static_folder='static', static_url_path='/static')
CORS(app)

# --- Configuracion de Azure SQL (USANDO VARIABLES DE ENTORNO) ---
# Lee las variables del entorno. 
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
        conn = pyodbc.connect(CONNECTION_STRING)
        cursor = conn.cursor()
        
        # Preparar la llamada al PS (ej: {CALL SP_Generar_BalanceFinanciero(?)})
        placeholders = ', '.join('?' for _ in params) if params else ''
        sp_call = f"{{CALL {sp_name}({placeholders})}}"
        
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
        if 'Login failed' in error_msg or 'firewall' in error_msg:
            message = "Error de Firewall de Azure o Credenciales. Verifique su IP."
        else:
            message = f"Error de SQL: {error_msg}"
            
        return {"status": "error", "message": message}
        
    finally:
        if conn:
            conn.close()


# --- RUTA RAÍZ (SERVIR INTERFAZ HTML) ---
@app.route('/')
def home():
    # 🟢 CAMBIO CRÍTICO: Usar render_template en lugar de send_file.
    # Esto fuerza a Flask a procesar index.html como una plantilla Jinja, 
    # lo cual es necesario para que {{ url_for(...) }} se ejecute correctamente.
    # Asegúrate de que index.html esté en una carpeta llamada 'templates/' o en la raíz.
    try:
        # Si index.html está en la raíz, Flask lo encontrará. 
        # Si está en 'templates/', usa render_template('index.html')
        return render_template('index.html') 
    except Exception as e:
        # Esto ayudará a diagnosticar si Flask no puede encontrar el index.html
        return f"Error al renderizar index.html: {str(e)}", 500
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
