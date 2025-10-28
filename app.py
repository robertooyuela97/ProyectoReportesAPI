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

# --- Funciones de Acceso a la Base de Datos ---

def ejecutar_stored_procedure(sp_name, params=None):
    """Funcion generica para ejecutar un PS y devolver los datos."""
    conn = None
    try:
        conn = pyodbc.connect(CONNECTION_STRING)
        cursor = conn.cursor()
        
        placeholders = ', '.join('?' for _ in params) if params else ''
        sp_call = f"{{CALL {sp_name}({placeholders})}}"
        
        cursor.execute(sp_call, params or [])
        
        column_names = [column[0] for column in cursor.description] if cursor.description else []
        
        reporte_data = []
        for row in cursor.fetchall():
            processed_row = [str(item) if item is not None else item for item in row]
            reporte_data.append(dict(zip(column_names, processed_row)))

        return {"status": "success", "reporte": sp_name, "data": reporte_data}

    except pyodbc.Error as ex:
        error_msg = str(ex)
        message = (
            "Error CRÍTICO de SQL (Login Failed/Firewall/Driver): "
            f"Detalle: {error_msg}"
        )
        app.logger.error(message)
        return {"status": "error", "message": message}
        
    finally:
        if conn:
            conn.close()

def ejecutar_select_query(query):
    """Funcion generica para ejecutar una query SELECT y devolver los datos de una vista."""
    conn = None
    try:
        conn = pyodbc.connect(CONNECTION_STRING)
        cursor = conn.cursor()
        
        # Ejecutar la query directamente
        cursor.execute(query)
        
        column_names = [column[0] for column in cursor.description] if cursor.description else []
        
        reporte_data = []
        for row in cursor.fetchall():
            processed_row = [str(item) if item is not None else item for item in row]
            reporte_data.append(dict(zip(column_names, processed_row)))

        return {"status": "success", "reporte": "Vista: " + query, "data": reporte_data}

    except pyodbc.Error as ex:
        error_msg = str(ex)
        message = (
            "Error de SQL al ejecutar SELECT: "
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

# --- Rutas de API para VISTAS DE COMPONENTES DEL BALANCE ---

@app.route('/api/reporte-vista/<view_name>', methods=['GET'])
def reporte_vista_api(view_name):
    """
    Ruta para obtener datos de cualquier vista (Activo/Pasivo Corriente/No Corriente)
    mediante una consulta SELECT * FROM dbo.<view_name>.
    
    INCLUYE PRUEBA DE CONECTIVIDAD DE EMERGENCIA.
    """
    if not view_name:
        return jsonify({"status": "error", "message": "Nombre de vista no especificado"}), 400
        
    # La consulta que ha estado fallando
    query = f"SELECT * FROM dbo.{view_name}"
    
    resultado = ejecutar_select_query(query)
    
    if resultado['status'] == 'error' and 'Invalid object name' in resultado['message']:
        # Si el error persiste, ejecutamos una consulta de prueba a una tabla básica
        app.logger.error(f"FALLO la consulta a {view_name}. Intentando consulta de prueba...")
        
        # *** CAMBIA 'Principal' por el nombre de una tabla que sabes que existe ***
        prueba_query = "SELECT TOP 1 * FROM dbo.Principal" 
        resultado_prueba = ejecutar_select_query(prueba_query)
        
        if resultado_prueba['status'] == 'success':
            # La prueba tuvo éxito, el problema ES la vista/nombre
            return jsonify({
                "status": "warning", 
                "message": f"FALLO: La vista '{view_name}' no se pudo encontrar (Invalid object name). La conexión a la DB y la tabla 'Principal' es OK.",
                "data": []
            }), 500
        else:
            # La prueba falló, el problema es la conexión, el firewall o el login/password
            return jsonify({
                "status": "error", 
                "message": "FALLO CRÍTICO: No se pudo consultar la vista NI la tabla de prueba 'Principal'. Revise credenciales/firewall.",
                "detail": resultado_prueba['message']
            }), 500

    if resultado['status'] == 'error':
        return jsonify(resultado), 500
    
    return jsonify(resultado)

# --- Rutas de API para Reportes Financieros completos (Stored Procedures) ---
# ... (El resto de rutas permanece igual)

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
