
if (window.linkedInAutomationInjected) {
} else {
    window.linkedInAutomationInjected = true;

class LinkedInAutomation {
    constructor() {
        this.isRunning = false;
        this.currentCampaign = null;
        this.actionDelay = 30000;
        this.dailyLimit = 20;
        this.todayCount = 0;
        this.isRealTimeMode = false;
        this.isAutoCollecting = false;
        this.isAutoCollectionEnabled = true;
        this.currentPageCollected = false;
        this.autoProfileObserver = null;
        this.autoCollectionTimeout = null;
        this.processedProfiles = new Set();
        this.init();
    }

    init() {
        chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
            this.handleMessage(message, sendResponse);
        });
        this.setupAutoDetection();
        this.setupAutoPopupDetection();
        this.initSalesNavigatorUI();
        this.setupPageChangeDetection();
    }

    setupPageChangeDetection() {
        // Monitor for page changes during multi-page collection
        let lastUrl = location.href;
        const pageChangeObserver = new MutationObserver(() => {
            const currentUrl = location.href;
            if (currentUrl !== lastUrl) {
                lastUrl = currentUrl;

                // If we're in multi-page collection mode, re-initialize
                if (this.isRealTimeMode && currentUrl.includes('linkedin.com')) {
                    console.log('Page change detected during collection, re-initializing...');
                    setTimeout(() => {
                        this.handlePageChangeInCollection();
                    }, 2000);
                }
            }
        });

        pageChangeObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    handlePageChangeInCollection() {
        try {
            // Re-setup auto detection
            this.setupAutoDetection();

            // Ensure message listeners are still active
            if (!window.linkedInPageChangeHandled) {
                chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
                    this.handleMessage(message, sendResponse);
                });
                window.linkedInPageChangeHandled = true;
            }

            console.log('Page change handling completed');
        } catch (error) {
            console.error('Error handling page change:', error);
        }
    }

    initSalesNavigatorUI() {
        if (window.location.href.includes('/sales/search/people') || window.location.href.includes('linkedin.com/sales')) {
            // Directly initialize the floating UI in the content script context
            if (!window.salesNavigatorFloatingUI) {
                window.salesNavigatorFloatingUI = new SalesNavigatorFloatingUI();
            }
        }

        let lastUrl = location.href;
        const observer = new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                if ((url.includes('/sales/search/people') || url.includes('linkedin.com/sales')) && !window.salesNavigatorFloatingUI) {
                    window.salesNavigatorFloatingUI = new SalesNavigatorFloatingUI();
                }
            }
        });

        observer.observe(document, { subtree: true, childList: true });
    }

    setupAutoDetection() {
        if (this.isProfilePage() && this.isAutoCollectionEnabled) {
            setTimeout(() => this.startAutoCollection(), 2000);
        }
        this.setupPageChangeMonitoring();
    }

    isProfilePage() {
        const url = window.location.href;
        if (url.includes('/in/') && !url.includes('/search/')) return false;
        return url.includes('linkedin.com/search/results/people') ||
               url.includes('linkedin.com/search/people') ||
               url.includes('linkedin.com/sales/search/people') ||
               url.includes('linkedin.com/mynetwork') ||
               url.includes('linkedin.com/connections') ||
               (url.includes('linkedin.com') && document.querySelector('.reusable-search__result-container, [data-chameleon-result-urn], .search-result, .entity-result, .artdeco-entity-lockup'));
    }

    setupPageChangeMonitoring() {
        let currentUrl = window.location.href;
        const urlObserver = new MutationObserver(() => {
            if (window.location.href !== currentUrl) {
                currentUrl = window.location.href;
                setTimeout(() => {
                    if (this.isProfilePage() && !this.isAutoCollecting && this.isAutoCollectionEnabled) {
                        this.startAutoCollection();
                    }
                }, 2000);
            }
        });

        urlObserver.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('popstate', () => {
            setTimeout(() => {
                if (this.isProfilePage() && !this.isAutoCollecting && this.isAutoCollectionEnabled) {
                    this.startAutoCollection();
                }
            }, 2000);
        });
    }

    setupAutoPopupDetection() {
        if (document.readyState === 'complete') {
            setTimeout(() => this.showAutoPopup(), 3000);
        } else {
            window.addEventListener('load', () => {
                setTimeout(() => this.showAutoPopup(), 3000);
            });
        }
    }

    showAutoPopup() {
        try {
            this.createAutoPopupNotification();
        } catch (error) {
            console.error('Error showing auto popup:', error);
        }
    }

    createAutoPopupNotification() {
        const existing = document.getElementById('linkedin-auto-popup');
        if (existing) existing.remove();

        const popup = document.createElement('div');
        popup.id = 'linkedin-auto-popup';
        popup.innerHTML = `
            <div style="position: fixed; top: 20px; right: 20px; background: linear-gradient(135deg, #0077b5 0%, #005885 100%); color: white; padding: 20px; border-radius: 12px; box-shadow: 0 8px 32px rgba(0, 119, 181, 0.3); z-index: 10000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 350px; animation: slideIn 0.5s ease-out;">
                <div style="display: flex; align-items: center; margin-bottom: 15px;">
                    <div style="font-size: 24px; margin-right: 10px;">🚀</div>
                    <div>
                        <div style="font-weight: 600; font-size: 16px;">LinkedIn Automation Ready!</div>
                        <div style="font-size: 14px; opacity: 0.9;">Your automation tools are now active</div>
                    </div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button id="open-automation-popup" style="background: white; color: #0077b5; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; flex: 1; transition: all 0.2s;">Open Tools</button>
                    <button id="dismiss-popup" style="background: rgba(255,255,255,0.2); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; transition: all 0.2s;">Dismiss</button>
                </div>
            </div>
            <style>@keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }</style>
        `;

        document.body.appendChild(popup);

        popup.querySelector('#open-automation-popup').addEventListener('click', () => {
            this.openExtensionPopup();
            popup.remove();
        });

        popup.querySelector('#dismiss-popup').addEventListener('click', () => popup.remove());

        setTimeout(() => {
            if (popup.parentNode) popup.remove();
        }, 10000);
    }

    openExtensionPopup() {
        try {
            chrome.runtime.sendMessage({ action: 'openPopup' });
        } catch (error) {
            console.error('Error opening popup:', error);
        }
    }

    async startAutoCollection() {
        if (this.isAutoCollecting) return;
        this.isAutoCollecting = true;

        try {
            if (chrome.runtime?.id) {
                chrome.runtime.sendMessage({
                    action: 'autoCollectionStarted',
                    url: window.location.href
                });
            }
        } catch (error) {}

        this.collectAndSendProfiles();
        this.setupContinuousMonitoring();
    }

    async collectAndSendProfiles() {
        // Only use collectMultiplePages for non-Sales Navigator pages
        let profiles = [];
        if (!window.location.href.includes('sales/search/people')) {
            profiles = await this.collectMultiplePages(4);
        } else {
            profiles = await this.collectCurrentPageOnly();
        }
        if (profiles.length > 0) {
            this.sendProfilesRealTime(profiles);
        }
    }

    setupContinuousMonitoring() {
        const observer = new MutationObserver((mutations) => {
            let hasNewProfiles = false;
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const newProfileCards = node.querySelectorAll ?
                                node.querySelectorAll('.reusable-search__result-container, [data-chameleon-result-urn], .search-result, .entity-result') : [];
                            if (newProfileCards.length > 0) hasNewProfiles = true;
                        }
                    });
                }
            });

            if (hasNewProfiles) {
                clearTimeout(this.autoCollectionTimeout);
                this.autoCollectionTimeout = setTimeout(() => this.collectNewProfilesAuto(), 1500);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        this.autoProfileObserver = observer;
    }

    async collectNewProfilesAuto() {
        if (!this.isAutoCollecting) return;

        const profileCards = document.querySelectorAll('.reusable-search__result-container, [data-chameleon-result-urn], .search-result, .entity-result');
        const newProfiles = [];

        profileCards.forEach((card) => {
            if (card.dataset.autoProcessed) return;
            const profile = this.extractProfileFromCard(card);
            if (profile?.name && profile?.url) {
                newProfiles.push(profile);
                card.dataset.autoProcessed = 'true';
            }
        });

        if (newProfiles.length > 0) this.sendProfilesRealTime(newProfiles);
    }

    stopAutoCollection() {
        this.isAutoCollecting = false;
        if (this.autoProfileObserver) {
            this.autoProfileObserver.disconnect();
            this.autoProfileObserver = null;
        }
        if (this.autoCollectionTimeout) {
            clearTimeout(this.autoCollectionTimeout);
            this.autoCollectionTimeout = null;
        }
    }
    handleMessage(message, sendResponse) {
        if (!message || !message.action) {
            sendResponse({ error: 'Invalid message format' });
            return;
        }

        const actions = {
            startAutomation: () => { this.startAutomation(message.campaign); sendResponse({ success: true }); },
            stopAutomation: () => { this.stopAutomation(); sendResponse({ success: true }); },
            getPageInfo: () => sendResponse(this.getPageInfo()),
            collectProfiles: () => { this.collectProfiles().then(profiles => sendResponse({ profiles })); return true; },
            sendDirectMessage: () => { this.handleDirectMessage(message.message, message.profileName, message.profileUrl); sendResponse({ success: true }); },
            showAutoPopup: () => { this.showAutoPopup(); sendResponse({ success: true }); },
            startRealTimeCollection: () => {
                this.isRealTimeMode = true;
                this.currentPageCollected = false;
                setTimeout(() => {
                    this.collectCurrentPageOnly().then(profiles => {
                        if (profiles.length > 0) {
                            this.sendProfilesRealTime(profiles);
                            this.currentPageCollected = true;
                        } else {
                            const alternativeProfiles = this.extractProfilesAlternative();
                            if (alternativeProfiles.length > 0) {
                                this.sendProfilesRealTime(alternativeProfiles.slice(0, 10));
                            }
                        }
                    }).catch(error => console.error('Error in real-time collection:', error));
                }, 1000);
                sendResponse({ success: true });
                return true;
            },
       startMultiPageCollection: () => {
                this.isRealTimeMode = true;
                const maxPages = message.maxPages || 4;
                setTimeout(() => {
                    this.collectMultiplePages(maxPages).then(profiles => {
                        sendResponse({ success: true, totalProfiles: profiles.length });
                    }).catch(error => {
                        sendResponse({ success: false, error: error.message });
                    });
                }, 1000);
                return true;
            },
            stopRealTimeCollection: () => { this.isRealTimeMode = false; this.currentPageCollected = false; sendResponse({ success: true }); return true; },
            stopAutoCollection: () => { this.stopAutoCollection(); sendResponse({ success: true }); return true; },
            startAutoCollection: () => {
                if (!this.isAutoCollecting && this.isAutoCollectionEnabled) this.startAutoCollection();
                sendResponse({ success: true });
                return true;
            },
            enableAutoCollection: () => {
                this.isAutoCollectionEnabled = true;
                if (this.isProfilePage() && !this.isAutoCollecting) this.startAutoCollection();
                sendResponse({ success: true });
                return true;
            },
            disableAutoCollection: () => { this.isAutoCollectionEnabled = false; this.stopAutoCollection(); sendResponse({ success: true }); return true; },
            searchByCompany: () => { this.searchByCompany(message.companyName).then(result => sendResponse(result)); return true; },
            searchNetwork: () => {
                this.searchNetwork(message.criteria).then(profiles => {
                    sendResponse({ profiles: profiles || [] });
                }).catch(error => {
                    sendResponse({ profiles: [], error: error.message });
                });
                return true;
            }
        };

        return actions[message.action] ? actions[message.action]() : sendResponse({ error: 'Unknown action: ' + message.action });
    }
    isSearchResultsPage() {
        return window.location.href.includes('/search/people/') ||
               window.location.href.includes('/search/results/people/') ||
               window.location.href.includes('/sales/search/people');
    }

    startAutomationFromPage() {
        if (this.todayCount >= this.dailyLimit) return;
        this.isRunning = true;
        this.processConnections();
    }

    async processConnections() {
        if (!this.isRunning) return;
        const connectButtons = this.findConnectButtons();
        if (connectButtons.length === 0) {
            this.stopAutomation();
            return;
        }

        for (let i = 0; i < connectButtons.length && this.isRunning; i++) {
            if (this.todayCount >= this.dailyLimit) break;
            const button = connectButtons[i];
            const personInfo = this.extractPersonInfo(button);

            try {
                await this.sendConnectionRequest(button, personInfo);
                this.todayCount++;
                if (i < connectButtons.length - 1) await this.delay(this.actionDelay);
            } catch (error) {
                console.error('Error sending connection request:', error);
            }
        }
        this.stopAutomation();
    }
    findConnectButtons() {
        const selectors = ['button[aria-label*="Connect"]', 'button[data-control-name="connect"]', '.search-result__actions button[aria-label*="Invite"]'];
        const buttons = [];
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                if ((el.textContent.includes('Connect') || el.getAttribute('aria-label')?.includes('Connect')) && el.offsetParent !== null) {
                    buttons.push(el);
                }
            });
        });
        return buttons;
    }

    extractPersonInfo(connectButton) {
        const resultCard = connectButton.closest('.search-result') || connectButton.closest('.reusable-search__result-container') || connectButton.closest('[data-chameleon-result-urn]');
        let name = 'Unknown', company = '', title = '';

        if (resultCard) {
            const nameElement = resultCard.querySelector('.entity-result__title-text a') || resultCard.querySelector('.search-result__result-link') || resultCard.querySelector('[data-anonymize="person-name"]');
            if (nameElement) name = nameElement.textContent.trim();

            const subtitleElement = resultCard.querySelector('.entity-result__primary-subtitle') || resultCard.querySelector('.search-result__truncate');
            if (subtitleElement) title = subtitleElement.textContent.trim();
        }
        return { name, company, title };
    }
    async sendConnectionRequest(button, personInfo) {
        return new Promise((resolve, reject) => {
            try {
                button.click();
                setTimeout(() => {
                    const sendButton = document.querySelector('button[aria-label*="Send without a note"]') || document.querySelector('button[data-control-name="send_invite"]') || document.querySelector('.send-invite__actions button[aria-label*="Send"]');

                    if (sendButton) {
                        sendButton.click();
                        resolve();
                    } else {
                        const addNoteButton = document.querySelector('button[aria-label*="Add a note"]');
                        if (addNoteButton) {
                            addNoteButton.click();
                            setTimeout(() => this.sendCustomMessage(personInfo, resolve, reject), 1000);
                        } else {
                            reject(new Error('Could not find send button'));
                        }
                    }
                }, 1000);
            } catch (error) {
                reject(error);
            }
        });
    }

    async sendCustomMessage(personInfo, resolve, reject) {
        try {
            const messageTemplate = 'Hi {firstName}, I\'d love to connect with you!';
            const personalizedMessage = this.personalizeMessage(messageTemplate, personInfo);
            const messageTextarea = document.querySelector('#custom-message') || document.querySelector('textarea[name="message"]') || document.querySelector('.send-invite__custom-message textarea');

            if (messageTextarea) {
                messageTextarea.value = personalizedMessage;
                messageTextarea.dispatchEvent(new Event('input', { bubbles: true }));

                setTimeout(() => {
                    const sendButton = document.querySelector('button[aria-label*="Send invitation"]') || document.querySelector('.send-invite__actions button[aria-label*="Send"]');
                    if (sendButton) {
                        sendButton.click();
                        resolve();
                    } else {
                        reject(new Error('Could not find send button for custom message'));
                    }
                }, 500);
            } else {
                reject(new Error('Could not find message textarea'));
            }
        } catch (error) {
            reject(error);
        }
    }

    personalizeMessage(template, personInfo) {
        const firstName = personInfo.name.split(' ')[0];
        const lastName = personInfo.name.split(' ').slice(1).join(' ');
        return template.replace(/{firstName}/g, firstName).replace(/{lastName}/g, lastName).replace(/{fullName}/g, personInfo.name).replace(/{company}/g, personInfo.company).replace(/{title}/g, personInfo.title);
    }
    startAutomation(campaign) {
        this.currentCampaign = campaign;
        this.startAutomationFromPage();
    }

    stopAutomation() {
        this.isRunning = false;
    }

    async closeChatWindow() {
        try {
            const primarySelectors = ['button svg[data-test-icon="close-small"]', 'button .artdeco-button__icon[data-test-icon="close-small"]', '[data-test-icon="close-small"]'];
            const fallbackSelectors = ['.msg-overlay-bubble-header__control--close', '.msg-overlay-bubble-header__control[aria-label*="Close"]', '.msg-overlay-bubble-header button[aria-label*="Close"]', '.msg-overlay-bubble-header .artdeco-button--circle', 'button[aria-label="Close conversation"]', '.msg-overlay-bubble-header button:last-child'];

            for (let attempt = 0; attempt < 5; attempt++) {
                for (const selector of primarySelectors) {
                    const closeIcon = document.querySelector(selector);
                    if (closeIcon) {
                        const closeButton = closeIcon.closest('button');
                        if (closeButton && closeButton.offsetParent !== null && !closeButton.disabled) {
                            closeButton.click();
                            await this.delay(500);
                            return true;
                        }
                    }
                }

                for (const selector of fallbackSelectors) {
                    const closeButton = document.querySelector(selector);
                    if (closeButton && closeButton.offsetParent !== null && !closeButton.disabled) {
                        closeButton.click();
                        await this.delay(500);
                        return true;
                    }
                }
                await this.delay(1000);
            }
            return false;
        } catch (error) {
            console.error('Error closing chat window:', error);
            return false;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async handleDirectMessage(message) {
        try {
            await this.delay(2000);
            const messageButton = await this.findMessageButton();
            if (messageButton) {
                messageButton.click();
                await this.delay(4000);
                const messageInput = await this.findMessageInput();
                if (!messageInput) return;

                await this.pasteMessageDirectly(messageInput, message);
                await this.delay(1000);
                if (!messageInput.textContent.trim() && !messageInput.value) {
                    await this.pasteUsingClipboard(messageInput, message);
                }
                await this.delay(500);
                if (!messageInput.textContent.trim() && !messageInput.value) {
                    messageInput.textContent = message;
                    messageInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
                await this.clickSendButton();
                await this.delay(2000);
                await this.closeChatWindow();
                await this.delay(1000);
            }
        } catch (error) {}
    }

    async findMessageButton() {
        await this.delay(2000);
        const selectors = ['button[aria-label*="Message"]:not([aria-label*="Send"]):not([aria-label*="Share"])', 'button[data-control-name="message"]', '.pv-s-profile-actions button[aria-label*="Message"]', '.pvs-profile-actions__action button[aria-label*="Message"]', '.message-anywhere-button', 'a[data-control-name="message"]'];

        for (const selector of selectors) {
            const button = document.querySelector(selector);
            if (button) {
                const text = button.textContent.toLowerCase().trim();
                const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
                if (!text.includes('send') && !text.includes('share') && !ariaLabel.includes('send') && !ariaLabel.includes('share') && !ariaLabel.includes('post')) {
                    return button;
                }
            }
        }

        const buttons = document.querySelectorAll('button, a');
        for (const button of buttons) {
            const text = button.textContent.toLowerCase().trim();
            const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
            if ((text === 'message' || ariaLabel.includes('message')) && !ariaLabel.includes('send') && !ariaLabel.includes('share') && !ariaLabel.includes('post') && !text.includes('send') && !text.includes('share') && !text.includes('more')) {
                return button;
            }
        }
        return null;
    }

    async pasteMessageDirectly(messageInput, message) {
        if (!messageInput) return;
        messageInput.focus();
        await this.delay(500);

        if (messageInput.contentEditable === 'true') {
            messageInput.innerHTML = `<p>${message}</p>`;
            const range = document.createRange();
            const selection = window.getSelection();
            const textNode = messageInput.querySelector('p') || messageInput;
            range.selectNodeContents(textNode);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        } else {
            messageInput.value = message;
        }

        const events = [new Event('focus', { bubbles: true }), new Event('input', { bubbles: true }), new Event('change', { bubbles: true }), new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }), new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' })];
        for (const event of events) {
            messageInput.dispatchEvent(event);
            await this.delay(100);
        }
        messageInput.focus();
        await this.delay(1000);
    }

    async pasteUsingClipboard(messageInput, message) {
        try {
            messageInput.focus();
            await this.delay(300);
            messageInput.textContent = '';
            await navigator.clipboard.writeText(message);
            await this.delay(200);

            const pasteEvent = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });
            pasteEvent.clipboardData.setData('text/plain', message);
            messageInput.dispatchEvent(pasteEvent);
            messageInput.dispatchEvent(new Event('input', { bubbles: true }));
            messageInput.dispatchEvent(new Event('change', { bubbles: true }));
            await this.delay(500);
        } catch (error) {
            messageInput.textContent = message;
            messageInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    async findMessageInput() {
        const selectors = ['.msg-form__contenteditable', '.msg-form__msg-content-container div[contenteditable="true"]', 'div[data-placeholder*="message"]', '.compose-form__message-field', 'div[contenteditable="true"][data-placeholder]', '.msg-form__msg-content-container--scrollable div[contenteditable="true"]', '.msg-form__placeholder + div[contenteditable="true"]', 'div[contenteditable="true"][role="textbox"]', '.msg-form div[contenteditable="true"]'];

        for (let attempt = 0; attempt < 8; attempt++) {
            for (const selector of selectors) {
                const input = document.querySelector(selector);
                if (input && input.isContentEditable && input.offsetParent !== null) return input;
            }

            const allContentEditables = document.querySelectorAll('div[contenteditable="true"]');
            for (const element of allContentEditables) {
                if (element.offsetParent === null) continue;
                const placeholder = element.getAttribute('data-placeholder') || element.getAttribute('aria-label') || element.getAttribute('placeholder');
                if (placeholder && placeholder.toLowerCase().includes('message')) return element;
                const parentContainer = element.closest('.msg-form, .compose-form');
                if (parentContainer) return element;
            }
            await this.delay(1000);
        }
        return null;
    }

    async typeText(element, text) {
        if (element.contentEditable === 'true') {
            element.focus();
            if (!element.textContent.trim()) element.textContent = '';
            element.textContent += text;

            const range = document.createRange();
            const selection = window.getSelection();
            range.selectNodeContents(element);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);

            element.dispatchEvent(new Event('focus', { bubbles: true }));
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        } else {
            element.focus();
            element.value += text;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        }
    }

    async clickSendButton() {
        await this.delay(2000);
        const sendSelectors = ['.msg-form__send-button', 'button[type="submit"]', '.msg-form button[type="submit"]', 'button[data-control-name="send"]', 'button[aria-label*="Send"]:not([aria-label*="options"])', '.compose-form__send-button', '.msg-form__send-btn'];

        for (let attempt = 0; attempt < 10; attempt++) {
            for (const selector of sendSelectors) {
                const button = document.querySelector(selector);
                if (button && !button.disabled && button.offsetParent !== null) {
                    const text = button.textContent.toLowerCase().trim();
                    const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
                    if (!text.includes('options') && !ariaLabel.includes('options')) {
                        button.click();
                        await this.delay(1000);
                        return;
                    }
                }
            }

            const buttons = document.querySelectorAll('button');
            for (const button of buttons) {
                const text = button.textContent.toLowerCase().trim();
                const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
                if (text === 'send' && !text.includes('options') && !ariaLabel.includes('options') && !button.disabled && button.offsetParent !== null && button.offsetWidth > 0 && button.offsetHeight > 0) {
                    button.click();
                    await this.delay(1000);
                    return;
                }
            }
            await this.delay(500);
        }
    }
    getPageInfo() {
        return {
            url: window.location.href,
            title: document.title,
            isSearchPage: this.isSearchResultsPage(),
            connectButtonsCount: this.findConnectButtons().length
        };
    }

    async collectProfiles() {
        const profiles = [];
        if (window.location.href.includes('/mynetwork/')) return this.collectNetworkProfiles();

        const selectors = ['.reusable-search__result-container', '[data-chameleon-result-urn]', '.search-result', '.entity-result'];
        let profileCards = [];
        for (const selector of selectors) {
            profileCards = document.querySelectorAll(selector);
            if (profileCards.length > 0) break;
        }

        profileCards.forEach((card) => {
            const profile = this.extractProfileFromCard(card);
            if (profile?.name && profile?.url) profiles.push(profile);
        });

        if (profiles.length === 0) {
            const alternativeProfiles = this.extractProfilesAlternative();
            if (Array.isArray(alternativeProfiles) && alternativeProfiles.length > 0) {
                profiles.push(...alternativeProfiles);
            }
        }
        return profiles;
    }

    async collectCurrentPageOnly() {
        const allProfiles = await this.collectProfiles();
        const limitedProfiles = allProfiles.slice(0, 10);
        limitedProfiles.forEach(profile => this.sendProfilesRealTime([profile]));
        return limitedProfiles;
    }

    async collectProfilesWithScrolling() {
        const profiles = [];
        const maxScrollAttempts = 5;
        let scrollAttempts = 0;

        // Initial collection without scrolling
        let searchResults = this.getSearchResultElements();
        searchResults.forEach((card) => {
            if (profiles.length < 20) {
                const profile = this.extractProfileFromCard(card);
                if (profile && profile.name && profile.url) {
                    profile.source = 'network-search';
                    profiles.push(profile);
                }
            }
        });

        // Scroll to load more profiles
        while (scrollAttempts < maxScrollAttempts && profiles.length < 20) {
            scrollAttempts++;
            const initialCount = profiles.length;

            if (scrollAttempts <= 3) {
                // Scroll down to load more content
                window.scrollBy(0, window.innerHeight);
                await this.delay(2000);
                window.scrollTo(0, document.body.scrollHeight);
            } else {
                // Scroll back up
                window.scrollBy(0, -window.innerHeight);
                await this.delay(2000);

                if (scrollAttempts === maxScrollAttempts) {
                    window.scrollTo(0, 0);
                }
            }

            await this.delay(2000);

            // Collect newly loaded profiles
            searchResults = this.getSearchResultElements();
            searchResults.forEach((card) => {
                if (profiles.length < 20) {
                    const profile = this.extractProfileFromCard(card);
                    if (profile && profile.name && profile.url) {
                        const isDuplicate = profiles.some(p => p.url === profile.url);
                        if (!isDuplicate) {
                            profile.source = 'network-search';
                            profiles.push(profile);
                        }
                    }
                }
            });

            // If no new profiles were found, break early
            if (profiles.length === initialCount) {
                break;
            }
        }

        return profiles;
    }

    async collectMultiplePages(maxPages = 4) {
        const allProfiles = [];
        const baseUrl = window.location.href.split('&page=')[0].split('?page=')[0];
        let currentPage = 1;

        try {
            this.sendCollectionStatus(`🚀 Starting collection from ${maxPages} pages...`);

            while (currentPage <= maxPages) {
                this.sendCollectionStatus(`Processing page ${currentPage}`);

                // First scroll and collect profiles from current page
                this.sendCollectionStatus(`Scrolling and collecting from page ${currentPage}`);
                let pageProfiles = [];

                try {
                    // Wait for page to fully load before collecting
                    await this.delay(2000);
                    await this.waitForSearchResults();

                    pageProfiles = await this.collectProfilesWithScrolling();
                    if (!Array.isArray(pageProfiles)) pageProfiles = [];

                    if (pageProfiles.length === 0) {
                        // Try alternative collection method
                        this.sendCollectionStatus(`No profiles found with scrolling, trying alternative method...`);
                        const alternativeProfiles = this.extractProfilesAlternative();
                        if (Array.isArray(alternativeProfiles) && alternativeProfiles.length > 0) {
                            pageProfiles = alternativeProfiles.slice(0, 10);
                            this.sendCollectionStatus(`Found ${pageProfiles.length} profiles using alternative method`);
                        } else {
                            this.sendCollectionStatus(`Page ${currentPage} completed (no profiles found)`);
                        }
                    } else {
                        this.sendCollectionStatus(`Found ${pageProfiles.length} profiles on page ${currentPage}`);
                    }
                } catch (error) {
                    console.error(`Error collecting from page ${currentPage}:`, error);
                    pageProfiles = [];
                    this.sendCollectionStatus(`Page ${currentPage} failed - ${error.message}`);
                }

                if (Array.isArray(pageProfiles) && pageProfiles.length > 0) {
                    pageProfiles.forEach(profile => {
                        if (profile && typeof profile === 'object') {
                            profile.collectedFromPage = currentPage;
                            profile.collectionTimestamp = new Date().toISOString();
                        }
                    });

                    allProfiles.push(...pageProfiles);
                    this.sendProfilesRealTime(pageProfiles);
                    this.sendCollectionStatus(`Completed page ${currentPage} with ${pageProfiles.length} profiles`);
                }

                // Navigate to next page if not the last page
                if (currentPage < maxPages) {
                    const nextPage = currentPage + 1;
                    this.sendCollectionStatus(`Navigating to page ${nextPage}`);
                    let navigationSuccess = false;
                    let attempts = 0;
                    const maxAttempts = 3;

                    while (!navigationSuccess && attempts < maxAttempts) {
                        attempts++;
                        this.sendCollectionStatus(`Attempt ${attempts}/${maxAttempts} to navigate to page ${nextPage}`);

                        const clickSuccess = await this.clickPaginationButton(nextPage);

                        if (clickSuccess) {
                            await this.delay(3000); // Increased wait time
                            await this.waitForSearchResults(); // Wait for results to load

                            const verifiedPage = this.getCurrentPageNumber();
                            if (verifiedPage === nextPage) {
                                navigationSuccess = true;
                                this.sendCollectionStatus(`Successfully clicked to page ${nextPage}`);
                            } else {
                                this.sendCollectionStatus(`Click navigation failed: expected page ${nextPage}, got ${verifiedPage}`);
                            }
                        } else {
                            this.sendCollectionStatus(`Failed to click pagination button for page ${nextPage}`);
                        }

                        if (!navigationSuccess && attempts < maxAttempts) {
                            await this.delay(3000); // Increased delay between attempts
                        }
                    }

                    if (!navigationSuccess) {
                        const pageUrl = this.buildPageUrl(baseUrl, nextPage);
                        this.sendCollectionStatus(`Direct navigation to page ${nextPage}`);

                        // Store current state before navigation
                        const currentState = {
                            isRealTimeMode: this.isRealTimeMode,
                            isAutoCollecting: this.isAutoCollecting,
                            processedProfiles: Array.from(this.processedProfiles)
                        };

                        window.location.href = pageUrl;
                        await this.waitForPageLoad();
                        await this.delay(5000); // Increased wait time
                        await this.waitForSearchResults();

                        // Re-initialize after page change
                        this.reinitializeAfterPageChange(currentState);
                        await this.delay(2000);

                        const finalVerifiedPage = this.getCurrentPageNumber();
                        if (finalVerifiedPage === nextPage) {
                            navigationSuccess = true;
                            this.sendCollectionStatus(`Successfully navigated to page ${nextPage}`);
                        } else {
                            this.sendCollectionStatus(`Page verification failed: expected ${nextPage}, got ${finalVerifiedPage}`);
                        }
                    }

                    if (!navigationSuccess) {
                        this.sendCollectionStatus(`Navigation to page ${nextPage} failed - trying recovery...`);

                        // Try one more recovery attempt with direct URL navigation
                        try {
                            const recoveryUrl = this.buildPageUrl(baseUrl, nextPage);
                            this.sendCollectionStatus(`Recovery attempt: navigating to ${recoveryUrl}`);

                            window.location.href = recoveryUrl;
                            await this.waitForPageLoad();
                            await this.delay(6000); // Extra wait time for recovery
                            await this.waitForSearchResults();

                            const recoveryPage = this.getCurrentPageNumber();
                            if (recoveryPage === nextPage) {
                                this.sendCollectionStatus(`Recovery successful - now on page ${nextPage}`);
                                navigationSuccess = true;
                            } else {
                                this.sendCollectionStatus(`Recovery failed - stopping collection at page ${currentPage}`);
                                break;
                            }
                        } catch (recoveryError) {
                            this.sendCollectionStatus(`Recovery attempt failed - stopping collection`);
                            console.error('Recovery error:', recoveryError);
                            break;
                        }
                    }
                }

                currentPage++;
                if (currentPage <= maxPages) await this.delay(1000);
            }

            const pagesProcessed = currentPage - 1;
            this.sendCollectionStatus(`All pages completed (${pagesProcessed}/${maxPages})`);
            return allProfiles;

        } catch (error) {
            let errorMessage = 'Collection error occurred';
            if (error.message.includes('iterable') || error.message.includes('Symbol.iterator')) {
                errorMessage = 'Profile data format error - collection stopped';
            } else if (error.message.includes('timeout')) {
                errorMessage = 'Page loading timeout - collection stopped';
            } else {
                errorMessage = `Collection error: ${error.message}`;
            }

            this.sendCollectionStatus(errorMessage);
            return Array.isArray(allProfiles) ? allProfiles : [];
        }
    }

    async clickPaginationButton(pageNumber) {
        try {
            console.log(`Attempting to click pagination button for page ${pageNumber}`);

            // Enhanced selectors for different LinkedIn layouts
            const selectors = [
                `button[aria-label="Page ${pageNumber}"]`,
                `button[aria-current="false"][aria-label="Page ${pageNumber}"]`,
                `.artdeco-pagination__button[aria-label="Page ${pageNumber}"]`,
                `.artdeco-pagination li button[aria-label="Page ${pageNumber}"]`,
                `[data-test-pagination-page-btn="${pageNumber}"]`,
                `.pagination button[aria-label="Page ${pageNumber}"]`,
                `button[data-test-pagination-page-btn="${pageNumber}"]`,
                `.artdeco-pagination__pages button[aria-label="Page ${pageNumber}"]`,
                `button[data-test-id="pagination-page-${pageNumber}"]`
            ];

            let pageButton = null;

            // First try direct selectors
            for (const selector of selectors) {
                try {
                    pageButton = document.querySelector(selector);
                    if (pageButton && !pageButton.disabled) {
                        console.log(`Found pagination button using selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            // Fallback: search through all buttons
            if (!pageButton) {
                console.log('Direct selectors failed, searching through all buttons...');
                const allButtons = document.querySelectorAll('button');
                for (const button of allButtons) {
                    if (button.disabled) continue;

                    const buttonText = button.textContent.trim();
                    const span = button.querySelector('span');
                    const spanText = span ? span.textContent.trim() : '';

                    if (buttonText === pageNumber.toString() || spanText === pageNumber.toString()) {
                        const ariaLabel = button.getAttribute('aria-label');
                        const parentClass = button.parentElement ? button.parentElement.className : '';
                        const buttonClass = button.className;

                        const isPaginationButton =
                            (ariaLabel && ariaLabel.toLowerCase().includes('page')) ||
                            parentClass.includes('pagination') ||
                            buttonClass.includes('pagination') ||
                            /^\d+$/.test(buttonText) ||
                            /^\d+$/.test(spanText);

                        if (isPaginationButton) {
                            pageButton = button;
                            console.log(`Found pagination button through text search: ${buttonText || spanText}`);
                            break;
                        }
                    }
                }
            }

            if (pageButton) {
                console.log(`Clicking pagination button for page ${pageNumber}`);

                // Ensure button is visible and clickable
                pageButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await this.delay(1000);

                // Try multiple click methods
                try {
                    pageButton.click();
                } catch (clickError) {
                    console.log('Regular click failed, trying dispatch event');
                    pageButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                }

                await this.delay(4000); // Increased wait time
                await this.waitForSearchResults();

                console.log(`Successfully clicked pagination button for page ${pageNumber}`);
                return true;
            } else {
                console.log(`Pagination button not found for page ${pageNumber}, trying Next button approach`);
                if (pageNumber > 1) {
                    return await this.clickNextButtonToPage(pageNumber);
                }
                return false;
            }

        } catch (error) {
            console.error(`Error clicking pagination button for page ${pageNumber}:`, error);
            return false;
        }
    }

    getCurrentPageNumber() {
        try {
            // Look for the current page button (aria-current="true")
            const currentPageButton = document.querySelector('button[aria-current="true"]');
            if (currentPageButton) {
                const span = currentPageButton.querySelector('span');
                if (span) {
                    const pageNum = parseInt(span.textContent.trim());
                    if (!isNaN(pageNum)) {
                        return pageNum;
                    }
                }
            }

            // Fallback: check URL for page parameter
            const urlParams = new URLSearchParams(window.location.search);
            const pageParam = urlParams.get('page');
            if (pageParam) {
                const pageNum = parseInt(pageParam);
                if (!isNaN(pageNum)) {
                    return pageNum;
                }
            }

            // Default to page 1 if no page indicator found
            return 1;
        } catch (error) {
            console.error('Error getting current page number:', error);
            return 1;
        }
    }

    async clickNextButtonToPage(targetPage) {
        try {
            const currentPage = this.getCurrentPageNumber();
            console.log(`Current page: ${currentPage}, Target page: ${targetPage}`);

            if (currentPage >= targetPage) {
                console.log('Already on or past target page');
                return true;
            }

            const clicksNeeded = targetPage - currentPage;
            console.log(`Need to click Next button ${clicksNeeded} times`);

            for (let i = 0; i < clicksNeeded; i++) {
                console.log(`Clicking Next button (${i + 1}/${clicksNeeded})`);

                // Find Next button
                const nextButton = this.findNextButton();
                if (!nextButton) {
                    console.log('Next button not found');
                    return false;
                }

                // Click Next button
                nextButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await this.delay(500);
                nextButton.click();

                // Wait for navigation
                await this.delay(3000);
                await this.waitForSearchResults();

                // Verify we moved to the next page
                const newPage = this.getCurrentPageNumber();
                console.log(`After click ${i + 1}: now on page ${newPage}`);

                if (newPage === targetPage) {
                    console.log(`Successfully reached target page ${targetPage}`);
                    return true;
                }
            }

            return this.getCurrentPageNumber() === targetPage;

        } catch (error) {
            console.error('Error in clickNextButtonToPage:', error);
            return false;
        }
    }

    findNextButton() {
        const nextSelectors = [
            'button[aria-label="Next"]',
            'button[aria-label="Next page"]',
            'button:contains("Next")',
            '.artdeco-pagination__button--next',
            'button[data-test-pagination-page-btn="next"]'
        ];

        for (const selector of nextSelectors) {
            try {
                const button = document.querySelector(selector);
                if (button && !button.disabled) {
                    return button;
                }
            } catch (e) {
                continue;
            }
        }

        // Fallback: look for buttons with "Next" text
        const allButtons = document.querySelectorAll('button');
        for (const button of allButtons) {
            if (button.textContent.toLowerCase().includes('next') && !button.disabled) {
                return button;
            }
        }

        return null;
    }



    buildPageUrl(baseUrl, pageNumber) {
        const separator = baseUrl.includes('?') ? '&' : '?';
        return `${baseUrl}${separator}page=${pageNumber}`;
    }

    async waitForPageLoad() {
        return new Promise((resolve) => {
            if (document.readyState === 'complete') {
                resolve();
            } else {
                window.addEventListener('load', resolve, { once: true });
                // Fallback timeout
                setTimeout(resolve, 5000);
            }
        });
    }

    async waitForSearchResults() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 15; // Increased attempts

            const checkForResults = () => {
                attempts++;

                // Check for LinkedIn search result containers
                const searchResults = document.querySelector('.search-results-container') ||
                                    document.querySelector('[data-view-name="search-entity-result-universal-template"]') ||
                                    document.querySelector('.reusable-search__result-container') ||
                                    document.querySelector('.search-result__wrapper') ||
                                    document.querySelector('.entity-result') ||
                                    document.querySelector('.search-result') ||
                                    document.querySelector('[data-test-id="search-result"]');

                if (searchResults || attempts >= maxAttempts) {
                    console.log(`Search results ${searchResults ? 'found' : 'not found'} after ${attempts} attempts`);
                    resolve();
                } else {
                    setTimeout(checkForResults, 800); // Increased interval
                }
            };

            checkForResults();
        });
    }

    reinitializeAfterPageChange(previousState) {
        try {
            // Restore previous state
            this.isRealTimeMode = previousState.isRealTimeMode;
            this.isAutoCollecting = previousState.isAutoCollecting;
            this.processedProfiles = new Set(previousState.processedProfiles);

            // Re-setup message listeners
            if (!window.linkedInAutomationReinitialized) {
                chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
                    this.handleMessage(message, sendResponse);
                });
                window.linkedInAutomationReinitialized = true;
            }

            // Re-setup auto detection if needed
            if (this.isAutoCollecting) {
                this.setupAutoDetection();
            }

            console.log('LinkedIn automation re-initialized after page change');
        } catch (error) {
            console.error('Error during re-initialization:', error);
        }
    }

    sendCollectionStatus(message) {
        try {
            if (chrome.runtime?.id) {
                chrome.runtime.sendMessage({
                    action: 'collectionStatus',
                    message: message
                }).catch(() => {
                    console.log('Status update:', message);
                });
            }
        } catch (error) {
            console.log('Status update:', message);
        }
    }

    sendProfilesRealTime(profiles) {
        if (!this.isAutoCollectionEnabled || profiles.length === 0) return;

        if (!chrome.runtime?.id) return;

        try {
            chrome.runtime.sendMessage({
                action: 'addProfilesRealTime',
                profiles: profiles
            }).catch(() => {});
        } catch (error) {}
    }

    fixProfileData(profile) {
        if (!profile.name ||
            profile.name.includes('Status is') ||
            profile.name.includes('offline') ||
            profile.name.includes('reachable') ||
            profile.name.length < 3) {

            if (profile.location) {
                const nameMatch = profile.location.match(/^([A-Za-z\s]+?)(?:View|•|\n)/);
                if (nameMatch && nameMatch[1].trim().length > 2) {
                    profile.name = nameMatch[1].trim();
                }


                const titleMatch = profile.location.match(/Full Stack Developer|Software Engineer|Developer|Engineer|Manager|Director|CEO|CTO|VP|President/i);
                if (titleMatch && !profile.title) {
                    profile.title = titleMatch[0];
                }


                const locationMatch = profile.location.match(/([A-Za-z\s]+,\s*[A-Za-z\s]+)(?:\n|$)/);
                if (locationMatch) {
                    const cleanLocation = locationMatch[1].trim();
                    if (cleanLocation.includes(',') && !cleanLocation.includes('View')) {
                        profile.location = cleanLocation;
                    }
                }
            }
        }

        if (profile.title && profile.title.includes('degree connection')) {
            if (profile.location) {
                const titleMatch = profile.location.match(/\n\s*([A-Za-z\s]+(?:Developer|Engineer|Manager|Director|CEO|CTO|VP|President|Analyst|Consultant|Specialist)[A-Za-z\s]*)/i);
                if (titleMatch) {
                    profile.title = titleMatch[1].trim();
                } else {
                    profile.title = '';
                }
            } else {
                profile.title = '';
            }
        }

        if (profile.title && profile.title.includes(' at ') && !profile.company) {
            const parts = profile.title.split(' at ');
            if (parts.length === 2) {
                profile.title = parts[0].trim();
                profile.company = parts[1].trim();
            }
        }
    }

    extractProfilesAlternative() {
        const profiles = [];
        const alternativeSelectors = ['.search-results-container .result-card', '.search-results .search-result__wrapper', '.artdeco-list .artdeco-list__item', '.pvs-list .pvs-list__item'];

        for (const selector of alternativeSelectors) {
            const cards = document.querySelectorAll(selector);
            if (cards.length > 0) {
                cards.forEach(card => {
                    const profile = this.extractProfileFromCard(card);
                    if (profile?.name && profile?.url) profiles.push(profile);
                });
                break;
            }
        }
        return profiles;
    }

    async collectNetworkProfiles() {
        const profiles = [];

        const selectors = [
            '.discover-entity-type-card',
            '.mn-person-card',
            '[data-test-id="person-card"]',
            '.artdeco-entity-lockup',
            '.discover-person-card'
        ];

        let profileCards = [];
        for (const selector of selectors) {
            profileCards = document.querySelectorAll(selector);
            if (profileCards.length > 0) break;
        }

        profileCards.forEach(card => {
            const profile = this.extractProfileFromCard(card, true); // Use unified extraction with network flag
            if (profile?.name && profile?.url) {
                profiles.push(profile);
            }
        });

        return profiles;
    }

    async collectSalesNavigatorProfiles() {
        const profiles = [];

        // Sales Navigator specific selectors
        const selectors = [
            '.artdeco-entity-lockup',
            '[data-chameleon-result-urn]',
            '.search-results__result-item',
            '.result-lockup',
            '.entity-result'
        ];

        let profileCards = [];
        for (const selector of selectors) {
            profileCards = document.querySelectorAll(selector);
            if (profileCards.length > 0) break;
        }

        profileCards.forEach(card => {
            const profile = this.extractSalesNavigatorProfile(card);
            if (profile?.name && profile?.url) {
                profile.source = 'sales-navigator';
                profiles.push(profile);
            }
        });

        return profiles;
    }

    extractSalesNavigatorProfile(card) {
        const profile = {
            name: '',
            url: '',
            company: '',
            title: '',
            location: '',
            industry: '',
            profilePic: '',
            collectedAt: new Date().toISOString(),
            source: 'sales-navigator'
        };

        try {
            // Sales Navigator name and URL extraction
            const nameSelectors = [
                '.artdeco-entity-lockup__title a',
                '.result-lockup__name a',
                'a[href*="/sales/lead/"]',
                'a[href*="/in/"]'
            ];

            let nameElement = null;
            for (const selector of nameSelectors) {
                nameElement = card.querySelector(selector);
                if (nameElement) break;
            }

            if (nameElement) {
                profile.name = nameElement.textContent?.trim() || '';
                profile.url = nameElement.href || '';
            }

            // Company and title extraction
            const titleSelectors = [
                '.artdeco-entity-lockup__subtitle',
                '.result-lockup__highlight-keyword',
                '.entity-result__primary-subtitle'
            ];

            for (const selector of titleSelectors) {
                const titleElement = card.querySelector(selector);
                if (titleElement) {
                    const titleText = titleElement.textContent?.trim() || '';
                    if (titleText.includes(' at ')) {
                        const parts = titleText.split(' at ');
                        profile.title = parts[0]?.trim() || '';
                        profile.company = parts[1]?.trim() || '';
                    } else {
                        profile.title = titleText;
                    }
                    break;
                }
            }

            // Location extraction
            const locationSelectors = [
                '.artdeco-entity-lockup__caption',
                '.result-lockup__misc-item',
                '.entity-result__secondary-subtitle'
            ];

            for (const selector of locationSelectors) {
                const locationElement = card.querySelector(selector);
                if (locationElement) {
                    profile.location = locationElement.textContent?.trim() || '';
                    break;
                }
            }

            // Profile picture extraction
            const imgSelectors = [
                '.artdeco-entity-lockup__image img',
                '.result-lockup__image img',
                '.entity-result__image img'
            ];

            for (const selector of imgSelectors) {
                const imgElement = card.querySelector(selector);
                if (imgElement) {
                    profile.profilePic = imgElement.src || '';
                    break;
                }
            }

        } catch (error) {
            console.error('Error extracting Sales Navigator profile:', error);
        }

        return profile;
    }

    extractProfileFromCard(card, isNetworkPage = false) {
        const profile = {
            name: '',
            url: '',
            company: '',
            title: '',
            location: '',
            industry: '',
            profilePic: '',
            collectedAt: new Date().toISOString()
        };

        try {
            const nameSelectors = isNetworkPage ? [
                'a[href*="/in/"]',
                '.discover-entity-type-card__link',
                '.mn-person-card__link',
                '.artdeco-entity-lockup__title a'
            ] : [
                '.entity-result__title-text a',
                '.search-result__result-link',
                'a[href*="/in/"]',
                '.app-aware-link'
            ];

            let nameLink = null;
            for (const selector of nameSelectors) {
                nameLink = card.querySelector(selector);
                if (nameLink) break;
            }

            if (nameLink) {
                profile.name = this.cleanNameText(nameLink.textContent.trim());
                profile.url = nameLink.href || '';
            } else {
                // Fallback: try to find name and URL separately
                const nameResult = this.findNameInCard(card);
                if (nameResult.name) {
                    profile.name = nameResult.name;
                    profile.url = nameResult.url || card.querySelector('a[href*="/in/"]')?.href || '';
                }
            }

            if (profile.url) {
                if (profile.url.startsWith('/')) {
                    profile.url = 'https://www.linkedin.com' + profile.url;
                }
                if (profile.url.includes('?')) {
                    profile.url = profile.url.split('?')[0];
                }
                profile.url = profile.url.replace(/\/$/, '');
            }

            const imgSelectors = [
                '.entity-result__image img',
                '.presence-entity__image img',
                '.discover-entity-type-card__image img',
                '.mn-person-card__picture img',
                '.artdeco-entity-lockup__image img',
                'img[alt*="profile"]',
                'img[alt*="Photo"]',
                'img[data-ghost-classes]',
                'img[src*="profile"]',
                'img'
            ];

            for (const selector of imgSelectors) {
                const imgElement = card.querySelector(selector);
                if (imgElement?.src &&
                    !imgElement.src.includes('data:image') &&
                    !imgElement.src.includes('ghost') &&
                    imgElement.src.includes('http')) {
                    profile.profilePic = imgElement.src;
                    break;
                }
            }

            const subtitleSelectors = isNetworkPage ? [
                '.discover-entity-type-card__occupation',
                '.mn-person-card__occupation',
                '.artdeco-entity-lockup__subtitle'
            ] : [
                '.entity-result__primary-subtitle',
                '.search-result__truncate',
                '.t-14.t-normal'
            ];

            for (const selector of subtitleSelectors) {
                const subtitleElement = card.querySelector(selector);
                if (subtitleElement) {
                    const subtitle = subtitleElement.textContent.trim();
                    const atIndex = subtitle.toLowerCase().indexOf(' at ');
                    if (atIndex !== -1) {
                        profile.title = subtitle.substring(0, atIndex).trim();
                        profile.company = subtitle.substring(atIndex + 4).trim();
                    } else {
                        profile.title = subtitle;
                    }
                    break;
                }
            }

            const locationSelectors = [
                '.entity-result__secondary-subtitle',
                '[data-anonymize="location"]',
                '.t-12.t-black--light'
            ];

            for (const selector of locationSelectors) {
                const locationElement = card.querySelector(selector);
                if (locationElement) {
                    profile.location = locationElement.textContent.trim();
                    break;
                }
            }

            this.fixProfileData(profile);
            if (!profile.name || !profile.url || !profile.url.includes('/in/')) {

                return null;
            }

            return profile;

        } catch (error) {
            console.error('Error extracting profile data:', error);
            return null;
        }
    }

    // Helper methods to reduce duplication in profile extraction
    cleanNameText(nameText) {
        if (nameText.includes('View') && nameText.includes('profile')) {
            const match = nameText.match(/^(.+?)(?:View|•|\n)/);
            if (match) {
                return match[1].trim();
            }
        }
        return nameText;
    }

    findNameInCard(card) {
        const nameSelectors = [
            'span[aria-hidden="true"]',
            '.t-16.t-black.t-bold',
            '[data-anonymize="person-name"] span',
            '.entity-result__title-text span',
            '.search-result__result-link span',
            '.artdeco-entity-lockup__title span',
            'span.t-16',
            'span.t-bold'
        ];

        for (const selector of nameSelectors) {
            const nameSpan = card.querySelector(selector);
            if (nameSpan && this.isValidNameText(nameSpan.textContent.trim())) {
                const parentLink = nameSpan.closest('a') || card.querySelector('a[href*="/in/"]');
                return {
                    name: nameSpan.textContent.trim(),
                    url: parentLink?.href || ''
                };
            }
        }

        // Final fallback: check all profile links
        const allLinks = card.querySelectorAll('a[href*="/in/"]');
        for (const link of allLinks) {
            const text = link.textContent.trim();
            if (this.isValidNameText(text) && text.split(' ').length >= 2) {
                return { name: text, url: link.href };
            }
        }

        return { name: '', url: '' };
    }

    isValidNameText(text) {
        return text && text.length > 2 &&
               !text.includes('Status') &&
               !text.includes('View') &&
               !text.includes('•');
    }

    async searchByCompany(companyName) {
        try {
            const searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(companyName)}&origin=GLOBAL_SEARCH_HEADER`;
            window.location.href = searchUrl;

            return { success: true, message: `Searching for employees at ${companyName}` };
        } catch (error) {
            console.error('Error searching by company:', error);
            return { success: false, message: error.message };
        }
    }

    async searchNetwork(criteria) {
        try {

            const profiles = [];
            // let scrollAttempts = 0;
            // const maxScrollAttempts = 5;

            this.setupContinuousMonitoring();

            if (criteria.type === 'sales-navigator' || window.location.href.includes('sales/search/people')) {

                let searchResults = this.getSalesNavigatorResultElements();

                searchResults.forEach((card) => {
                    if (profiles.length < 20) {
                        const profile = this.extractSalesNavigatorProfile(card);
                        if (profile && profile.name && profile.url) {
                            profile.source = 'sales-navigator';
                            profiles.push(profile);
                        }
                    }
                });
                // Removed pagination automation: do not scroll or load more pages for Sales Navigator
                // Only collect profiles from the first page

            } else if (criteria.type === 'search' || window.location.href.includes('search/results/people')) {

                let searchResults = this.getSearchResultElements();

                searchResults.forEach((card) => {
                    if (profiles.length < 20) {
                        const profile = this.extractProfileFromCard(card);
                        if (profile && profile.name && profile.url) {
                            profile.source = 'network-search';
                            profiles.push(profile);

                        }
                    }
                });

                while (scrollAttempts < maxScrollAttempts && profiles.length < 20) {
                    scrollAttempts++;

                    const initialCount = profiles.length;

                    if (scrollAttempts <= 3) {
                        window.scrollBy(0, window.innerHeight);
                        await this.delay(2000);
                        window.scrollTo(0, document.body.scrollHeight);

                    } else {
                        window.scrollBy(0, -window.innerHeight);
                        await this.delay(2000);

                        if (scrollAttempts === maxScrollAttempts) {
                            window.scrollTo(0, 0);

                        }
                    }

                    await this.delay(2000);
                    searchResults = this.getSearchResultElements();
                    searchResults.forEach((card) => {
                        if (profiles.length < 20) {
                            const profile = this.extractProfileFromCard(card);
                            if (profile && profile.name && profile.url) {
                                const isDuplicate = profiles.some(p => p.url === profile.url);
                                if (!isDuplicate) {
                                    profile.source = 'network-search';
                                    profiles.push(profile);

                                }
                            }
                        }
                    });

                    const newProfilesCount = profiles.length - initialCount;

                    if (newProfilesCount === 0 && scrollAttempts >= 2) {

                        break;
                    }
                }

            } else if (criteria.type === 'connections' || window.location.href.includes('mynetwork') || window.location.href.includes('connections')) {
                let connectionCards = document.querySelectorAll('.mn-connection-card');
                if (connectionCards.length === 0) {
                    connectionCards = document.querySelectorAll('.connection-card');
                }
                if (connectionCards.length === 0) {
                    connectionCards = document.querySelectorAll('[data-control-name="connection_profile"]');
                }
                if (connectionCards.length === 0) {
                    connectionCards = document.querySelectorAll('.artdeco-entity-lockup');
                }
                if (connectionCards.length === 0) {
                    connectionCards = document.querySelectorAll('li');
                }



                connectionCards.forEach((card, index) => {
                    if (index < 20) { // Process more profiles for better real-time experience
                        const profile = this.extractProfileFromCard(card, true); // Use unified extraction
                        if (profile?.name && profile?.url) {
                            profile.source = 'connections';
                            profiles.push(profile);

                            if (profiles.length <= 3 || profiles.length % 2 === 0) {
                                this.sendProfilesRealTime([profile]);
                            }
                        }
                    }
                });
            }

            return profiles;
        } catch (error) {
            console.error('Error searching network:', error);
            return [];
        }
    }

    getSearchResultElements() {
        const selectors = ['.search-result', '.reusable-search__result-container', '[data-chameleon-result-urn]', 'li[data-reusable-search-result]', '.entity-result'];

        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) return elements;
        }

        const elements = document.querySelectorAll('li');
        return Array.from(elements).filter(li => li.querySelector('a[href*="/in/"]') || li.querySelector('a[href*="linkedin.com/in/"]'));
    }

    getSalesNavigatorResultElements() {
        const selectors = [
            '.artdeco-entity-lockup',
            '[data-chameleon-result-urn]',
            '.search-results__result-item',
            '.result-lockup',
            '.entity-result',
            'li[data-test-result-item]'
        ];

        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) return elements;
        }

        // Fallback for Sales Navigator
        const elements = document.querySelectorAll('li');
        return Array.from(elements).filter(li =>
            li.querySelector('a[href*="/sales/lead/"]') ||
            li.querySelector('a[href*="/in/"]') ||
            li.querySelector('.artdeco-entity-lockup')
        );
    }

}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.linkedInAutomation = new LinkedInAutomation();
    });
} else {
    window.linkedInAutomation = new LinkedInAutomation();
}

}
