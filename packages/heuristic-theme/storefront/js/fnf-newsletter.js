(function () {
  var selector = 'form[data-newsletter-form], form.fnf-newsletter-form, .hc-newsletter form';

  function feedback(form, message, isError) {
    var note = form.querySelector('.fnf-nl-note');
    if (!note) {
      note = document.createElement('p');
      note.className = 'fnf-nl-note';
      note.setAttribute('role', 'status');
      note.setAttribute('aria-live', 'polite');
      note.style.cssText = 'margin-top:8px;font-size:13px;font-weight:600;';
      form.appendChild(note);
    }
    note.textContent = message;
    note.style.color = isError ? '#ff6b4a' : '#9fe6a0';
  }

  function handleSubmit(event) {
    var form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches(selector) || form.matches('[data-global-newsletter]')) return;
    var emailInput = form.querySelector('input[type="email"]');
    if (!emailInput) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    var email = emailInput.value.trim();
    if (!email || !emailInput.checkValidity()) {
      feedback(form, 'Enter a valid email address.', true);
      emailInput.focus();
      return;
    }

    var submitButton = form.querySelector('button[type="submit"], button');
    if (submitButton) submitButton.disabled = true;
    feedback(form, 'Sending your confirmation link…', false);
    var firstName = form.querySelector('[name="first_name"]');
    var lastName = form.querySelector('[name="last_name"]');
    var sourceType = form.dataset.newsletterSource || 'cms_block';
    var sourceRef = form.dataset.newsletterRef || null;

    fetch('/api/newsletter', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: email,
        first_name: firstName ? firstName.value.trim() : '',
        last_name: lastName ? lastName.value.trim() : '',
        source_path: location.pathname,
        source_page: location.pathname,
        source_type: sourceType,
        source_ref: sourceRef,
        consent_text: form.dataset.consentText || 'Submitted the Fuel & Free Time newsletter signup form.'
      })
    })
      .then(function (response) { return response.json().then(function (data) { return { ok: response.ok, data: data }; }); })
      .then(function (result) {
        if (result.ok) {
          feedback(form, result.data.message || 'Check your inbox to confirm your subscription.', false);
          form.reset();
        } else {
          feedback(form, result.data && result.data.error ? result.data.error : 'Something went wrong. Please try again.', true);
        }
      })
      .catch(function () { feedback(form, 'Network error — please try again.', true); })
      .finally(function () { if (submitButton) submitButton.disabled = false; });
  }

  // Delegation also catches newsletter blocks that page-composer renders after DOMContentLoaded.
  document.addEventListener('submit', handleSubmit, true);
})();
