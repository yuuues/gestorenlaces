# MCPs - Model Context Protocols

Esta carpeta contiene la información de todos los MCPs (Model Context Protocols) disponibles en la empresa.

## 📋 Estructura

```
mcp-list/
├── data.json                    # Lista de todos los MCPs disponibles
├── README.md                    # Este archivo
├── [nombre-mcp]/                # Carpeta para cada MCP
│   ├── readme.md                # Documentación principal del MCP
│   └── [archivos-adicionales]   # Archivos de configuración, ejemplos, etc.
```

## 🔧 Cómo agregar un nuevo MCP

### 1. Crear la carpeta del MCP

Crea una nueva carpeta con el nombre del MCP (usa kebab-case):

```bash
mkdir mcp-list/nombre-del-mcp
```

### 2. Crear el archivo readme.md

Dentro de la carpeta, crea un `readme.md` con la siguiente estructura recomendada:

```markdown
# Nombre del MCP

Descripción breve del MCP.

## 📋 Descripción

Descripción detallada del MCP y sus funcionalidades.

## ⚙️ Configuración

### Instalación

```json
{
  "mcpServers": {
    "nombre-mcp": {
      "command": "npx",
      "args": ["-y", "nombre-del-paquete"]
    }
  }
}
```

### Variables de entorno

Listado de variables de entorno necesarias.

## 🚀 Uso

Ejemplos de uso del MCP.

## 📦 Recursos adicionales

Enlaces a documentación, repositorios, etc.

## 🏷️ Tags

`tag1` `tag2` `tag3`
```

### 3. Agregar archivos adicionales (opcional)

Puedes agregar archivos de configuración de ejemplo, scripts, esquemas, etc:

```bash
# Ejemplos
mcp-list/nombre-del-mcp/config.example.yaml
mcp-list/nombre-del-mcp/schema.json
mcp-list/nombre-del-mcp/.env.example
```

Estos archivos se mostrarán automáticamente en la interfaz y podrán ser descargados.

### 4. Actualizar data.json

Agrega una entrada en `data.json` con la información del nuevo MCP:

```json
{
  "id": "nombre-del-mcp",
  "name": "Nombre Descriptivo del MCP",
  "description": "Descripción breve del MCP para la tarjeta",
  "folder": "nombre-del-mcp",
  "icon": "🔧",
  "tags": ["tag1", "tag2", "tag3"]
}
```

#### Campos del data.json:

- **id**: Identificador único del MCP (mismo que el nombre de la carpeta)
- **name**: Nombre descriptivo para mostrar en la interfaz
- **description**: Descripción breve (1-2 líneas) para la tarjeta
- **folder**: Nombre de la carpeta del MCP
- **icon**: Emoji que representa el MCP
- **tags**: Array de tags para filtrado y búsqueda

#### Emojis recomendados:

- 📚 Documentación
- 🗄️ Bases de datos
- 📁 Archivos
- 🌐 APIs/Web
- 🔧 Herramientas
- 🔒 Seguridad
- 📊 Datos/Analytics
- 🤖 AI/ML
- 📨 Mensajería
- 🔌 Conectores
- ⚡ Performance
- 🐳 Docker/Containers
- ☁️ Cloud

### 5. Verificar

1. Reinicia el servidor si está en ejecución
2. Navega a la pestaña "MCPs" en la aplicación
3. Verifica que tu nuevo MCP aparece en el listado
4. Haz clic en la tarjeta para verificar que el README se muestra correctamente
5. Comprueba que los archivos adicionales aparecen en el sidebar

## 📝 Ejemplo completo

### 1. Crear carpeta y archivos

```bash
mkdir mcp-list/github-mcp
cd mcp-list/github-mcp
```

### 2. Crear readme.md

```markdown
# GitHub MCP

MCP para interactuar con la API de GitHub.

## 📋 Descripción

Este MCP permite realizar operaciones con repositorios, issues, pull requests y más.

## ⚙️ Configuración

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@github/mcp-server"],
      "env": {
        "GITHUB_TOKEN": "tu_token_aqui"
      }
    }
  }
}
```

## 🚀 Uso

```javascript
// Listar repositorios
const repos = await github.listRepos({ org: 'empresa' });

// Crear issue
await github.createIssue({
  repo: 'proyecto',
  title: 'Nuevo issue',
  body: 'Descripción del issue'
});
```

## 🏷️ Tags

`github` `git` `api` `version-control`
```

### 3. Crear .env.example

```env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITHUB_ORG=mi-organizacion
```

### 4. Actualizar data.json

```json
{
  "id": "github-mcp",
  "name": "GitHub MCP",
  "description": "Integración con GitHub para gestión de repositorios, issues y pull requests",
  "folder": "github-mcp",
  "icon": "🐙",
  "tags": ["github", "git", "api", "version-control"]
}
```

## 🎨 Mejores prácticas

1. **Usa nombres descriptivos**: Los nombres de carpeta deben ser claros y en kebab-case
2. **Documenta bien**: Incluye ejemplos claros en el README
3. **Archivos de ejemplo**: Siempre incluye archivos `.example` para configuraciones sensibles
4. **Tags relevantes**: Usa tags que faciliten la búsqueda
5. **Emojis consistentes**: Usa emojis que representen bien la funcionalidad
6. **Mantén actualizado**: Actualiza la documentación cuando cambien las configuraciones

## 🔍 Tags comunes

- `documentation` - Para MCPs de documentación
- `database` - Para conectores de bases de datos
- `api` - Para integraciones con APIs
- `filesystem` - Para operaciones con archivos
- `cloud` - Para servicios en la nube
- `security` - Para herramientas de seguridad
- `development` - Para herramientas de desarrollo
- `integration` - Para integradores y conectores

## ❓ Preguntas frecuentes

### ¿Puedo usar markdown avanzado en el readme?

Sí, aunque el renderizado es básico. Se soporta:
- Headers (h1, h2, h3)
- Bold y cursiva
- Code blocks y inline code
- Links
- Listas (con formato HTML)

### ¿Cómo organizo múltiples archivos?

Puedes crear subcarpetas dentro del MCP:

```
mcp-list/nombre-mcp/
├── readme.md
├── examples/
│   ├── basic.js
│   └── advanced.js
├── schemas/
│   └── config.schema.json
└── templates/
    └── config.template.yaml
```

Todos los archivos (incluyendo los de subcarpetas) estarán disponibles para descarga.

### ¿Cómo actualizo un MCP existente?

1. Edita los archivos en la carpeta del MCP
2. Si cambias el nombre o descripción, actualiza `data.json`
3. Los cambios se reflejarán automáticamente al recargar la página

## 📞 Soporte

Si tienes problemas o sugerencias, contacta al equipo de desarrollo.


