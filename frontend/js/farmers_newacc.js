// Minimal JS: prevents default form submission and logs values for potential backend integration.
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('createAccountForm');

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    // collect values (simple example)
    const data = Array.from(form.querySelectorAll('input, select'))
      .filter(el => el.name !== '_') // placeholder filter if needed
      .reduce((acc, el) => {
        const key = el.getAttribute('name') || el.placeholder || el.previousElementSibling?.innerText || el.type;
        acc[key.trim()] = el.value;
        return acc;
      }, {});

    // For now: simple visual confirmation.
    // Replace this with your AJAX/fetch call to Node.js backend.
    console.log('Form data (ready to send to backend):', data);
    // show small in-page confirmation (non-intrusive)
    const saveBtn = form.querySelector('.btn-save');
    saveBtn.innerText = 'SAVED';
    saveBtn.disabled = true;
    setTimeout(() => {
      saveBtn.innerText = 'SAVE';
      saveBtn.disabled = false;
    }, 1200);
  });
});
