# SQL Server MCP

Conector MCP para bases de datos SQL Server, permite consultas y gestión de bases de datos.

## 📋 Descripción

Este MCP proporciona una interfaz completa para interactuar con bases de datos SQL Server, incluyendo consultas, gestión de tablas y operaciones CRUD.

## ⚙️ Configuración

### Instalación

```json
{
  "mcpServers": {
    "mcp-sql": {
      "command": "npx",
      "args": ["-y", "mcp-sql-server"]
    }
  }
}
```

### Variables de entorno

Crea un archivo `.env` con las siguientes variables:

```env
SQL_SERVER_HOST=localhost
SQL_SERVER_PORT=1433
SQL_SERVER_USER=sa
SQL_SERVER_PASSWORD=tu_password
SQL_SERVER_DATABASE=master
```

### Archivo de configuración

Opcionalmente, puedes usar un archivo `config.yaml`:

```yaml
servers:
  - name: production
    host: prod-sql.empresa.com
    port: 1433
    user: app_user
    database: production_db
    
  - name: development
    host: localhost
    port: 1433
    user: dev_user
    database: dev_db
```

## 🚀 Uso

### Comandos disponibles

- `list_configured_servers`: Lista todos los servidores configurados
- `get_databases`: Obtiene las bases de datos de un servidor
- `get_tables`: Lista las tablas de una base de datos
- `describe_table`: Describe la estructura de una tabla
- `query_table_with_columns`: Consulta columnas específicas

### Ejemplo

```sql
-- Listar tablas
SELECT * FROM information_schema.tables;

-- Consultar datos
SELECT id, name, email FROM users WHERE active = 1;
```

## 📦 Recursos adicionales

- [SQL Server Docs](https://docs.microsoft.com/sql/)
- `config.example.yaml` - Archivo de ejemplo de configuración
- `queries/` - Carpeta con consultas de ejemplo

## 🔒 Seguridad

⚠️ **Importante**: Nunca compartas tus credenciales de base de datos. Usa variables de entorno y mantén el archivo `.env` fuera del control de versiones.

## 🏷️ Tags

`database` `sql` `server` `queries` `data-management`


