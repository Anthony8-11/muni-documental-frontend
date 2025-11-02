// Importar configuración (se debe cargar config.js antes que este archivo)
const API_BASE_URL = window.CONFIG?.API_BASE_URL || 'http://localhost:3000';

// UI toggles: show signin by default, allow switching to signup
document.addEventListener('DOMContentLoaded', () => {
    const signupSection = document.getElementById('signup-section');
    const signinSection = document.getElementById('signin-section');
    const showSignupBtn = document.getElementById('show-signup-btn');
    const showSigninBtn = document.getElementById('show-signin-btn');

    function showSignup() {
        if (signupSection) signupSection.style.display = 'block';
        if (signinSection) signinSection.style.display = 'none';
    }

    function showSignin() {
        if (signupSection) signupSection.style.display = 'none';
        if (signinSection) signinSection.style.display = 'block';
    }

    if (showSignupBtn) showSignupBtn.addEventListener('click', (e) => { e.preventDefault(); showSignup(); });
    if (showSigninBtn) showSigninBtn.addEventListener('click', (e) => { e.preventDefault(); showSignin(); });
});

// Lógica para el formulario de registro
document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        if (response.ok) {
            const data = await response.json();
            // Try to get token from signup response
            let token = data?.session?.access_token || data?.access_token;

            // If no token returned, attempt client-side signin fallback to ensure automatic login
            if (!token) {
                try {
                    const signinResp = await fetch(`${API_BASE_URL}/api/auth/signin`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ email, password })
                    });

                    if (signinResp.ok) {
                        const signinData = await signinResp.json();
                        token = signinData?.session?.access_token || signinData?.access_token;
                    } else {
                        console.warn('Fallback signin failed after signup:', await signinResp.text());
                    }
                } catch (err) {
                    console.error('Fallback signin error:', err);
                }
            }

            if (token) {
                localStorage.setItem('accessToken', token);
                // Save refresh token if provided
                const refresh = data?.session?.refresh_token || data?.refresh_token || null;
                if (refresh) localStorage.setItem('refreshToken', refresh);
                window.location.href = 'dashboard.html';
            } else {
                // As a last resort, inform the user but don't block them from trying to sign in
                alert('Registro exitoso. No se pudo iniciar sesión automáticamente; por favor inicia sesión.');
                window.location.href = 'index.html';
            }
        } else {
            // If email already exists, backend returns 409 with a helpful message
            if (response.status === 409) {
                try {
                    const err = await response.json();
                    alert(err.error || 'El correo ya existe, utiliza otro');
                } catch (parseErr) {
                    alert('El correo ya existe, utiliza otro');
                }
            } else {
                alert('Error en el registro. Verifica tus datos.');
            }
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error de conexión.');
    }
});

// Lógica para el formulario de inicio de sesión
document.getElementById('signin-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('signin-email').value;
    const password = document.getElementById('signin-password').value;

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/signin`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        if (response.ok) {
            const data = await response.json();
            const token = data?.session?.access_token || data?.access_token;
            if (token) {
                localStorage.setItem('accessToken', token);
                const refresh = data?.session?.refresh_token || data?.refresh_token || null;
                if (refresh) localStorage.setItem('refreshToken', refresh);
                window.location.href = 'dashboard.html';
            } else {
                console.warn('No access token returned from signin response:', data);
                alert('Inicio de sesión correcto pero no se recibió token. Intenta iniciar sesión de nuevo.');
            }
        } else {
            alert('Credenciales inválidas.');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error de conexión.');
    }
});