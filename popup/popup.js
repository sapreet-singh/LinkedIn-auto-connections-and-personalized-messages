document.addEventListener('DOMContentLoaded', function() {
    // Tab navigation
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            
            // Update active tab button
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Show active tab content
            tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === tabName) {
                    content.classList.add('active');
                }
            });
        });
    });
    
    // Modal functionality
    const modal = document.getElementById('campaign-modal');
    const createCampaignBtn = document.getElementById('create-campaign');
    const cancelCampaignBtn = document.getElementById('cancel-campaign');
    const closeModalBtn = document.querySelector('.close');
    
    createCampaignBtn.addEventListener('click', () => {
        modal.style.display = 'block';
    });
    
    cancelCampaignBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    closeModalBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
    
    // Load saved settings
    loadSettings();
    loadMessages();
    loadCampaigns();
    
    // Save settings
    document.getElementById('save-settings').addEventListener('click', saveSettings);
    
    // Save messages
    document.getElementById('save-messages').addEventListener('click', saveMessages);
    
    // Create campaign
    document.getElementById('save-campaign').addEventListener('click', createCampaign);
});

// Load settings from storage
function loadSettings() {
    chrome.storage.local.get(['dailyLimit', 'actionDelay', 'followupDelay'], function(result) {
        if (result.dailyLimit) {
            document.getElementById('daily-limit').value = result.dailyLimit;
        }
        if (result.actionDelay) {
            document.getElementById('action-delay').value = result.actionDelay;
        }
        if (result.followupDelay) {
            document.getElementById('followup-delay').value = result.followupDelay;
        }
    });
    
    // Load stats
    chrome.storage.local.get(['todayCount', 'totalCount'], function(result) {
        document.getElementById('today-count').textContent = result.todayCount || 0;
        document.getElementById('total-count').textContent = result.totalCount || 0;
    });
}

// Save settings to storage
function saveSettings() {
    const dailyLimit = document.getElementById('daily-limit').value;
    const actionDelay = document.getElementById('action-delay').value;
    const followupDelay = document.getElementById('followup-delay').value;
    
    chrome.storage.local.set({
        dailyLimit: parseInt(dailyLimit),
        actionDelay: parseInt(actionDelay),
        followupDelay: parseInt(followupDelay)
    }, function() {
        showNotification('Settings saved successfully!');
    });
}

// Load message templates
function loadMessages() {
    chrome.storage.local.get(['connectionMessage', 'followup1', 'followup2'], function(result) {
        if (result.connectionMessage) {
            document.getElementById('connection-message').value = result.connectionMessage;
        }
        if (result.followup1) {
            document.getElementById('followup-1').value = result.followup1;
        }
        if (result.followup2) {
            document.getElementById('followup-2').value = result.followup2;
        }
    });
}

// Save message templates
function saveMessages() {
    const connectionMessage = document.getElementById('connection-message').value;
    const followup1 = document.getElementById('followup-1').value;
    const followup2 = document.getElementById('followup-2').value;
    
    chrome.storage.local.set({
        connectionMessage,
        followup1,
        followup2
    }, function() {
        showNotification('Messages saved successfully!');
    });
}

// Load campaigns
function loadCampaigns() {
    chrome.storage.local.get(['campaigns'], function(result) {
        const campaignList = document.getElementById('campaign-list');
        
        if (result.campaigns && result.campaigns.length > 0) {
            campaignList.innerHTML = '';
            
            result.campaigns.forEach((campaign, index) => {
                const campaignItem = document.createElement('div');
                campaignItem.className = 'campaign-item';
                campaignItem.innerHTML = `
                    <div class="campaign-header">
                        <div class="campaign-title">${campaign.name}</div>
                        <div class="campaign-actions">
                            <button class="btn btn-secondary btn-sm" data-action="pause" data-index="${index}">
                                ${campaign.status === 'running' ? 'Pause' : 'Resume'}
                            </button>
                            <button class="btn btn-secondary btn-sm" data-action="delete" data-index="${index}">Delete</button>
                        </div>
                    </div>
                    <div class="campaign-stats">
                        Progress: ${campaign.progress}/${campaign.maxConnections} | 
                        Status: ${campaign.status}
                    </div>
                `;
                campaignList.appendChild(campaignItem);
            });
            
            // Add event listeners for campaign actions
            document.querySelectorAll('[data-action]').forEach(button => {
                button.addEventListener('click', handleCampaignAction);
            });
        } else {
            campaignList.innerHTML = '<div class="empty-state">No campaigns yet. Create your first campaign!</div>';
        }
    });
}

// Create a new campaign
function createCampaign() {
    const name = document.getElementById('campaign-name').value;
    const targetUrl = document.getElementById('target-url').value;
    const maxConnections = parseInt(document.getElementById('max-connections').value);
    
    if (!name || !targetUrl) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    
    chrome.storage.local.get(['campaigns'], function(result) {
        const campaigns = result.campaigns || [];
        
        const newCampaign = {
            id: Date.now(),
            name,
            targetUrl,
            maxConnections,
            progress: 0,
            status: 'running',
            createdAt: new Date().toISOString()
        };
        
        campaigns.push(newCampaign);
        
        chrome.storage.local.set({ campaigns }, function() {
            document.getElementById('campaign-modal').style.display = 'none';
            loadCampaigns();
            showNotification('Campaign created successfully!');
            
            // Reset form
            document.getElementById('campaign-name').value = '';
            document.getElementById('target-url').value = '';
            document.getElementById('max-connections').value = '100';
            
            // Notify background script to start the campaign
            chrome.runtime.sendMessage({
                action: 'startCampaign',
                campaignId: newCampaign.id
            });
        });
    });
}

// Handle campaign actions (pause/resume/delete)
function handleCampaignAction(event) {
    const action = event.target.getAttribute('data-action');
    const index = parseInt(event.target.getAttribute('data-index'));
    
    chrome.storage.local.get(['campaigns'], function(result) {
        const campaigns = result.campaigns || [];
        
        if (action === 'pause') {
            campaigns[index].status = campaigns[index].status === 'running' ? 'paused' : 'running';
            
            chrome.storage.local.set({ campaigns }, function() {
                loadCampaigns();
                
                // Notify background script
                chrome.runtime.sendMessage({
                    action: campaigns[index].status === 'running' ? 'resumeCampaign' : 'pauseCampaign',
                    campaignId: campaigns[index].id
                });
            });
        } else if (action === 'delete') {
            if (confirm('Are you sure you want to delete this campaign?')) {
                const campaignId = campaigns[index].id;
                campaigns.splice(index, 1);
                
                chrome.storage.local.set({ campaigns }, function() {
                    loadCampaigns();
                    
                    // Notify background script
                    chrome.runtime.sendMessage({
                        action: 'deleteCampaign',
                        campaignId
                    });
                });
            }
        }
    });
}

// Show notification
function showNotification(message, type = 'success') {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
    
    setTimeout(() => {
        status.textContent = 'Ready';
        status.className = 'status';
    }, 3000);
}
