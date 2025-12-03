document.addEventListener('DOMContentLoaded', () => {
  // Local uploaded image path (will be transformed to a public URL by your pipeline)
  const HERO_IMAGE_URL = '/mnt/data/11dbcb6f-aac3-41f1-98a7-21f123f95262.png';

  // Set hero image if present
  const heroImgEl = document.getElementById('heroImg');
  if (heroImgEl) heroImgEl.src = HERO_IMAGE_URL;

  // Password toggle (supports multiple toggles)
  const toggleButtons = Array.from(document.querySelectorAll('.toggle-pass, .toggle-password, .pwd-toggle'));
  toggleButtons.forEach(btn => {
    // avoid double-binding
    if (btn.dataset.toggleAttached) return;
    btn.dataset.toggleAttached = 'true';

    btn.addEventListener('click', () => {
      // find nearest input (works if toggle inside .input-group, or targets #password)
      const input =
        btn.closest('.input-group')?.querySelector('input[type="password"], input[type="text"]') ||
        document.querySelector('input#password') ||
        (btn.dataset.target && document.querySelector(btn.dataset.target));
      const icon = btn.querySelector('i');
      if (!input) return;

      if (input.type === 'password') {
        input.type = 'text';
        if (icon) { icon.classList.remove('fa-eye'); icon.classList.add('fa-eye-slash'); }
      } else {
        input.type = 'password';
        if (icon) { icon.classList.remove('fa-eye-slash'); icon.classList.add('fa-eye'); }
      }
    });
  });

  // Main login form handler
  const form = document.getElementById('loginForm');
  if (!form) return;

  // Prevent double-binding
  if (form.dataset.handlerAttached) return;
  form.dataset.handlerAttached = 'true';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Native validation (required, type=email, etc.)
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const emailEl = document.getElementById('email');
    const pwdEl = document.getElementById('password');
    const messageEl = document.getElementById('message');

    const showMessage = (text, color = 'black', alertFallback = false) => {
      if (messageEl) {
        messageEl.style.color = color;
        messageEl.textContent = text;
      }
      if (alertFallback && !messageEl) {
        alert(text);
      }
    };

    const email = emailEl ? emailEl.value.trim() : '';
    const password = pwdEl ? pwdEl.value : '';

    if (!email || !password) {
      showMessage('Please fill in both fields.', 'red', true);
      return;
    }

    showMessage('Logging in...', 'black');

    try {
      const res = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const raw = await res.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (parseErr) {
        console.error('Non-JSON response from server:', raw);
        throw new Error(raw ? raw.slice(0, 300) : 'Server returned invalid response.');
      }

      // Map common HTTP statuses to friendly messages
      if (!res.ok) {
        let friendly;
        if (res.status === 400) {
          friendly = data.message || 'Bad request. Please check your input.';
        } else if (res.status === 401) {
          friendly = data.message || 'Invalid credentials. Please check your email and password.';
        } else if (res.status === 404) {
          friendly = data.message || 'No user found with that email.';
        } else if (res.status >= 500) {
          friendly = data.message || 'Server error. Please try again later.';
        } else {
          friendly = data.message || 'Login failed. Please try again.';
        }

        if (data.errors && Array.isArray(data.errors) && data.errors.length) {
          friendly += ' ' + data.errors.map(e => e.msg || e).join('; ');
        }

        showMessage(friendly, 'red', true);
        return;
      }

      // If server explicitly returned success:false
      if (data && data.success === false) {
        const friendly = data.message || 'Login unsuccessful. Please check your credentials.';
        showMessage(friendly, 'red', true);
        return;
      }

      // Persist auth info (defensive)
      try {
        if (data.token) localStorage.setItem('token', data.token);
        if (data.role) localStorage.setItem('role', data.role);
        if (data.user && data.user._id) localStorage.setItem('userId', data.user._id);
        if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
      } catch (storageErr) {
        console.warn('Could not write to localStorage:', storageErr);
      }

      showMessage('Login successful! Redirecting...', 'green');

      // Redirect based on role
      setTimeout(() => {
        if (data.role === 'admin') {
          window.location.href = 'admin_dashboard.html';
        } else if (data.role === 'farmer') {
          window.location.href = 'farmer_dashboard.html';
        } else if (data.role) {
          // Fallback generic dashboard
          window.location.href = 'dashboard.html';
        } else {
          showMessage('Unknown role. Please contact admin.', 'red', true);
        }
      }, 800);

    } catch (err) {
      console.error('Login error:', err);
      const msg = err && err.message ? err.message : 'An unexpected error occurred.';
      showMessage(msg, 'red', true);
    }
  });
});
