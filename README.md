# 🎨 Muni Documental Frontend

Frontend del Gestor Documental Municipal Inteligente con diseño contemporáneo.

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Netlify](https://img.shields.io/badge/Netlify-00C7B7?style=for-the-badge&logo=netlify&logoColor=white)

## 🌟 Características

- **🎨 Diseño contemporáneo** con efectos glass morphism
- **📱 Totalmente responsive** - mobile first
- **⚡ Vanilla JavaScript** - sin frameworks, ultra rápido
- **🔐 Autenticación integrada** con Supabase
- **📄 Gestión de documentos** con drag & drop
- **🔍 Búsqueda en tiempo real** con filtros avanzados
- **🤖 Chat con IA** para análisis de documentos

## 🚀 Despliegue Rápido

### Netlify (Recomendado)

1. Fork este repositorio
2. Conecta con Netlify
3. Configura la variable de entorno
4. Deploy automático

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy)

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone)

## ⚙️ Configuración

### Variables de Entorno

Crear archivo `env.production.js`:

```javascript
window.ENV = {
    API_BASE_URL: 'https://tu-backend-url.railway.app'
};
```

### Para Netlify

En el panel de Netlify, ir a Site settings > Environment variables:

```
API_BASE_URL = https://tu-backend-url.railway.app
```

Luego crear un archivo `_headers` con:

```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```

## 🛠️ Desarrollo Local

```bash
# Clonar repositorio
git clone <url-del-repo>
cd muni-documental-frontend

# Crear configuración local
cp env.example.js env.local.js
# Editar env.local.js con la URL de tu backend local

# Servir archivos estáticos (Python)
python -m http.server 3000

# O con Node.js (si está instalado)
npx serve . -p 3000

# O simplemente abrir index.html en el navegador
```

## 📁 Estructura del Proyecto

```
muni-documental-frontend/
├── index.html              # Página de login
├── dashboard.html           # Dashboard principal
├── assets/
│   ├── css/
│   │   └── style.css       # Estilos principales con diseño contemporáneo
│   └── js/
│       ├── config.js       # Configuración de la app
│       ├── auth.js         # Lógica de autenticación
│       └── main.js         # Lógica principal del dashboard
├── env.example.js          # Ejemplo de configuración
├── env.production.js       # Configuración de producción
└── README.md              # Esta documentación
```

## 🎨 Características del Diseño

### Glass Morphism
- Fondos translúcidos con blur
- Bordes suaves y sombras elegantes
- Efectos de profundidad modernos

### Animaciones Suaves
- Transiciones de 0.3s en elementos interactivos
- Hover effects con elevación
- Animaciones de entrada para contenido dinámico

### Responsive Design
- Mobile first approach
- Breakpoints: 768px, 480px
- Elementos adaptativos según dispositivo

### Paleta de Colores
- Primario: #667eea (púrpura-azul suave)
- Secundario: #764ba2 (púrpura elegante)
- Acento: #f093fb (rosa suave)
- Éxito: #4ecdc4 (teal moderno)

## 🔧 Personalización

### Cambiar Colores

Editar variables CSS en `assets/css/style.css`:

```css
:root {
    --primary-color: #667eea;
    --secondary-color: #764ba2;
    --accent-color: #f093fb;
    /* ... más colores */
}
```

### Configurar Backend

Editar `env.production.js` o crear `env.local.js`:

```javascript
window.ENV = {
    API_BASE_URL: 'https://tu-backend-personalizado.com'
};
```

## 📱 Compatibilidad

- ✅ Chrome 80+
- ✅ Firefox 75+
- ✅ Safari 13+
- ✅ Edge 80+
- ✅ Dispositivos móviles iOS/Android

## 🚀 Plataformas de Despliegue

### Estáticos (Recomendado)
- **Netlify** ⭐ (CI/CD integrado)
- **Vercel** ⭐ (Deploy automático)
- **GitHub Pages**
- **AWS S3 + CloudFront**

### Tradicionales
- **Apache/Nginx** en VPS
- **Firebase Hosting**
- **Surge.sh**

## 🔒 Características de Seguridad

- Headers de seguridad HTTP
- Validación de formularios
- Sanitización de inputs
- Token refresh automático
- Logout automático en inactividad

## 📊 Performance

- **Carga inicial**: < 2 segundos
- **First Contentful Paint**: < 1.5s
- **Time to Interactive**: < 3s
- **Lighthouse Score**: 90+

## 🤝 Contribución

1. Fork el proyecto
2. Crear rama feature (`git checkout -b feature/AmazingFeature`)
3. Commit cambios (`git commit -m 'Add AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abrir Pull Request

## 📄 Licencia

MIT License - ver archivo [LICENSE](LICENSE) para detalles.

## 🆘 Soporte

¿Problemas con el despliegue?

1. Verificar configuración de CORS en el backend
2. Confirmar URL del backend en variables de entorno
3. Revisar consola del navegador para errores
4. [Abrir un issue](../../issues) si persiste el problema

---

## 🔗 Enlaces Relacionados

- [Backend Repository](https://github.com/tu-usuario/muni-documental-backend)
- [Documentación Técnica](./TECHNICAL_DOCS.md)
- [Demo en Vivo](https://muni-documental.netlify.app)