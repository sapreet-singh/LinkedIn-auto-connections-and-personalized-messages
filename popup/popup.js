// Global variables
let currentStep = 1;
let isCollecting = false;
let collectedProfiles = [];
let duplicateProfiles = [];
let wizardInitialized = false;

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
    
    // Campaign wizard functionality
    const campaignModal = document.getElementById('campaign-modal');
    const profilesModal = document.getElementById('profiles-modal');
    const createCampaignBtn = document.getElementById('create-campaign');
    const closeBtns = document.querySelectorAll('.close');
    const closeProfilesBtn = document.getElementById('close-profiles');

    // Initialize wizard elements after DOM is loaded
    function initializeWizardElements() {
        if (wizardInitialized) return;
        wizardInitialized = true;
    }

    // Reset variables
    currentStep = 1;
    collectedProfiles = [];
    duplicateProfiles = [];
    isCollecting = false;

    // Open campaign modal
    createCampaignBtn.addEventListener('click', () => {
        campaignModal.style.display = 'block';
        // Always initialize wizard elements and listeners when modal opens
        initializeWizardElements(); // Initialize wizard elements when modal opens
        initializeWizardEventListeners(); // Initialize event listeners
        showStep(1);
    });

    // Close modal
    closeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.closest('#campaign-modal')) {
                campaignModal.style.display = 'none';
                resetWizard();
            }
        });
    });

    closeProfilesBtn.addEventListener('click', () => {
        profilesModal.style.display = 'none';
    });

    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === campaignModal) {
            campaignModal.style.display = 'none';
            resetWizard();
        }
        if (event.target === profilesModal) {
            profilesModal.style.display = 'none';
        }
    });

    // Wizard step navigation - will be initialized when modal opens
    function initializeWizardEventListeners() {
        // Next step 1 handler
        const nextStep1 = document.getElementById('next-step-1');
        if (nextStep1) {
            nextStep1.onclick = (e) => {
                e.preventDefault();
                const campaignNameInput = document.getElementById('campaign-name');
                const campaignName = campaignNameInput?.value.trim();
                if (!campaignName) {
                    alert('Please enter a campaign name');
                    campaignNameInput?.focus();
                    return;
                }
                showStep(2);
            };
        }

        // Navigation buttons
        const backToStep1 = document.getElementById('back-to-step-1');
        const backToStep2 = document.getElementById('back-to-step-2');
        const backToSearch = document.getElementById('back-to-search');
        const backToStep2FromNetwork = document.getElementById('back-to-step-2-from-network');
        const backToCollecting = document.getElementById('back-to-collecting');
        const nextToMessaging = document.getElementById('next-to-messaging');

        if (backToStep1) backToStep1.onclick = () => showStep(1);
        if (backToStep2) backToStep2.onclick = () => showStep(2);
        if (backToSearch) backToSearch.onclick = () => showStep(3, 'search');
        if (backToStep2FromNetwork) backToStep2FromNetwork.onclick = () => showStep(2);
        if (backToCollecting) backToCollecting.onclick = () => showStep(3, 'collecting');
        if (nextToMessaging) nextToMessaging.onclick = () => showStep(4);

        // Option selections
        const linkedinSearchOption = document.getElementById('linkedin-search-option');
        const salesNavigatorOption = document.getElementById('sales-navigator-option');
        const networkOption = document.getElementById('network-option');

        if (linkedinSearchOption) linkedinSearchOption.onclick = () => showStep(3, 'search');
        if (salesNavigatorOption) salesNavigatorOption.onclick = () => alert('Sales Navigator integration coming soon!');
        if (networkOption) networkOption.onclick = () => showStep(3, 'network');

        // CSV upload handling
        const csvUploadBtn = document.getElementById('csv-upload-btn');
        const csvUploadBtn2 = document.getElementById('csv-upload-btn-2');
        const csvFileInput = document.getElementById('csv-file-input');

        if (csvUploadBtn) csvUploadBtn.onclick = () => csvFileInput?.click();
        if (csvUploadBtn2) csvUploadBtn2.onclick = () => csvFileInput?.click();
        if (csvFileInput) csvFileInput.onchange = handleCSVUpload;

        // Collection actions
        const showFiltersBtn = document.getElementById('show-filters');
        const startCollectingBtn = document.getElementById('start-collecting');
        const showNetworkFiltersBtn = document.getElementById('show-network-filters');
        const startNetworkCollectingBtn = document.getElementById('start-network-collecting');
        const browseConnectionsBtn = document.getElementById('browse-connections');
        const pauseCollectionBtn = document.getElementById('pause-collection');
        const createCampaignFinalBtn = document.getElementById('create-campaign-final');

        if (showFiltersBtn) showFiltersBtn.onclick = () => chrome.tabs.create({ url: 'https://www.linkedin.com/search/people/' });
        if (startCollectingBtn) startCollectingBtn.onclick = () => { showStep(3, 'collecting'); startCollecting(); };
        if (showNetworkFiltersBtn) showNetworkFiltersBtn.onclick = () => openLinkedInNetworkSearch();
        if (startNetworkCollectingBtn) startNetworkCollectingBtn.onclick = () => { showStep(3, 'collecting'); startNetworkCollecting(); };
        if (browseConnectionsBtn) browseConnectionsBtn.onclick = () => browseConnections();

        if (pauseCollectionBtn) {
            pauseCollectionBtn.onclick = () => {
                isCollecting = !isCollecting;
                pauseCollectionBtn.textContent = isCollecting ? 'PAUSE' : 'RESUME';
                if (isCollecting) continueCollecting();
            };
        }

        if (createCampaignFinalBtn) {
            createCampaignFinalBtn.onclick = () => {
                const currentActiveStep = document.querySelector('.wizard-step.active');
                if (currentActiveStep?.id === 'step-3-collecting') {
                    if (collectedProfiles.length === 0) {
                        alert('Please collect some profiles first');
                        return;
                    }
                    showStep(4);
                } else {
                    checkForDuplicates();
                }
            };
        }

        // Duplicate handling
        const excludeDuplicatesBtn = document.getElementById('exclude-duplicates');
        const cancelDuplicatesBtn = document.getElementById('cancel-duplicates');

        if (excludeDuplicatesBtn) {
            excludeDuplicatesBtn.onclick = () => {
                collectedProfiles = collectedProfiles.filter(profile =>
                    !duplicateProfiles.some(dup => dup.url === profile.url)
                );
                document.getElementById('duplicates-modal').style.display = 'none';
                finalizeCampaign();
            };
        }

        if (cancelDuplicatesBtn) {
            cancelDuplicatesBtn.onclick = () => {
                document.getElementById('duplicates-modal').style.display = 'none';
                finalizeCampaign();
            };
        }

        // Messaging strategy event listeners
        const singleMessageRadio = document.getElementById('single-message-radio');
        const multiStepRadio = document.getElementById('multi-step-radio');
        const followUpConfig = document.getElementById('follow-up-config');

        if (singleMessageRadio) singleMessageRadio.onchange = () => followUpConfig.style.display = 'none';
        if (multiStepRadio) multiStepRadio.onchange = () => followUpConfig.style.display = 'block';
    }

    // Event listeners now initialized when modal opens

    // Profile collection
    document.getElementById('collect-profiles').addEventListener('click', collectProfiles);
    document.getElementById('view-collected').addEventListener('click', viewCollectedProfiles);
    document.getElementById('export-profiles').addEventListener('click', exportProfiles);
    document.getElementById('create-campaign-from-profiles').addEventListener('click', createCampaignFromProfiles);

    // Profile URLs modal
    document.getElementById('close-profile-urls').addEventListener('click', closeProfileUrlsPopup);
    document.getElementById('select-all-profiles').addEventListener('click', selectAllProfiles);
    document.getElementById('add-profiles-to-campaign').addEventListener('click', addSelectedProfilesToCampaign);
    
    // Load saved settings
    loadSettings();
    loadMessages();
    loadCampaigns();
    loadCollectedProfiles();
    
    // Save settings
    document.getElementById('save-settings').addEventListener('click', saveSettings);
    
    // Save messages
    document.getElementById('save-messages').addEventListener('click', saveMessages);
});

// Load settings from storage
function loadSettings() {
    chrome.storage.local.get(['dailyLimit', 'actionDelay', 'followupDelay', 'openaiKey', 'messageStyle'], function(result) {
        if (result.dailyLimit) {
            document.getElementById('daily-limit').value = result.dailyLimit;
        }
        if (result.actionDelay) {
            document.getElementById('action-delay').value = result.actionDelay;
        }
        if (result.followupDelay) {
            document.getElementById('followup-delay').value = result.followupDelay;
        }
        if (result.openaiKey) {
            document.getElementById('openai-key').value = result.openaiKey;
        }
        if (result.messageStyle) {
            document.getElementById('message-style').value = result.messageStyle;
        }
    });

    // Load stats and profile count
    chrome.storage.local.get(['todayCount', 'totalCount', 'collectedProfiles'], function(result) {
        document.getElementById('today-count').textContent = result.todayCount || 0;
        document.getElementById('total-count').textContent = result.totalCount || 0;
        document.getElementById('profile-count').textContent = (result.collectedProfiles || []).length;
    });
}

// Save settings to storage
function saveSettings() {
    const dailyLimit = document.getElementById('daily-limit').value;
    const actionDelay = document.getElementById('action-delay').value;
    const followupDelay = document.getElementById('followup-delay').value;
    const openaiKey = document.getElementById('openai-key').value;
    const messageStyle = document.getElementById('message-style').value;

    chrome.storage.local.set({
        dailyLimit: parseInt(dailyLimit),
        actionDelay: parseInt(actionDelay),
        followupDelay: parseInt(followupDelay),
        openaiKey: openaiKey,
        messageStyle: messageStyle
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

// Legacy function removed - now using wizard-based campaign creation

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

// Collect profiles from current LinkedIn page
function collectProfiles() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        const tab = tabs[0];

        if (!tab.url.includes('linkedin.com')) {
            showNotification('Please navigate to a LinkedIn page first', 'error');
            return;
        }

        // First check if we have any stored profiles to show
        chrome.storage.local.get(['collectedProfiles'], async function(result) {
            const existingProfiles = result.collectedProfiles || [];

            try {
                console.log('Sending collectProfiles message to tab:', tab.id);
                // Use promise-based approach for Manifest V3
                const response = await chrome.tabs.sendMessage(tab.id, { action: 'collectProfiles' });
                console.log('Received response:', response);

                if (response && response.profiles && response.profiles.length > 0) {
                    console.log('Received profiles:', response.profiles);
                    // Store collected profiles
                    const newProfiles = response.profiles.filter(profile =>
                        !existingProfiles.some(existing => existing.url === profile.url)
                    );

                    const updated = [...existingProfiles, ...newProfiles];

                    chrome.storage.local.set({ collectedProfiles: updated }, function() {
                        document.getElementById('profile-count').textContent = updated.length;
                        showNotification(`Collected ${newProfiles.length} new profiles`);
                    });
                } else {
                    console.log('No profiles in response:', response);
                    // If no new profiles but we have existing ones, show them
                    if (existingProfiles.length > 0) {
                        document.getElementById('profile-count').textContent = existingProfiles.length;
                        showNotification(`Showing ${existingProfiles.length} previously collected profiles`, 'info');
                    } else {
                        showNotification('No profiles found. Please navigate to LinkedIn search results page.', 'warning');
                    }
                }
            } catch (error) {
                console.error('Error sending message:', error);
                // If message fails but we have existing profiles, show them
                if (existingProfiles.length > 0) {
                    document.getElementById('profile-count').textContent = existingProfiles.length;
                    showNotification(`Showing ${existingProfiles.length} previously collected profiles`, 'info');
                } else {
                    showNotification('Please refresh the LinkedIn page and try again.', 'error');
                }
            }
        });
    });
}

// View collected profiles
function viewCollectedProfiles() {
    chrome.storage.local.get(['collectedProfiles'], function(result) {
        const profiles = result.collectedProfiles || [];
        const profilesList = document.getElementById('profiles-list');

        if (profiles.length === 0) {
            profilesList.innerHTML = '<div class="empty-state">No profiles collected yet</div>';
        } else {
            profilesList.innerHTML = profiles.map(profile => `
                <div class="profile-item">
                    <div class="profile-name">${profile.name}</div>
                    <div class="profile-details">${profile.title} at ${profile.company}</div>
                    <div class="profile-url">${profile.url}</div>
                </div>
            `).join('');
        }

        document.getElementById('profiles-modal').style.display = 'block';
    });
}

// Export profiles to CSV
function exportProfiles() {
    chrome.storage.local.get(['collectedProfiles'], function(result) {
        const profiles = result.collectedProfiles || [];

        if (profiles.length === 0) {
            showNotification('No profiles to export', 'warning');
            return;
        }

        const csvContent = [
            'name,profile_url,company,title',
            ...profiles.map(p => `"${p.name}","${p.url}","${p.company}","${p.title}"`)
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `linkedin_profiles_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();

        URL.revokeObjectURL(url);
        showNotification('Profiles exported successfully!');
    });
}

// Create campaign from collected profiles
function createCampaignFromProfiles() {
    chrome.storage.local.get(['collectedProfiles'], function(result) {
        const profiles = result.collectedProfiles || [];

        if (profiles.length === 0) {
            showNotification('No profiles to create campaign from', 'warning');
            return;
        }

        // Close profiles modal and open campaign modal
        document.getElementById('profiles-modal').style.display = 'none';
        document.getElementById('campaign-modal').style.display = 'block';

        // Pre-fill campaign with collected profiles
        collectedProfiles = profiles;
        document.getElementById('campaign-name').value = `Campaign from ${profiles.length} profiles`;
        showStep(3, 'collecting');
        updateCollectedProfilesList();
        document.getElementById('collected-number').textContent = profiles.length;
    });
}

// Wizard helper functions
function showStep(stepNumber, subStep = null) {
    // Hide all steps
    document.querySelectorAll('.wizard-step').forEach(step => {
        step.classList.remove('active');
    });

    // Show current step
    let stepId = '';
    if (stepNumber === 1) stepId = 'step-1';
    else if (stepNumber === 2) stepId = 'step-2';
    else if (stepNumber === 3) {
        if (subStep === 'search') stepId = 'step-3-search';
        else if (subStep === 'network') stepId = 'step-3-network';
        else if (subStep === 'collecting') stepId = 'step-3-collecting';
    } else if (stepNumber === 4) stepId = 'step-4-messaging';

    const stepElement = document.getElementById(stepId);
    if (stepElement) stepElement.classList.add('active');

    currentStep = stepNumber;
}

function resetWizard() {
    currentStep = 1;
    collectedProfiles = [];
    duplicateProfiles = [];
    isCollecting = false;
    const campaignNameInput = document.getElementById('campaign-name');
    if (campaignNameInput) campaignNameInput.value = '';

    const collectedNumber = document.getElementById('collected-number');
    if (collectedNumber) collectedNumber.textContent = '0';

    const profilesList = document.getElementById('collected-profiles-list');
    if (profilesList) profilesList.innerHTML = '';

    if (pauseCollectionBtn) pauseCollectionBtn.textContent = 'PAUSE';
}

function handleCSVUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const csv = e.target.result;
        const lines = csv.split('\n');
        const profiles = [];

        // Skip header row
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const columns = line.split(',').map(col => col.replace(/"/g, '').trim());
            if (columns.length >= 2) {
                profiles.push({
                    name: columns[0],
                    url: columns[1],
                    company: columns[2] || '',
                    title: columns[3] || ''
                });
            }
        }

        if (profiles.length > 0) {
            collectedProfiles = profiles;
            updateCollectedProfilesList();
            showStep(3, 'collecting');
            const collectedNumber = document.getElementById('collected-number');
            if (collectedNumber) collectedNumber.textContent = profiles.length;
        } else {
            alert('No valid profiles found in CSV file');
        }
    };
    reader.readAsText(file);
}

function startCollecting() {
    isCollecting = true;
    // Start actual profile collection from LinkedIn
    collectProfilesFromCurrentPage();
}

function continueCollecting() {
    if (isCollecting) {
        collectProfilesFromCurrentPage();
    }
}

function collectProfilesFromCurrentPage() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        const tab = tabs[0];
        if (!tab.url.includes('linkedin.com')) {
            showNotification('Please navigate to a LinkedIn page first', 'error');
            return;
        }

        chrome.tabs.sendMessage(tab.id, { action: 'collectProfiles' })
            .then(response => {
                if (response?.profiles?.length > 0) {
                    collectedProfiles.push(...response.profiles);
                    updateCollectedProfilesList();
                    document.getElementById('collected-number').textContent = collectedProfiles.length;
                    showNotification(`Collected ${response.profiles.length} profiles`);
                }
            })
            .catch(error => {
                console.error('Error collecting profiles:', error);
                showNotification('Error collecting profiles. Please refresh the page.', 'error');
            });
    });
}

function updateCollectedProfilesList() {
    const listElement = document.getElementById('collected-profiles-list');
    if (!listElement) return;

    listElement.innerHTML = '';

    collectedProfiles.forEach(profile => {
        // Extract clean name - try multiple sources
        let cleanName = 'Unknown Name';

        // First try the name field directly
        if (profile.name && profile.name !== 'Status is reachable') {
            cleanName = profile.name.trim();
        }
        // If name field is not useful, try extracting from location
        else if (profile.location) {
            // Extract just the name part before "View" or other text
            const nameMatch = profile.location.match(/^([^V•\n]+?)(?:View|•|\n|$)/);
            if (nameMatch) {
                cleanName = nameMatch[1].trim();
            }
        }

        // Clean up any remaining artifacts
        cleanName = cleanName.replace(/\s+/g, ' ').trim();

        const profileCard = document.createElement('div');
        profileCard.className = 'profile-card';
        profileCard.innerHTML = `
            <div class="profile-avatar">${cleanName.charAt(0)}</div>
            <div class="profile-info">
                <div class="profile-name">${cleanName}</div>
                <div class="profile-details">• 1st degree connection</div>
            </div>
        `;
        listElement.appendChild(profileCard);
    });
}

function checkForDuplicates() {
    // Simulate finding duplicates
    chrome.storage.local.get(['campaigns'], function(result) {
        const existingCampaigns = result.campaigns || [];
        const allExistingProfiles = [];

        existingCampaigns.forEach(campaign => {
            if (campaign.profiles) {
                allExistingProfiles.push(...campaign.profiles);
            }
        });

        duplicateProfiles = collectedProfiles.filter(profile =>
            allExistingProfiles.some(existing => existing.url === profile.url)
        );

        if (duplicateProfiles.length > 0) {
            showDuplicatesModal();
        } else {
            finalizeCampaign();
        }
    });
}

function showDuplicatesModal() {
    const duplicateCount = document.getElementById('duplicate-count');
    if (duplicateCount) duplicateCount.textContent = duplicateProfiles.length;

    const duplicatesList = document.getElementById('duplicate-profiles-list');
    if (duplicatesList) {
        duplicatesList.innerHTML = '';

        duplicateProfiles.forEach(profile => {
            const profileCard = document.createElement('div');
            profileCard.className = 'profile-card';
            profileCard.innerHTML = `
                <div class="profile-avatar">${profile.name.charAt(0)}</div>
                <div class="profile-info">
                    <div class="profile-name">${profile.name}</div>
                    <div class="profile-details">${profile.title} at ${profile.company}</div>
                </div>
            `;
            duplicatesList.appendChild(profileCard);
        });
    }

    if (duplicatesModal) duplicatesModal.style.display = 'block';
}

function finalizeCampaign() {
    const campaignName = document.getElementById('campaign-name').value.trim();

    // Get messaging strategy configuration
    const messagingStrategy = document.querySelector('input[name="messaging-strategy"]:checked')?.value || 'single';
    const followUpCount = parseInt(document.getElementById('follow-up-count')?.value || '1');
    const followUpDelay = parseInt(document.getElementById('follow-up-delay')?.value || '3');
    const analyzeProfile = document.getElementById('analyze-profile')?.checked || true;
    const analyzePosts = document.getElementById('analyze-posts')?.checked || true;
    const messageStyle = document.getElementById('message-style')?.value || 'professional';

    const newCampaign = {
        id: Date.now(),
        name: campaignName,
        profiles: collectedProfiles,
        maxConnections: collectedProfiles.length,
        progress: 0,
        status: 'ready',
        createdAt: new Date().toISOString(),
        useAI: true,
        messagingStrategy: {
            type: messagingStrategy,
            followUpCount: messagingStrategy === 'multi' ? followUpCount : 0,
            followUpDelay: followUpDelay,
            analyzeProfile: analyzeProfile,
            analyzePosts: analyzePosts,
            messageStyle: messageStyle
        }
    };

    chrome.storage.local.get(['campaigns'], function(result) {
        const campaigns = result.campaigns || [];
        campaigns.push(newCampaign);

        chrome.storage.local.set({ campaigns }, function() {
            campaignModal.style.display = 'none';
            resetWizard();
            loadCampaigns();
            showNotification(`Campaign "${campaignName}" created with ${collectedProfiles.length} profiles!`);
        });
    });
}

// Network search functionality
function openLinkedInNetworkSearch() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        const tab = tabs[0];

        // Navigate to LinkedIn people search with network filter
        const networkSearchUrl = 'https://www.linkedin.com/search/results/people/?network=%5B%22F%22%5D&origin=FACETED_SEARCH';

        chrome.tabs.update(tab.id, { url: networkSearchUrl }, () => {
            showNotification('LinkedIn network search opened. Use the filters to refine your search, then click "Start Collecting People"', 'info');
        });
    });
}

function browseConnections() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        const tab = tabs[0];

        // Navigate to LinkedIn connections page
        const connectionsUrl = 'https://www.linkedin.com/mynetwork/invite-connect/connections/';

        chrome.tabs.update(tab.id, { url: connectionsUrl }, () => {
            showNotification('LinkedIn connections page opened. You can browse and then click "Start Collecting People"', 'info');
        });
    });
}

function startNetworkCollecting() {
    // Start collecting from current LinkedIn page (network search results or connections)
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        const tab = tabs[0];

        if (!tab.url.includes('linkedin.com')) {
            alert('Please navigate to LinkedIn first');
            return;
        }

        // Check if we're on a network-related page
        if (tab.url.includes('search/results/people') && tab.url.includes('network')) {
            // We're on network search results
            startNetworkSearch(tab.id, { type: 'search' });
        } else if (tab.url.includes('mynetwork') || tab.url.includes('connections')) {
            // We're on connections page
            startNetworkSearch(tab.id, { type: 'connections' });
        } else {
            // Navigate to network search first
            openLinkedInNetworkSearch();
            setTimeout(() => {
                startNetworkSearch(tab.id, { type: 'search' });
            }, 3000);
        }
    });
}

function startNetworkSearch(tabId, searchCriteria) {
    console.log('Starting network search with criteria:', searchCriteria);

    // First ensure content script is injected (Manifest V3 way)
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content/linkedin-content.js']
    }).then(() => {
        console.log('Content script injected successfully');

        // Wait a moment for script to initialize
        setTimeout(() => {
            // Send message with timeout handling
            const messageTimeout = setTimeout(() => {
                console.log('Message timeout, trying fallback approach');
                showNotification('Collecting profiles... This may take a moment.', 'info');
            }, 5000);

            chrome.tabs.sendMessage(tabId, {
                action: 'searchNetwork',
                criteria: searchCriteria
            }).then(response => {
                clearTimeout(messageTimeout);
                console.log('Received response:', response);
                console.log('Response type:', typeof response);
                console.log('Response profiles:', response?.profiles);

                if (response && response.profiles && response.profiles.length > 0) {
                    console.log('Received profiles:', response.profiles);
                    // Add profiles directly to campaign without approval modal
                    addProfilesDirectlyToCampaign(response.profiles);
                } else {
                    console.log('No profiles in response:', response);
                    if (response && response.error) {
                        showNotification(`Error: ${response.error}`, 'error');
                    } else {
                        // Try fallback with collectProfiles
                        console.log('Trying fallback with collectProfiles...');
                        chrome.tabs.sendMessage(tabId, { action: 'collectProfiles' }).then(fallbackResponse => {
                            console.log('Fallback response:', fallbackResponse);
                            if (fallbackResponse && fallbackResponse.profiles && fallbackResponse.profiles.length > 0) {
                                console.log('Adding fallback profiles directly to campaign');
                                addProfilesDirectlyToCampaign(fallbackResponse.profiles);
                            } else {
                                showNotification('No profiles found matching your criteria', 'warning');
                            }
                        }).catch(fallbackError => {
                            console.error('Fallback error:', fallbackError);
                            showNotification('No profiles found matching your criteria', 'warning');
                        });
                    }
                }
            }).catch(error => {
                clearTimeout(messageTimeout);
                console.error('Message sending error:', error);
                showNotification('Profiles collected! Check the list below.', 'success');

                // Try to get any profiles that might have been collected
                chrome.storage.local.get(['collectedProfiles'], function(result) {
                    if (result.collectedProfiles && result.collectedProfiles.length > 0) {
                        collectedProfiles = result.collectedProfiles;
                        updateCollectedProfilesList();
                        document.getElementById('collected-number').textContent = result.collectedProfiles.length;
                    }
                });
            });
        }, 1000);
    }).catch(error => {
        console.error('Script injection error:', error);
        // Try without injection - script might already be there
        chrome.tabs.sendMessage(tabId, {
            action: 'searchNetwork',
            criteria: searchCriteria
        }, function(response) {
            if (chrome.runtime.lastError) {
                console.error('Message sending error:', chrome.runtime.lastError);
                showNotification('Please refresh the LinkedIn page and try again.', 'error');
                return;
            }

            if (response && response.profiles) {
                console.log('Received profiles:', response.profiles);
                // Add collected profiles
                chrome.storage.local.get(['collectedProfiles'], function(result) {
                    const existing = result.collectedProfiles || [];
                    const newProfiles = response.profiles.filter(profile =>
                        !existing.some(existing => existing.url === profile.url)
                    );

                    const updated = [...existing, ...newProfiles];

                    chrome.storage.local.set({ collectedProfiles: updated }, function() {
                        collectedProfiles = updated;
                        updateCollectedProfilesList();
                        document.getElementById('collected-number').textContent = updated.length;
                        showNotification(`Collected ${newProfiles.length} profiles from your network`);
                    });
                });
            } else {
                console.log('No profiles in response:', response);
                showNotification('No profiles found. Try scrolling down to load more results.', 'warning');
            }
        });
    });
}

// Load collected profiles
function loadCollectedProfiles() {
    chrome.storage.local.get(['collectedProfiles'], function(result) {
        const profiles = result.collectedProfiles || [];
        document.getElementById('profile-count').textContent = profiles.length;
    });
}

// Profile URLs Popup Functions
let selectedProfiles = [];

function showProfileUrlsPopup(profiles) {
    console.log('Showing profile URLs popup with', profiles.length, 'profiles');

    // Force close any existing modals first
    const campaignModal = document.getElementById('campaign-modal');
    if (campaignModal) {
        campaignModal.style.display = 'none';
        console.log('Closed campaign modal to show profile URLs popup');
    }

    // Store profiles for later use
    selectedProfiles = profiles.map(profile => ({ ...profile, selected: true }));

    // Update count
    document.getElementById('profile-count-display').textContent = profiles.length;

    // Populate the list
    const profilesList = document.getElementById('profile-urls-list');
    profilesList.innerHTML = '';

    profiles.forEach((profile, index) => {
        const profileItem = document.createElement('div');
        profileItem.className = 'profile-item';
        // Extract clean name - try multiple sources
        let cleanName = 'Unknown Name';

        // First try the name field directly
        if (profile.name && profile.name !== 'Status is reachable') {
            cleanName = profile.name.trim();
        }
        // If name field is not useful, try extracting from location
        else if (profile.location) {
            // Extract just the name part before "View" or other text
            const nameMatch = profile.location.match(/^([^V•\n]+?)(?:View|•|\n|$)/);
            if (nameMatch) {
                cleanName = nameMatch[1].trim();
            }
        }

        // Clean up any remaining artifacts
        cleanName = cleanName.replace(/\s+/g, ' ').trim();

        const profilePicUrl = profile.profilePic || '';
        console.log(`Profile ${index}: Name="${cleanName}", PicURL="${profilePicUrl}"`);

        profileItem.innerHTML = `
            <input type="checkbox" class="profile-checkbox" data-index="${index}" checked>
            <div class="profile-pic">
                ${profilePicUrl ?
                    `<img src="${profilePicUrl}" alt="${cleanName}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid #0073b1;">` :
                    `<div style="width: 50px; height: 50px; border-radius: 50%; background: #0073b1; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 18px;">${cleanName.charAt(0).toUpperCase()}</div>`
                }
            </div>
            <div class="profile-info">
                <div class="profile-name" style="font-weight: bold; color: #333;">${cleanName}</div>
                <div class="profile-connection" style="color: #666; font-size: 12px;">• 1st degree connection</div>
            </div>
        `;
        profilesList.appendChild(profileItem);
    });

    // Add event listeners to checkboxes
    document.querySelectorAll('.profile-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const index = parseInt(this.getAttribute('data-index'));
            selectedProfiles[index].selected = this.checked;
            updateSelectedCount();
        });
    });

    // Show the modal with maximum visibility
    const modal = document.getElementById('profile-urls-modal');
    if (modal) {
        // Force show with all possible overrides
        modal.style.cssText = `
            display: block !important;
            position: fixed !important;
            z-index: 999999 !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            background: rgba(0,0,0,0.5) !important;
            visibility: visible !important;
            opacity: 1 !important;
        `;
        console.log('Profile URLs modal displayed with force styling');

        // Also ensure modal content is visible
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.style.cssText = `
                background: white !important;
                margin: 5% auto !important;
                padding: 20px !important;
                border-radius: 8px !important;
                width: 90% !important;
                max-width: 800px !important;
                max-height: 80% !important;
                overflow-y: auto !important;
                position: relative !important;
                z-index: 1000000 !important;
            `;
        }
    } else {
        console.error('Profile URLs modal not found!');
    }
    updateSelectedCount();
}

function closeProfileUrlsPopup() {
    document.getElementById('profile-urls-modal').style.display = 'none';
    selectedProfiles = [];
}

function selectAllProfiles() {
    const checkboxes = document.querySelectorAll('.profile-checkbox');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);

    checkboxes.forEach((checkbox, index) => {
        checkbox.checked = !allChecked;
        selectedProfiles[index].selected = !allChecked;
    });

    updateSelectedCount();
}

function updateSelectedCount() {
    const selectedCount = selectedProfiles.filter(p => p.selected).length;
    const button = document.getElementById('add-profiles-to-campaign');
    button.textContent = `Add Selected to Campaign (${selectedCount})`;
    button.disabled = selectedCount === 0;
}

function addProfilesDirectlyToCampaign(profiles) {
    console.log('Adding profiles directly to campaign:', profiles.length);

    // Add all profiles to collected profiles for the campaign
    collectedProfiles.push(...profiles);

    // Update the campaign wizard
    updateCollectedProfilesList();
    document.getElementById('collected-number').textContent = collectedProfiles.length;

    // Show success message
    showNotification(`Added ${profiles.length} profiles to campaign automatically`, 'success');

    // Ensure campaign modal is visible and show step 3
    const campaignModal = document.getElementById('campaign-modal');
    if (campaignModal) {
        campaignModal.style.display = 'block';
        showStep(3, 'collecting');
    }
}

function addSelectedProfilesToCampaign() {
    const profilesToAdd = selectedProfiles.filter(p => p.selected);

    if (profilesToAdd.length === 0) {
        showNotification('Please select at least one profile', 'warning');
        return;
    }

    // Add to collected profiles for the campaign
    collectedProfiles.push(...profilesToAdd);

    // Update the campaign wizard
    updateCollectedProfilesList();
    document.getElementById('collected-number').textContent = collectedProfiles.length;

    // Close the popup
    closeProfileUrlsPopup();

    // Show success message
    showNotification(`Added ${profilesToAdd.length} profiles to campaign`, 'success');

    // Reopen campaign modal and show step 3
    const campaignModal = document.getElementById('campaign-modal');
    if (campaignModal) {
        campaignModal.style.display = 'block';
        showStep(3, 'collecting');
    }
}
