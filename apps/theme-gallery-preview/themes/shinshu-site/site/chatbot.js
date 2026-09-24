// Multilingual Chatbot for Shinshu Solutions
class ShinshuChatbot {
  constructor(apiUrl) {
    this.apiUrl = apiUrl || 'https://shinshu-solutions.meauxbility.workers.dev';
    this.sessionId = this.generateSessionId();
    this.isOpen = false;
    this.conversationHistory = [];
    this.currentLanguage = 'en';
    
    this.init();
  }

  generateSessionId() {
    return `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  init() {
    this.createChatbotUI();
    this.loadHistory();
  }

  createChatbotUI() {
    const chatbot = document.createElement('div');
    chatbot.id = 'shinshu-chatbot';
    chatbot.className = 'chatbot-container';
    chatbot.innerHTML = `
      <div class="chatbot-toggle" onclick="window.shinshuChatbot.toggle()">
        <svg class="icon"><use href="#icon-chat"></use></svg>
      </div>
      <div class="chatbot-window" id="chatbot-window">
        <div class="chatbot-header">
          <div class="chatbot-title">
            <svg class="icon"><use href="#icon-chat"></use></svg>
            <span data-i18n="chatbot.title">How can I help?</span>
          </div>
          <button class="chatbot-close" onclick="window.shinshuChatbot.toggle()">
            <svg class="icon"><use href="#icon-close"></use></svg>
          </button>
        </div>
        <div class="chatbot-messages" id="chatbot-messages"></div>
        <div class="chatbot-suggestions" id="chatbot-suggestions"></div>
        <div class="chatbot-input-container">
          <input 
            type="text" 
            id="chatbot-input" 
            class="chatbot-input"
            data-i18n="chatbot.placeholder"
            placeholder="Ask about our services, properties, or get assistance..."
            onkeypress="if(event.key==='Enter') window.shinshuChatbot.sendMessage()"
          />
          <button class="chatbot-send" onclick="window.shinshuChatbot.sendMessage()">
            <svg class="icon"><use href="#icon-send"></use></svg>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(chatbot);
    this.updatePlaceholder();
  }

  updatePlaceholder() {
    const input = document.getElementById('chatbot-input');
    if (input && window.i18n) {
      input.placeholder = window.i18n.t('chatbot.placeholder');
    }
  }

  toggle() {
    this.isOpen = !this.isOpen;
    const window = document.getElementById('chatbot-window');
    const toggle = document.querySelector('.chatbot-toggle');
    
    if (this.isOpen) {
      window.classList.add('open');
      toggle.classList.add('active');
      document.getElementById('chatbot-input').focus();
      this.showSuggestions();
    } else {
      window.classList.remove('open');
      toggle.classList.remove('active');
    }
  }

  showSuggestions() {
    const suggestionsEl = document.getElementById('chatbot-suggestions');
    if (!suggestionsEl || this.conversationHistory.length > 0) {
      if (suggestionsEl) suggestionsEl.style.display = 'none';
      return;
    }

    suggestionsEl.style.display = 'flex';
    const suggestions = window.i18n ? window.i18n.t('chatbot.suggestions', {}, true) : [];
    
    if (Array.isArray(suggestions)) {
      suggestionsEl.innerHTML = suggestions.map(s => 
        `<button class="suggestion-btn" onclick="window.shinshuChatbot.sendSuggestion('${s}')">${s}</button>`
      ).join('');
    }
  }

  sendSuggestion(text) {
    document.getElementById('chatbot-input').value = text;
    this.sendMessage();
  }

  async sendMessage() {
    const input = document.getElementById('chatbot-input');
    const message = input.value.trim();
    if (!message) return;

    input.value = '';
    this.addMessage('user', message);
    this.hideSuggestions();
    this.showTyping();

    try {
      const response = await this.getBotResponse(message);
      this.hideTyping();
      this.addMessage('bot', response);
      this.saveToHistory(message, response);
    } catch (error) {
      this.hideTyping();
      const errorMsg = window.i18n ? window.i18n.t('chatbot.error') : 'Sorry, I encountered an error.';
      this.addMessage('bot', errorMsg);
      console.error('Chatbot error:', error);
    }
  }

  async getBotResponse(message) {
    // Use AI-powered chatbot API
    const lang = this.currentLanguage || window.i18n?.currentLanguage || 'en';
    
    try {
      const response = await fetch(`${this.apiUrl}/api/chatbot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message,
          sessionId: this.sessionId,
          language: lang,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.response) {
          return data.response;
        }
      }
    } catch (error) {
      console.error('Chatbot API error:', error);
    }
    
    // Fallback to rule-based responses
    const lowerMsg = message.toLowerCase();

    // Service inquiries
    if (lowerMsg.includes('service') || lowerMsg.includes('サービス') || lowerMsg.includes('服务')) {
      return this.getServiceInfo(lang);
    }

    // Contact information
    if (lowerMsg.includes('contact') || lowerMsg.includes('連絡') || lowerMsg.includes('联系') || 
        lowerMsg.includes('email') || lowerMsg.includes('電話') || lowerMsg.includes('电话')) {
      return this.getContactInfo(lang);
    }

    // Area/region inquiries
    if (lowerMsg.includes('area') || lowerMsg.includes('region') || lowerMsg.includes('地域') || 
        lowerMsg.includes('地区') || lowerMsg.includes('serve') || lowerMsg.includes('カバー')) {
      return this.getAreaInfo(lang);
    }

    // General help
    if (lowerMsg.includes('help') || lowerMsg.includes('助け') || lowerMsg.includes('帮助') || 
        lowerMsg.includes('start') || lowerMsg.includes('始め') || lowerMsg.includes('开始')) {
      return this.getGeneralHelp(lang);
    }

    // Default response
    return this.getDefaultResponse(lang, message);
  }

  getServiceInfo(lang) {
    const responses = {
      en: "We offer comprehensive bilingual services including translation & interpretation, client liaison, project coordination, property management, and cultural consulting. Our services are designed to bridge language and cultural gaps for foreign investors in Nagano. Would you like more details on any specific service?",
      ja: "翻訳・通訳、クライアント連絡、プロジェクト調整、不動産管理、文化的コンサルティングなど、包括的なバイリンガルサービスを提供しています。特定のサービスについて詳しく知りたいですか？",
      zh: "我们提供全面的双语服务，包括翻译和口译、客户联络、项目协调、物业管理和文化咨询。我们的服务旨在为长野的外国投资者弥合语言和文化差距。您想了解任何特定服务的更多详细信息吗？",
      ko: "번역 및 통역, 고객 연락, 프로젝트 조정, 부동산 관리 및 문화 컨설팅을 포함한 포괄적인 이중 언어 서비스를 제공합니다. 특정 서비스에 대한 자세한 내용을 원하시나요?"
    };
    return responses[lang] || responses.en;
  }

  getContactInfo(lang) {
    const responses = {
      en: "You can reach us at [email protected] or call +81 070-7476-5362. We're located in Komoro, Nagano Prefecture, Japan. Our service areas include Nozawa Onsen, Iiyama, Shinano, Myoko, and Karuizawa.",
      ja: "メールアドレス: [email protected]、電話: +81 070-7476-5362 までお問い合わせください。長野県小諸市に所在しています。サービスエリアは野沢温泉、飯山、信濃、妙高、軽井沢です。",
      zh: "您可以通过 [email protected] 或致电 +81 070-7476-5362 联系我们。我们位于日本长野县小诸市。我们的服务区域包括野泽温泉、饭山、信浓、妙高和轻井泽。",
      ko: "[email protected]로 연락하거나 +81 070-7476-5362로 전화하실 수 있습니다. 일본 나가노현 고모로시에 위치해 있습니다. 서비스 지역은 노자와 온천, 이이야마, 시나노, 묘코, 가루이자와입니다."
    };
    return responses[lang] || responses.en;
  }

  getAreaInfo(lang) {
    const responses = {
      en: "We primarily serve the Nozawa Onsen area, which was featured on Condé Nast Traveler as one of the world's top 9 ski resorts. We also work in Iiyama, Shinano, Myoko, Karuizawa, and the Komoro region.",
      ja: "主に野沢温泉エリアを中心にサービスを提供しています。野沢温泉はコンデナストトラベラーで世界トップ9のスキーリゾートの一つとして紹介されました。飯山、信濃、妙高、軽井沢、小諸地域でも活動しています。",
      zh: "我们主要服务于野泽温泉地区，该地区被《康泰纳仕旅行者》评为世界前9大滑雪胜地之一。我们还在饭山、信浓、妙高、轻井泽和小诸地区工作。",
      ko: "주로 노자와 온천 지역을 중심으로 서비스를 제공하며, 이 지역은 콘데 나스트 트래블러에서 세계 상위 9개 스키 리조트 중 하나로 선정되었습니다. 이이야마, 시나노, 묘코, 가루이자와, 고모로 지역에서도 활동합니다."
    };
    return responses[lang] || responses.en;
  }

  getGeneralHelp(lang) {
    const responses = {
      en: "I'm here to help you with information about Shinshu Solutions. I can answer questions about our services, contact information, service areas, or help you get started. What would you like to know?",
      ja: "信州ソリューションズに関する情報をお手伝いします。サービス、連絡先、サービスエリアについて質問に答えたり、始めるお手伝いをしたりできます。何を知りたいですか？",
      zh: "我在这里帮助您了解信州解决方案的信息。我可以回答有关我们的服务、联系信息、服务区域的问题，或帮助您开始。您想了解什么？",
      ko: "신슈 솔루션에 대한 정보를 도와드리기 위해 여기 있습니다. 서비스, 연락처 정보, 서비스 지역에 대한 질문에 답하거나 시작하는 데 도움을 드릴 수 있습니다. 무엇을 알고 싶으신가요?"
    };
    return responses[lang] || responses.en;
  }

  getDefaultResponse(lang, message) {
    const responses = {
      en: "Thank you for your message. I'm a virtual assistant for Shinshu Solutions. I can help you with information about our services, contact details, or service areas. Feel free to ask me anything!",
      ja: "メッセージありがとうございます。信州ソリューションズのバーチャルアシスタントです。サービス、連絡先、サービスエリアに関する情報をお手伝いできます。何でもお聞きください！",
      zh: "感谢您的留言。我是信州解决方案的虚拟助手。我可以帮助您了解我们的服务、联系方式或服务区域。请随时问我任何问题！",
      ko: "메시지를 보내주셔서 감사합니다. 신슈 솔루션의 가상 어시스턴트입니다. 서비스, 연락처 정보 또는 서비스 지역에 대한 정보를 도와드릴 수 있습니다. 무엇이든 물어보세요!"
    };
    return responses[lang] || responses.en;
  }

  addMessage(type, text) {
    const messagesEl = document.getElementById('chatbot-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chatbot-message ${type}`;
    messageDiv.innerHTML = `<div class="message-content">${this.escapeHtml(text)}</div>`;
    messagesEl.appendChild(messageDiv);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    
    this.conversationHistory.push({ type, text, timestamp: Date.now() });
  }

  showTyping() {
    const messagesEl = document.getElementById('chatbot-messages');
    const typingDiv = document.createElement('div');
    typingDiv.id = 'chatbot-typing';
    typingDiv.className = 'chatbot-message bot typing';
    typingDiv.innerHTML = `
      <div class="message-content">
        <span class="typing-indicator">
          <span></span><span></span><span></span>
        </span>
        ${window.i18n ? window.i18n.t('chatbot.typing') : 'Typing...'}
      </div>
    `;
    messagesEl.appendChild(typingDiv);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  hideTyping() {
    const typing = document.getElementById('chatbot-typing');
    if (typing) typing.remove();
  }

  hideSuggestions() {
    const suggestions = document.getElementById('chatbot-suggestions');
    if (suggestions) suggestions.style.display = 'none';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  saveToHistory(userMsg, botMsg) {
    const history = JSON.parse(localStorage.getItem('shinshu_chat_history') || '[]');
    history.push({
      sessionId: this.sessionId,
      userMessage: userMsg,
      botResponse: botMsg,
      language: this.currentLanguage,
      timestamp: Date.now()
    });
    // Keep last 50 messages
    if (history.length > 50) history.shift();
    localStorage.setItem('shinshu_chat_history', JSON.stringify(history));
  }

  loadHistory() {
    const history = JSON.parse(localStorage.getItem('shinshu_chat_history') || '[]');
    // Could load recent history if needed
  }

  setLanguage(lang) {
    this.currentLanguage = lang;
    this.updatePlaceholder();
  }
}

// Initialize chatbot when DOM is ready
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    if (!window.shinshuChatbot) {
      window.shinshuChatbot = new ShinshuChatbot();
    }
  });
}
