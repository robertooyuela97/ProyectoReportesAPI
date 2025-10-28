import os 
import pyodbc
from flask import Flask, jsonify, request, render_template 
from flask_cors import CORS
from datetime import date
import json

# Ruta absoluta de templates
template_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), 'templates'))

app = Flask(
    __name__, 
    template_folder=template_dir, 
    static_folder='static', 
    static_url_path='/static'
)
CORS(app)

# --- Configuracion de Azure SQL (USANDO VARIABLES DE ENTORNO) ---
SERVER = os.environ.get('DB_SERVER', 'grupo2-bd2-ergj.database.windows.net')
DATABASE = os.environ.get('DB_NAME', 'ProyectoContable_G2BD2')
USERNAME = os.environ.get('DB_USER', 'grupo2')
PASSWORD = os.environ.get('DB_PASSWORD', 'Grupobd.2') 
# Specify driver name via env var or default to ODBC Driver 18
DB_DRIVER = os.environ.get('DB_DRIVER', 'ODBC Driver 18 for SQL Server')

# Cadena de conexion DSN-less incluyendo DRIVER (necesario en Linux)
CONNECTION_STRING = (
    f"DRIVER={{{DB_DRIVER}}};"
    f"SERVER={SERVER},1433;"
    f"DATABASE={DATABASE};"
    f"UID={USERNAME};"
    f"PWD={PASSWORD};"
    f"Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
)

def ejecutar_stored_procedure(sp_name, params=None):
    """Funcion generica para ejecutar un PS y devolver los datos."""
    conn = None
    try:
        # Intentar conectar con la cadena completa (incluye DRIVER)
        conn = pyodbc.connect(CONNECTION_STRING)
        cursor = conn.cursor()
        
        placeholders = ', '.join('?' for _ in params) if params else ''
        sp_call = f"{{CALL {sp_name}({placeholders})}}"
        
        cursor.execute(sp_call, params or [])
        
        # Si el stored procedure no retorna filas, description puede ser None
        column_names = [column[0] for column in cursor.description] if cursor.description else []
        
        reporte_data = []
        for row in cursor.fetchall():
            processed_row = [str(item) if item is not None else item for item in row]
            reporte_data.append(dict(zip(column_names, processed_row)))

        return {"status": "success", "reporte": sp_name, "data": reporte_data}

    except pyodbc.Error as ex:
        error_msg = str(ex)
        # Mensaje más informativo
        message = (
            "Error CRÍTICO de SQL (Login Failed/Firewall/Driver): "
            f"Detalle: {error_msg}"
        )
        app.logger.error(message)
        return {"status": "error", "message": message}
        
    finally:
        if conn:
            conn.close()


@app.route('/')
def home():
    return render_template('index.html') 


@app.route('/api/balance-financiero', methods=['GET'])
def balance_financiero_api():
    resultado = ejecutar_stored_procedure("SP_Generar_BalanceFinanciero", params=[1])
    if resultado['status'] == 'error':
        return jsonify(resultado), 500
    return jsonify(resultado)


@app.route('/api/balance-comprobacion', methods=['GET'])
def balance_comprobacion_api():
    resultado = ejecutar_stored_procedure("SP_Generar_BalanceComprobacion", params=[1])
    if resultado['status'] == 'error':
        return jsonify(resultado), 500
    return jsonify(resultado)


@app.route('/api/estado-resultados', methods=['GET'])
def estado_resultados_api():
    resultado = ejecutar_stored_procedure("SP_Generar_EstadoResultados", params=[1])
    if resultado['status'] == 'error':
        return jsonify(resultado), 500
    return jsonify(resultado)


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
    app.run(host='0.0.0.0', port=8000, debug=True)