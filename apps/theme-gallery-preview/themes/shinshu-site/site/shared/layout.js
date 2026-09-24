/**
 * Shinshu Solutions - Shared Layout & API Client
 * Handles navigation, API calls, and shared functionality
 */

const SHINSHU_API = {
  baseUrl: window.location.origin.includes('shinshu-solutions') 
    ? 'https://shinshu-solutions.meauxbility.workers.dev'
    : '/api',
  
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      
      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  // Clients
  async getClients() {
    return this.request('/api/clients');
  },
  
  async getClient(id) {
    return this.request(`/api/clients/${id}`);
  },
  
  async createClient(data) {
    return this.request('/api/clients', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  
  async updateClient(id, data) {
    return this.request(`/api/clients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  
  async deleteClient(id) {
    return this.request(`/api/clients/${id}`, {
      method: 'DELETE',
    });
  },

  // Properties
  async getProperties(clientId = null) {
    const endpoint = clientId ? `/api/properties?client_id=${clientId}` : '/api/properties';
    return this.request(endpoint);
  },
  
  async getProperty(id) {
    return this.request(`/api/properties/${id}`);
  },
  
  async createProperty(data) {
    return this.request('/api/properties', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  
  async updateProperty(id, data) {
    return this.request(`/api/properties/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  
  async deleteProperty(id) {
    return this.request(`/api/properties/${id}`, {
      method: 'DELETE',
    });
  },

  // Projects
  async getProjects(clientId = null, propertyId = null, status = null) {
    let endpoint = '/api/projects';
    const params = new URLSearchParams();
    if (clientId) params.append('client_id', clientId);
    if (propertyId) params.append('property_id', propertyId);
    if (status) params.append('status', status);
    if (params.toString()) endpoint += `?${params.toString()}`;
    return this.request(endpoint);
  },
  
  async getProject(id) {
    return this.request(`/api/projects/${id}`);
  },
  
  async createProject(data) {
    return this.request('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  
  async updateProject(id, data) {
    return this.request(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
  
  async deleteProject(id) {
    return this.request(`/api/projects/${id}`, {
      method: 'DELETE',
    });
  },

  // Services
  async getServices(projectId = null) {
    const endpoint = projectId ? `/api/services?project_id=${projectId}` : '/api/services';
    return this.request(endpoint);
  },
  
  async createService(data) {
    return this.request('/api/services', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Contacts
  async getContacts(clientId = null) {
    const endpoint = clientId ? `/api/contacts?client_id=${clientId}` : '/api/contacts';
    return this.request(endpoint);
  },
  
  async createContact(data) {
    return this.request('/api/contacts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Documents
  async getDocuments(clientId = null, propertyId = null, projectId = null) {
    let endpoint = '/api/documents';
    const params = new URLSearchParams();
    if (clientId) params.append('client_id', clientId);
    if (propertyId) params.append('property_id', propertyId);
    if (projectId) params.append('project_id', projectId);
    if (params.toString()) endpoint += `?${params.toString()}`;
    return this.request(endpoint);
  },
  
  async uploadDocument(formData) {
    const url = `${this.baseUrl}/api/documents`;
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });
    return response.json();
  },
  
  getDocumentUrl(id) {
    return `${this.baseUrl}/api/documents/download/${id}`;
  },
};

// Navigation System
const Navigation = {
  currentPage: 'home',
  
  init() {
    // Set active page from URL hash
    const hash = window.location.hash.replace('#', '') || 'home';
    this.navigateTo(hash);
    
    // Handle browser back/forward
    window.addEventListener('popstate', () => {
      const hash = window.location.hash.replace('#', '') || 'home';
      this.navigateTo(hash, false);
    });
  },
  
  navigateTo(pageName, updateHistory = true) {
    this.currentPage = pageName;
    
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
      page.classList.remove('active');
    });
    
    // Show target page
    const targetPage = document.getElementById(`${pageName}-page`);
    if (targetPage) {
      targetPage.classList.add('active');
    }
    
    // Update nav links
    document.querySelectorAll('.nav-link').forEach(link => {
      if (link.getAttribute('data-page') === pageName) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
    
    // Update URL
    if (updateHistory) {
      window.history.pushState({ page: pageName }, '', `#${pageName}`);
    }
    
    // Scroll to top
    window.scrollTo(0, 0);
    
    // Load page-specific data
    if (pageName === 'dashboard') {
      this.loadDashboardData();
    }
  },
  
  async loadDashboardData() {
    try {
      const [clientsRes, propertiesRes, projectsRes] = await Promise.all([
        SHINSHU_API.getClients(),
        SHINSHU_API.getProperties(),
        SHINSHU_API.getProjects(),
      ]);
      
      const clients = clientsRes.data || [];
      const properties = propertiesRes.data || [];
      const projects = projectsRes.data || [];
      const activeProjects = projects.filter(p => p.status === 'in_progress');
      
      // Update counts
      document.getElementById('clientsCount').textContent = clients.length;
      document.getElementById('propertiesCount').textContent = properties.length;
      document.getElementById('projectsCount').textContent = activeProjects.length;
      
      // Render clients table
      const clientsTable = document.getElementById('clientsTable');
      if (clients.length === 0) {
        clientsTable.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-gray);">No clients yet. Start by creating your first client!</td></tr>';
      } else {
        clientsTable.innerHTML = clients.slice(0, 10).map(client => `
          <tr>
            <td>${escapeHtml(client.name || 'N/A')}</td>
            <td>${escapeHtml(client.email || 'N/A')}</td>
            <td>${escapeHtml(client.country || 'N/A')}</td>
            <td>${escapeHtml(client.phone || 'N/A')}</td>
            <td><span class="badge badge-${client.status === 'active' ? 'success' : 'warning'}">${escapeHtml(client.status || 'active')}</span></td>
          </tr>
        `).join('');
      }
      
      // Render projects table
      const projectsTable = document.getElementById('projectsTable');
      if (projects.length === 0) {
        projectsTable.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-gray);">No projects yet. Start tracking your first project!</td></tr>';
      } else {
        projectsTable.innerHTML = projects.slice(0, 10).map(project => {
          let badgeClass = 'badge-warning';
          if (project.status === 'completed') badgeClass = 'badge-success';
          if (project.status === 'in_progress') badgeClass = 'badge-info';
          
          const budget = project.budget ? `¥${Number(project.budget).toLocaleString()}` : 'N/A';
          const startDate = project.start_date ? new Date(project.start_date * 1000).toLocaleDateString() : 'Not set';
          
          return `
            <tr>
              <td>${escapeHtml(project.name || 'N/A')}</td>
              <td>${escapeHtml(project.project_type || 'N/A')}</td>
              <td><span class="badge ${badgeClass}">${escapeHtml(project.status || 'planning')}</span></td>
              <td>${budget}</td>
              <td>${startDate}</td>
            </tr>
          `;
        }).join('');
      }
      
      // Hide loading, show content
      document.getElementById('dashboard-content').style.display = 'block';
    } catch (error) {
      console.error('Error loading dashboard:', error);
      document.getElementById('clientsTable').innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: #dc2626;">Error loading data. Check console for details.</td></tr>';
    }
  },
};

// Utility: Escape HTML
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Navigation.init());
} else {
  Navigation.init();
}
