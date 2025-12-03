document.addEventListener('DOMContentLoaded', () => {
  // Local uploaded image path (will be transformed to a public URL by your pipeline)
  const HERO_IMAGE_URL = '/mnt/data/11dbcb6f-aac3-41f1-98a7-21f123f95262.png';

  // If an img with id="heroImg" exists, set its src
  const heroImgEl = document.getElementById('heroImg');
  if (heroImgEl) heroImgEl.src = HERO_IMAGE_URL;

  // Password toggle for any .toggle-pass button
  const toggleButtons = Array.from(document.querySelectorAll('.toggle-pass'));
  toggleButtons.forEach(btn => {
    // prevent adding multiple listeners if scripts re-run
    if (btn.dataset.toggleAttached) return;
    btn.dataset.toggleAttached = 'true';

    btn.addEventListener('click', (ev) => {
      // find the nearest input inside the same input-group
      const input = btn.closest('.input-group')?.querySelector('input');
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

  // Select the form (support both ids)
  const form = document.getElementById('signupForm') || document.getElementById('registerForm');
  if (!form) return;

  // Avoid double-binding the submit handler
  if (form.dataset.handlerAttached) return;
  form.dataset.handlerAttached = 'true';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // 1) Run native browser validation first
    // This will respect required, type="email", pattern, etc.
    if (!form.checkValidity()) {
      // show browser UI
      form.reportValidity();
      return;
    }

    // 2) Read fields (support current markup)
    const firstNameEl = document.getElementById('firstname');
    const lastNameEl = document.getElementById('lastname');
    const emailEl = document.getElementById('email');
    const phoneEl = document.getElementById('phone');
    const passwordEl = document.getElementById('password');
    const confirmEl = document.getElementById('confirm_password');

    const firstName = firstNameEl ? firstNameEl.value.trim() : '';
    const lastName = lastNameEl ? lastNameEl.value.trim() : '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    const email = emailEl ? emailEl.value.trim() : '';
    const phone = phoneEl ? phoneEl.value.trim() : '';
    const password = passwordEl ? passwordEl.value : '';
    const confirmPassword = confirmEl ? confirmEl.value : '';

    // 3) Role handling: read checked radio (preferred) or fallback to select#role
    const role = (document.querySelector('input[name="role"]:checked')?.value) ||
                 (document.getElementById('role') ? document.getElementById('role').value : '') ||
                 '';

    // 4) Additional JS checks (confirm password, role presence, name presence)
    if ((firstNameEl || lastNameEl) && !fullName) {
      alert('Please provide your full name.');
      return;
    }

    if (!role) {
      // This should rarely happen because native validation should block,
      // but we keep a JS guard for robustness.
      alert('Please select a role.');
      return;
    }

    if (confirmEl && password !== confirmPassword) {
      alert('Passwords do not match.');
      return;
    }

    // 5) Build payload
    const payload = {
      fullName: fullName || undefined,
      email,
      password,
      role: role || undefined
    };
    if (phone) payload.phone = phone;

    // Remove undefined keys
    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

    // 6) POST to server
    try {
      const response = await fetch('http://localhost:5000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // try parse JSON, but handle non-JSON gracefully
      const text = await response.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        console.error('Non-JSON response from server:', text);
      }

      if (!response.ok) {
        // derive friendly message
        const msg = data?.message || (text ? text.slice(0, 300) : 'Registration failed.');
        throw new Error(msg);
      }

      // success
      alert('Registration successful! Please log in.');
      window.location.href = 'login.html';
    } catch (err) {
      console.error('Registration error:', err);
      // show either server-sent message or generic
      alert(err.message || 'An unexpected error occurred.');
    }
  });
});
