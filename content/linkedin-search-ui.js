class LinkedInSearchFloatingUI {
    constructor() {
        this.ui = null;
        this.isCollecting = false;
        this.collectedProfiles = [];
        this.config = window.LinkedInSearchConfig || {};
        this.collectionInterval = null;
        this.observer = null;
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
        const collectBtn = this.ui.querySelector('#collect-profiles-btn');
        const connectBtn = this.ui.querySelector('#start-connecting-btn');
        const clearBtn = this.ui.querySelector('#clear-profiles');
        const closeBtn = this.ui.querySelector('.linkedin-search-close');
        const minimizeBtn = this.ui.querySelector('.linkedin-search-minimize');
        const header = this.ui.querySelector('.linkedin-search-header');

        collectBtn.addEventListener('click', () => this.toggleCollecting());
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



    toggleCollecting() {
        if (this.isCollecting) {
            this.pauseCollecting();
        } else {
            this.startCollecting();
        }
    }

    startCollecting() {
        this.updateStatus('status', this.config.messages?.status?.collecting || 'Collecting profiles...', true);
        this.isCollecting = true;

        const collectBtn = this.ui.querySelector('#collect-profiles-btn');
        collectBtn.textContent = 'PAUSE COLLECTING';
        collectBtn.classList.remove('start');
        collectBtn.classList.add('pause');

        this.setupProfileObserver();
        this.collectCurrentPageProfiles();
        this.collectionInterval = setInterval(() => {
            this.collectCurrentPageProfiles();
        }, 3000);
    }

    pauseCollecting() {
        this.updateStatus('status', 'Collection paused. Click "START COLLECTING" to resume.', false);
        this.isCollecting = false;

        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }

        if (this.collectionInterval) {
            clearInterval(this.collectionInterval);
            this.collectionInterval = null;
        }

        const collectBtn = this.ui.querySelector('#collect-profiles-btn');
        collectBtn.textContent = 'START COLLECTING';
        collectBtn.classList.remove('pause');
        collectBtn.classList.add('start');
    }

    setupProfileObserver() {
        if (this.observer) return;
        this.observer = new MutationObserver((mutations) => {
            if (!this.isCollecting) return;
            let hasNewProfiles = false;
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1 && this.isProfileElement(node)) {
                        hasNewProfiles = true;
                    }
                });
            });
            if (hasNewProfiles) {
                setTimeout(() => this.collectCurrentPageProfiles(), 500);
            }
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
    }

    isProfileElement(element) {
        const selectors = ['.entity-result', '[data-chameleon-result-urn]', '.reusable-search__result-container', '.search-results__result-item', '[componentkey]'];
        return selectors.some(selector =>
            element.matches && element.matches(selector) ||
            element.querySelector && element.querySelector(selector)
        );
    }

    collectCurrentPageProfiles() {
        if (!this.isCollecting) return;
        const selectors = ['.entity-result', '[data-chameleon-result-urn]', '.reusable-search__result-container', '.search-results__result-item', 'div[componentkey]:has(a[href*="/in/"])', 'div:has(> div > figure img[alt]) div:has(a[href*="/in/"])'];
        let profileElements = [];
        for (const selector of selectors) {
            try {
                profileElements = document.querySelectorAll(selector);
                if (profileElements.length > 0) break;
            } catch (e) {
                continue;
            }
        }
        profileElements.forEach(element => {
            const profile = this.extractProfileData(element);
            if (profile && !this.isDuplicateProfile(profile)) {
                this.addProfile(profile);
            }
        });
    }

    extractProfileData(element) {
        try {
            const nameElement = element.querySelector('a[href*="/in/"][data-view-name="search-result-lockup-title"]') ||
                               element.querySelector('.entity-result__title-text a') ||
                               element.querySelector('.actor-name a') ||
                               element.querySelector('a[href*="/in/"]');
            if (!nameElement) return null;

            let name = nameElement.textContent?.trim();
            if (name && name.includes(' is reachable')) {
                name = name.replace(' is reachable', '').trim();
            }

            const url = nameElement.href.startsWith('http') ? nameElement.href : `https://www.linkedin.com${nameElement.getAttribute('href')}`;
            let title = '', company = '', location = '';
            const parentContainer = nameElement.closest('div[componentkey]') || element;
            const textElements = parentContainer.querySelectorAll('p');

            textElements.forEach((p) => {
                const text = p.textContent?.trim();
                if (!text || text.includes(name)) return;
                if (!title && text && !text.includes('•') && !text.includes(',')) {
                    title = text;
                } else if (!location && text && (text.includes(',') || text.includes('India') || text.includes('USA') || text.includes('UK'))) {
                    location = text;
                }
            });

            if (title && title.includes(' at ')) {
                const parts = title.split(' at ');
                title = parts[0]?.trim() || '';
                company = parts[1]?.trim() || '';
            }

            const imageElement = parentContainer.querySelector('img[alt="' + name + '"]') ||
                               parentContainer.querySelector('img[src*="profile"]') ||
                               parentContainer.querySelector('figure img');
            const profilePic = imageElement?.src || '';

            return { name, url, title, company, location, profilePic, timestamp: Date.now(), source: 'linkedin-search' };
        } catch (error) {
            console.error('Error extracting profile data:', error);
            return null;
        }
    }

    isDuplicateProfile(newProfile) {
        return this.collectedProfiles.some(profile =>
            profile.url === newProfile.url ||
            (profile.name === newProfile.name && profile.title === newProfile.title)
        );
    }

    addProfile(profile) {
        this.collectedProfiles.push(profile);
        this.updateProfilesList();
        this.updateProfileCount();
        this.showNextButton();
    }



    updateProfileCount() {
        const countElement = this.ui.querySelector('#profile-count');
        countElement.textContent = this.collectedProfiles.length;

        const nextBtn = this.ui.querySelector('#start-connecting-btn');
        nextBtn.textContent = `Next: Start Connecting (${this.collectedProfiles.length})`;
    }

    updateProfilesList() {
        const profilesList = this.ui.querySelector('#profiles-list');
        const emptyMessage = this.config.messages?.empty?.profiles || 'No profiles collected yet. Click "START COLLECTING" to begin.';

        if (this.collectedProfiles.length === 0) {
            profilesList.innerHTML = `<div class="empty-profiles">${emptyMessage}</div>`;
        } else {
            profilesList.innerHTML = this.collectedProfiles.map((profile, index) => `
                <div class="profile-item" data-profile-index="${index}">
                    <div class="profile-image">
                        ${profile.profilePic ?
                            `<img src="${profile.profilePic}" alt="${profile.name}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">` :
                            `<div class="profile-initial">${profile.name ? profile.name.charAt(0).toUpperCase() : '?'}</div>`
                        }
                    </div>
                    <div class="profile-info">
                        <div class="profile-name" title="${profile.name}">${profile.name}</div>
                        <div class="profile-title" title="${profile.title}">${profile.title}</div>
                        ${profile.company ? `<div class="profile-company" title="${profile.company}">${profile.company}</div>` : ''}
                        <div class="profile-url" title="${profile.url}" data-url="${profile.url}" style="cursor: pointer;">${this.shortenUrl(profile.url)}</div>
                    </div>
                    <div class="profile-actions">
                        <button class="profile-action-btn remove-profile-btn" data-url="${profile.url}" title="Remove">✕</button>
                    </div>
                </div>
            `).join('');

            // Add event listeners for profile actions
            profilesList.querySelectorAll('.profile-url').forEach(urlElement => {
                urlElement.addEventListener('click', (e) => {
                    const url = e.target.getAttribute('data-url');
                    this.copyProfileUrl(url);
                });
            });

            profilesList.querySelectorAll('.remove-profile-btn').forEach(removeBtn => {
                removeBtn.addEventListener('click', (e) => {
                    const url = e.target.getAttribute('data-url');
                    this.removeProfile(url);
                });
            });
        }
    }

    shortenUrl(url) {
        // Extract LinkedIn profile ID for cleaner display
        const match = url.match(/\/in\/([^\/\?]+)/);
        if (match) return `linkedin.com/in/${match[1]}`;
        return url.length > 30 ? url.substring(0, 30) + '...' : url;
    }

    copyProfileUrl(url) {
        navigator.clipboard.writeText(url).then(() => {
            const notification = document.createElement('div');
            notification.style.cssText = `position: fixed; top: 20px; right: 20px; background: #28a745; color: white; padding: 10px 15px; border-radius: 5px; z-index: 10001; font-size: 12px;`;
            notification.textContent = 'Profile URL copied!';
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 2000);
        }).catch(err => console.error('Failed to copy URL:', err));
    }

    removeProfile(url) {
        this.collectedProfiles = this.collectedProfiles.filter(profile => profile.url !== url);
        this.updateProfilesList();
        this.updateProfileCount();
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
        if (this.isCollecting) {
            this.pauseCollecting();
        }
        this.collectedProfiles = [];
        this.updateProfileCount();
        this.updateProfilesList();
        const collectBtn = this.ui.querySelector('#collect-profiles-btn');
        const nextBtn = this.ui.querySelector('#start-connecting-btn');
        collectBtn.disabled = false;
        collectBtn.textContent = 'START COLLECTING';
        collectBtn.classList.remove('pause');
        collectBtn.classList.add('start');
        nextBtn.style.display = 'none';
        this.ui.querySelector('#send-connect-count').textContent = '0';
        this.ui.querySelector('#field-connect-count').textContent = '0';
        this.updateStatus('status', this.config.messages?.status?.ready || 'Ready to start collecting profiles', false);
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
        if (this.isCollecting) {
            this.pauseCollecting();
        }
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
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
