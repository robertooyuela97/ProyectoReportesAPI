import os 
import pyodbc
from flask import Flask, jsonify, request, render_template 
from flask_cors import CORS
import json

# Ruta absoluta de templates
# El canvas de desarrollo usa un sistema de archivos virtual, pero esta línea
# asegura que Flask encuentre la carpeta 'templates' si existiera.
template_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), 'templates'))

app = Flask(
    __name__, 
    template_folder=template_dir, 
    static_folder='static', 
    static_url_path='/static'
)
CORS(app)

# --- Configuracion de Azure SQL (USANDO VARIABLES DE ENTORNO) ---
# Usamos variables de entorno para las credenciales, un estándar de seguridad.
# Estas variables deben ser configuradas en el entorno de ejecución (Ej: Canvas).
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
    Garantiza la seguridad mediante el uso de parámetros para evitar inyección SQL.
    """
    conn = None
    try:
        conn = pyodbc.connect(CONNECTION_STRING)
        cursor = conn.cursor()
        
        # Ejecutar la query con parámetros para seguridad
        cursor.execute(query, params or [])
        
        column_names = [column[0] for column in cursor.description] if cursor.description else []
        
        reporte_data = []
        for row in cursor.fetchall():
            # Convertir a diccionario y asegurar la serialización JSON (convierte non-None a str)
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
        # Devolvemos un error con detalle para facilitar la depuración
        if 'Login failed' in error_msg or 'ODBC Driver' in error_msg or 'firewall' in error_msg:
             return {"status": "error", "message": "Fallo de Conexión/Credenciales/Driver. Revise las variables de entorno.", "detail": error_msg}
        return {"status": "error", "message": message}
        
    finally:
        if conn:
            conn.close()

@app.route('/')
def home():
    """Ruta principal que sirve la interfaz web."""
    # En un entorno de desarrollo Canvas, 'index.html' es el archivo HTML principal
    return render_template('index.html') 

# --- RUTA PARA OBTENER LA LISTA DE EMPRESAS ---

@app.route('/api/empresas', methods=['GET'])
def obtener_empresas_api():
    """Endpoint: Obtiene la lista de empresas (REG_Empresa y Nombre_empresa) de la tabla Principal."""
    query = "SELECT REG_Empresa, Nombre_empresa FROM dbo.Principal ORDER BY REG_Empresa"
    resultado = ejecutar_select_query(query)
    
    # Devolvemos 500 si hay un error de conexión/SQL
    if resultado['status'] == 'error':
        return jsonify(resultado), 500
        
    return jsonify(resultado)

# --- RUTA GENÉRICA PARA OBTENER DATOS DE CUALQUIER VISTA CON FILTRO ---

@app.route('/api/reporte-vista/<view_name>', methods=['GET'])
def reporte_vista_api(view_name):
    """
    Endpoint: Obtiene datos de cualquier vista (Activo/Pasivo/Patrimonio) 
    filtrando por el ID de empresa.
    """
    if not view_name:
        return jsonify({"status": "error", "message": "Nombre de vista no especificado"}), 400
        
    # El ID de la empresa es OBLIGATORIO (Empresa es el filtro principal)
    # Se espera un argumento de consulta '?empresa_id=<ID>'
    empresa_id = request.args.get('empresa_id', type=int)
    
    if not empresa_id:
         return jsonify({"status": "error", "message": "Filtro: empresa_id es requerido."}), 400

    # 1. Construir la consulta SELECT usando el nombre de la vista y un placeholder '?'
    # Asumimos que todas las vistas relevantes tienen una columna llamada 'Empresa' que apunta a REG_Empresa
    query = f"SELECT * FROM dbo.{view_name} WHERE Empresa = ?"
    
    # 2. Ejecutar la consulta con el parámetro de seguridad
    resultado = ejecutar_select_query(query, params=[empresa_id])
    
    # Manejo de errores específico
    if resultado['status'] == 'error':
        # Error 404 si la vista no existe
        if 'Invalid object name' in resultado.get('detail', ''):
             return jsonify({
                "status": "error", 
                "message": f"Error: La vista '{view_name}' no existe o no se encontró.",
                "detail": resultado['detail']
             }), 404
        return jsonify(resultado), 500 # Otros errores de SQL/Conexión
    
    return jsonify(resultado)

if __name__ == '__main__':
    # Ejecuta la aplicación Flask en el puerto 8000
    app.run(host='0.0.0.0', port=8000, debug=True)
