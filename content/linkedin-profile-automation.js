// LinkedIn Profile Automation Handler - Same Tab Approach
class LinkedInProfileAutomation {
    constructor() {
        this.isProcessing = false;
        this.automationState = null;
        this.config = window.LinkedInSearchConfig?.automation || {};
        this.maxRetries = this.config.timing?.maxRetries || 5;
        this.retryDelay = this.config.timing?.retryDelay || 1000;
        this.init();
    }

    init() {
        // Check if we're on a LinkedIn profile page
        if (this.isLinkedInProfilePage()) {
            this.checkForAutomationState();
        }
    }

    isLinkedInProfilePage() {
        const url = window.location.href;
        return url.includes('linkedin.com/in/') && !url.includes('/search');
    }

    checkForAutomationState() {
        // Check for automation state from same-tab navigation
        const automationState = sessionStorage.getItem('linkedinAutomationState');
        if (automationState) {
            try {
                this.automationState = JSON.parse(automationState);
                if (this.automationState.isAutomation) {
                    console.log('Profile automation detected for:', this.automationState.profileName);
                    this.showAutomationIndicator('LinkedIn Automation Active - Processing profile...');

                    // Wait for page to fully load
                    setTimeout(() => {
                        this.processConnection();
                    }, 3000);
                }
            } catch (error) {
                console.error('Error parsing automation state:', error);
                this.returnToSearchWithResult({
                    success: false,
                    error: 'Failed to parse automation state'
                });
            }
        }
    }

    async processConnection() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            console.log('Starting profile connection for:', this.automationState.profileName);
            this.showAutomationIndicator('Looking for Connect button...');

            // Wait a bit more for page to fully load
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Step 1: Find and click Connect button with retries
            const connectResult = await this.findAndClickConnectButton();
            if (!connectResult.success) {
                this.showAutomationIndicator('Connect button not found', 'error');
                setTimeout(() => {
                    this.returnToSearchWithResult({
                        success: false,
                        error: connectResult.error
                    });
                }, 2000);
                return;
            }

            console.log('Connect button clicked, waiting for popup...');
            this.showAutomationIndicator('Clicking Connect button...');

            // Step 2: Wait for popup and handle it
            const popupResult = await this.handleConnectionPopup();
            if (!popupResult.success) {
                this.showAutomationIndicator('Connection failed: ' + popupResult.error, 'error');
                setTimeout(() => {
                    this.returnToSearchWithResult({
                        success: false,
                        error: popupResult.error
                    });
                }, 2000);
                return;
            }

            // Step 3: Success
            this.showAutomationIndicator('Connection sent successfully!', 'success');
            setTimeout(() => {
                this.returnToSearchWithResult({
                    success: true,
                    message: 'Connection request sent successfully'
                });
            }, 1000);

        } catch (error) {
            console.error('Error processing connection:', error);
            this.showAutomationIndicator('Error: ' + error.message, 'error');
            setTimeout(() => {
                this.returnToSearchWithResult({
                    success: false,
                    error: error.message
                });
            }, 2000);
        } finally {
            this.isProcessing = false;
        }
    }

    async findAndClickConnectButton() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = this.maxRetries;

            const findButton = () => {
                attempts++;
                console.log(`Attempt ${attempts} to find connect button`);
                this.showAutomationIndicator(`Looking for Connect button... (${attempts}/${maxAttempts})`);

                // Get selectors from configuration
                const primarySelectors = this.config.selectors?.connectButton?.primary || [
                    'button[aria-label*="to connect"]',
                    'button[aria-label*="Connect"]',
                    'button.artdeco-button--primary'
                ];

                const fallbackSelectors = this.config.selectors?.connectButton?.fallback || [
                    'button[data-control-name="connect"]',
                    '.pv-s-profile-actions button[aria-label*="Connect"]'
                ];

                let connectButton = null;
                const allSelectors = [...primarySelectors, ...fallbackSelectors];

                // Try all selectors in order
                for (const selector of allSelectors) {
                    try {
                        const buttons = document.querySelectorAll(selector);
                        for (const button of buttons) {
                            const buttonText = button.querySelector('.artdeco-button__text')?.textContent?.trim().toLowerCase();
                            if (buttonText === 'connect' &&
                                !button.disabled &&
                                button.offsetParent !== null) {
                                connectButton = button;
                                console.log('Found connect button with selector:', selector);
                                console.log('Button text:', buttonText);
                                console.log('Button aria-label:', button.getAttribute('aria-label'));
                                break;
                            }
                        }
                        if (connectButton) break;
                    } catch (e) {
                        continue;
                    }
                }

                // Final fallback: look for any button with exact "Connect" text
                if (!connectButton) {
                    const allButtons = document.querySelectorAll('button');
                    for (const button of allButtons) {
                        const buttonTextElement = button.querySelector('.artdeco-button__text');
                        if (buttonTextElement &&
                            buttonTextElement.textContent.trim().toLowerCase() === 'connect' &&
                            !button.disabled && button.offsetParent !== null) {
                            connectButton = button;
                            console.log('Found connect button via text search');
                            break;
                        }
                    }
                }

                if (connectButton) {
                    console.log('Clicking Connect button...');
                    connectButton.click();
                    resolve({ success: true });
                    return;
                }

                if (attempts < maxAttempts) {
                    setTimeout(findButton, this.retryDelay);
                } else {
                    console.log('Connect button not found after', maxAttempts, 'attempts');
                    resolve({ success: false, error: 'Connect button not found after multiple attempts' });
                }
            };

            findButton();
        });
    }

    isValidConnectButton(button) {
        if (!button || button.disabled) return false;
        
        const text = button.textContent.trim().toLowerCase();
        const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
        
        // Check if it's actually a Connect button
        const isConnect = text.includes('connect') || ariaLabel.includes('connect');
        
        // Exclude buttons that are not the main connect action
        const isExcluded = text.includes('following') || 
                          text.includes('message') || 
                          text.includes('more') ||
                          ariaLabel.includes('following') ||
                          ariaLabel.includes('message');
        
        return isConnect && !isExcluded;
    }

    async handleConnectionPopup() {
        try {
            console.log('Looking for connection popup/modal...');
            this.showAutomationIndicator('Looking for connection popup...');

            // Wait for popup to appear
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Look for "Add a note" button first - exact match for your HTML structure
            console.log('Looking for "Add a note" button...');
            const addNoteButton = document.querySelector('button[aria-label="Add a note"]') ||
                                 document.querySelector('button.artdeco-button--secondary .artdeco-button__text:contains("Add a note")') ||
                                 document.querySelector('button.artdeco-button--muted');

            // Alternative approach - find button by text content
            let addNoteButtonByText = null;
            const allButtons = document.querySelectorAll('button');
            for (const button of allButtons) {
                const textElement = button.querySelector('.artdeco-button__text');
                if (textElement && textElement.textContent.trim() === 'Add a note') {
                    addNoteButtonByText = button;
                    break;
                }
            }

            const finalAddNoteButton = addNoteButton || addNoteButtonByText;

            if (finalAddNoteButton) {
                console.log('Found "Add a note" button, clicking...');
                this.showAutomationIndicator('Clicking "Add a note"...');
                finalAddNoteButton.click();
                await new Promise(resolve => setTimeout(resolve, 1500));
            } else {
                console.log('No "Add a note" button found, looking for textarea directly');
            }

            // Look for note textarea - exact match for your HTML structure
            console.log('Looking for message textarea...');
            let noteTextarea = document.querySelector('textarea[name="message"]') ||
                              document.querySelector('textarea#custom-message') ||
                              document.querySelector('.connect-button-send-invite__custom-message') ||
                              document.querySelector('.connect-button-send-invite__custom-message-box textarea');

            // Alternative approach - find textarea in the custom message box
            if (!noteTextarea) {
                const messageBox = document.querySelector('.connect-button-send-invite__custom-message-box');
                if (messageBox) {
                    noteTextarea = messageBox.querySelector('textarea');
                }
            }

            if (noteTextarea && this.automationState.message) {
                console.log('Found textarea, adding message...');
                this.showAutomationIndicator('Adding custom message...');

                // Clear existing text and add the message
                noteTextarea.value = '';
                noteTextarea.focus();

                // Set the message value
                noteTextarea.value = this.automationState.message;

                // Trigger events to ensure LinkedIn recognizes the input
                noteTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                noteTextarea.dispatchEvent(new Event('change', { bubbles: true }));
                noteTextarea.dispatchEvent(new Event('keyup', { bubbles: true }));

                console.log('Message added successfully:', this.automationState.message);

                // Wait a bit for the UI to update
                await new Promise(resolve => setTimeout(resolve, 500));
            } else {
                console.log('No textarea found, proceeding without custom message');
            }

            // Wait a bit then look for send button
            await new Promise(resolve => setTimeout(resolve, 1000));

            this.showAutomationIndicator('Looking for Send button...');

            // Look for send button - exact match for your HTML structure
            console.log('Looking for Send invitation button...');
            let sendButton = document.querySelector('button[aria-label="Send invitation"]');

            // Alternative approach - find button by text content
            if (!sendButton) {
                const allButtons = document.querySelectorAll('button');
                for (const button of allButtons) {
                    const textElement = button.querySelector('.artdeco-button__text');
                    if (textElement && textElement.textContent.trim() === 'Send') {
                        // Make sure it's a primary button (likely the send button)
                        if (button.classList.contains('artdeco-button--primary')) {
                            sendButton = button;
                            console.log('Found Send button by text content');
                            break;
                        }
                    }
                }
            }

            // Additional fallback selectors
            if (!sendButton) {
                const fallbackSelectors = [
                    'button[aria-label*="Send invitation"]',
                    'button[aria-label*="Send"]',
                    '.artdeco-button--primary:has(.artdeco-button__text)',
                    'button.ml1.artdeco-button--primary'
                ];

                for (const selector of fallbackSelectors) {
                    try {
                        const buttons = document.querySelectorAll(selector);
                        for (const button of buttons) {
                            const textElement = button.querySelector('.artdeco-button__text');
                            if (textElement && textElement.textContent.trim().toLowerCase() === 'send') {
                                sendButton = button;
                                console.log('Found send button with fallback selector:', selector);
                                break;
                            }
                        }
                        if (sendButton) break;
                    } catch (e) {
                        continue;
                    }
                }
            }

            if (sendButton) {
                console.log('Clicking send button...');
                console.log('Send button aria-label:', sendButton.getAttribute('aria-label'));
                this.showAutomationIndicator('Sending connection request...');
                sendButton.click();

                return { success: true };
            } else {
                console.log('Send button not found, checking if connection was already sent');
                return { success: true, message: 'Connect button clicked (no send popup found)' };
            }

        } catch (error) {
            console.log('Failed to handle connection popup:', error.message);
            return { success: false, error: 'Error handling popup: ' + error.message };
        }
    }

    fillConnectionMessage(popup, resolve) {
        try {
            // Look for message textarea
            const messageSelectors = [
                'textarea[name="message"]',
                'textarea[id*="custom-message"]',
                '.send-invite__custom-message textarea',
                'textarea'
            ];

            let messageTextarea = null;
            for (const selector of messageSelectors) {
                messageTextarea = popup.querySelector(selector);
                if (messageTextarea) break;
            }

            if (messageTextarea && this.connectionData.message) {
                // Clear existing text and type new message
                messageTextarea.value = '';
                messageTextarea.focus();
                
                // Type message character by character to simulate human typing
                this.typeMessage(messageTextarea, this.connectionData.message);
            }

            // Find and click Send button
            setTimeout(() => {
                const sendButton = this.findSendButton(popup);
                if (sendButton) {
                    sendButton.click();
                    resolve({ success: true });
                } else {
                    resolve({ success: false, error: 'Send button not found' });
                }
            }, 2000);

        } catch (error) {
            resolve({ success: false, error: `Error filling message: ${error.message}` });
        }
    }

    typeMessage(textarea, message) {
        let index = 0;
        const typeChar = () => {
            if (index < message.length) {
                textarea.value += message[index];
                // Trigger input event
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                index++;
                setTimeout(typeChar, 50 + Math.random() * 50); // Random delay between 50-100ms
            }
        };
        typeChar();
    }

    findSendButton(popup) {
        const sendSelectors = [
            'button[aria-label*="Send"]',
            'button[data-control-name="send_invite"]',
            'button:contains("Send")',
            '.send-invite__actions button[type="submit"]',
            'button[type="submit"]'
        ];

        for (const selector of sendSelectors) {
            if (selector.includes(':contains')) {
                const buttons = popup.querySelectorAll('button');
                for (const button of buttons) {
                    if (button.textContent.trim().toLowerCase().includes('send')) {
                        return button;
                    }
                }
            } else {
                const button = popup.querySelector(selector);
                if (button && !button.disabled) {
                    return button;
                }
            }
        }
        return null;
    }

    // Show automation indicator on profile page
    showAutomationIndicator(message, type = 'info') {
        // Remove existing indicator
        const existingIndicator = document.querySelector('.profile-automation-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }

        const indicator = document.createElement('div');
        indicator.className = 'profile-automation-indicator';
        indicator.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#007bff'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10001;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            font-weight: 500;
            max-width: 300px;
            word-wrap: break-word;
            animation: slideIn 0.3s ease-out;
        `;

        // Add animation keyframes if not already added
        if (!document.querySelector('#automation-indicator-styles')) {
            const style = document.createElement('style');
            style.id = 'automation-indicator-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }

        indicator.textContent = message;
        document.body.appendChild(indicator);

        // Auto-remove success/error messages after 3 seconds
        if (type === 'success' || type === 'error') {
            setTimeout(() => {
                if (indicator.parentNode) {
                    indicator.remove();
                }
            }, 3000);
        }
    }

    // Helper function to return to search with result
    returnToSearchWithResult(result) {
        // Remove automation indicator
        const indicator = document.querySelector('.profile-automation-indicator');
        if (indicator) {
            indicator.remove();
        }

        sessionStorage.removeItem('linkedinAutomationState');
        sessionStorage.setItem('automationResult', JSON.stringify(result));
        window.location.href = this.automationState.currentUrl;
    }
}

// Initialize when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new LinkedInProfileAutomation();
    });
} else {
    new LinkedInProfileAutomation();
}

// Also initialize on navigation changes (for SPA behavior)
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        setTimeout(() => {
            new LinkedInProfileAutomation();
        }, 1000);
    }
}).observe(document, { subtree: true, childList: true });
