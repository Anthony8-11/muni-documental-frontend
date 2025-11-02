// Configuración del entorno
const CONFIG = {
    // URL del backend - se puede sobrescribir con variables de entorno
    API_BASE_URL: window.ENV?.API_BASE_URL || 'http://localhost:3000',
    
    // Configuración de la aplicación
    APP_NAME: 'Gestor Documental Muni Inteligente',
    VERSION: '1.0.0',
    
    // Configuración de archivos
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_FILE_TYPES: [
        'application/pdf',
        'text/plain',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ],
    
    // Configuración de UI
    DOCUMENTS_PER_PAGE: 20,
    SEARCH_DEBOUNCE_MS: 300
};

// Función para obtener la URL completa de la API
const getApiUrl = (endpoint) => {
    return `${CONFIG.API_BASE_URL}${endpoint}`;
};

// Exportar configuración
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
} else {
    window.CONFIG = CONFIG;
    window.getApiUrl = getApiUrl;
}