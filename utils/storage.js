// Storage utility functions for LinkedIn Automation Extension

class StorageManager {
    // Get data from Chrome storage
    static async get(keys) {
        return new Promise((resolve) => {
            chrome.storage.local.get(keys, (result) => {
                resolve(result);
            });
        });
    }
    
    // Set data in Chrome storage
    static async set(data) {
        return new Promise((resolve) => {
            chrome.storage.local.set(data, () => {
                resolve();
            });
        });
    }
    
    // Remove data from Chrome storage
    static async remove(keys) {
        return new Promise((resolve) => {
            chrome.storage.local.remove(keys, () => {
                resolve();
            });
        });
    }
    
    // Clear all storage
    static async clear() {
        return new Promise((resolve) => {
            chrome.storage.local.clear(() => {
                resolve();
            });
        });
    }
    
    // Get campaign by ID
    static async getCampaign(campaignId) {
        const { campaigns } = await this.get(['campaigns']);
        return (campaigns || []).find(c => c.id === campaignId);
    }
    
    // Update campaign
    static async updateCampaign(campaignId, updates) {
        const { campaigns } = await this.get(['campaigns']);
        const campaignList = campaigns || [];
        
        const index = campaignList.findIndex(c => c.id === campaignId);
        if (index !== -1) {
            campaignList[index] = { ...campaignList[index], ...updates };
            await this.set({ campaigns: campaignList });
            return campaignList[index];
        }
        return null;
    }
    
    // Add new campaign
    static async addCampaign(campaign) {
        const { campaigns } = await this.get(['campaigns']);
        const campaignList = campaigns || [];
        
        campaignList.push(campaign);
        await this.set({ campaigns: campaignList });
        return campaign;
    }
    
    // Delete campaign
    static async deleteCampaign(campaignId) {
        const { campaigns } = await this.get(['campaigns']);
        const campaignList = campaigns || [];
        
        const filteredCampaigns = campaignList.filter(c => c.id !== campaignId);
        await this.set({ campaigns: filteredCampaigns });
        return true;
    }
    
    // Get settings with defaults
    static async getSettings() {
        const defaults = {
            dailyLimit: 50,
            actionDelay: 30,
            followupDelay: 3,
            connectionMessage: 'Hi {firstName}, I\'d love to connect with you!',
            followup1: 'Thanks for connecting, {firstName}!',
            followup2: 'Hope you\'re doing well, {firstName}!',
            todayCount: 0,
            totalCount: 0
        };
        
        const stored = await this.get(Object.keys(defaults));
        
        // Merge defaults with stored values
        const settings = {};
        for (const key in defaults) {
            settings[key] = stored[key] !== undefined ? stored[key] : defaults[key];
        }
        
        return settings;
    }
    
    // Update settings
    static async updateSettings(newSettings) {
        await this.set(newSettings);
        return newSettings;
    }
    
    // Increment counters
    static async incrementCounters() {
        const { todayCount, totalCount } = await this.get(['todayCount', 'totalCount']);
        
        const newCounts = {
            todayCount: (todayCount || 0) + 1,
            totalCount: (totalCount || 0) + 1
        };
        
        await this.set(newCounts);
        return newCounts;
    }
    
    // Reset daily counter
    static async resetDailyCounter() {
        await this.set({ todayCount: 0 });
    }
    
    // Export data for backup
    static async exportData() {
        const allData = await this.get(null); // Get all data
        return JSON.stringify(allData, null, 2);
    }
    
    // Import data from backup
    static async importData(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            await this.set(data);
            return true;
        } catch (error) {
            console.error('Error importing data:', error);
            return false;
        }
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageManager;
} else if (typeof window !== 'undefined') {
    window.StorageManager = StorageManager;
}
