document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.getElementById('farmersTbody');
  const filtersForm = document.getElementById('filtersForm');
  const btnSearch = filtersForm.querySelector('.search-btn');

  // Demo dataset — replace by fetching from your API
  const demoFarmers = [
    {
      id: '01',
      name: 'Juan Dela Cruz',
      sex: 'M',
      municipality: 'Torrijos',
      address: 'Barangay Tiquion, Torrijos, Marinduque',
      contact: '09123456789',
      type: 'Breeder',
      farmSize: '00',
      penCount: 2,
      capacity: 6,
      status: 'Activated',
      tag: 'A001',
      date: '2024-10-20'
    },
    {
      id: '02',
      name: 'Maria Santos',
      sex: 'F',
      municipality: 'Boac',
      address: 'Brgy. San Roque, Boac',
      contact: '09129876543',
      type: 'Finisher',
      farmSize: '0.5',
      penCount: 3,
      capacity: 12,
      status: 'Activated',
      tag: 'B101',
      date: '2024-09-12'
    }
  ];

  // Utility: safe text for HTML (very small helper)
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Render rows to table body
  function renderRows(list) {
    tbody.innerHTML = '';
    list.forEach(f => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="fw-bold">${escapeHtml(f.id)}</td>
        <td>${escapeHtml(f.name)}</td>
        <td>${escapeHtml(f.sex)}</td>
        <td>${escapeHtml(f.municipality)}</td>
        <td class="address-muted">${escapeHtml(f.address)}</td>
        <td>${escapeHtml(f.contact)}</td>
        <td>${escapeHtml(f.type)}</td>
        <td>${escapeHtml(f.farmSize)}</td>
        <td>${escapeHtml(String(f.penCount))}</td>
        <td>${escapeHtml(String(f.capacity))}</td>
        <td>${f.status === 'Activated' ? '<span class="badge-activated">Activated</span>' : escapeHtml(f.status)}</td>
        <td class="action-col">
          <button class="btn-view" type="button" aria-label="View farmer ${escapeHtml(f.id)}">VIEW</button>
          <button class="btn-edit" type="button" aria-label="Edit farmer ${escapeHtml(f.id)}">EDIT</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // append spacer rows to emulate empty area in screenshot
    for (let i = 0; i < 4; i++) {
      const spacer = document.createElement('tr');
      spacer.className = 'spacer';
      spacer.innerHTML = '<td colspan="12"></td>';
      tbody.appendChild(spacer);
    }
  }

  // Initial render using demo data
  renderRows(demoFarmers);

  // Optional: Example fetch to get real data from server
  // Uncomment / modify for your backend:
  /*
  async function fetchFarmersFromServer(query = '') {
    const res = await fetch('/api/farmers' + (query ? '?' + query : ''));
    if (!res.ok) throw new Error('Failed to fetch');
    return await res.json(); // expect array of farmer objects
  }
  */

  // Convert FormData to plain object
  function formDataToObj(formData) {
    const out = {};
    for (const [k, v] of formData.entries()) {
      out[k] = v;
    }
    return out;
  }

  // Handle filtersForm submit
  filtersForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(filtersForm);
    const filters = formDataToObj(fd);

    // Small UI feedback on the Search button
    btnSearch.disabled = true;
    btnSearch.setAttribute('aria-busy', 'true');

    // Demo filtering (client-side). Replace with server-side query if needed.
    let result = demoFarmers.slice();

    // Filter by tag (substring)
    if (filters.tag && filters.tag.trim()) {
      const q = filters.tag.trim().toLowerCase();
      result = result.filter(f => (f.tag && f.tag.toLowerCase().includes(q)) || (f.name && f.name.toLowerCase().includes(q)));
    }

    // Date range filter (expects YYYY-MM-DD string compare)
    if (filters.dateFrom) {
      result = result.filter(f => f.date >= filters.dateFrom);
    }
    if (filters.dateTo) {
      result = result.filter(f => f.date <= filters.dateTo);
    }

    // TODO: additional filters for location / pigStatus / sex / phase / typeOfPig
    // Example:
    // if (filters.location && filters.location !== 'Location') { result = result.filter(f => f.municipality === filters.location); }

    // Re-render (or, for real dataset, call fetchFarmersFromServer with query params)
    renderRows(result.length ? result : demoFarmers);

    // restore button state
    setTimeout(() => {
      btnSearch.disabled = false;
      btnSearch.removeAttribute('aria-busy');
    }, 250);
  });

  // Keyboard: press Enter in any filter field triggers the search
  filtersForm.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) {
      e.preventDefault();
      filtersForm.requestSubmit();
    }
  });

  // Delegate action buttons inside the table
  tbody.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    const row = btn.closest('tr');
    if (!row) return;
    const id = row.querySelector('td')?.innerText || '';

    if (btn.classList.contains('btn-view')) {
      // hook to modal or route
      alert(`View farmer ${id}`);
    } else if (btn.classList.contains('btn-edit')) {
      // navigate to edit page
      alert(`Edit farmer ${id}`);
    }
  });

  // Small accessibility helper: focus style for first interactive
  // No-op if no inputs
  const firstInput = filtersForm.querySelector('input, select, button');
  if (firstInput) firstInput.setAttribute('autocomplete', 'off');
});
