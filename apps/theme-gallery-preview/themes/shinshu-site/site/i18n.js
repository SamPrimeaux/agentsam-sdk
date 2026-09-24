// Internationalization System for Shinshu Solutions
// Supports: English, Japanese, Chinese (Simplified), Korean

const i18n = {
  // Detect user's preferred language from browser/system
  detectLanguage() {
    // Check localStorage first (user preference)
    const savedLang = localStorage.getItem('shinshu_language');
    if (savedLang && i18n.translations[savedLang]) {
      return savedLang;
    }

    // Check browser language
    const browserLang = navigator.language || navigator.userLanguage;
    const langCode = browserLang.split('-')[0].toLowerCase();

    // Map common languages
    const langMap = {
      'ja': 'ja', // Japanese
      'zh': 'zh', // Chinese
      'ko': 'ko', // Korean
      'en': 'en'  // English (default)
    };

    return langMap[langCode] || 'en';
  },

  // Set language preference
  setLanguage(langCode) {
    if (i18n.translations[langCode]) {
      localStorage.setItem('shinshu_language', langCode);
      i18n.currentLanguage = langCode;
      document.documentElement.lang = langCode;

      // Force update immediately - use requestAnimationFrame for smooth updates
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          requestAnimationFrame(() => {
            i18n.updatePageContent();
          });
        });
      } else {
        requestAnimationFrame(() => {
          i18n.updatePageContent();
        });
      }

      return true;
    } else {
      return false;
    }
  },

  // Get translation
  t(key, params = {}) {
    if (!key) return '';

    const keys = key.split('.');
    let value = i18n.translations[i18n.currentLanguage];

    // Navigate through nested object
    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k];
      } else {
        value = undefined;
        break;
      }
    }

    // Fallback to English if translation not found
    if (!value || (typeof value !== 'string' && typeof value !== 'number')) {
      value = i18n.translations.en;
      for (const k of keys) {
        if (value && typeof value === 'object') {
          value = value[k];
        } else {
          value = undefined;
          break;
        }
      }
    }

    // If still no value, return the key (for debugging)
    if (!value) {
      return key;
    }

    // Replace parameters
    if (typeof value === 'string' && params) {
      return value.replace(/\{\{(\w+)\}\}/g, (match, param) => {
        return params[param] || match;
      });
    }

    return value;
  },

  // Update all page content
  updatePageContent() {
    // Update all elements with data-i18n attribute
    const elements = document.querySelectorAll('[data-i18n]');

    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;

      const translation = i18n.t(key);

      if (!translation || translation === key) {
        return; // Skip if no translation found
      }

      try {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          if (el.hasAttribute('data-i18n-placeholder')) {
            const placeholderKey = el.getAttribute('data-i18n-placeholder');
            el.placeholder = i18n.t(placeholderKey);
          } else {
            el.value = translation;
          }
        } else if (el.hasAttribute('data-i18n-html')) {
          // Allow HTML content
          el.innerHTML = translation;
        } else if (el.tagName === 'LABEL') {
          el.textContent = translation;
        } else if (el.tagName === 'BUTTON') {
          el.textContent = translation;
        } else {
          el.textContent = translation;
        }
      } catch (error) {
        // Silently fail for individual elements
      }
    });

    // Update placeholders separately
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const translation = i18n.t(key);
      if (translation && translation !== key) {
        el.placeholder = translation;
      }
    });

    // Update page title
    document.title = i18n.t('meta.title');

    // Update meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.content = i18n.t('meta.description');
    }

    // Update hero title with special handling
    const heroPrefix = document.querySelector('[data-i18n="hero.title.prefix"]');
    const heroHighlight = document.querySelector('[data-i18n="hero.titleHighlight"]');
    const heroSuffix = document.querySelector('[data-i18n="hero.title.suffix"]');

    if (heroPrefix) {
      const prefixText = i18n.t('hero.title.prefix');
      if (prefixText && prefixText !== 'hero.title.prefix') {
        heroPrefix.textContent = prefixText;
      }
    }
    if (heroHighlight) {
      const highlightText = i18n.t('hero.titleHighlight');
      if (highlightText && highlightText !== 'hero.titleHighlight') {
        heroHighlight.textContent = highlightText;
      }
    }
    if (heroSuffix) {
      const suffixText = i18n.t('hero.title.suffix');
      if (suffixText && suffixText !== 'hero.title.suffix') {
        heroSuffix.textContent = suffixText;
      }
    }

    // Update lists (qualifications, service areas, etc.)
    this.updateLists();
  },

  // Update list items
  updateLists() {
    // Qualifications list
    const qualList = document.querySelector('[data-i18n-list="about.qualifications"]');
    if (qualList) {
      const items = [
        i18n.t('about.qual1'),
        i18n.t('about.qual2'),
        i18n.t('about.qual3'),
        i18n.t('about.qual4'),
        i18n.t('about.qual5'),
        i18n.t('about.qual6'),
        i18n.t('about.qual7')
      ];
      qualList.innerHTML = items.map(item => `<li>${item}</li>`).join('');
    }

    // Service areas list
    const areasList = document.querySelector('[data-i18n-list="about.serviceAreas"]');
    if (areasList) {
      const items = [
        i18n.t('about.area1'),
        i18n.t('about.area2'),
        i18n.t('about.area3'),
        i18n.t('about.area4'),
        i18n.t('about.area5'),
        i18n.t('about.area6')
      ];
      areasList.innerHTML = items.map(item => `<li>${item}</li>`).join('');
    }

    // Service features lists
    document.querySelectorAll('[data-i18n-features]').forEach(list => {
      const serviceType = list.getAttribute('data-i18n-features');
      const features = [
        i18n.t(`servicesPage.${serviceType}.feature1`),
        i18n.t(`servicesPage.${serviceType}.feature2`),
        i18n.t(`servicesPage.${serviceType}.feature3`),
        i18n.t(`servicesPage.${serviceType}.feature4`),
        i18n.t(`servicesPage.${serviceType}.feature5`),
        i18n.t(`servicesPage.${serviceType}.feature6`)
      ];
      list.innerHTML = features.map(f => `<li>${f}</li>`).join('');
    });
  },

  currentLanguage: 'en',

  translations: {
    en: {
      meta: {
        title: 'Shinshu Solutions - Opening Nagano to the World',
        description: 'Expert bilingual support for foreign real estate investors in Nagano, Japan'
      },
      nav: {
        home: 'Home',
        about: 'About',
        services: 'Services',
        contact: 'Contact',
        dashboard: 'Dashboard',
        language: 'Language',
        tagline: 'Opening Nagano to the World'
      },
      hero: {
        title: {
          prefix: 'Navigating',
          highlight: 'Real Estate Investment',
          suffix: 'in Japan'
        },
        titleHighlight: 'Real Estate Investment',
        subtitle: 'Expert bilingual support for foreign investors in Nagano\'s stunning Shinshu region. We bridge language and cultural gaps to help you successfully manage property investments in Japan\'s world-class ski resort areas.',
        cta: 'Get in Touch',
        stats: {
          experience: 'Years Experience',
          certified: 'JLPT Certified',
          bilingual: 'Bilingual'
        }
      },
      services: {
        title: 'Why Shinshu Solutions?',
        subtitle: 'Your trusted local partner for real estate success in Nagano, Japan',
        translation: {
          title: 'Translation & Interpretation',
          desc: 'Professional Japanese-English translation for property discussions, contractor meetings, site visits, and documents.'
        },
        liaison: {
          title: 'Client Liaison Services',
          desc: 'Support for Japanese businesses handling foreign clients, ensuring smooth communication and expectation alignment.'
        },
        coordination: {
          title: 'Introductions & Coordination',
          desc: 'Connect with trusted local realtors and contractors. Complete coordination support throughout your project.'
        },
        project: {
          title: 'Project Support',
          desc: 'Renovation and improvement project coordination, schedule tracking, budget management, and on-site check-ins.'
        },
        management: {
          title: 'Property Management',
          desc: 'Routine property checks, keyholding services, and repair coordination for absentee owners.'
        },
        cultural: {
          title: 'Cultural Bridge',
          desc: 'Navigate the cultural expectations that often lead to missed deadlines and budget overruns.'
        }
      },
      chatbot: {
        title: 'How can I help?',
        placeholder: 'Ask about our services, properties, or get assistance...',
        send: 'Send',
        typing: 'Typing...',
        error: 'Sorry, I encountered an error. Please try again.',
        suggestions: [
          'Tell me about your services',
          'How do I get started?',
          'What areas do you serve?',
          'Contact information'
        ]
      },
      dashboard: {
        title: 'Business Dashboard',
        subtitle: 'Manage your clients, properties, and projects',
        clients: 'Total Clients',
        properties: 'Properties',
        projects: 'Active Projects',
        recentClients: 'Recent Clients',
        recentProjects: 'Recent Projects',
        noData: 'No data available'
      },
      about: {
        title: 'About Jake Waalk',
        subtitle: 'Your local expert with deep roots in Nagano',
        intro1: 'Shinshu Solutions is a Nagano-based bilingual consulting service operated by Jake Waalk, specializing in supporting foreign real estate investors and Japanese construction firms. I help international clients navigate the practical realities of buying, renovating, and maintaining property in Japan.',
        intro2: 'My service area is centered on the world-class ski resort Nozawa Onsen, which was featured on the cover of Condé Nast Traveler as one of the world\'s top 9 ski resorts for the 2026 season. I also work in the surrounding region including Iiyama, Shinano, Myoko, Karuizawa, and nearby resort areas.',
        intro3: 'I relocated to Nagano Prefecture after earning my Master\'s Degree in Anthropology in 2015. Since then, I have amassed wide-ranging professional experience in Nagano across both the public and private sectors. I worked as an English teacher on the JET Program, serving two years as President of Nagano AJET.',
        intro4: 'From 2020 to 2021, I was employed by Tomi City on ecotourism development at the Tomi Tourism Association, where I became the first non-Japanese Town Development Officer in Nagano Prefecture. More recently, I worked in the Japanese mushroom industry, handling marketing and international client management for a Nagano-based export firm.',
        qualifications: 'Qualifications & Experience',
        qual1: 'JLPT N1 Certification (Highest Level of Japanese Fluency)',
        qual2: '5+ Years Technical Japanese-English Translation & Interpretation',
        qual3: 'Master\'s Degree in Anthropology',
        qual4: 'First Non-Japanese Town Development Officer in Nagano Prefecture',
        qual5: 'President of Nagano AJET (2 Years)',
        qual6: 'Deep Construction Industry Connections Through Family Ties',
        qual7: 'Export Industry Experience in International Client Management',
        serviceAreas: 'Service Areas',
        area1: 'Nozawa Onsen (Primary Focus)',
        area2: 'Iiyama',
        area3: 'Shinano',
        area4: 'Myoko',
        area5: 'Karuizawa',
        area6: 'Komoro Region'
      },
      servicesPage: {
        title: 'Our Services',
        subtitle: 'Comprehensive support for your real estate journey in Japan',
        translation: {
          title: 'Translation & Interpretation',
          desc: 'Professional Japanese-English translation and interpretation services for all aspects of your property investment.',
          feature1: 'Property discussion translation',
          feature2: 'Contractor meeting interpretation',
          feature3: 'Site visit coordination',
          feature4: 'Document translation',
          feature5: 'Legal document review',
          feature6: 'Contract negotiation support'
        },
        liaison: {
          title: 'Client Liaison for Japanese Businesses',
          desc: 'Support for Japanese companies handling foreign clients, ensuring smooth communication and cultural alignment.',
          feature1: 'Expectation alignment',
          feature2: 'Communication flow management',
          feature3: 'Cultural consultation',
          feature4: 'Foreign client support',
          feature5: 'Business practice guidance',
          feature6: 'Ongoing relationship management'
        },
        coordination: {
          title: 'Introductions & Coordination',
          desc: 'Connect with trusted local professionals and ensure seamless project coordination.',
          feature1: 'Realtor introductions',
          feature2: 'Contractor recommendations',
          feature3: 'Local government liaison',
          feature4: 'Service provider network',
          feature5: 'Project coordination',
          feature6: 'Stakeholder management'
        },
        project: {
          title: 'Renovation / Project Support',
          desc: 'Comprehensive support for renovation and improvement projects from planning to completion.',
          feature1: 'Contractor coordination',
          feature2: 'Schedule tracking',
          feature3: 'Budget management',
          feature4: 'On-site check-ins',
          feature5: 'Issue resolution',
          feature6: 'Quality assurance'
        },
        management: {
          title: 'Property Care & Management',
          desc: 'Reliable property management services for absentee owners.',
          feature1: 'Routine property checks',
          feature2: 'Keyholding services',
          feature3: 'Repair coordination',
          feature4: 'Maintenance scheduling',
          feature5: 'Emergency response',
          feature6: 'Seasonal preparation'
        }
      },
      contact: {
        title: 'Get in Touch',
        subtitle: 'Ready to start your real estate journey in Nagano?',
        email: 'Email',
        phone: 'Phone',
        location: 'Location',
        serviceAreas: 'Service Areas',
        serviceAreasList: 'Nozawa Onsen, Iiyama, Shinano, Myoko, Karuizawa',
        name: 'Name',
        emailPlaceholder: 'your.email@example.com',
        subject: 'Subject',
        message: 'Message',
        send: 'Send Message'
      }
    },
    ja: {
      meta: {
        title: '信州ソリューションズ - 長野を世界に開く',
        description: '長野県の外国人不動産投資家向け専門バイリンガルサポート'
      },
      nav: {
        home: 'ホーム',
        about: 'について',
        services: 'サービス',
        contact: 'お問い合わせ',
        dashboard: 'ダッシュボード',
        language: '言語',
        tagline: '長野を世界に開く'
      },
      hero: {
        title: {
          prefix: '日本の',
          highlight: '不動産投資',
          suffix: 'をナビゲート'
        },
        titleHighlight: '不動産投資',
        subtitle: '長野県の美しい信州地域で外国人投資家向けの専門バイリンガルサポート。言語と文化のギャップを埋め、日本の世界クラスのスキーリゾートエリアでの不動産投資の成功をサポートします。',
        cta: 'お問い合わせ',
        stats: {
          experience: '年の経験',
          certified: '日本語能力試験N1認定',
          bilingual: 'バイリンガル'
        }
      },
      services: {
        title: 'なぜ信州ソリューションズ？',
        subtitle: '長野県での不動産成功のための信頼できる現地パートナー',
        translation: {
          title: '翻訳・通訳',
          desc: '不動産の議論、請負業者との会議、現場訪問、書類のための専門的な日英翻訳。'
        },
        liaison: {
          title: 'クライアント連絡サービス',
          desc: '外国人クライアントを扱う日本企業のサポート、スムーズなコミュニケーションと期待値の調整を確保。'
        },
        coordination: {
          title: '紹介・調整',
          desc: '信頼できる現地の不動産業者や請負業者とのつながり。プロジェクト全体を通じた完全な調整サポート。'
        },
        project: {
          title: 'プロジェクトサポート',
          desc: '改築・改善プロジェクトの調整、スケジュール追跡、予算管理、現場チェックイン。'
        },
        management: {
          title: '不動産管理',
          desc: '定期的な不動産チェック、鍵の保管サービス、不在所有者向けの修理調整。'
        },
        cultural: {
          title: '文化的架け橋',
          desc: '期限の遅れや予算超過につながることが多い文化的期待をナビゲート。'
        }
      },
      chatbot: {
        title: 'どのようにお手伝いできますか？',
        placeholder: 'サービス、物件について質問するか、サポートを受ける...',
        send: '送信',
        typing: '入力中...',
        error: '申し訳ございません。エラーが発生しました。もう一度お試しください。',
        suggestions: [
          'サービスについて教えてください',
          '始めるにはどうすればいいですか？',
          'どの地域をカバーしていますか？',
          '連絡先情報'
        ]
      },
      dashboard: {
        title: 'ビジネスダッシュボード',
        subtitle: 'クライアント、物件、プロジェクトを管理',
        clients: '総クライアント数',
        properties: '物件',
        projects: 'アクティブなプロジェクト',
        recentClients: '最近のクライアント',
        recentProjects: '最近のプロジェクト',
        noData: 'データがありません'
      },
      about: {
        title: 'ジェイク・ワークについて',
        subtitle: '長野に深いルーツを持つ現地の専門家',
        intro1: '信州ソリューションズは、ジェイク・ワークが運営する長野県を拠点とするバイリンガルコンサルティングサービスで、外国人不動産投資家と日本の建設会社をサポートすることに特化しています。国際的なクライアントが日本で不動産を購入、改築、維持する際の実践的な現実をナビゲートするお手伝いをします。',
        intro2: '私のサービスエリアは、2026シーズンの世界トップ9スキーリゾートの1つとしてコンデナストトラベラーの表紙に掲載された世界クラスのスキーリゾート野沢温泉を中心としています。飯山、信濃、妙高、軽井沢、および近隣のリゾートエリアでも活動しています。',
        intro3: '2015年に人類学の修士号を取得した後、長野県に移住しました。それ以来、公共部門と民間部門の両方で長野県における幅広い専門的な経験を積んできました。JETプログラムで英語教師として働き、2年間長野AJETの会長を務めました。',
        intro4: '2020年から2021年まで、私は戸美市の戸美観光協会でエコツーリズム開発に従事し、長野県で初の非日本人町づくり担当者になりました。最近では、長野県を拠点とする輸出会社でマーケティングと国際的なクライアント管理を担当し、日本のきのこ産業で働いていました。',
        qualifications: '資格と経験',
        qual1: '日本語能力試験N1認定（最高レベルの日本語能力）',
        qual2: '5年以上の技術的な日英翻訳・通訳',
        qual3: '人類学の修士号',
        qual4: '長野県初の非日本人町づくり担当者',
        qual5: '長野AJET会長（2年間）',
        qual6: '家族関係を通じた建設業界との深いつながり',
        qual7: '国際的なクライアント管理における輸出業界の経験',
        serviceAreas: 'サービスエリア',
        area1: '野沢温泉（主要焦点）',
        area2: '飯山',
        area3: '信濃',
        area4: '妙高',
        area5: '軽井沢',
        area6: '小諸地域'
      },
      servicesPage: {
        title: '私たちのサービス',
        subtitle: '日本での不動産の旅を包括的にサポート',
        translation: {
          title: '翻訳・通訳',
          desc: '不動産投資のあらゆる側面における専門的な日英翻訳・通訳サービス。',
          feature1: '不動産の議論の翻訳',
          feature2: '請負業者との会議の通訳',
          feature3: '現場訪問の調整',
          feature4: '書類の翻訳',
          feature5: '法的文書のレビュー',
          feature6: '契約交渉のサポート'
        },
        liaison: {
          title: '日本企業向けクライアント連絡',
          desc: '外国人クライアントを扱う日本企業のサポート、スムーズなコミュニケーションと文化的調整を確保。',
          feature1: '期待値の調整',
          feature2: 'コミュニケーションフローの管理',
          feature3: '文化的コンサルティング',
          feature4: '外国人クライアントのサポート',
          feature5: 'ビジネス慣行のガイダンス',
          feature6: '継続的な関係管理'
        },
        coordination: {
          title: '紹介・調整',
          desc: '信頼できる現地の専門家とつながり、シームレスなプロジェクト調整を確保。',
          feature1: '不動産業者の紹介',
          feature2: '請負業者の推奨',
          feature3: '地方自治体との連絡',
          feature4: 'サービスプロバイダーネットワーク',
          feature5: 'プロジェクト調整',
          feature6: 'ステークホルダー管理'
        },
        project: {
          title: '改築・プロジェクトサポート',
          desc: '計画から完成まで、改築および改善プロジェクトの包括的なサポート。',
          feature1: '請負業者の調整',
          feature2: 'スケジュール追跡',
          feature3: '予算管理',
          feature4: '現場チェックイン',
          feature5: '問題解決',
          feature6: '品質保証'
        },
        management: {
          title: '不動産ケア・管理',
          desc: '不在所有者向けの信頼できる不動産管理サービス。',
          feature1: '定期的な不動産チェック',
          feature2: '鍵の保管サービス',
          feature3: '修理の調整',
          feature4: 'メンテナンススケジュール',
          feature5: '緊急対応',
          feature6: '季節の準備'
        }
      },
      contact: {
        title: 'お問い合わせ',
        subtitle: '長野での不動産の旅を始める準備はできていますか？',
        email: 'メール',
        phone: '電話',
        location: '所在地',
        serviceAreas: 'サービスエリア',
        serviceAreasList: '野沢温泉、飯山、信濃、妙高、軽井沢',
        name: 'お名前',
        emailPlaceholder: 'your.email@example.com',
        subject: '件名',
        message: 'メッセージ',
        send: 'メッセージを送信'
      }
    },
    zh: {
      meta: {
        title: '信州解决方案 - 向世界开放长野',
        description: '为长野县外国房地产投资者提供专业双语支持'
      },
      nav: {
        home: '首页',
        about: '关于',
        services: '服务',
        contact: '联系',
        dashboard: '仪表板',
        language: '语言',
        tagline: '向世界开放长野'
      },
      hero: {
        title: {
          prefix: '导航',
          highlight: '房地产投资',
          suffix: '在日本'
        },
        titleHighlight: '房地产投资',
        subtitle: '为长野县美丽信州地区的外国投资者提供专业双语支持。我们弥合语言和文化差距，帮助您成功管理日本世界级滑雪胜地地区的房地产投资。',
        cta: '联系我们',
        stats: {
          experience: '年经验',
          certified: '日语能力测试N1认证',
          bilingual: '双语'
        }
      },
      services: {
        title: '为什么选择信州解决方案？',
        subtitle: '您在长野房地产成功的值得信赖的本地合作伙伴',
        translation: {
          title: '翻译与口译',
          desc: '为房地产讨论、承包商会议、现场访问和文件提供专业的日英翻译。'
        },
        liaison: {
          title: '客户联络服务',
          desc: '支持处理外国客户的日本企业，确保顺畅沟通和期望对齐。'
        },
        coordination: {
          title: '介绍与协调',
          desc: '与值得信赖的本地房地产经纪人和承包商建立联系。在整个项目中提供完整的协调支持。'
        },
        project: {
          title: '项目支持',
          desc: '翻新和改进项目协调、进度跟踪、预算管理和现场检查。'
        },
        management: {
          title: '物业管理',
          desc: '定期物业检查、钥匙保管服务和为缺席业主提供维修协调。'
        },
        cultural: {
          title: '文化桥梁',
          desc: '导航经常导致错过截止日期和预算超支的文化期望。'
        }
      },
      chatbot: {
        title: '我能如何帮助您？',
        placeholder: '询问我们的服务、物业或获得帮助...',
        send: '发送',
        typing: '正在输入...',
        error: '抱歉，我遇到了错误。请重试。',
        suggestions: [
          '告诉我您的服务',
          '如何开始？',
          '您服务哪些地区？',
          '联系信息'
        ]
      },
      dashboard: {
        title: '业务仪表板',
        subtitle: '管理您的客户、物业和项目',
        clients: '总客户数',
        properties: '物业',
        projects: '活跃项目',
        recentClients: '最近客户',
        recentProjects: '最近项目',
        noData: '无可用数据'
      },
      about: {
        title: '关于杰克·瓦尔克',
        subtitle: '您在长野的本地专家，在当地有深厚根基',
        intro1: '信州解决方案是由杰克·瓦尔克运营的位于长野的双语咨询服务，专门支持外国房地产投资者和日本建筑公司。我帮助国际客户应对在日本购买、翻新和维护房产的实际挑战。',
        intro2: '我的服务区域以世界级滑雪胜地野泽温泉为中心，该地区被《康泰纳仕旅行者》杂志评为2026年世界前9大滑雪胜地之一。我还在周边地区工作，包括饭山、信浓、妙高、轻井泽和附近的度假区。',
        intro3: '我在2015年获得人类学硕士学位后移居长野县。从那时起，我在长野的公共和私营部门积累了广泛的职业经验。我曾在JET项目中担任英语教师，并担任长野AJET主席两年。',
        intro4: '从2020年到2021年，我在户美市户美旅游协会从事生态旅游开发工作，成为长野县第一位非日本籍城镇发展官员。最近，我在日本蘑菇行业工作，为一家长野出口公司处理营销和国际客户管理。',
        qualifications: '资格与经验',
        qual1: 'JLPT N1认证（最高级别日语能力）',
        qual2: '5年以上技术日英翻译与口译',
        qual3: '人类学硕士学位',
        qual4: '长野县第一位非日本籍城镇发展官员',
        qual5: '长野AJET主席（2年）',
        qual6: '通过家庭关系与建筑行业的深厚联系',
        qual7: '国际客户管理的出口行业经验',
        serviceAreas: '服务区域',
        area1: '野泽温泉（主要焦点）',
        area2: '饭山',
        area3: '信浓',
        area4: '妙高',
        area5: '轻井泽',
        area6: '小诸地区'
      },
      servicesPage: {
        title: '我们的服务',
        subtitle: '为您的日本房地产之旅提供全面支持',
        translation: {
          title: '翻译与口译',
          desc: '为您的房地产投资的所有方面提供专业的日英翻译和口译服务。',
          feature1: '房地产讨论翻译',
          feature2: '承包商会议口译',
          feature3: '现场访问协调',
          feature4: '文件翻译',
          feature5: '法律文件审查',
          feature6: '合同谈判支持'
        },
        liaison: {
          title: '日本企业的客户联络',
          desc: '支持处理外国客户的日本公司，确保顺畅沟通和文化对齐。',
          feature1: '期望对齐',
          feature2: '沟通流程管理',
          feature3: '文化咨询',
          feature4: '外国客户支持',
          feature5: '商业实践指导',
          feature6: '持续关系管理'
        },
        coordination: {
          title: '介绍与协调',
          desc: '与值得信赖的本地专业人士建立联系，确保无缝项目协调。',
          feature1: '房地产经纪人介绍',
          feature2: '承包商推荐',
          feature3: '地方政府联络',
          feature4: '服务提供商网络',
          feature5: '项目协调',
          feature6: '利益相关者管理'
        },
        project: {
          title: '翻新/项目支持',
          desc: '从规划到完成，为翻新和改进项目提供全面支持。',
          feature1: '承包商协调',
          feature2: '进度跟踪',
          feature3: '预算管理',
          feature4: '现场检查',
          feature5: '问题解决',
          feature6: '质量保证'
        },
        management: {
          title: '物业护理与管理',
          desc: '为缺席业主提供可靠的物业管理服务。',
          feature1: '定期物业检查',
          feature2: '钥匙保管服务',
          feature3: '维修协调',
          feature4: '维护计划',
          feature5: '紧急响应',
          feature6: '季节性准备'
        }
      },
      contact: {
        title: '联系我们',
        subtitle: '准备好开始您在长野的房地产之旅了吗？',
        email: '电子邮件',
        phone: '电话',
        location: '位置',
        serviceAreas: '服务区域',
        serviceAreasList: '野泽温泉、饭山、信浓、妙高、轻井泽',
        name: '姓名',
        emailPlaceholder: 'your.email@example.com',
        subject: '主题',
        message: '消息',
        send: '发送消息'
      }
    },
    ko: {
      meta: {
        title: '신슈 솔루션 - 나가노를 세계에 열기',
        description: '나가노현 외국인 부동산 투자자를 위한 전문 이중 언어 지원'
      },
      nav: {
        home: '홈',
        about: '소개',
        services: '서비스',
        contact: '연락처',
        dashboard: '대시보드',
        language: '언어',
        tagline: '나가노를 세계에 열기'
      },
      hero: {
        title: {
          prefix: '일본',
          highlight: '부동산 투자',
          suffix: '탐색'
        },
        titleHighlight: '부동산 투자',
        subtitle: '나가노현의 아름다운 신슈 지역의 외국인 투자자를 위한 전문 이중 언어 지원. 언어와 문화적 격차를 메워 일본의 세계적 수준의 스키 리조트 지역에서 부동산 투자를 성공적으로 관리할 수 있도록 도와드립니다.',
        cta: '문의하기',
        stats: {
          experience: '년 경력',
          certified: 'JLPT N1 인증',
          bilingual: '이중 언어'
        }
      },
      services: {
        title: '왜 신슈 솔루션인가?',
        subtitle: '나가노에서 부동산 성공을 위한 신뢰할 수 있는 현지 파트너',
        translation: {
          title: '번역 및 통역',
          desc: '부동산 논의, 계약자 회의, 현장 방문 및 문서를 위한 전문 일본어-영어 번역.'
        },
        liaison: {
          title: '고객 연락 서비스',
          desc: '외국 고객을 처리하는 일본 기업 지원, 원활한 커뮤니케이션 및 기대치 정렬 보장.'
        },
        coordination: {
          title: '소개 및 조정',
          desc: '신뢰할 수 있는 현지 부동산 중개인 및 계약자와 연결. 프로젝트 전반에 걸친 완전한 조정 지원.'
        },
        project: {
          title: '프로젝트 지원',
          desc: '리노베이션 및 개선 프로젝트 조정, 일정 추적, 예산 관리 및 현장 체크인.'
        },
        management: {
          title: '부동산 관리',
          desc: '정기적인 부동산 점검, 열쇠 보관 서비스 및 부재 소유자를 위한 수리 조정.'
        },
        cultural: {
          title: '문화적 다리',
          desc: '종종 마감일을 놓치고 예산 초과로 이어지는 문화적 기대를 탐색.'
        }
      },
      chatbot: {
        title: '어떻게 도와드릴까요?',
        placeholder: '서비스, 부동산에 대해 질문하거나 도움을 받으세요...',
        send: '보내기',
        typing: '입력 중...',
        error: '죄송합니다. 오류가 발생했습니다. 다시 시도해 주세요.',
        suggestions: [
          '서비스에 대해 알려주세요',
          '어떻게 시작하나요?',
          '어떤 지역을 서비스하나요?',
          '연락처 정보'
        ]
      },
      dashboard: {
        title: '비즈니스 대시보드',
        subtitle: '고객, 부동산 및 프로젝트 관리',
        clients: '총 고객 수',
        properties: '부동산',
        projects: '활성 프로젝트',
        recentClients: '최근 고객',
        recentProjects: '최근 프로젝트',
        noData: '사용 가능한 데이터 없음'
      },
      about: {
        title: '제이크 왈크 소개',
        subtitle: '나가노에 깊은 뿌리를 둔 현지 전문가',
        intro1: '신슈 솔루션은 제이크 왈크가 운영하는 나가노 기반 이중 언어 컨설팅 서비스로, 외국인 부동산 투자자와 일본 건설 회사를 지원하는 데 특화되어 있습니다. 국제 고객이 일본에서 부동산을 구매, 리노베이션 및 유지 관리하는 실제 현실을 탐색할 수 있도록 도와드립니다.',
        intro2: '제 서비스 지역은 2026 시즌 세계 상위 9개 스키 리조트 중 하나로 콘데 나스트 트래블러 표지에 소개된 세계적 수준의 스키 리조트 노자와 온천을 중심으로 합니다. 이이야마, 시나노, 묘코, 가루이자와 및 인근 리조트 지역에서도 활동합니다.',
        intro3: '저는 2015년 인류학 석사 학위를 취득한 후 나가노현으로 이주했습니다. 그 이후 공공 및 민간 부문 모두에서 나가노에서 광범위한 전문 경험을 쌓았습니다. JET 프로그램에서 영어 교사로 일했으며 2년 동안 나가노 AJET 회장을 역임했습니다.',
        intro4: '2020년부터 2021년까지 토미시 토미 관광 협회에서 생태 관광 개발에 종사했으며, 나가노현 최초의 비일본인 마을 개발 담당자가 되었습니다. 최근에는 나가노 기반 수출 회사에서 마케팅 및 국제 고객 관리를 담당하여 일본 버섯 산업에서 일했습니다.',
        qualifications: '자격 및 경험',
        qual1: 'JLPT N1 인증 (최고 수준의 일본어 능력)',
        qual2: '5년 이상의 기술 일본어-영어 번역 및 통역',
        qual3: '인류학 석사 학위',
        qual4: '나가노현 최초의 비일본인 마을 개발 담당자',
        qual5: '나가노 AJET 회장 (2년)',
        qual6: '가족 관계를 통한 건설 산업과의 깊은 연결',
        qual7: '국제 고객 관리의 수출 산업 경험',
        serviceAreas: '서비스 지역',
        area1: '노자와 온천 (주요 초점)',
        area2: '이이야마',
        area3: '시나노',
        area4: '묘코',
        area5: '가루이자와',
        area6: '고모로 지역'
      },
      servicesPage: {
        title: '우리 서비스',
        subtitle: '일본에서의 부동산 여정을 위한 포괄적인 지원',
        translation: {
          title: '번역 및 통역',
          desc: '부동산 투자의 모든 측면에 대한 전문 일본어-영어 번역 및 통역 서비스.',
          feature1: '부동산 논의 번역',
          feature2: '계약자 회의 통역',
          feature3: '현장 방문 조정',
          feature4: '문서 번역',
          feature5: '법적 문서 검토',
          feature6: '계약 협상 지원'
        },
        liaison: {
          title: '일본 기업을 위한 고객 연락',
          desc: '외국 고객을 처리하는 일본 기업 지원, 원활한 커뮤니케이션 및 문화적 정렬 보장.',
          feature1: '기대치 정렬',
          feature2: '커뮤니케이션 흐름 관리',
          feature3: '문화적 상담',
          feature4: '외국 고객 지원',
          feature5: '비즈니스 관행 가이드',
          feature6: '지속적인 관계 관리'
        },
        coordination: {
          title: '소개 및 조정',
          desc: '신뢰할 수 있는 현지 전문가와 연결하고 원활한 프로젝트 조정을 보장.',
          feature1: '부동산 중개인 소개',
          feature2: '계약자 추천',
          feature3: '지방 정부 연락',
          feature4: '서비스 제공자 네트워크',
          feature5: '프로젝트 조정',
          feature6: '이해관계자 관리'
        },
        project: {
          title: '리노베이션 / 프로젝트 지원',
          desc: '계획부터 완료까지 리노베이션 및 개선 프로젝트에 대한 포괄적인 지원.',
          feature1: '계약자 조정',
          feature2: '일정 추적',
          feature3: '예산 관리',
          feature4: '현장 체크인',
          feature5: '문제 해결',
          feature6: '품질 보증'
        },
        management: {
          title: '부동산 관리',
          desc: '부재 소유자를 위한 신뢰할 수 있는 부동산 관리 서비스.',
          feature1: '정기적인 부동산 점검',
          feature2: '열쇠 보관 서비스',
          feature3: '수리 조정',
          feature4: '유지보수 일정',
          feature5: '비상 대응',
          feature6: '계절 준비'
        }
      },
      contact: {
        title: '문의하기',
        subtitle: '나가노에서 부동산 여정을 시작할 준비가 되셨나요?',
        email: '이메일',
        phone: '전화',
        location: '위치',
        serviceAreas: '서비스 지역',
        serviceAreasList: '노자와 온천, 이이야마, 시나노, 묘코, 가루이자와',
        name: '이름',
        emailPlaceholder: 'your.email@example.com',
        subject: '제목',
        message: '메시지',
        send: '메시지 보내기'
      }
    }
  }
};

// Initialize on load
if (typeof window !== 'undefined') {
  i18n.currentLanguage = i18n.detectLanguage();
  document.documentElement.lang = i18n.currentLanguage;

  // Make i18n globally accessible
  window.i18n = i18n;

  // Auto-update on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        if (i18n.updatePageContent) {
          i18n.updatePageContent();
        }
      }, 100);
    });
  } else {
    setTimeout(() => {
      if (i18n.updatePageContent) {
        i18n.updatePageContent();
      }
    }, 100);
  }
}
