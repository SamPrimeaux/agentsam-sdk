/**
 * Cypress Commons - Unified & Remote Header Component
 * This script dynamically injects the standardized premium header across all pages.
 */
(() => {
    const injectHeader = () => {
        // Create header element if it doesn't exist
        let header = document.querySelector('header');
        if (!header) {
            header = document.createElement('header');
            document.body.prepend(header);
        }

        const navLinks = [
            { label: 'Home', url: '/' },
            { label: 'About', url: '/about-us' },
            { label: 'Groups', url: '/groups' },
            { label: 'Connect', url: '/connect' },
            { label: 'Donate', url: '/donate', class: 'donate-btn' }
        ];

        const currentPath = window.location.pathname;
        const normalize = p => (p === '/' || p === '') ? '/' : p.replace(/\/$/, '');
        const normalizedCurrent = normalize(currentPath);

        const isCurrent = (url) => {
            const normalizedUrl = normalize(url);
            if (normalizedUrl === '/' && normalizedCurrent === '/') return true;
            if (normalizedUrl !== '/' && (normalizedCurrent === normalizedUrl || normalizedCurrent.startsWith(normalizedUrl + '#'))) return true;
            return false;
        };

        // Header: MAIN church logo (full-color). Do NOT use footer logo (logo-white-2026.png).
        // Cloudflare Images main logo; ?v=2 forces reload past cache.
        const HEADER_LOGO_URL = "/assets/generated/media-ce06595d59.webp";

        const headerHTML = `
            <div class="header-container">
                <a href="/" class="logo-link">
                    <img src="${HEADER_LOGO_URL}" alt="Cypress Commons" class="logo-img">
                </a>

                <nav class="nav-desktop">
                    ${navLinks.map(link => `
                        <a href="${link.url}" class="nav-link ${link.class || ''} ${isCurrent(link.url) ? 'active' : ''}">${link.label}</a>
                    `).join('')}
                </nav>

                <button class="mobile-toggle" id="mobileToggle" aria-label="Toggle Menu">
                    <span></span>
                    <span></span>
                    <span></span>
                </button>
            </div>
        `;

        header.innerHTML = headerHTML;

        // Inject Mobile Menu if it doesn't exist
        if (!document.getElementById('mobileMenu')) {
            const overlay = document.createElement('div');
            overlay.className = 'mobile-menu-overlay';
            overlay.id = 'menuOverlay';
            document.body.appendChild(overlay);

            const mobileMenu = document.createElement('nav');
            mobileMenu.className = 'mobile-menu';
            mobileMenu.id = 'mobileMenu';
            mobileMenu.innerHTML = `
                <ul>
                    ${navLinks.map(link => `
                        <li><a href="${link.url}" class="${isCurrent(link.url) ? 'active' : ''}">${link.label}</a></li>
                    `).join('')}
                </ul>
            `;
            document.body.appendChild(mobileMenu);
        }

        // Logic
        const toggleBtn = document.getElementById('mobileToggle');
        const mobileMenu = document.getElementById('mobileMenu');
        const overlay = document.getElementById('menuOverlay');

        if (toggleBtn && mobileMenu && overlay) {
            const toggleMenu = () => {
                toggleBtn.classList.toggle('active');
                mobileMenu.classList.toggle('active');
                overlay.classList.toggle('active');
                document.body.style.overflow = mobileMenu.classList.contains('active') ? 'hidden' : '';
            };

            toggleBtn.addEventListener('click', toggleMenu);
            overlay.addEventListener('click', toggleMenu);
        }

        // Scroll management
        window.addEventListener('scroll', () => {
            if (window.scrollY > 20) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        }, { passive: true });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectHeader);
    } else {
        injectHeader();
    }
})();
