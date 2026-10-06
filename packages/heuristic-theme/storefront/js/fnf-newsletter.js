(function () {
  function feedback(form, msg, isError) {
    var note = form.querySelector('.fnf-nl-note');
    if (!note) {
      note = document.createElement('div');
      note.className = 'fnf-nl-note';
      note.style.cssText = 'margin-top:8px;font-size:13px;font-weight:600;';
      form.appendChild(note);
    }
    note.textContent = msg;
    note.style.color = isError ? '#ff6b4a' : '#9fe6a0';
  }

  function handleSubmit(e) {
    var form = e.target;
    var emailInput = form.querySelector('input[type="email"]');
    if (!emailInput) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    var email = emailInput.value.trim();
    if (!email) return;

    var submitBtn = form.querySelector('button[type="submit"], button');
    if (submitBtn) submitBtn.disabled = true;

    fetch('/api/newsletter', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email, source_page: location.pathname }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (res.ok) {
          feedback(form, "You're in. Watch for drops.", false);
          form.reset();
        } else {
          feedback(form, res.d && res.d.error ? res.d.error : 'Something went wrong.', true);
        }
      })
      .catch(function () {
        feedback(form, 'Network error — try again.', true);
      })
      .finally(function () {
        if (submitBtn) submitBtn.disabled = false;
      });
  }

  function init() {
    var forms = document.querySelectorAll('form');
    forms.forEach(function (form) {
      if (form.querySelector('input[type="email"]')) {
        form.addEventListener('submit', handleSubmit, true);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
