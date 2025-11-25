document.addEventListener('DOMContentLoaded', () => {
  // Optional hero image (uploaded file path; your pipeline will map it to a public URL)
  const HERO_IMAGE_URL = '/mnt/data/11dbcb6f-aac3-41f1-98a7-21f123f95262.png';
  const heroImgEl = document.getElementById('heroImg');
  if (heroImgEl) heroImgEl.src = HERO_IMAGE_URL;

  // Password toggle (supports multiple toggles)
  const toggleButtons = document.querySelectorAll('.toggle-pass, .toggle-password, .pwd-toggle');
  toggleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
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

  // Main login form
  const form = document.getElementById('loginForm');
  if (!form) return;

  // Prevent double-binding
  if (form.dataset.mergedHandlerAttached) return;
  form.dataset.mergedHandlerAttached = 'true';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const emailEl = document.getElementById('email');
    const pwdEl = document.getElementById('password');
    const messageEl = document.getElementById('message');

    const showMessage = (text, color = 'black', useAlertFallback = false) => {
      if (messageEl) {
        messageEl.style.color = color;
        messageEl.textContent = text;
      }
      if (useAlertFallback && !messageEl) {
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

      // read raw text to defend against non-JSON responses
      const raw = await res.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch (parseErr) {
        console.error('Non-JSON response:', raw);
        // If the server returned plain text that gives a clue, surface it
        const textMsg = raw ? raw.slice(0, 200) : 'Server returned invalid response.';
        throw new Error(textMsg);
      }

      // Helpful, specific error mapping
      if (!res.ok) {
        // Common HTTP status based messages
        let friendly;
        if (res.status === 400) {
          friendly = data.message || 'Bad request. Please check your input.';
        } else if (res.status === 401) {
          // unauthorized: invalid credentials
          friendly = data.message || 'Invalid credentials. Please check your email and password.';
        } else if (res.status === 404) {
          // not found: no user
          friendly = data.message || 'No user found with that email.';
        } else if (res.status >= 500) {
          friendly = data.message || 'Server error. Please try again later.';
        } else {
          friendly = data.message || 'Login failed. Please try again.';
        }

        // Optionally include validation errors array if present
        if (data.errors && Array.isArray(data.errors) && data.errors.length) {
          friendly += ' ' + data.errors.map(e => e.msg || e).join('; ');
        }

        // show the message and bail out
        showMessage(friendly, 'red', true);
        return;
      }

      // If server returned success flag but explicitly false
      if (data && data.success === false) {
        const friendly = data.message || 'Login unsuccessful. Please check your credentials.';
        showMessage(friendly, 'red', true);
        return;
      }


      try {
        if (data.token) localStorage.setItem('token', data.token);
        if (data.role) localStorage.setItem('role', data.role);
        if (data.user && data.user._id) localStorage.setItem('userId', data.user._id);
        if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
      } catch (storageErr) {
        console.warn('localStorage unavailable:', storageErr);
      }

      showMessage('Login successful! Redirecting...', 'green');

      // Redirect by role after short pause
      setTimeout(() => {
        if (data.role === 'admin') {
          window.location.href = 'admin_dashboard.html';
        } else if (data.role === 'farmer') {
          window.location.href = 'farmer_dashboard.html';
        } else if (data.role) {
          // Known role but no dedicated page
          showMessage('Logged in. Redirecting...', 'green');
          // fallback: go to generic dashboard if exists
          window.location.href = 'dashboard.html';
        } else {
          showMessage('Unknown role. Please contact admin.', 'red', true);
        }
      }, 800);

    } catch (err) {
      // Final catch: network errors or thrown friendly errors above
      console.error('Login error:', err);
      const userMsg = err && err.message ? err.message : 'An unexpected error occurred.';
      showMessage(userMsg, 'red', true);
    }
  });
});
