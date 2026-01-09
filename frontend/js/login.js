document.addEventListener('DOMContentLoaded', () => {
  /* =========================
     HERO IMAGE
  ========================== */
  const HERO_IMAGE_URL = '/images/hero.png';

  const heroImgEl = document.getElementById('heroImg');
  if (heroImgEl) {
    heroImgEl.src = HERO_IMAGE_URL;
  }

  /* =========================
     PASSWORD TOGGLE (UI ONLY)
  ========================== */
  const toggleButtons = document.querySelectorAll(
    '.toggle-pass, .toggle-password, .pwd-toggle'
  );

  toggleButtons.forEach(btn => {
    if (btn.dataset.toggleAttached) return;
    btn.dataset.toggleAttached = 'true';

    btn.addEventListener('click', () => {
      const input =
        btn.closest('.input-group')
          ?.querySelector('input[type="password"], input[type="text"]') ||
        document.getElementById('password');

      if (!input) return;

      const icon = btn.querySelector('i');

      if (input.type === 'password') {
        input.type = 'text';
        icon?.classList.replace('fa-eye', 'fa-eye-slash');
      } else {
        input.type = 'password';
        icon?.classList.replace('fa-eye-slash', 'fa-eye');
      }
    });
  });

  /* =========================
     LOGIN FORM HANDLER
  ========================== */
  const form = document.getElementById('loginForm');
  if (!form) return;

  if (form.dataset.handlerAttached) return;
  form.dataset.handlerAttached = 'true';

  const messageEl = document.getElementById('message');

  const showMessage = (text, color = 'black', fallback = false) => {
    if (messageEl) {
      messageEl.style.color = color;
      messageEl.textContent = text;
    } else if (fallback) {
      alert(text);
    }
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const email = document.getElementById('email')?.value.trim();
    const password = document.getElementById('password')?.value;

    if (!email || !password) {
      showMessage('Please fill in both fields.', 'red', true);
      return;
    }

    showMessage('Logging in...');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const raw = await res.text();
      let data;

      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        console.error('Invalid JSON:', raw);
        throw new Error('Server returned invalid response.');
      }

      if (!res.ok || data.success === false) {
        const msg =
          data.message ||
          (res.status === 401
            ? 'Invalid email or password.'
            : res.status === 404
            ? 'User not found.'
            : 'Login failed.');

        showMessage(msg, 'red', true);
        return;
      }

      /* =========================
         STORE AUTH DATA
      ========================== */
      try {
        if (data.token) localStorage.setItem('token', data.token);
        if (data.user?._id) localStorage.setItem('userId', data.user._id);
        if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
      } catch (err) {
        console.warn('LocalStorage error:', err);
      }

      /* =========================
         RESOLVE ROLE (SOURCE OF TRUTH)
      ========================== */
      const resolvedRole =
        data.role || data.user?.role || 'farmer';

      localStorage.setItem('role', resolvedRole);

      showMessage('Login successful! Redirecting...', 'green');

      /* =========================
         ROLE-BASED REDIRECT
      ========================== */
      setTimeout(() => {
        if (resolvedRole === 'admin') {
          window.location.href = '/admin_dashboard';
        } else if (resolvedRole === 'farmer') {
          window.location.href = '/farmer_dashboard';
        } else {
          window.location.href = '/landing_page';
        }
      }, 800);

    } catch (err) {
      console.error('Login error:', err);
      showMessage(err.message || 'Unexpected error occurred.', 'red', true);
    }
  });
});
