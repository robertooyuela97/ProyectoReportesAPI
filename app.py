import os 
import pyodbc
from flask import Flask, jsonify, request, render_template 
from flask_cors import CORS
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
# Usamos variables de entorno para las credenciales.
SERVER = os.environ.get('DB_SERVER')
DATABASE = os.environ.get('DB_NAME')
USERNAME = os.environ.get('DB_USER')
PASSWORD = os.environ.get('DB_PASSWORD') 
# Especificar el driver para compatibilidad en Linux (Azure App Service)
DB_DRIVER = os.environ.get('DB_DRIVER', 'ODBC Driver 18 for SQL Server') 

# Cadena de conexion DSN-less
CONNECTION_STRING = (
    f"DRIVER={{{DB_DRIVER}}};"
    f"SERVER={SERVER},1433;"
    f"DATABASE={DATABASE};"
    f"UID={USERNAME};"
    f"PWD={PASSWORD};"
    f"Encrypt=yes;TrustServerCertificate=no;Connection Timeout=30;"
)

# --- Funciones de Acceso a la Base de Datos (Solo para SELECT) ---

def ejecutar_select_query(query, params=None):
    """
    Función genérica para ejecutar una query SELECT (incluyendo filtros WHERE).
    Ahora maneja el filtro de empresa para las vistas.
    """
    conn = None
    try:
        conn = pyodbc.connect(CONNECTION_STRING)
        cursor = conn.cursor()
        
        # Ejecutar la query directamente
        cursor.execute(query, params or [])
        
        column_names = [column[0] for column in cursor.description] if cursor.description else []
        
        reporte_data = []
        for row in cursor.fetchall():
            # Convertir todos los items a string si no son None para asegurar serialización JSON
            processed_row = [str(item) if item is not None else item for item in row]
            reporte_data.append(dict(zip(column_names, processed_row)))

        return {"status": "success", "query": query, "data": reporte_data}

    except pyodbc.Error as ex:
        error_msg = str(ex)
        message = (
            "Error CRÍTICO de SQL (Login Failed/Firewall/Driver/Query): "
            f"Detalle: {error_msg}"
        )
        app.logger.error(message)
        # Devolvemos un error 500 para fallos de conexión o driver
        if 'Login failed' in error_msg or 'ODBC Driver' in error_msg or 'firewall' in error_msg:
             return {"status": "error", "message": "Fallo de Conexión/Credenciales/Driver. Revise las variables de entorno.", "detail": error_msg}
        return {"status": "error", "message": message}
        
    finally:
        if conn:
            conn.close()

@app.route('/')
def home():
    """Ruta principal que sirve la interfaz web."""
    return render_template('index.html') 

# --- RUTA PARA OBTENER LA LISTA DE EMPRESAS ---

@app.route('/api/empresas', methods=['GET'])
def obtener_empresas_api():
    """Obtiene la lista de empresas (REG_Empresa y Nombre_empresa) de la tabla Principal."""
    # Nota: Esta query no usa el ID de la empresa ya que lista todas las disponibles.
    query = "SELECT REG_Empresa, Nombre_empresa FROM dbo.Principal ORDER BY REG_Empresa"
    resultado = ejecutar_select_query(query)
    
    if resultado['status'] == 'error':
        # Devolvemos un código 500 solo si falla la conexión
        return jsonify(resultado), 500
        
    return jsonify(resultado)

# --- RUTA GENÉRICA PARA OBTENER DATOS DE CUALQUIER VISTA CON FILTRO ---

@app.route('/api/reporte-vista/<view_name>', methods=['GET'])
def reporte_vista_api(view_name):
    """
    Ruta para obtener datos de cualquier vista (Activo/Pasivo/Patrimonio) 
    filtrando por el ID de empresa proporcionado en los argumentos de la URL.
    """
    if not view_name:
        return jsonify({"status": "error", "message": "Nombre de vista no especificado"}), 400
        
    # El ID de la empresa es OBLIGATORIO para filtrar
    empresa_id = request.args.get('empresa_id', type=int)
    
    if not empresa_id:
         return jsonify({"status": "error", "message": "Filtro: empresa_id es requerido."}), 400

    # 1. Construir la consulta SELECT
    # Asumimos que todas las vistas relevantes para el balance tienen una columna llamada 'Empresa'
    # que se refiere a REG_Empresa.
    query = f"SELECT * FROM dbo.{view_name} WHERE Empresa = ?"
    
    # 2. Ejecutar la consulta con el parámetro de seguridad
    resultado = ejecutar_select_query(query, params=[empresa_id])
    
    # Manejo de errores específico
    if resultado['status'] == 'error':
        if 'Invalid object name' in resultado['message']:
             return jsonify({
                "status": "error", 
                "message": f"Error: La vista '{view_name}' no existe o no se encontró en el esquema de la base de datos.",
                "detail": resultado['message']
             }), 404
        return jsonify(resultado), 500 # Otros errores de SQL/Conexión
    
    return jsonify(resultado)

# --- RUTAS OBSOLETAS (SE ELIMINAN) ---
# Se eliminan:
# /api/balance-financiero
# /api/balance-comprobacion
# /api/estado-resultados
# /api/movimientos-cuentas 
# ------------------------------------

if __name__ == '__main__':
    # Usar el puerto 8000 si se ejecuta localmente
    app.run(host='0.0.0.0', port=8000, debug=True)
