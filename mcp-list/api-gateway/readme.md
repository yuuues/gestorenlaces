# API Gateway MCP

Gateway para conectar con APIs externas de forma segura y controlada.

## 📋 Descripción

Este MCP actúa como un gateway para interactuar con APIs externas, proporcionando autenticación, rate limiting, y transformación de datos.

## ⚙️ Configuración

### Instalación

```json
{
  "mcpServers": {
    "api-gateway": {
      "command": "node",
      "args": ["path/to/api-gateway-server.js"],
      "env": {
        "API_KEY": "tu_api_key_aqui",
        "RATE_LIMIT": "100"
      }
    }
  }
}
```

### Variables de entorno

```env
API_KEY=your_api_key_here
API_SECRET=your_api_secret_here
RATE_LIMIT=100
TIMEOUT=30000
BASE_URL=https://api.ejemplo.com
```

### Configuración de endpoints

Crea un archivo `endpoints.json`:

```json
{
  "endpoints": [
    {
      "name": "users",
      "path": "/api/v1/users",
      "methods": ["GET", "POST"],
      "auth": "bearer",
      "rateLimit": 50
    },
    {
      "name": "products",
      "path": "/api/v1/products",
      "methods": ["GET"],
      "auth": "apikey",
      "rateLimit": 100
    }
  ]
}
```

## 🚀 Uso

### Comandos disponibles

- `call_api`: Realizar una llamada a la API
- `list_endpoints`: Listar endpoints disponibles
- `get_endpoint_info`: Obtener información de un endpoint específico
- `test_connection`: Probar la conexión con la API

### Ejemplo

```javascript
// Llamar a un endpoint
const response = await apiGateway.callApi({
  endpoint: 'users',
  method: 'GET',
  params: { page: 1, limit: 10 }
});

// Crear un recurso
await apiGateway.callApi({
  endpoint: 'products',
  method: 'POST',
  data: {
    name: 'Nuevo Producto',
    price: 99.99
  }
});
```

## 🔒 Seguridad

### Autenticación

Soporta múltiples métodos de autenticación:
- Bearer Token
- API Key
- OAuth 2.0
- Basic Auth

### Rate Limiting

El gateway implementa rate limiting para proteger las APIs:
- Límite configurable por endpoint
- Reinicio automático de límites
- Respuestas apropiadas cuando se excede el límite

## 📦 Recursos adicionales

- `endpoints.json` - Configuración de endpoints
- `auth-examples/` - Ejemplos de diferentes métodos de autenticación
- `schemas/` - Esquemas de validación para requests/responses

## ⚡ Características

- ✅ Autenticación múltiple
- ✅ Rate limiting configurable
- ✅ Transformación de datos
- ✅ Manejo de errores robusto
- ✅ Logs de peticiones
- ✅ Caché de respuestas
- ✅ Retry automático

## 🏷️ Tags

`api` `gateway` `integration` `rest` `authentication` `http`


