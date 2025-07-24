
if (window.linkedInAutomationInjected) {
} else {
    window.linkedInAutomationInjected = true;

class LinkedInAutomation {
    constructor() {
        this.isRunning = false;
        this.currentCampaign = null;
        this.actionDelay = 30000;
        this.dailyLimit = 50;
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
        this.loadSettings();
        this.setupAutoDetection();
    }
    
    loadSettings() {
        this.actionDelay = 30 * 1000;
        this.dailyLimit = 50;
        this.todayCount = 0;
    }

    setupAutoDetection() {
        if (this.isProfilePage() && this.isAutoCollectionEnabled) {
            setTimeout(() => {
                this.startAutoCollection();
            }, 2000);
        }
        this.setupPageChangeMonitoring();
    }

    isProfilePage() {
        const url = window.location.href;
        if (url.includes('/in/') && !url.includes('/search/')) {
            return false;
        }
        return url.includes('linkedin.com/search/results/people') ||
               url.includes('linkedin.com/search/people') ||
               url.includes('linkedin.com/mynetwork') ||
               url.includes('linkedin.com/connections') ||
               (url.includes('linkedin.com') && document.querySelector('.reusable-search__result-container, [data-chameleon-result-urn], .search-result, .entity-result'));
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

        urlObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        window.addEventListener('popstate', () => {
            setTimeout(() => {
                if (this.isProfilePage() && !this.isAutoCollecting && this.isAutoCollectionEnabled) {
                    this.startAutoCollection();
                }
            }, 2000);
        });
    }

    async startAutoCollection() {
        if (this.isAutoCollecting) {
            return;
        }

        this.isAutoCollecting = true;

        try {
            if (chrome.runtime?.id) {
                chrome.runtime.sendMessage({
                    action: 'autoCollectionStarted',
                    url: window.location.href
                });
            }
        } catch (error) {
        }

        this.collectAndSendProfiles();
        this.setupContinuousMonitoring();
    }

    async collectAndSendProfiles() {
        const profiles = await this.collectCurrentPageOnly();

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

                            if (newProfileCards.length > 0) {
                                hasNewProfiles = true;
                            }
                        }
                    });
                }
            });

            if (hasNewProfiles) {
                clearTimeout(this.autoCollectionTimeout);
                this.autoCollectionTimeout = setTimeout(() => {
                    this.collectNewProfilesAuto();
                }, 1500);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

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

        if (newProfiles.length > 0) {
            this.sendProfilesRealTime(newProfiles);
        }
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

        switch (message.action) {
            case 'startAutomation':
                this.startAutomation(message.campaign);
                sendResponse({ success: true });
                break;
            case 'stopAutomation':
                this.stopAutomation();
                sendResponse({ success: true });
                break;
            case 'getPageInfo':
                sendResponse(this.getPageInfo());
                break;
            case 'collectProfiles':
                this.collectProfiles().then(profiles => {
                    sendResponse({ profiles });
                });
                return true;
            case 'sendDirectMessage':
                this.handleDirectMessage(message.message, message.profileName, message.profileUrl);
                sendResponse({ success: true });
                break;
            case 'startRealTimeCollection':
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
                    }).catch(error => {
                        console.error('🚀 CONTENT: Error in real-time collection:', error);
                    });
                }, 1000);

                sendResponse({ success: true });
                return true;
            case 'stopRealTimeCollection':
                this.isRealTimeMode = false;
                this.currentPageCollected = false;
                sendResponse({ success: true });
                return true;
            case 'stopAutoCollection':
                this.stopAutoCollection();
                sendResponse({ success: true });
                return true;
            case 'startAutoCollection':
                if (!this.isAutoCollecting && this.isAutoCollectionEnabled) {
                    this.startAutoCollection();
                }
                sendResponse({ success: true });
                return true;
            case 'enableAutoCollection':
                this.isAutoCollectionEnabled = true;
                if (this.isProfilePage() && !this.isAutoCollecting) {
                    this.startAutoCollection();
                }
                sendResponse({ success: true });
                return true;
            case 'disableAutoCollection':
                this.isAutoCollectionEnabled = false;
                this.stopAutoCollection();
                sendResponse({ success: true });
                return true;
            case 'searchByCompany':
                this.searchByCompany(message.companyName).then(result => {
                    sendResponse(result);
                });
                return true;
            case 'searchNetwork':
                this.searchNetwork(message.criteria).then(profiles => {
                    sendResponse({ profiles: profiles || [] });
                }).catch(error => {
                    console.error('Error in searchNetwork:', error);
                    sendResponse({ profiles: [], error: error.message });
                });
                return true;
            default:
                sendResponse({ error: 'Unknown action: ' + message.action });
        }
    }
    
    isSearchResultsPage() {
        return window.location.href.includes('/search/people/') ||
               window.location.href.includes('/search/results/people/');
    }
    
    startAutomationFromPage() {
        if (this.todayCount >= this.dailyLimit) {
            return;
        }
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
            if (this.todayCount >= this.dailyLimit) {
                break;
            }

            const button = connectButtons[i];
            const personInfo = this.extractPersonInfo(button);

            try {
                await this.sendConnectionRequest(button, personInfo);
                this.todayCount++;
                if (i < connectButtons.length - 1) {
                    await this.delay(this.actionDelay);
                }
            } catch (error) {
                console.error('Error sending connection request:', error);
            }
        }

        this.stopAutomation();
    }
    
    findConnectButtons() {
        const selectors = [
            'button[aria-label*="Connect"]',
            'button[data-control-name="connect"]',
            '.search-result__actions button[aria-label*="Invite"]'
        ];

        const buttons = [];
        selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                if ((el.textContent.includes('Connect') || el.getAttribute('aria-label')?.includes('Connect'))
                    && el.offsetParent !== null) {
                    buttons.push(el);
                }
            });
        });

        return buttons;
    }
    
    extractPersonInfo(connectButton) {
        const resultCard = connectButton.closest('.search-result') ||
                           connectButton.closest('.reusable-search__result-container') ||
                           connectButton.closest('[data-chameleon-result-urn]');
        
        let name = 'Unknown';
        let company = '';
        let title = '';
        
        if (resultCard) {
            const nameElement = resultCard.querySelector('.entity-result__title-text a') ||
                               resultCard.querySelector('.search-result__result-link') ||
                               resultCard.querySelector('[data-anonymize="person-name"]');
            
            if (nameElement) {
                name = nameElement.textContent.trim();
            }

            const subtitleElement = resultCard.querySelector('.entity-result__primary-subtitle') ||
                                   resultCard.querySelector('.search-result__truncate');
            
            if (subtitleElement) {
                title = subtitleElement.textContent.trim();
            }
        }
        
        return { name, company, title };
    }
    
    async sendConnectionRequest(button, personInfo) {
        return new Promise((resolve, reject) => {
            try {
                button.click();

                setTimeout(() => {
                    const sendButton = document.querySelector('button[aria-label*="Send without a note"]') ||
                                     document.querySelector('button[data-control-name="send_invite"]') ||
                                     document.querySelector('.send-invite__actions button[aria-label*="Send"]');
                    
                    if (sendButton) {
                        sendButton.click();
                        resolve();
                    } else {
                        const addNoteButton = document.querySelector('button[aria-label*="Add a note"]');
                        if (addNoteButton) {
                            addNoteButton.click();
                            
                            setTimeout(() => {
                                this.sendCustomMessage(personInfo, resolve, reject);
                            }, 1000);
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

            const messageTextarea = document.querySelector('#custom-message') ||
                                   document.querySelector('textarea[name="message"]') ||
                                   document.querySelector('.send-invite__custom-message textarea');

            if (messageTextarea) {
                messageTextarea.value = personalizedMessage;
                messageTextarea.dispatchEvent(new Event('input', { bubbles: true }));

                setTimeout(() => {
                    const sendButton = document.querySelector('button[aria-label*="Send invitation"]') ||
                                     document.querySelector('.send-invite__actions button[aria-label*="Send"]');

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
        
        return template
            .replace(/{firstName}/g, firstName)
            .replace(/{lastName}/g, lastName)
            .replace(/{fullName}/g, personInfo.name)
            .replace(/{company}/g, personInfo.company)
            .replace(/{title}/g, personInfo.title);
    }
    
    startAutomation(campaign) {
        this.currentCampaign = campaign;
        this.startAutomationFromPage();
    }

    stopAutomation() {
        this.isRunning = false;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async handleDirectMessage(message, profileName, profileUrl) {
        try {
            await this.delay(2000);
            const messageButton = await this.findMessageButton();

            if (messageButton) {
                messageButton.click();
                await this.delay(4000);
                const messageInput = await this.findMessageInput();
                if (!messageInput) {
                    return;
                }
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
            }
        } catch (error) {
        }
    }

    async findMessageButton() {
        await this.delay(2000);
        const selectors = [
            'button[aria-label*="Message"]:not([aria-label*="Send"]):not([aria-label*="Share"])',
            'button[data-control-name="message"]',
            '.pv-s-profile-actions button[aria-label*="Message"]',
            '.pvs-profile-actions__action button[aria-label*="Message"]',
            '.message-anywhere-button',
            'a[data-control-name="message"]'
        ];

        for (const selector of selectors) {
            const button = document.querySelector(selector);
            if (button) {
                const text = button.textContent.toLowerCase().trim();
                const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
                if (!text.includes('send') &&
                    !text.includes('share') &&
                    !ariaLabel.includes('send') &&
                    !ariaLabel.includes('share') &&
                    !ariaLabel.includes('post')) {
                    return button;
                }
            }
        }

        const buttons = document.querySelectorAll('button, a');
        for (const button of buttons) {
            const text = button.textContent.toLowerCase().trim();
            const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
            if ((text === 'message' || ariaLabel.includes('message')) &&
                !ariaLabel.includes('send') &&
                !ariaLabel.includes('share') &&
                !ariaLabel.includes('post') &&
                !text.includes('send') &&
                !text.includes('share') &&
                !text.includes('more')) {
                return button;
            }
        }
        return null;
    }

    async pasteMessageDirectly(messageInput, message) {
        if (!messageInput) {
            return;
        }
        messageInput.focus();
        await this.delay(500);

        if (messageInput.contentEditable === 'true') {
            messageInput.innerHTML = '';
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

        const events = [
            new Event('focus', { bubbles: true }),
            new Event('input', { bubbles: true }),
            new Event('change', { bubbles: true }),
            new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
            new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' })
        ];
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

            // Copy message to clipboard
            await navigator.clipboard.writeText(message);
            await this.delay(200);

            // Simulate Ctrl+V paste
            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: new DataTransfer()
            });

            pasteEvent.clipboardData.setData('text/plain', message);
            messageInput.dispatchEvent(pasteEvent);

            // Trigger input events
            messageInput.dispatchEvent(new Event('input', { bubbles: true }));
            messageInput.dispatchEvent(new Event('change', { bubbles: true }));

            await this.delay(500);
        } catch (error) {
            messageInput.textContent = message;
            messageInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    async findMessageInput() {
        const selectors = [
            '.msg-form__contenteditable',
            '.msg-form__msg-content-container div[contenteditable="true"]',
            'div[data-placeholder*="message"]',
            '.compose-form__message-field',
            'div[contenteditable="true"][data-placeholder]',
            '.msg-form__msg-content-container--scrollable div[contenteditable="true"]',
            '.msg-form__placeholder + div[contenteditable="true"]',
            'div[contenteditable="true"][role="textbox"]',
            '.msg-form div[contenteditable="true"]'
        ];

        for (let attempt = 0; attempt < 8; attempt++) {
            for (const selector of selectors) {
                const input = document.querySelector(selector);
                if (input && input.isContentEditable && input.offsetParent !== null) {
                    return input;
                }
            }
            const allContentEditables = document.querySelectorAll('div[contenteditable="true"]');
            for (const element of allContentEditables) {
                if (element.offsetParent === null) continue;

                const placeholder = element.getAttribute('data-placeholder') ||
                                  element.getAttribute('aria-label') ||
                                  element.getAttribute('placeholder');
                if (placeholder && placeholder.toLowerCase().includes('message')) {
                    return element;
                }

                const parentContainer = element.closest('.msg-form, .compose-form');
                if (parentContainer) {
                    return element;
                }
            }
            await this.delay(1000);
        }

        return null;
    }

    async typeText(element, text) {
        // For contenteditable divs
        if (element.contentEditable === 'true') {
            // Focus the element first
            element.focus();

            // Clear existing content if this is the first text
            if (!element.textContent.trim()) {
                element.textContent = '';
            }

            // Add the text
            element.textContent += text;

            // Move cursor to end
            const range = document.createRange();
            const selection = window.getSelection();
            range.selectNodeContents(element);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);

            // Trigger comprehensive events
            element.dispatchEvent(new Event('focus', { bubbles: true }));
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        } else {
            // For regular input/textarea
            element.focus();
            element.value += text;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        }
    }

    async clickSendButton() {

        await this.delay(2000);

        const sendSelectors = [
            '.msg-form__send-button',
            'button[type="submit"]',
            '.msg-form button[type="submit"]',
            'button[data-control-name="send"]',
            'button[aria-label*="Send"]:not([aria-label*="options"])',
            '.compose-form__send-button',
            '.msg-form__send-btn'
        ];

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
                if (text === 'send' &&
                    !text.includes('options') &&
                    !ariaLabel.includes('options') &&
                    !button.disabled &&
                    button.offsetParent !== null &&
                    button.offsetWidth > 0 &&
                    button.offsetHeight > 0) {
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

        if (window.location.href.includes('/mynetwork/')) {
            return this.collectNetworkProfiles();
        }

        const selectors = [
            '.reusable-search__result-container',
            '[data-chameleon-result-urn]',
            '.search-result',
            '.entity-result'
        ];

        let profileCards = [];
        for (const selector of selectors) {
            profileCards = document.querySelectorAll(selector);
            if (profileCards.length > 0) break;
        }

        profileCards.forEach((card) => {
            const profile = this.extractProfileFromCard(card);
            if (profile?.name && profile?.url) {
                profiles.push(profile);
            }
        });

        if (profiles.length === 0) {
            const alternativeProfiles = this.extractProfilesAlternative();
            profiles.push(...alternativeProfiles);
        }

        return profiles;
    }

    async collectCurrentPageOnly() {
        // Use existing collectProfiles method but limit results and send real-time
        const allProfiles = await this.collectProfiles();
        const limitedProfiles = allProfiles.slice(0, 10);

        // Send profiles in real-time as they're collected
        limitedProfiles.forEach(profile => {
            this.sendProfilesRealTime([profile]);
        });

        return limitedProfiles;
    }

    sendProfilesRealTime(profiles) {
        if (!this.isAutoCollectionEnabled) {
            return;
        }

        if (profiles.length > 0) {
            if (!chrome.runtime?.id) {
                this.storeProfilesForPopup(profiles);
                return;
            }
            try {
                chrome.runtime.sendMessage({
                    action: 'addProfilesRealTime',
                    profiles: profiles
                }).catch(() => {
                    this.storeProfilesForPopup(profiles);
                });
            } catch (error) {
                this.storeProfilesForPopup(profiles);
            }
        }
    }

    storeProfilesForPopup() {
        // Storage removed - profiles are handled in memory only
    }

    // Removed duplicate startContinuousCollection() and collectNewProfiles() - functionality exists in setupContinuousMonitoring() and collectNewProfilesAuto()

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
        // Simplified alternative extraction using existing extractProfileFromCard method
        const profiles = [];
        const profileLinks = document.querySelectorAll('a[href*="/in/"]');
        const containers = new Set();

        profileLinks.forEach(link => {
            if (!link.href.includes('/in/') || link.href.includes('?') || link.closest('.processed')) {
                return;
            }

            const container = link.closest('li, div, article');
            if (container && !container.classList.contains('processed')) {
                container.classList.add('processed');
                containers.add(container);
            }
        });

        Array.from(containers).forEach(container => {
            const profile = this.extractProfileFromCard(container);
            if (profile?.name && profile?.url) {
                profiles.push(profile);
            }
        });

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
                let nameText = nameLink.textContent.trim();

                if (nameText.includes('View') && nameText.includes('profile')) {
                    const match = nameText.match(/^(.+?)(?:View|•|\n)/);
                    if (match) {
                        nameText = match[1].trim();
                    }
                }

                profile.name = nameText;
                profile.url = nameLink.href || '';
            } else {
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

                let nameSpan = null;
                for (const selector of nameSelectors) {
                    nameSpan = card.querySelector(selector);
                    if (nameSpan && nameSpan.textContent.trim() &&
                        !nameSpan.textContent.includes('Status') &&
                        !nameSpan.textContent.includes('View') &&
                        nameSpan.textContent.length > 2) {
                        break;
                    }
                    nameSpan = null;
                }

                if (nameSpan) {
                    profile.name = nameSpan.textContent.trim();
                    const parentLink = nameSpan.closest('a') || card.querySelector('a[href*="/in/"]');
                    if (parentLink) profile.url = parentLink.href;
                } else {
                    const allLinks = card.querySelectorAll('a[href*="/in/"]');
                    for (const link of allLinks) {
                        const text = link.textContent.trim();
                        if (text && text.length > 2 &&
                            !text.includes('Status') &&
                            !text.includes('View') &&
                            !text.includes('•') &&
                            text.split(' ').length >= 2) {
                            profile.name = text;
                            profile.url = link.href;
                            break;
                        }
                    }
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
            let scrollAttempts = 0;
            const maxScrollAttempts = 5;

            this.setupContinuousMonitoring();

            if (criteria.type === 'search' || window.location.href.includes('search/results/people')) {

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
        let elements = document.querySelectorAll('.search-result');
        if (elements.length > 0) return elements;

        elements = document.querySelectorAll('.reusable-search__result-container');
        if (elements.length > 0) return elements;

        elements = document.querySelectorAll('[data-chameleon-result-urn]');
        if (elements.length > 0) return elements;

        elements = document.querySelectorAll('li[data-reusable-search-result]');
        if (elements.length > 0) return elements;

        elements = document.querySelectorAll('.entity-result');
        if (elements.length > 0) return elements;

        elements = document.querySelectorAll('li');
        return Array.from(elements).filter(li => {
            return li.querySelector('a[href*="/in/"]') || li.querySelector('a[href*="linkedin.com/in/"]');
        });
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
