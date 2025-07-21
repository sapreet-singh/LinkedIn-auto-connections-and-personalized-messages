// LinkedIn Content Script - Handles automation on LinkedIn pages
class LinkedInAutomation {
    constructor() {
        this.isRunning = false;
        this.currentCampaign = null;
        this.actionDelay = 30000; // 30 seconds default
        this.dailyLimit = 50;
        this.todayCount = 0;
        
        this.init();
    }
    
    init() {
        console.log('LinkedIn Automation initialized');
        
        // Listen for messages from background script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sendResponse);
        });
        
        // Load settings
        this.loadSettings();
        
        // Check if we're on a search results page
        if (this.isSearchResultsPage()) {
            this.addAutomationUI();
        }
    }
    
    loadSettings() {
        chrome.storage.local.get(['actionDelay', 'dailyLimit', 'todayCount'], (result) => {
            this.actionDelay = (result.actionDelay || 30) * 1000;
            this.dailyLimit = result.dailyLimit || 50;
            this.todayCount = result.todayCount || 0;
        });
    }
    
    handleMessage(message, sendResponse) {
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
            default:
                sendResponse({ error: 'Unknown action' });
        }
    }
    
    isSearchResultsPage() {
        return window.location.href.includes('/search/people/') || 
               window.location.href.includes('/search/results/people/');
    }
    
    addAutomationUI() {
        // Add a floating button to start automation
        const automationButton = document.createElement('div');
        automationButton.id = 'linkedin-automation-btn';
        automationButton.innerHTML = `
            <div class="automation-panel">
                <button id="start-automation">Start Auto Connect</button>
                <button id="stop-automation" style="display: none;">Stop</button>
                <div class="automation-status">Ready</div>
            </div>
        `;
        
        document.body.appendChild(automationButton);
        
        // Add event listeners
        document.getElementById('start-automation').addEventListener('click', () => {
            this.startAutomationFromPage();
        });
        
        document.getElementById('stop-automation').addEventListener('click', () => {
            this.stopAutomation();
        });
    }
    
    startAutomationFromPage() {
        if (this.todayCount >= this.dailyLimit) {
            this.updateStatus('Daily limit reached!', 'error');
            return;
        }
        
        this.isRunning = true;
        this.updateStatus('Starting automation...', 'running');
        
        document.getElementById('start-automation').style.display = 'none';
        document.getElementById('stop-automation').style.display = 'block';
        
        this.processConnections();
    }
    
    async processConnections() {
        if (!this.isRunning) return;
        
        const connectButtons = this.findConnectButtons();
        
        if (connectButtons.length === 0) {
            this.updateStatus('No connect buttons found', 'warning');
            this.stopAutomation();
            return;
        }
        
        for (let i = 0; i < connectButtons.length && this.isRunning; i++) {
            if (this.todayCount >= this.dailyLimit) {
                this.updateStatus('Daily limit reached!', 'error');
                break;
            }
            
            const button = connectButtons[i];
            const personInfo = this.extractPersonInfo(button);
            
            this.updateStatus(`Connecting to ${personInfo.name}...`, 'running');
            
            try {
                await this.sendConnectionRequest(button, personInfo);
                this.todayCount++;
                
                // Update storage
                chrome.storage.local.set({ todayCount: this.todayCount });
                
                this.updateStatus(`Connected to ${personInfo.name}. Waiting...`, 'success');
                
                // Wait before next action
                if (i < connectButtons.length - 1) {
                    await this.delay(this.actionDelay);
                }
            } catch (error) {
                console.error('Error sending connection request:', error);
                this.updateStatus(`Error connecting to ${personInfo.name}`, 'error');
            }
        }
        
        this.updateStatus('Automation completed', 'success');
        this.stopAutomation();
    }
    
    findConnectButtons() {
        // Find all "Connect" buttons on the page
        const buttons = [];
        
        // Different selectors for different LinkedIn layouts
        const selectors = [
            'button[aria-label*="Connect"]',
            'button[data-control-name="connect"]',
            'button:contains("Connect")',
            '.search-result__actions button[aria-label*="Invite"]'
        ];
        
        selectors.forEach(selector => {
            try {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => {
                    if (el.textContent.includes('Connect') || el.getAttribute('aria-label')?.includes('Connect')) {
                        buttons.push(el);
                    }
                });
            } catch (e) {
                // Ignore selector errors
            }
        });
        
        return buttons.filter(btn => btn.offsetParent !== null); // Only visible buttons
    }
    
    extractPersonInfo(connectButton) {
        // Try to extract person information from the search result
        const resultCard = connectButton.closest('.search-result') || 
                           connectButton.closest('.reusable-search__result-container') ||
                           connectButton.closest('[data-chameleon-result-urn]');
        
        let name = 'Unknown';
        let company = '';
        let title = '';
        
        if (resultCard) {
            // Try different selectors for name
            const nameElement = resultCard.querySelector('.entity-result__title-text a') ||
                               resultCard.querySelector('.search-result__result-link') ||
                               resultCard.querySelector('[data-anonymize="person-name"]');
            
            if (nameElement) {
                name = nameElement.textContent.trim();
            }
            
            // Try to get company and title
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
                // Click the connect button
                button.click();
                
                // Wait for modal to appear
                setTimeout(() => {
                    // Look for "Send without a note" or "Send" button
                    const sendButton = document.querySelector('button[aria-label*="Send without a note"]') ||
                                     document.querySelector('button[data-control-name="send_invite"]') ||
                                     document.querySelector('.send-invite__actions button[aria-label*="Send"]');
                    
                    if (sendButton) {
                        sendButton.click();
                        resolve();
                    } else {
                        // Try to find and use custom message option
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
            // Get custom message template
            chrome.storage.local.get(['connectionMessage'], (result) => {
                const messageTemplate = result.connectionMessage || 'Hi {firstName}, I\'d love to connect with you!';
                const personalizedMessage = this.personalizeMessage(messageTemplate, personInfo);
                
                // Find message textarea
                const messageTextarea = document.querySelector('#custom-message') ||
                                       document.querySelector('textarea[name="message"]') ||
                                       document.querySelector('.send-invite__custom-message textarea');
                
                if (messageTextarea) {
                    messageTextarea.value = personalizedMessage;
                    messageTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                    
                    // Find and click send button
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
            });
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
    
    stopAutomation() {
        this.isRunning = false;
        
        const startBtn = document.getElementById('start-automation');
        const stopBtn = document.getElementById('stop-automation');
        
        if (startBtn && stopBtn) {
            startBtn.style.display = 'block';
            stopBtn.style.display = 'none';
        }
        
        this.updateStatus('Automation stopped', 'ready');
    }
    
    updateStatus(message, type = 'ready') {
        const statusElement = document.querySelector('.automation-status');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `automation-status ${type}`;
        }
        
        console.log(`LinkedIn Automation: ${message}`);
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    getPageInfo() {
        return {
            url: window.location.href,
            title: document.title,
            isSearchPage: this.isSearchResultsPage(),
            connectButtonsCount: this.findConnectButtons().length
        };
    }
}

// Initialize the automation when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new LinkedInAutomation();
    });
} else {
    new LinkedInAutomation();
}
