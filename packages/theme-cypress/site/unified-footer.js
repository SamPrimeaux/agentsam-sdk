/* Unified Footer & Modal Logic - MASTER REMASTER */

function injectFooter() {
    const footer = document.getElementById('unified-footer');
    if (!footer) return;

    footer.innerHTML = `
        <div class="footer-container">
            <div class="footer-grid">
                <div class="footer-brand">
                    <img src="/assets/generated/media-ce06595d59.webp" alt="Cypress Commons" class="footer-logo">
                    <p class="footer-brand-text">
                        A Christ-centered community in River Parish where faith is lived, not just spoken. Join us as we serve our neighbors and grow deeper in Christ.
                    </p>
                    <div style="display: flex; gap: 1rem; margin-top: 1rem;">
                        <a href="https://facebook.com" target="_blank" style="color: white; opacity: 0.6;"><svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg></a>
                        <a href="https://youtube.com" target="_blank" style="color: white; opacity: 0.6;"><svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg></a>
                    </div>
                </div>

                <div class="footer-nav-col">
                    <h3>Explore</h3>
                    <ul>
                        <li><a href="/about-us">About Our Church</a></li>
                        <li><a href="/about-us#beliefs">What We Believe</a></li>
                        <li><a href="/mission">Model City Missions</a></li>
                        <li><a href="/sermons">Latest Sermons</a></li>
                    </ul>
                </div>

                <div class="footer-nav-col">
                    <h3>Communities</h3>
                    <ul>
                        <li><a href="/mensgroup">Fight Club (Men)</a></li>
                        <li><a href="/womansgroup">Rooted (Women)</a></li>
                        <li><a href="/connect">Get Connected</a></li>
                        <li><a href="/groups">Small Groups</a></li>
                    </ul>
                </div>

                <div class="footer-nav-col">
                    <h3>Visit Us</h3>
                    <div class="footer-contact-item">
                        <div class="footer-contact-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>
                        <div>100 Cypress Way<br>River Parish, LA 70000</div>
                    </div>
                    <div class="footer-contact-item">
                        <div class="footer-contact-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg></div>
                        <div>202-555-0100</div>
                    </div>
                    <div class="footer-contact-item">
                        <div class="footer-contact-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
                        <div>Sunday Service: 10:00 AM<br>Adult Bible Class: 9:30 AM</div>
                    </div>
                </div>
            </div>

            <div class="footer-bottom">
                <p>&copy; 2026 Cypress Commons. All rights reserved.</p>
                <div class="footer-bottom-links">
                    <a href="/admin">Staff Dashboard</a>
                    <a href="javascript:void(0)" onclick="openContactModal()">Contact Support</a>
                </div>
            </div>
        </div>
    `;
}

function openModal(type) {
    const overlay = document.getElementById('modalOverlay');
    if (!overlay) {
        createModalHTML();
    }

    const titles = {
        prayer: 'Prayer Request',
        question: 'Ask a Question',
        comment: 'Leave a Comment',
        contact: 'Contact Us'
    };

    document.getElementById('modalTitle').textContent = titles[type] || 'Contact Us';
    document.getElementById('modalOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function openContactModal() {
    openModal('contact');
}

async function handleUnifiedSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const data = Object.fromEntries(formData);
    const submitButton = event.target.querySelector('button');
    const originalText = submitButton.textContent;

    submitButton.textContent = 'Sending...';
    submitButton.disabled = true;

    try {
        const response = await fetch('/api/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: data.name,
                email: data.email,
                message: data.message,
                subject: document.getElementById('modalTitle').textContent
            })
        });

        if (response.ok) {
            alert('Thank you! Your message has been sent.');
            event.target.reset();
            closeModal();
        } else {
            throw new Error('Failed to send');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Sorry, there was an error. Please try calling us at 202-555-0100.');
    } finally {
        submitButton.textContent = originalText;
        submitButton.disabled = false;
    }
}

function createModalHTML() {
    const modalHTML = `
    <div class="modal-overlay" id="modalOverlay" onclick="if(event.target===this) closeModal()">
        <div class="modal">
            <div class="modal-header">
                <h2 class="modal-title" id="modalTitle">Contact Us</h2>
                <button class="modal-close" onclick="closeModal()">×</button>
            </div>
            <form onsubmit="handleUnifiedSubmit(event)">
                <div class="form-group">
                    <label class="form-label">Name</label>
                    <input type="text" name="name" class="form-input" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Email</label>
                    <input type="email" name="email" class="form-input" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Message</label>
                    <textarea name="message" class="form-textarea" required></textarea>
                </div>
                <button type="submit" class="form-submit">Send Message</button>
            </form>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Global exposure
window.openModal = openModal;
window.closeModal = closeModal;
window.openContactModal = openContactModal;
window.handleUnifiedSubmit = handleUnifiedSubmit;
window.toggleChatWindow = function () {
    openModal('question');
};

// Auto-inject on load
document.addEventListener('DOMContentLoaded', injectFooter);
