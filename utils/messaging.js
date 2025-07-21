// Messaging utility for communication between extension components

class MessagingManager {
    // Send message to background script
    static async sendToBackground(message) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Error sending message to background:', chrome.runtime.lastError);
                    resolve({ error: chrome.runtime.lastError.message });
                } else {
                    resolve(response);
                }
            });
        });
    }
    
    // Send message to content script
    static async sendToContent(tabId, message) {
        return new Promise((resolve) => {
            chrome.tabs.sendMessage(tabId, message, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Error sending message to content script:', chrome.runtime.lastError);
                    resolve({ error: chrome.runtime.lastError.message });
                } else {
                    resolve(response);
                }
            });
        });
    }
    
    // Send message to popup
    static async sendToPopup(message) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Error sending message to popup:', chrome.runtime.lastError);
                    resolve({ error: chrome.runtime.lastError.message });
                } else {
                    resolve(response);
                }
            });
        });
    }
    
    // Listen for messages
    static onMessage(callback) {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            callback(message, sender, sendResponse);
            return true; // Keep the message channel open for async responses
        });
    }
    
    // Campaign-specific messaging
    static async startCampaign(campaignId) {
        return this.sendToBackground({
            action: 'startCampaign',
            campaignId
        });
    }
    
    static async pauseCampaign(campaignId) {
        return this.sendToBackground({
            action: 'pauseCampaign',
            campaignId
        });
    }
    
    static async resumeCampaign(campaignId) {
        return this.sendToBackground({
            action: 'resumeCampaign',
            campaignId
        });
    }
    
    static async deleteCampaign(campaignId) {
        return this.sendToBackground({
            action: 'deleteCampaign',
            campaignId
        });
    }
    
    static async getCampaignStatus(campaignId) {
        return this.sendToBackground({
            action: 'getCampaignStatus',
            campaignId
        });
    }
    
    // Content script automation messaging
    static async startAutomation(tabId, campaign) {
        return this.sendToContent(tabId, {
            action: 'startAutomation',
            campaign
        });
    }
    
    static async stopAutomation(tabId) {
        return this.sendToContent(tabId, {
            action: 'stopAutomation'
        });
    }
    
    static async getPageInfo(tabId) {
        return this.sendToContent(tabId, {
            action: 'getPageInfo'
        });
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MessagingManager;
} else if (typeof window !== 'undefined') {
    window.MessagingManager = MessagingManager;
}
