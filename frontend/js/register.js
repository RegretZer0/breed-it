document.addEventListener('DOMContentLoaded', () => {
  // -------------- Helper: image from uploaded file (optional) --------------
  // Developer note: using uploaded file path as URL; your server/build will
  // convert /mnt/data/... into a public URL as needed.
  const HERO_IMAGE_URL = '/mnt/data/11dbcb6f-aac3-41f1-98a7-21f123f95262.png';


  const heroImgEl = document.getElementById('heroImg');
  if (heroImgEl) {
    heroImgEl.src = HERO_IMAGE_URL;
  }

  // -------------- Toggle password visibility --------------
  const toggleButtons = document.querySelectorAll('.toggle-pass');
  toggleButtons.forEach(btn => {
    btn.addEventListener('click', (ev) => {
      // find the nearest input inside same input-group
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

  // -------------- Determine which form to use --------------
  const form = document.getElementById('registerForm') || document.getElementById('signupForm');
  if (!form) {
    // nothing to attach
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Gather common fields (support both naming variants)
    const fullNameInput = document.getElementById('name') || document.getElementById('fullName') || document.getElementById('fullname');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const confirmInput = document.getElementById('confirm_password') || document.getElementById('confirmPassword');
    const roleSelect = document.getElementById('role') || document.querySelector('select[name="role"]');

    const fullName = fullNameInput ? fullNameInput.value.trim() : '';
    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';
    const confirmPassword = confirmInput ? confirmInput.value : '';
    const role = roleSelect ? roleSelect.value : '';

    // Basic validation
    if (!email || !password) {
      alert('Please complete the form (email and password required).');
      return;
    }


    if (fullNameInput && !fullName) {
      alert('Please provide your full name.');
      return;
    }
    if (roleSelect && !role) {
      alert('Please choose a role.');
      return;
    }

    // If confirm password field exists, check equality
    if (confirmInput && password !== confirmPassword) {
      alert('Passwords do not match.');
      return;
    }

    // Perform registration POST (same as original main JS)
    try {
      const payload = {
        fullName: fullName || undefined,
        email,
        password,
        role: role || undefined
      };

      // Remove undefined fields so server receives only present keys
      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

      const response = await fetch('http://localhost:5000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        // data.message from server preferred, fallback to generic
        throw new Error(data.message || 'Registration failed.');
      }

      // Success - same behavior as original: notify and redirect to login
      alert('Registration successful! Please log in.');
      window.location.href = 'login.html';
    } catch (error) {
      console.error('Registration error:', error);
      alert(error.message || 'An unexpected error occurred.');
    }
  });
});
