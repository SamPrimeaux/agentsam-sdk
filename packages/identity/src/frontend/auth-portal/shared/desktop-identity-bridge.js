(function () {
  function getInvoke() {
    try {
      return window.__TAURI__?.core?.invoke
        || window.parent?.__TAURI__?.core?.invoke
        || null;
    } catch {
      return null;
    }
  }

  var invoke = getInvoke();
  if (!invoke) return;

  var APP_ID = 'local-studio';
  var SESSION_ACCOUNT = 'identity_session';
  var originalFetch = window.fetch.bind(window);

  async function callIdentity(payload) {
    var raw = await invoke('identity_bridge', {
      requestJson: JSON.stringify(payload || {}),
    });
    var body = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!body || body.ok === false) {
      throw new Error(body?.error || 'identity_request_failed');
    }
    return body;
  }

  async function getSessionId() {
    return await invoke('secure_store_get', {
      appId: APP_ID,
      account: SESSION_ACCOUNT,
    });
  }

  async function setSessionId(sessionId) {
    await invoke('secure_store_set', {
      appId: APP_ID,
      account: SESSION_ACCOUNT,
      value: String(sessionId || ''),
    });
  }

  async function clearSessionId() {
    try {
      await invoke('secure_store_delete', {
        appId: APP_ID,
        account: SESSION_ACCOUNT,
      });
    } catch {}
  }

  function jsonResponse(body, status) {
    return new Response(JSON.stringify(body), {
      status: status || 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  function parseBody(init) {
    if (!init?.body) return {};
    try {
      return typeof init.body === 'string' ? JSON.parse(init.body) : {};
    } catch {
      return {};
    }
  }

  function notifyAuthenticated(body) {
    try {
      window.parent?.postMessage({
        type: 'agentsam:desktop-identity',
        authenticated: true,
        user: body?.user || null,
      }, '*');
    } catch {}
  }

  window.fetch = async function packagedIdentityFetch(input, init) {
    var url;
    try {
      url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
    } catch {
      return originalFetch(input, init);
    }

    if (url.pathname === '/api/company') {
      return jsonResponse({
        name: 'AgentSam',
        tagline: 'Instant Access',
        logoUrl: '/shared/agentsam-mark.svg',
        authBgColor: '#050508',
      });
    }

    if (url.pathname === '/api/auth/login') {
      try {
        var loginBody = parseBody(init);
        var login = await callIdentity({
          op: 'login',
          email: loginBody.email,
          password: loginBody.password,
          next: loginBody.next || '/agentsam',
        });
        await setSessionId(login.session_id);
        notifyAuthenticated(login);
        return jsonResponse({ ok: true, user: login.user, redirect: '/agentsam' });
      } catch (error) {
        return jsonResponse({ ok: false, error: error?.message || String(error) }, 401);
      }
    }

    if (url.pathname === '/api/auth/signup') {
      try {
        var signupBody = parseBody(init);
        var signup = await callIdentity({
          op: 'signup',
          email: signupBody.email,
          password: signupBody.password,
          displayName: signupBody.name || signupBody.displayName || signupBody.display_name,
          next: signupBody.next || '/agentsam',
        });
        await setSessionId(signup.session_id);
        notifyAuthenticated(signup);
        return jsonResponse({ ok: true, user: signup.user, redirect: '/agentsam' });
      } catch (error) {
        return jsonResponse({ ok: false, error: error?.message || String(error) }, 400);
      }
    }

    if (url.pathname === '/api/auth/password-reset/request') {
      try {
        var requestBody = parseBody(init);
        var requested = await callIdentity({
          op: 'reset_request',
          email: requestBody.email,
        });
        return jsonResponse(requested);
      } catch (error) {
        return jsonResponse({ ok: false, error: error?.message || String(error) }, 400);
      }
    }

    if (url.pathname === '/api/auth/password-reset/confirm') {
      try {
        var resetBody = parseBody(init);
        var reset = await callIdentity({
          op: 'reset_confirm',
          email: resetBody.email,
          code: resetBody.code,
          password: resetBody.password,
          confirm_password: resetBody.confirm_password || resetBody.confirmPassword || resetBody.confirm,
        });
        return jsonResponse(reset);
      } catch (error) {
        return jsonResponse({ ok: false, error: error?.message || String(error) }, 400);
      }
    }

    if (url.pathname === '/api/auth/logout') {
      var sessionId = await getSessionId();
      if (sessionId) {
        try {
          await callIdentity({ op: 'logout', session_id: sessionId });
        } catch {}
      }
      await clearSessionId();
      return jsonResponse({ ok: true });
    }

    return originalFetch(input, init);
  };

  function localizeAuthLinks() {
    var map = {
      '/auth/login': './login.html',
      '/auth/signup': './signup.html',
      '/auth/reset': './reset.html',
    };
    document.querySelectorAll('a[href]').forEach(function (link) {
      var href = link.getAttribute('href');
      if (!href) return;
      var base = href.split('?')[0];
      if (map[base]) {
        var query = href.indexOf('?') >= 0 ? href.slice(href.indexOf('?')) : '';
        link.setAttribute('href', map[base] + query);
      }
    });

    // Provider OAuth belongs to installed provider adapters. Do not render
    // decorative/dead login buttons in the packaged native surface.
    ['googleSignIn', 'githubSignIn', 'cloudflareSignIn'].forEach(function (id) {
      var link = document.getElementById(id);
      if (link) link.style.display = 'none';
    });
    var backupToggle = document.getElementById('backupCodeToggle');
    if (backupToggle) {
      var backupPrompt = backupToggle.closest('p');
      if (backupPrompt) backupPrompt.style.display = 'none';
      else backupToggle.style.display = 'none';
    }
  }

  window.addEventListener('DOMContentLoaded', localizeAuthLinks);
  window.__AGENTSAM_DESKTOP_IDENTITY__ = true;
})();
