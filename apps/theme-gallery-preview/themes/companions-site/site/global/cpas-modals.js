/**
 * cpas-modals.js — reusable apply / contact / volunteer modals for Companions of CPAS
 *
 * Triggers:
 *   data-action="foster"  or data-modal="foster"         → 4-step foster application
 *   data-modal="foster-application"                        → same as foster (application form)
 *   data-modal="volunteer"                                 → volunteer interest form
 *   data-modal="contact"                                   → contact form
 *
 * Donate modal is handled separately by donate-modal.js (data-action="donate").
 */
(function () {
  'use strict';

  const INTRO_DEFAULTS = {
    foster: {
      eyebrow: 'Companions of CPAS',
      title: 'Apply to Foster',
      subtitle: 'Open your home. Change a life.',
      body: 'Fostering gives a dog safety, stability, and time to find their forever family. Applications take about 5 minutes.',
      cta_label: 'Start Application',
    },
  };

  const FORM_MODALS = {
    volunteer: {
      title: 'Volunteer With Companions',
      sub: '100% volunteer-run. Every role directly helps dogs move forward.',
      submitLabel: 'Submit Interest',
      success: {
        title: 'Interest received!',
        msg: 'Thank you for wanting to help. We will be in touch within a few days to match you with the right role.',
      },
      html: `
        <form id="cpasVolunteerForm" novalidate>
          <div class="cm-form-row">
            <div><label>First Name *</label><input name="first_name" required placeholder="Jane"></div>
            <div><label>Last Name *</label><input name="last_name" required placeholder="Smith"></div>
          </div>
          <div class="cm-form-row">
            <div><label>Email *</label><input name="email" type="email" required placeholder="jane@email.com"></div>
            <div><label>Phone</label><input name="phone" type="tel" placeholder="(318) 555-0100"></div>
          </div>
          <div><label>City / Area *</label><input name="city" required placeholder="Shreveport"></div>
          <div><label>How would you like to volunteer? *</label>
            <select name="volunteer_role" required>
              <option value="">Select a role…</option>
              <option>Transport driver</option>
              <option>Foster coordinator</option>
              <option>Photographer / videographer</option>
              <option>Social media advocate</option>
              <option>Fundraising / events</option>
              <option>General support</option>
              <option>Not sure yet — tell me what's needed</option>
            </select>
          </div>
          <div><label>Availability</label>
            <select name="availability">
              <option value="">Select…</option>
              <option>A few hours per month</option>
              <option>Weekends occasionally</option>
              <option>Flexible / as needed</option>
              <option>Regular weekly commitment</option>
            </select>
          </div>
          <div><label>Tell us a little about yourself *</label>
            <textarea name="why_volunteer" required placeholder="Why you want to help, any relevant experience…" rows="3"></textarea>
          </div>
          <button type="submit" class="cm-submit">Submit Interest</button>
          <p class="cm-form-note">We will reach out within a few days to connect you with the right role.</p>
        </form>`,
    },
    contact: {
      title: 'Get in Touch',
      sub: 'Questions about fostering, transport, or how to help? Send us a note — we typically reply within 1–2 business days.',
      submitLabel: 'Send Message',
      success: {
        title: 'Message sent!',
        msg: "We'll get back to you as soon as we can.",
      },
      html: `
        <form id="cpasContactForm" novalidate>
          <div class="cm-form-row">
            <div><label>First Name *</label><input name="first_name" required placeholder="Jane"></div>
            <div><label>Last Name</label><input name="last_name" placeholder="Smith"></div>
          </div>
          <div><label>Email *</label><input name="email" type="email" required placeholder="jane@email.com"></div>
          <div><label>Subject</label>
            <select name="subject">
              <option value="">Select a topic…</option>
              <option>Fostering a dog</option>
              <option>Adopting a dog</option>
              <option>Transport support</option>
              <option>Volunteering</option>
              <option>Donating / fundraising</option>
              <option>General question</option>
            </select>
          </div>
          <div><label>Message *</label>
            <textarea name="message" required placeholder="How can we help?" rows="4"></textarea>
          </div>
          <button type="submit" class="cm-submit">Send Message</button>
          <p class="cm-form-note">Or email us at <a href="mailto:companionsCPAS@gmail.com">companionsCPAS@gmail.com</a></p>
        </form>`,
    },
  };

  const CONTACT_STEPS = [
    { id: 'main', title: 'Your message', fields: [
      { key: 'first_name', label: 'First Name', type: 'text', required: true, placeholder: 'Jane' },
      { key: 'last_name', label: 'Last Name', type: 'text', required: false, placeholder: 'Smith' },
      { key: 'email', label: 'Email', type: 'email', required: true, placeholder: 'jane@email.com' },
      { key: 'subject', label: 'Subject', type: 'select', required: false, options: [
        'Fostering a dog', 'Adopting a dog', 'Volunteering', 'Donations / Fundraising', 'Press / Media inquiry', 'Something else',
      ]},
      { key: 'message', label: 'Message', type: 'textarea', required: true, placeholder: 'How can we help?' },
    ]},
  ];

  const FOSTER_STEPS = [
    { id: 'contact', title: 'Contact Info', fields: [
      { key: 'first_name', label: 'First Name', type: 'text', required: true, placeholder: 'Jane' },
      { key: 'last_name', label: 'Last Name', type: 'text', required: true, placeholder: 'Smith' },
      { key: 'email', label: 'Email', type: 'email', required: true, placeholder: 'you@email.com' },
      { key: 'phone', label: 'Phone', type: 'tel', required: false, placeholder: '(318) 555-0100' },
      { key: 'city', label: 'City', type: 'text', required: true, placeholder: 'Shreveport' },
      { key: 'state', label: 'State', type: 'text', required: true, placeholder: 'LA' },
      { key: 'postal_code', label: 'ZIP Code', type: 'text', required: true, placeholder: '71101' },
    ]},
    { id: 'household', title: 'Your Home', fields: [
      { key: 'housing_type', label: 'Housing Type', type: 'select', required: true, options: ['House', 'Apartment', 'Condo', 'Townhouse', 'Other'] },
      { key: 'rent_or_own', label: 'Rent or Own?', type: 'radio', required: true, options: ['Own', 'Rent'] },
      { key: 'landlord_ok', label: 'Landlord allows pets?', type: 'radio', required: false, options: ['Yes', 'No', 'N/A - I own'] },
      { key: 'has_yard', label: 'Fenced yard?', type: 'radio', required: true, options: ['Yes - fully fenced', 'Yes - partially fenced', 'No'] },
      { key: 'adults_in_home', label: 'Adults in home', type: 'number', required: true, placeholder: '2' },
      { key: 'children_in_home', label: 'Children under 18', type: 'number', required: false, placeholder: '0' },
      { key: 'has_cats', label: 'Do you have cats?', type: 'radio', required: true, options: ['Yes', 'No'] },
      { key: 'current_pets', label: 'Current pets (type, breed, age)', type: 'textarea', required: false, placeholder: 'e.g. Lab mix, 3 yrs — include dogs, cats, other' },
    ]},
    { id: 'experience', title: 'Experience', fields: [
      { key: 'foster_experience', label: 'Have you fostered before?', type: 'radio', required: true, options: ['Yes', 'No'] },
      { key: 'dog_experience', label: 'Experience with dogs', type: 'radio', required: true, options: ['First-time owner', 'Some experience', 'Very experienced'] },
      { key: 'dog_sizes', label: 'Dog sizes you can foster', type: 'multiselect', required: true, options: ['Small (under 25 lbs)', 'Medium (25-50 lbs)', 'Large (50-80 lbs)', 'XL (80+ lbs)', 'Any size'] },
      { key: 'special_needs_ok', label: 'Open to dogs with special needs?', type: 'checkbox', required: false },
      { key: 'why_foster', label: 'Why do you want to foster?', type: 'textarea', required: true, placeholder: 'Tell us a bit about your motivation...' },
    ]},
    { id: 'commitment', title: 'Commitment', fields: [
      { key: 'hours_alone', label: 'Max hours dog alone daily', type: 'select', required: true, options: ['0-2 hours', '2-4 hours', '4-6 hours', '6-8 hours', '8+ hours'] },
      { key: 'foster_duration', label: 'How long can you foster?', type: 'select', required: true, options: ['1-2 weeks', '2-4 weeks', '1-3 months', 'As long as needed', 'Open to adopt'] },
      { key: 'vet_reference', label: 'Vet name and clinic (if any)', type: 'text', required: false, placeholder: 'Dr. Smith, Caddo Animal Clinic' },
      { key: 'additional_info', label: 'Anything else we should know?', type: 'textarea', required: false, placeholder: 'Optional' },
      { key: 'agree_terms', label: 'I understand fostering is temporary and agree to care for the dog per Companions of CPAS guidelines.', type: 'checkbox', required: true },
    ]},
  ];

  const CSS = `
    .cm-backdrop{position:fixed;inset:0;z-index:9000;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(18,8,28,.72);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
    .cm-backdrop.is-open{display:flex}
    .cm-card{width:min(100%,540px);max-height:92vh;overflow-y:auto;border:1px solid rgba(255,255,255,.14);border-radius:24px;background:linear-gradient(165deg,#1a0a24 0%,#12061a 48%,#0d0412 100%);color:#f8f4ff;box-shadow:0 40px 100px rgba(0,0,0,.62),inset 0 1px 0 rgba(255,255,255,.08);font-family:'DM Sans',system-ui,sans-serif;scrollbar-width:none}
    .cm-card::-webkit-scrollbar{display:none}
    .cm-card *{box-sizing:border-box}
    .cm-top{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:30px 30px 0}
    .cm-eyebrow{margin:0 0 7px;color:#e879f9;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
    .cm-title{margin:0;font-family:'Fraunces',Georgia,serif;font-size:clamp(1.65rem,4vw,2.15rem);line-height:1.08;color:#fff}
    .cm-sub{margin:10px 0 0;color:#c4b8d4;font-size:.96rem;line-height:1.6;max-width:42ch}
    .cm-body{padding:16px 30px 24px;color:#c8cdd8;font-size:.95rem;line-height:1.7;white-space:pre-line}
    .cm-close{width:36px;height:36px;border:1px solid rgba(255,255,255,.12);border-radius:50%;background:rgba(255,255,255,.06);color:#e9d5ff;cursor:pointer;position:relative;flex:0 0 auto;transition:background .15s,border-color .15s}
    .cm-close:hover{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.22)}
    .cm-close::before,.cm-close::after{content:'';position:absolute;left:50%;top:50%;width:18px;height:2px;border-radius:999px;background:currentColor}
    .cm-close::before{transform:translate(-50%,-50%) rotate(45deg)}.cm-close::after{transform:translate(-50%,-50%) rotate(-45deg)}
    .cm-cta-wrap{padding:0 30px 30px}
    .cm-cta{display:inline-flex;align-items:center;justify-content:center;width:100%;min-height:50px;border:0;border-radius:12px;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#fff;font-weight:800;font-size:.95rem;text-decoration:none;cursor:pointer;font-family:inherit}
    .cm-cta:hover{opacity:.92}
    .cm-error{display:none;margin:0 30px 16px;color:#fca5a5;font-size:.86rem;line-height:1.4}
    .cm-form{padding:0 30px 30px;display:grid;gap:16px}
    .cm-form-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .cm-form label{display:block;font-size:11px;font-weight:700;color:#a89fba;margin-bottom:7px;text-transform:uppercase;letter-spacing:.08em}
    .cm-form input,.cm-form select,.cm-form textarea{width:100%;padding:12px 14px;border:1.5px solid rgba(255,255,255,.12);border-radius:12px;font-size:.92rem;font-family:inherit;color:#f8f4ff;background:rgba(255,255,255,.055);outline:none;transition:border-color .15s,box-shadow .15s,background .15s}
    .cm-form input::placeholder,.cm-form textarea::placeholder{color:#7c7290}
    .cm-form input:focus,.cm-form select:focus,.cm-form textarea:focus{border-color:#c026d3;background:rgba(255,255,255,.08);box-shadow:0 0 0 3px rgba(192,38,211,.2)}
    .cm-form textarea{resize:vertical;min-height:96px}
    .cm-submit{margin-top:4px;width:100%;min-height:50px;border:0;border-radius:12px;background:linear-gradient(135deg,#9333ea 0%,#6b21a8 52%,#4c1d6e 100%);color:#fff;font-family:inherit;font-size:.95rem;font-weight:700;cursor:pointer;box-shadow:0 10px 28px rgba(107,33,168,.35);transition:transform .15s,box-shadow .15s,opacity .15s}
    .cm-submit:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 14px 34px rgba(107,33,168,.42)}
    .cm-submit:disabled{opacity:.55;cursor:not-allowed}
    .cm-form-note{font-size:.82rem;color:#9ca3af;text-align:center;margin:0;line-height:1.55;padding-top:4px}
    .cm-form-note a{color:#e879f9;text-decoration:none;font-weight:600}
    .cm-form-note a:hover{text-decoration:underline}
    .cm-success{text-align:center;padding:44px 30px}
    .cm-success-title{font-family:'Fraunces',Georgia,serif;font-size:1.35rem;color:#fff;margin-bottom:8px}
    .cm-success-msg{font-size:.9rem;color:#b0a8be;line-height:1.6}
    .fa-backdrop{position:fixed;inset:0;z-index:9100;background:rgba(4,7,17,.82);backdrop-filter:blur(10px);display:none;align-items:center;justify-content:center;padding:16px}
    .fa-backdrop.is-open{display:flex}
    .fa-card{width:min(100%,540px);max-height:92vh;overflow-y:auto;background:var(--fa-bg,#090d18);border:1px solid rgba(255,255,255,.1);border-radius:calc(var(--fa-radius,12)*1px + 8px);box-shadow:0 40px 100px rgba(0,0,0,.65);font-family:'DM Sans',system-ui,sans-serif;color:var(--fa-text,#f4efe8);scrollbar-width:none;--fa-accent:var(--fa-accent,#7c3aed)}
    .fa-card::-webkit-scrollbar{display:none}
    .fa-card *{box-sizing:border-box}
    .fa-brand-bar{display:flex;align-items:center;gap:10px;padding:14px 24px 0;font-size:12px;font-weight:700}
    .fa-brand-bar img{height:28px;width:auto;object-fit:contain}
    .fa-header{padding:24px 24px 0;position:relative}
    .fa-close{position:absolute;top:18px;right:18px;width:30px;height:30px;border:1px solid rgba(255,255,255,.12);border-radius:50%;background:rgba(255,255,255,.06);color:#9ca3af;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center}
    .fa-eyebrow{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--fa-accent,#a78bfa);margin-bottom:6px}
    .fa-title{font-family:'Fraunces',Georgia,serif;font-size:1.5rem;font-weight:700;color:inherit;margin:0 0 4px}
    .fa-sub{font-size:.84rem;color:#8a94a6;margin:0 0 16px;line-height:1.5}
    .fa-progress{display:flex;gap:6px;padding:0 24px;margin-bottom:20px}
    .fa-pip{flex:1;height:3px;border-radius:99px;background:rgba(255,255,255,.08);transition:background .3s}
    .fa-pip.done{background:var(--fa-accent,#7c3aed)}.fa-pip.active{background:var(--fa-accent,#a78bfa);opacity:.85}
    .fa-step-label{padding:0 24px;margin-bottom:16px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6b7280}
    .fa-body{padding:0 24px 24px}
    .fa-field{margin-bottom:16px}
    .fa-label{display:block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;margin-bottom:6px}
    .fa-req{color:#f87171}
    .fa-input,.fa-select,.fa-textarea{width:100%;background:rgba(255,255,255,.045);border:1.5px solid rgba(255,255,255,.09);border-radius:calc(var(--fa-radius,9)*1px);padding:10px 12px;color:inherit;font-family:inherit;font-size:.88rem;outline:none}
    .fa-input:focus,.fa-select:focus,.fa-textarea:focus{border-color:var(--fa-accent,#7c3aed);box-shadow:0 0 0 3px color-mix(in srgb, var(--fa-accent,#7c3aed) 22%, transparent)}
    .fa-textarea{resize:vertical;min-height:80px}
    .fa-radio-group{display:flex;flex-direction:column;gap:7px}
    .fa-radio-opt,.fa-check-opt{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1.5px solid rgba(255,255,255,.08);border-radius:calc(var(--fa-radius,9)*1px);cursor:pointer}
    .fa-radio-opt input,.fa-check-opt input{accent-color:var(--fa-accent,#7c3aed);width:16px;height:16px}
    .fa-radio-opt.selected,.fa-check-opt.selected{border-color:var(--fa-accent,#7c3aed);background:color-mix(in srgb, var(--fa-accent,#7c3aed) 12%, transparent)}
    .fa-multi{display:flex;flex-wrap:wrap;gap:7px}
    .fa-multi-opt{padding:7px 14px;border:1.5px solid rgba(255,255,255,.08);border-radius:999px;cursor:pointer;font-size:.8rem;color:#9ca3af}
    .fa-multi-opt.selected{border-color:var(--fa-accent,#7c3aed);background:color-mix(in srgb, var(--fa-accent,#7c3aed) 15%, transparent);color:#c4b5fd}
    .fa-footer{padding:0 24px 24px;display:flex;gap:10px}
    .fa-btn{flex:1;min-height:46px;border:none;border-radius:calc(var(--fa-radius,10)*1px);font-family:inherit;font-size:.9rem;font-weight:700;cursor:pointer}
    .fa-btn-back{background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.1);color:#d1d5db}
    .fa-btn-next{background:var(--fa-accent,#7c3aed);color:#fff}
    .fa-error{margin:0 24px 16px;padding:10px 12px;background:rgba(248,113,113,.09);border:1px solid rgba(248,113,113,.25);border-radius:9px;color:#fca5a5;font-size:.82rem;display:none}
    .fa-success{text-align:center;padding:48px 28px;display:none}
    .fa-success-icon{width:56px;height:56px;border-radius:50%;margin:0 auto 18px;background:color-mix(in srgb, var(--fa-accent,#7c3aed) 15%, transparent);border:1.5px solid color-mix(in srgb, var(--fa-accent,#7c3aed) 35%, transparent);display:flex;align-items:center;justify-content:center;font-size:1.4rem;color:var(--fa-accent,#a78bfa)}
    .fa-success h3{font-family:'Fraunces',Georgia,serif;font-size:1.3rem;color:inherit;margin:0 0 8px}
    .fa-success p{font-size:.86rem;color:#9ca3af;margin:0;line-height:1.5}
    .fa-card.is-light{--fa-bg:#f7f7f9;--fa-text:#16171c;background:#f7f7f9;color:#16171c;border-color:#e5e7eb}
    .fa-card.is-light .fa-sub,.fa-card.is-light .fa-label,.fa-card.is-light .fa-step-label{color:#6b7280}
    .fa-card.is-light .fa-input,.fa-card.is-light .fa-select,.fa-card.is-light .fa-textarea{background:#fff;border-color:#d9dbe1;color:#16171c}
    .fa-card.is-light .fa-btn-back{background:#fff;border-color:#d9dbe1;color:#374151}
    @media(max-width:520px){.cm-backdrop,.fa-backdrop{padding:0;align-items:flex-end}.cm-card,.fa-card{border-radius:20px 20px 0 0;max-height:96vh}.cm-form-row{grid-template-columns:1fr}}
  `;

  let introBackdrop = null;
  let formBackdrop = null;
  let fosterStep = 0;
  let fosterData = {};
  let fosterSubmitting = false;
  let activeFormKey = 'foster_application';
  let activeSchema = null;
  let activeSteps = FOSTER_STEPS;
  const schemaCache = {};

  async function loadPublishedForm(formKey) {
    const key = String(formKey || '').trim();
    if (!key) return null;
    if (schemaCache[key] && Date.now() - schemaCache[key]._ts < 60000) return schemaCache[key];
    try {
      const res = await fetch(`/api/public/forms/${encodeURIComponent(key)}`, { headers: { accept: 'application/json' } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) return null;
      const steps = (data.steps || []).map((s) => ({
        id: s.id || s.step_key,
        title: s.title || 'Step',
        fields: (data.fields || [])
          .filter((f) => !s.id || f.step_id === s.id)
          .map((f) => ({
            key: f.field_key,
            label: f.label,
            type: f.field_type === 'tel' ? 'tel' : f.field_type,
            required: !!f.is_required,
            placeholder: f.placeholder || '',
            options: Array.isArray(f.options) ? f.options : [],
          })),
      })).filter((s) => s.fields.length);
      // If steps empty but fields exist, one step
      let built = steps;
      if (!built.length && (data.fields || []).length) {
        built = [{
          id: 'main',
          title: 'Your information',
          fields: (data.fields || []).map((f) => ({
            key: f.field_key,
            label: f.label,
            type: f.field_type === 'tel' ? 'tel' : f.field_type,
            required: !!f.is_required,
            placeholder: f.placeholder || '',
            options: Array.isArray(f.options) ? f.options : [],
          })),
        }];
      }
      const packed = {
        form: data.form,
        steps: built,
        _ts: Date.now(),
      };
      schemaCache[key] = packed;
      return packed;
    } catch (_) {
      return null;
    }
  }

  function applyFormTheme(card, settings, intro) {
    if (!card) return;
    const theme = (settings && settings.theme) || {};
    const accent = theme.accent || '#7c3aed';
    card.style.setProperty('--fa-accent', accent);
    card.style.setProperty('--fa-radius', String(theme.radius || 12));
    card.classList.toggle('is-light', theme.mode === 'light');
    card.dataset.themeReady = '1';
    card._formMeta = { settings: settings || {}, intro: intro || {}, theme };
  }

  function ensureStyles() {
    if (document.getElementById('cpas-modals-styles')) return;
    const s = document.createElement('style');
    s.id = 'cpas-modals-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function lockScroll(on) {
    document.body.style.overflow = on ? 'hidden' : '';
  }

  function closeAll() {
    closeIntro();
    closeFormModal();
    closeFosterApplication();
  }

  function escHandler(e) {
    if (e.key === 'Escape') closeAll();
  }

  /* ── Intro modal (foster CTA, CMS-driven) ───────────────── */
  function ensureIntroBackdrop() {
    if (introBackdrop) return introBackdrop;
    ensureStyles();
    introBackdrop = document.createElement('div');
    introBackdrop.id = 'cpasIntroBackdrop';
    introBackdrop.className = 'cm-backdrop';
    introBackdrop.innerHTML = `
      <div class="cm-card" role="dialog" aria-modal="true" aria-labelledby="cpasIntroTitle">
        <div class="cm-top">
          <div>
            <p class="cm-eyebrow" id="cpasIntroEyebrow"></p>
            <h2 class="cm-title" id="cpasIntroTitle"></h2>
            <p class="cm-sub" id="cpasIntroSub"></p>
          </div>
          <button class="cm-close" type="button" aria-label="Close"></button>
        </div>
        <div class="cm-body" id="cpasIntroBody"></div>
        <p class="cm-error" id="cpasIntroError"></p>
        <div class="cm-cta-wrap"><button type="button" class="cm-cta" id="cpasIntroCta"></button></div>
      </div>`;
    document.body.appendChild(introBackdrop);
    introBackdrop.addEventListener('click', (e) => { if (e.target === introBackdrop) closeIntro(); });
    introBackdrop.querySelector('.cm-close').addEventListener('click', closeIntro);
    return introBackdrop;
  }

  function closeIntro() {
    if (!introBackdrop) return;
    introBackdrop.classList.remove('is-open');
    if (!formBackdrop?.classList.contains('is-open') && !document.getElementById('fa-backdrop')?.classList.contains('is-open')) {
      lockScroll(false);
      document.removeEventListener('keydown', escHandler);
    }
  }

  async function openFosterIntro() {
    const modal = ensureIntroBackdrop();
    const err = modal.querySelector('#cpasIntroError');
    err.style.display = 'none';
    err.textContent = '';

    let cfg = { ...INTRO_DEFAULTS.foster };
    try {
      const res = await fetch('/api/cms/modal/foster_cta', { headers: { accept: 'application/json' } });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.modal) {
        cfg = {
          eyebrow: INTRO_DEFAULTS.foster.eyebrow,
          title: data.modal.title || cfg.title,
          subtitle: data.modal.subtitle || cfg.subtitle,
          body: data.modal.body || cfg.body,
          cta_label: data.modal.cta_label || cfg.cta_label,
        };
      }
    } catch (_) { /* use defaults */ }

    modal.querySelector('#cpasIntroEyebrow').textContent = cfg.eyebrow;
    modal.querySelector('#cpasIntroTitle').textContent = cfg.title;
    modal.querySelector('#cpasIntroSub').textContent = cfg.subtitle;
    modal.querySelector('#cpasIntroBody').textContent = cfg.body;
    const cta = modal.querySelector('#cpasIntroCta');
    cta.textContent = cfg.cta_label;
    cta.onclick = () => { closeIntro(); openFosterApplication(); };

    modal.classList.add('is-open');
    lockScroll(true);
    document.addEventListener('keydown', escHandler);
  }

  /* ── Simple form modals (volunteer, contact) ──────────── */
  function ensureFormBackdrop() {
    if (formBackdrop) return formBackdrop;
    ensureStyles();
    formBackdrop = document.createElement('div');
    formBackdrop.id = 'cpasFormBackdrop';
    formBackdrop.className = 'cm-backdrop';
    formBackdrop.innerHTML = `
      <div class="cm-card" role="dialog" aria-modal="true" aria-labelledby="cpasFormTitle">
        <div class="cm-top">
          <div>
            <h2 class="cm-title" id="cpasFormTitle"></h2>
            <p class="cm-sub" id="cpasFormSub"></p>
          </div>
          <button class="cm-close" type="button" aria-label="Close"></button>
        </div>
        <div id="cpasFormBody"></div>
      </div>`;
    document.body.appendChild(formBackdrop);
    formBackdrop.addEventListener('click', (e) => { if (e.target === formBackdrop) closeFormModal(); });
    formBackdrop.querySelector('.cm-close').addEventListener('click', closeFormModal);
    return formBackdrop;
  }

  function closeFormModal() {
    if (!formBackdrop) return;
    formBackdrop.classList.remove('is-open');
    if (!introBackdrop?.classList.contains('is-open') && !document.getElementById('fa-backdrop')?.classList.contains('is-open')) {
      lockScroll(false);
      document.removeEventListener('keydown', escHandler);
    }
  }

  function showFormSuccess(cfg) {
    document.getElementById('cpasFormBody').innerHTML = `
      <div class="cm-success">
        <div class="cm-success-title">${cfg.title}</div>
        <div class="cm-success-msg">${cfg.msg}</div>
      </div>`;
  }

  async function handleFormSubmit(e, key) {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('.cm-submit');
    const cfg = FORM_MODALS[key];
    if (!cfg) return;
    btn.disabled = true;
    btn.textContent = 'Submitting…';
    const data = Object.fromEntries(new FormData(form));
    try {
      if (key === 'foster') {
        const res = await fetch('/api/foster/apply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ form_key: 'foster_application', ...data }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok && !json.success) throw new Error('server error');
      } else if (key === 'contact') {
        const name = [data.first_name, data.last_name].filter(Boolean).join(' ').trim() || data.first_name || '';
        const res = await fetch('/api/contact/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email: data.email,
            message: data.message,
            request_type: data.subject || 'general',
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok && !json.success) throw new Error(json.error || 'server error');
      } else {
        showFormSuccess(cfg.success);
        return;
      }
      showFormSuccess(cfg.success);
    } catch (_) {
      btn.disabled = false;
      btn.textContent = cfg.submitLabel;
      const err = document.createElement('p');
      err.style.cssText = 'color:#fca5a5;font-size:13px;text-align:center;margin:8px 28px 0';
      err.textContent = 'Something went wrong — please email companionsCPAS@gmail.com directly.';
      formBackdrop.querySelector('.cm-card').appendChild(err);
    }
  }

  function openFormModal(key) {
    const cfg = FORM_MODALS[key];
    if (!cfg) return;
    const modal = ensureFormBackdrop();
    modal.querySelector('#cpasFormTitle').textContent = cfg.title;
    modal.querySelector('#cpasFormSub').textContent = cfg.sub;
    const body = modal.querySelector('#cpasFormBody');
    body.innerHTML = `<div class="cm-form">${cfg.html}</div>`;
    const form = body.querySelector('form');
    if (form) form.addEventListener('submit', (e) => handleFormSubmit(e, key));
    modal.classList.add('is-open');
    lockScroll(true);
    document.addEventListener('keydown', escHandler);
  }

  /* ── Foster 4-step application ────────────────────────── */
  function buildField(f) {
    const req = f.required ? '<span class="fa-req">*</span>' : '';
    if (f.type === 'radio') {
      const opts = f.options.map((o) => `<label class="fa-radio-opt${fosterData[f.key] === o ? ' selected' : ''}"><input type="radio" name="${f.key}" value="${o}"${fosterData[f.key] === o ? ' checked' : ''} />${o}</label>`).join('');
      return `<div class="fa-field"><span class="fa-label">${f.label} ${req}</span><div class="fa-radio-group">${opts}</div></div>`;
    }
    if (f.type === 'multiselect') {
      const vals = Array.isArray(fosterData[f.key]) ? fosterData[f.key] : [];
      const opts = f.options.map((o) => `<span class="fa-multi-opt${vals.includes(o) ? ' selected' : ''}" data-val="${o}">${o}</span>`).join('');
      return `<div class="fa-field"><span class="fa-label">${f.label} ${req}</span><input type="hidden" name="${f.key}" value="${vals.join(',')}" /><div class="fa-multi">${opts}</div></div>`;
    }
    if (f.type === 'checkbox') {
      return `<div class="fa-field"><label class="fa-check-opt${fosterData[f.key] ? ' selected' : ''}"><input type="checkbox" name="${f.key}"${fosterData[f.key] ? ' checked' : ''} /><span>${f.label} ${req}</span></label></div>`;
    }
    if (f.type === 'textarea') {
      return `<div class="fa-field"><label class="fa-label">${f.label} ${req}</label><textarea class="fa-textarea" name="${f.key}" placeholder="${f.placeholder || ''}">${fosterData[f.key] || ''}</textarea></div>`;
    }
    if (f.type === 'select') {
      const opts = f.options.map((o) => `<option value="${o}"${fosterData[f.key] === o ? ' selected' : ''}>${o}</option>`).join('');
      return `<div class="fa-field"><label class="fa-label">${f.label} ${req}</label><select class="fa-select" name="${f.key}"><option value="">Select...</option>${opts}</select></div>`;
    }
    return `<div class="fa-field"><label class="fa-label">${f.label} ${req}</label><input class="fa-input" type="${f.type}" name="${f.key}" placeholder="${f.placeholder || ''}" value="${fosterData[f.key] || ''}" /></div>`;
  }

  function renderFosterStep(card) {
    const s = activeSteps[fosterStep];
    if (!s) return;
    const meta = card._formMeta || {};
    const intro = meta.intro || {};
    const settings = meta.settings || {};
    const theme = meta.theme || {};
    const pips = activeSteps.map((_, i) => `<div class="fa-pip${i < fosterStep ? ' done' : i === fosterStep ? ' active' : ''}"></div>`).join('');
    const brandBar = theme.show_header === false ? '' : `
      <div class="fa-brand-bar">
        ${theme.logo_url ? `<img src="${theme.logo_url}" alt="" />` : ''}
        <span>${theme.org_name || 'Companions of CPAS'}</span>
      </div>`;
    const submitLabel = settings.submit_label || (fosterStep === activeSteps.length - 1 ? 'Submit Application' : 'Continue');
    const successTitle = settings.success_title || 'Application received.';
    const successMsg = settings.success_message || 'We review every application personally and will be in touch within 2-3 business days. Thank you for opening your home.';
    card.innerHTML = `
      ${brandBar}
      <div class="fa-header">
        <button class="fa-close" id="fa-close" type="button" aria-label="Close">&times;</button>
        <div class="fa-eyebrow">${intro.eyebrow || 'Companions of CPAS'}</div>
        <h2 class="fa-title">${intro.heading || (meta.formTitle || 'Apply')}</h2>
        <p class="fa-sub">${intro.subheading || ''}</p>
      </div>
      <div class="fa-progress">${pips}</div>
      <div class="fa-step-label">Step ${fosterStep + 1} of ${activeSteps.length} — ${s.title}</div>
      <div class="fa-error" id="fa-error"></div>
      <div class="fa-body">${s.fields.map(buildField).join('')}</div>
      <div class="fa-footer">
        ${fosterStep > 0 ? '<button class="fa-btn fa-btn-back" id="fa-back" type="button">Back</button>' : ''}
        <button class="fa-btn fa-btn-next" id="fa-next" type="button">${fosterStep === activeSteps.length - 1 ? submitLabel : 'Continue'}</button>
      </div>
      <div class="fa-success" id="fa-success">
        <div class="fa-success-icon">&#10003;</div>
        <h3>${successTitle}</h3>
        <p>${successMsg}</p>
      </div>`;

    document.getElementById('fa-close').addEventListener('click', closeFosterApplication);
    card.querySelectorAll('.fa-radio-opt').forEach((opt) => {
      opt.addEventListener('click', () => {
        const inp = opt.querySelector('input');
        inp.checked = true;
        card.querySelectorAll(`.fa-radio-opt input[name="${inp.name}"]`).forEach((i) => i.closest('.fa-radio-opt').classList.remove('selected'));
        opt.classList.add('selected');
      });
    });
    card.querySelectorAll('.fa-multi-opt').forEach((opt) => {
      opt.addEventListener('click', () => {
        opt.classList.toggle('selected');
        const wrap = opt.closest('.fa-field');
        const vals = [...wrap.querySelectorAll('.fa-multi-opt.selected')].map((o) => o.dataset.val);
        wrap.querySelector('input[type=hidden]').value = vals.join(',');
      });
    });
    card.querySelectorAll('.fa-check-opt input[type=checkbox]').forEach((inp) => {
      inp.addEventListener('change', () => inp.closest('.fa-check-opt').classList.toggle('selected', inp.checked));
    });
    document.getElementById('fa-back')?.addEventListener('click', () => { collectFosterStep(card); fosterStep--; renderFosterStep(card); });
    document.getElementById('fa-next').addEventListener('click', async () => {
      if (!validateFosterStep(card)) return;
      collectFosterStep(card);
      if (fosterStep < activeSteps.length - 1) { fosterStep++; renderFosterStep(card); card.scrollTop = 0; }
      else { await submitFosterForm(card); }
    });
  }

  function collectFosterStep(card) {
    const s = activeSteps[fosterStep];
    s.fields.forEach((f) => {
      if (f.type === 'multiselect') {
        const h = card.querySelector(`input[type=hidden][name="${f.key}"]`);
        if (h) fosterData[f.key] = h.value ? h.value.split(',') : [];
      } else if (f.type === 'checkbox') {
        const i = card.querySelector(`input[name="${f.key}"]`);
        if (i) fosterData[f.key] = i.checked;
      } else {
        const i = card.querySelector(`[name="${f.key}"]`);
        if (i) fosterData[f.key] = i.value.trim();
      }
    });
  }

  function validateFosterStep(card) {
    const s = activeSteps[fosterStep];
    const err = document.getElementById('fa-error');
    const missing = [];
    s.fields.forEach((f) => {
      if (!f.required) return;
      if (f.type === 'multiselect') {
        const h = card.querySelector(`input[type=hidden][name="${f.key}"]`);
        if (!h?.value) missing.push(f.label);
      } else if (f.type === 'checkbox') {
        const i = card.querySelector(`input[name="${f.key}"]`);
        if (!i?.checked) missing.push(f.label);
      } else {
        const i = card.querySelector(`[name="${f.key}"]`);
        if (!i?.value?.trim()) missing.push(f.label);
      }
    });
    if (missing.length) {
      err.textContent = 'Please complete: ' + missing.join(', ');
      err.style.display = 'block';
      return false;
    }
    err.style.display = 'none';
    return true;
  }

  async function submitFosterForm(card) {
    if (fosterSubmitting) return;
    fosterSubmitting = true;
    const btn = document.getElementById('fa-next');
    const settings = (card._formMeta && card._formMeta.settings) || {};
    const endpoint = settings.submit_endpoint || (activeFormKey === 'contact' ? '/api/contact/request' : '/api/foster/apply');
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }
    try {
      const payload = { ...fosterData };
      Object.keys(payload).forEach((k) => { if (Array.isArray(payload[k])) payload[k] = payload[k].join(', '); });
      if (activeFormKey === 'contact' || endpoint.includes('/contact')) {
        payload.name = [payload.first_name, payload.last_name].filter(Boolean).join(' ').trim() || payload.name || payload.full_name || '';
        const subjectMap = {
          'Fostering a dog': 'fostering',
          'Adopting a dog': 'adopting',
          'Volunteering': 'volunteering',
          'Donations / Fundraising': 'donating',
          'Press / Media inquiry': 'media',
          'Something else': 'other',
        };
        payload.request_type = subjectMap[payload.subject] || payload.request_type || 'general';
        payload.source = 'modal:contact';
      } else {
        payload.form_key = activeFormKey || 'foster_application';
      }
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = Array.isArray(d.errors) && d.errors.length ? (' ' + d.errors.join('; ')) : '';
        throw new Error((d.error || 'Submission failed.') + detail);
      }
      ['fa-header', 'fa-progress', 'fa-step-label', 'fa-body', 'fa-footer', 'fa-error', 'fa-brand-bar'].forEach((cls) => {
        card.querySelectorAll('.' + cls).forEach((el) => { el.style.display = 'none'; });
      });
      document.getElementById('fa-success').style.display = 'block';
      setTimeout(closeFosterApplication, 6000);
    } catch (e) {
      const err = document.getElementById('fa-error');
      if (err) { err.textContent = e.message || 'Submission failed. Please try again.'; err.style.display = 'block'; }
      fosterSubmitting = false;
      if (btn) { btn.disabled = false; btn.textContent = settings.submit_label || 'Submit'; }
    }
  }

  async function openPublishedApplication(formKey) {
    ensureStyles();
    activeFormKey = formKey || 'foster_application';
    fosterStep = 0;
    fosterData = {};
    fosterSubmitting = false;
    const published = await loadPublishedForm(activeFormKey);
    if (published && published.steps?.length) {
      activeSchema = published;
      activeSteps = published.steps;
    } else if (activeFormKey === 'foster_application') {
      activeSteps = FOSTER_STEPS;
      activeSchema = null;
    } else if (activeFormKey === 'contact' || activeFormKey === 'contact_request') {
      activeSteps = CONTACT_STEPS;
      activeSchema = {
        form: {
          form_key: 'contact',
          title: 'Contact Us',
          settings: {
            submit_endpoint: '/api/contact/request',
            submit_label: 'Send Message',
            success_message: "We'll get back to you as soon as we can.",
            success_title: 'Message sent!',
          },
          intro: {
            heading: 'Get in Touch',
            subheading: FORM_MODALS.contact?.sub || '',
          },
        },
      };
    } else {
      activeSteps = [{ id: 'main', title: 'Form unavailable', fields: [] }];
      activeSchema = null;
    }

    let backdrop = document.getElementById('fa-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'fa-backdrop';
      backdrop.className = 'fa-backdrop';
      backdrop.setAttribute('role', 'dialog');
      backdrop.setAttribute('aria-modal', 'true');
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeFosterApplication(); });
      document.body.appendChild(backdrop);
    }
    let card = document.getElementById('fa-card');
    if (!card) {
      card = document.createElement('div');
      card.id = 'fa-card';
      card.className = 'fa-card';
      backdrop.appendChild(card);
    }
    const form = published?.form || {};
    applyFormTheme(card, form.settings || {}, form.intro || {});
    card._formMeta.formTitle = form.title || '';
    renderFosterStep(card);
    backdrop.classList.add('is-open');
    lockScroll(true);
    document.addEventListener('keydown', escHandler);
  }

  function openFosterApplication() {
    return openPublishedApplication('foster_application');
  }

  function closeFosterApplication() {
    const b = document.getElementById('fa-backdrop');
    if (b) b.classList.remove('is-open');
    if (!introBackdrop?.classList.contains('is-open') && !formBackdrop?.classList.contains('is-open')) {
      lockScroll(false);
      document.removeEventListener('keydown', escHandler);
    }
  }

  /* ── Global click routing ─────────────────────────────── */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-modal],[data-action]');
    if (!el) return;

    const modal = el.dataset.modal;
    const action = el.dataset.action;

    if (action === 'donate' || el.hasAttribute('data-donate')) return;

    if (
      action === 'foster' ||
      modal === 'foster' ||
      modal === 'foster-application' ||
      modal === 'foster-form'
    ) {
      e.preventDefault();
      openFosterApplication();
      return;
    }
    if (modal === 'volunteer') {
      e.preventDefault();
      openFormModal('volunteer');
      return;
    }
    if (modal === 'contact' || action === 'contact') {
      e.preventDefault();
      openPublishedApplication('contact');
    }
  });

  window.CPASModals = {
    openFosterIntro,
    openFosterApplication,
    openPublishedApplication,
    openVolunteer: () => openFormModal('volunteer'),
    openContact: () => openPublishedApplication('contact'),
    close: closeAll,
  };

  window.FosterModal = {
    open: openFosterApplication,
    openApplication: openFosterApplication,
    openIntro: openFosterIntro,
    close: closeAll,
  };
})();
