# File System MCP

MCP para operaciones de sistema de archivos con soporte para lectura y escritura.

## 📋 Descripción

Proporciona acceso controlado al sistema de archivos, permitiendo operaciones de lectura, escritura, y gestión de archivos y directorios.

## ⚙️ Configuración

### Instalación

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"],
      "env": {
        "ALLOWED_DIRECTORIES": "/path/to/allowed/dir1,/path/to/allowed/dir2"
      }
    }
  }
}
```

### Variables de entorno

```env
ALLOWED_DIRECTORIES=/home/user/projects,/var/www
MAX_FILE_SIZE=10485760
ENABLE_WRITE=true
```

## 🚀 Uso

### Comandos disponibles

- `read_file`: Leer contenido de un archivo
- `write_file`: Escribir contenido en un archivo
- `list_directory`: Listar contenido de un directorio
- `create_directory`: Crear un nuevo directorio
- `delete_file`: Eliminar un archivo
- `move_file`: Mover o renombrar un archivo

### Ejemplo

```javascript
// Leer un archivo
const content = await filesystem.readFile('/path/to/file.txt');

// Escribir un archivo
await filesystem.writeFile('/path/to/output.txt', 'Contenido nuevo');

// Listar directorio
const files = await filesystem.listDirectory('/path/to/directory');
```

## 🔒 Seguridad

Este MCP requiere configuración explícita de directorios permitidos por seguridad. Solo tendrá acceso a los directorios especificados en `ALLOWED_DIRECTORIES`.

### Restricciones de seguridad

- ✅ Acceso solo a directorios configurados
- ✅ Validación de rutas para prevenir path traversal
- ✅ Límites de tamaño de archivo configurables
- ✅ Control de operaciones de escritura

## 📦 Recursos adicionales

- [Documentación MCP Filesystem](https://github.com/modelcontextprotocol/servers)
- `permissions.example.json` - Ejemplo de configuración de permisos

## 🏷️ Tags

`filesystem` `files` `storage` `io` `directories`


