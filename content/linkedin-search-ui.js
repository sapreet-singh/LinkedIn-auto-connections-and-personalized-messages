class LinkedInSearchFloatingUI {
    constructor() {
        this.ui = null;
        this.isCollecting = false;
        this.collectedProfiles = [];
        this.config = window.LinkedInSearchConfig || {};
        this.init();
    }

    async init() {
        await this.loadDependencies();
        this.injectCSS();
        await this.loadHTMLTemplate();
        this.setupEventListeners();
        this.showUI();
    }

    async loadDependencies() {
        if (!window.LinkedInSearchConfig) {
            await this.loadScript('content/linkedin-search-config.js');
            this.config = window.LinkedInSearchConfig || {};
        }
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src*="${src}"]`)) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = chrome.runtime.getURL(src);
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    injectCSS() {
        if (document.getElementById('linkedin-search-ui-styles')) return;
        const link = document.createElement('link');
        link.id = 'linkedin-search-ui-styles';
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('content/linkedin-search-ui.css');
        link.onerror = () => {
            console.warn('Failed to load external CSS, falling back to inline styles');
            this.injectInlineCSS();
        };
        document.head.appendChild(link);
    }

    injectInlineCSS() {
        const style = document.createElement('style');
        style.id = 'linkedin-search-ui-inline-styles';
        style.textContent = `
            .linkedin-search-floating-ui {
                position: fixed !important;
                top: 80px !important;
                right: 20px !important;
                width: 420px !important;
                background: white !important;
                border-radius: 12px !important;
                box-shadow: 0 8px 32px rgba(0,0,0,0.15) !important;
                z-index: 999999 !important;
                display: flex !important;
                flex-direction: column !important;
            }
            .linkedin-search-header {
                background: linear-gradient(135deg, #0a66c2, #004182) !important;
                color: white !important;
                padding: 16px 20px !important;
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
            }
            .linkedin-search-btn {
                padding: 12px 16px !important;
                border: none !important;
                border-radius: 8px !important;
                font-weight: 600 !important;
                cursor: pointer !important;
            }
        `;
        document.head.appendChild(style);
    }

    async loadHTMLTemplate() {
        try {
            const response = await fetch(chrome.runtime.getURL('content/linkedin-search-ui.html'));
            const htmlContent = await response.text();
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = htmlContent;
            this.ui = tempDiv.firstElementChild;
            this.applyConfigurationToTemplate();

            document.body.appendChild(this.ui);

        } catch (error) {
            console.warn('Failed to load HTML template, using fallback:', error);
            this.createFallbackUI();
        }
    }

    applyConfigurationToTemplate() {
        if (!this.ui || !this.config) return;
        const elementsWithDataText = this.ui.querySelectorAll('[data-text]');

        elementsWithDataText.forEach(element => {
            const configPath = element.getAttribute('data-text');
            const configValue = this.getConfigValue(configPath);

            if (configValue) {
                if (element.id === 'start-connecting-btn') {
                    element.textContent = `${configValue} (0)`;
                } else if (element.classList.contains('profiles-count')) {
                    element.innerHTML = `${configValue} <span id="profile-count">0</span>`;
                } else {
                    element.textContent = configValue;
                }
            }
        });
    }

    getConfigValue(path) {
        const keys = path.split('.');
        let value = this.config;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return null;
            }
        }

        return value;
    }

    createFallbackUI() {
        console.error('Failed to load external HTML template. Creating minimal fallback UI.');

        this.ui = document.createElement('div');
        this.ui.className = 'linkedin-search-floating-ui';
        this.ui.innerHTML = `
            <div class="linkedin-search-header">
                <h3 class="linkedin-search-title">LinkedIn Search</h3>
                <button class="linkedin-search-close" title="Close">&times;</button>
            </div>
            <div class="linkedin-search-content">
                <p style="text-align: center; color: #dc3545; padding: 20px;">
                    Failed to load UI template. Please refresh the page.
                </p>
                <button class="linkedin-search-btn start" onclick="window.location.reload()">
                    Refresh Page
                </button>
            </div>
        `;
        document.body.appendChild(this.ui);

        this.ui.querySelector('.linkedin-search-close').addEventListener('click', () => {
            this.closeUI();
        });
    }

    setupEventListeners() {
        const showFiltersBtn = this.ui.querySelector('#show-filters-btn');
        const collectBtn = this.ui.querySelector('#collect-profiles-btn');
        const connectBtn = this.ui.querySelector('#start-connecting-btn');
        const clearBtn = this.ui.querySelector('#clear-profiles');
        const closeBtn = this.ui.querySelector('.linkedin-search-close');
        const minimizeBtn = this.ui.querySelector('.linkedin-search-minimize');
        const header = this.ui.querySelector('.linkedin-search-header');

        showFiltersBtn.addEventListener('click', () => this.showLinkedInFilters());
        collectBtn.addEventListener('click', () => this.collectProfiles());
        connectBtn.addEventListener('click', () => this.startConnecting());
        clearBtn.addEventListener('click', () => this.clearProfiles());
        closeBtn.addEventListener('click', () => this.closeUI());
        minimizeBtn.addEventListener('click', () => this.toggleMinimize());

        this.makeDraggable(header);
    }

    makeDraggable(handle) {
        let isDragging = false;
        let currentX, currentY, initialX, initialY;
        let xOffset = 0, yOffset = 0;

        handle.addEventListener('mousedown', (e) => {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            if (e.target === handle || handle.contains(e.target)) {
                isDragging = true;
                this.ui.style.cursor = 'grabbing';
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
                xOffset = currentX;
                yOffset = currentY;
                this.ui.style.transform = `translate(${currentX}px, ${currentY}px)`;
            }
        });

        document.addEventListener('mouseup', () => {
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
            this.ui.style.cursor = 'move';
        });
    }

    showLinkedInFilters() {
        this.updateStatus('status', this.config.messages?.status?.openingFilters || 'Opening LinkedIn search filters...', true);

        const collectBtn = this.ui.querySelector('#collect-profiles-btn');
        collectBtn.disabled = false;
        this.updateButtonText('collect-profiles-btn', 'messages.buttons.collectProfiles', 'COLLECT PROFILES');

        const searchUrl = this.config.urls?.linkedinSearchWithFilters || 'https://www.linkedin.com/search/results/people/?origin=FACETED_SEARCH&viewAllFilters=true';
        window.location.href = searchUrl;

        setTimeout(() => {
            this.updateStatus('status', this.config.messages?.status?.filtersOpened || 'LinkedIn filters opened. Now click "COLLECT PROFILES"', false);
        }, this.config.timing?.pageLoadWait || 2000);
    }

    collectProfiles() {
        this.updateStatus('status', this.config.messages?.status?.collecting || 'Collecting profiles...', true);
        this.isCollecting = true;

        const showFiltersBtn = this.ui.querySelector('#show-filters-btn');
        const collectBtn = this.ui.querySelector('#collect-profiles-btn');

        showFiltersBtn.disabled = true;
        this.updateButtonText('collect-profiles-btn', 'messages.buttons.collecting', 'COLLECTING...');
        collectBtn.disabled = true;

        this.startProfileCollection();
    }

    startProfileCollection() {
        const profileSelectors = this.config.selectors?.profiles || [
            '[data-chameleon-result-urn]',
            '.reusable-search__result-container',
            '.entity-result'
        ];

        const profiles = document.querySelectorAll(profileSelectors.join(', '));
        const delay = this.config.timing?.profileCollectionDelay || 500;

        profiles.forEach((profile, index) => {
            setTimeout(() => {
                this.processProfile(profile);
                this.updateProfileCount();
            }, index * delay);
        });

        setTimeout(() => {
            this.showNextButton();
        }, profiles.length * delay + (this.config.timing?.statusUpdateDelay || 1000));
    }

    processProfile(profileElement) {
        const nameSelectors = this.config.selectors?.profileName || ['.entity-result__title-text a', '.actor-name'];
        const titleSelectors = this.config.selectors?.profileTitle || ['.entity-result__primary-subtitle', '.actor-occupation'];
        const locationSelectors = this.config.selectors?.profileLocation || ['.entity-result__secondary-subtitle', '.actor-meta'];

        const profileData = {
            name: this.getTextFromSelectors(profileElement, nameSelectors) || 'Unknown',
            url: this.getHrefFromSelectors(profileElement, nameSelectors) || '',
            title: this.getTextFromSelectors(profileElement, titleSelectors) || '',
            location: this.getTextFromSelectors(profileElement, locationSelectors) || ''
        };

        if (profileData.url) {
            this.collectedProfiles.push(profileData);
            this.updateProfilesList();
        }
    }

    getTextFromSelectors(element, selectors) {
        for (const selector of selectors) {
            const found = element.querySelector(selector);
            if (found && found.textContent) {
                return found.textContent.trim();
            }
        }
        return null;
    }

    getHrefFromSelectors(element, selectors) {
        for (const selector of selectors) {
            const found = element.querySelector(selector);
            if (found && found.href) {
                return found.href;
            }
        }
        return null;
    }

    updateProfileCount() {
        const countElement = this.ui.querySelector('#profile-count');
        countElement.textContent = this.collectedProfiles.length;

        const nextBtn = this.ui.querySelector('#start-connecting-btn');
        nextBtn.textContent = `Next: Start Connecting (${this.collectedProfiles.length})`;
    }

    updateProfilesList() {
        const profilesList = this.ui.querySelector('#profiles-list');
        const emptyMessage = this.config.messages?.empty?.profiles || 'No profiles collected yet. Click "Show LinkedIn Filters" to begin.';

        if (this.collectedProfiles.length === 0) {
            profilesList.innerHTML = `<div class="empty-profiles">${emptyMessage}</div>`;
        } else {
            profilesList.innerHTML = this.collectedProfiles.map((profile) => `
                <div class="profile-item">
                    <strong>${profile.name}</strong><br>
                    <span>${profile.title}</span>
                </div>
            `).join('');
        }
    }

    showNextButton() {
        const nextBtn = this.ui.querySelector('#start-connecting-btn');
        const buttonText = this.config.messages?.buttons?.startConnecting || 'Next: Start Connecting';

        nextBtn.style.display = 'block';
        nextBtn.disabled = this.collectedProfiles.length === 0;
        nextBtn.textContent = `${buttonText} (${this.collectedProfiles.length})`;

        const statusMessage = `${this.config.messages?.status?.collected || 'profiles collected. Ready to connect!'}`;
        this.updateStatus('status', `Collected ${this.collectedProfiles.length} ${statusMessage}`, false);
    }

    startConnecting() {
        this.updateStatus('status', this.config.messages?.status?.connecting || 'Starting connection requests...', true);
        this.processConnectionRequests();
    }

    processConnectionRequests() {
        console.log('Processing connection requests for:', this.collectedProfiles);
        
        const sendRatio = this.config.stats?.sendConnectRatio || 0.7;
        const fieldRatio = this.config.stats?.fieldConnectRatio || 0.3;

        const sendConnectCount = this.ui.querySelector('#send-connect-count');
        const fieldConnectCount = this.ui.querySelector('#field-connect-count');

        sendConnectCount.textContent = Math.floor(this.collectedProfiles.length * sendRatio);
        fieldConnectCount.textContent = Math.floor(this.collectedProfiles.length * fieldRatio);
    }

    clearProfiles() {
        this.collectedProfiles = [];
        this.updateProfileCount();
        this.updateProfilesList();

        // Reset UI state
        const showFiltersBtn = this.ui.querySelector('#show-filters-btn');
        const collectBtn = this.ui.querySelector('#collect-profiles-btn');
        const nextBtn = this.ui.querySelector('#start-connecting-btn');

        showFiltersBtn.disabled = false;
        collectBtn.disabled = true;
        collectBtn.textContent = this.config.messages?.buttons?.collectProfiles || 'COLLECT PROFILES';
        nextBtn.style.display = 'none';

        // Reset stats
        this.ui.querySelector('#send-connect-count').textContent = '0';
        this.ui.querySelector('#field-connect-count').textContent = '0';

        this.updateStatus('status', this.config.messages?.status?.ready || 'Ready to show LinkedIn filters', false);
    }

    updateStatus(statusType, message, isActive = false) {
        const statusText = this.ui.querySelector(`#${statusType}-text`);
        const statusDot = this.ui.querySelector(`#${statusType}-dot`);

        if (statusText) statusText.textContent = message;
        if (statusDot) {
            statusDot.classList.toggle('active', isActive);
        }
    }

    // Utility method to update any element text using configuration
    updateElementText(elementId, configPath, fallbackText = '') {
        const element = this.ui.querySelector(`#${elementId}`);
        if (element) {
            const configValue = this.getConfigValue(configPath);
            element.textContent = configValue || fallbackText;
        }
    }

    // Utility method to update button text using configuration
    updateButtonText(buttonId, configPath, fallbackText = '', suffix = '') {
        const button = this.ui.querySelector(`#${buttonId}`);
        if (button) {
            const configValue = this.getConfigValue(configPath);
            button.textContent = `${configValue || fallbackText}${suffix}`;
        }
    }

    showUI() {
        if (this.ui) {
            this.ui.style.display = 'flex';
            this.ui.style.visibility = 'visible';
            this.ui.style.opacity = '1';
        }
    }

    closeUI() {
        if (this.ui) {
            this.ui.remove();
        }
    }

    toggleMinimize() {
        const content = this.ui.querySelector('.linkedin-search-content');
        if (content.style.display === 'none') {
            content.style.display = 'block';
        } else {
            content.style.display = 'none';
        }
    }
}

// Auto-initialize when on LinkedIn search pages
function initLinkedInSearchUI() {
    if (window.location.href.includes('linkedin.com/search') &&
        !document.querySelector('.linkedin-search-floating-ui') &&
        !window['linkedInSearchUI']) {

        // Wait for page to load
        setTimeout(() => {
            window['linkedInSearchUI'] = new LinkedInSearchFloatingUI();
        }, 2000);
    }
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLinkedInSearchUI);
} else {
    initLinkedInSearchUI();
}

// Re-initialize on navigation changes
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        setTimeout(initLinkedInSearchUI, 1000);
    }
}).observe(document, { subtree: true, childList: true });

window.LinkedInSearchFloatingUI = LinkedInSearchFloatingUI;
