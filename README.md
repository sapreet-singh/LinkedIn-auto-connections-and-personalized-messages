# LinkedIn Auto Connect & Message Extension

A Chrome extension for automating LinkedIn connections and personalized messages with AI-powered message generation.

## 🚀 New Features

### AI-Powered Message Generation
- **Profile Analysis**: Automatically analyze LinkedIn profiles for personalized messaging
- **API Integration**: Connect to Node.js backend for AI message generation
- **Multi-Strategy Messaging**: Support for single messages and multi-step follow-ups
- **Message Preview**: Review generated messages before campaign creation
- **Confidence Scoring**: AI confidence ratings for message quality

### Enhanced Campaign Management
- **Messaging Strategy Display**: View campaign messaging strategies in dashboard
- **Generated Message Tracking**: Track which campaigns use AI-generated messages
- **Profile Limit**: Generate messages for up to 10 profiles per campaign

## Features

- 🤝 **Auto Connection Requests** - Automatically send personalized connection requests
- 🏢 **Company-Based Targeting** - Search and connect with employees from specific companies
- 📋 **Profile Collection** - Automatically collect and store LinkedIn profile data
- 💬 **Follow-up Messages** - Send automated follow-up message sequences
- 🎯 **Multiple Campaign Types** - Company search, LinkedIn search URLs, or custom profile lists
- 📊 **Campaign Management** - Create and manage multiple outreach campaigns
- 🛡️ **Safety Features** - Built-in daily limits and delays to protect your account
- 📈 **Statistics** - Track your connection success rates
- 📤 **Data Export** - Export collected profiles to CSV

## Installation

### Extension Setup
1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. The extension icon will appear in your Chrome toolbar

### API Server Setup
1. Navigate to the server directory:
   ```bash
   cd server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```

The API server will run on `http://localhost:7007`

## How to Use

### 1. Configure Settings
- Click the extension icon to open the popup
- Go to the "Settings" tab
- **Add your OpenAI API Key** for AI-generated messages (optional)
- Set your daily connection limit (recommended: 20 or less)
- Set delays between actions (recommended: 30+ seconds)
- Choose message style (Professional, Friendly, Casual, Sales-focused)

### 2. Set Up Message Templates (Optional)
- Go to the "Messages" tab
- Customize your connection request message (used as fallback if AI fails)
- Set up follow-up messages
- Use variables like `{firstName}`, `{company}`, `{title}` for personalization

### 3. Create a Campaign
- Go to the "Campaigns" tab
- Click "New Campaign"
- Choose campaign type:
  - **Company Employees**: Enter company name to target employees
  - **LinkedIn Search URL**: Paste a LinkedIn search results URL
  - **Upload Profile List**: Upload a CSV file with profile data
- Set maximum connections for this campaign
- Enable/disable AI-generated messages

### 4. Collect Profiles (Optional)
- Navigate to any LinkedIn search results page
- Click "Collect Profiles from Current Page" to gather profile data
- View and export collected profiles
- Create campaigns from collected profiles

### 5. Generate AI Messages (New Feature)
- Collect profiles (up to 10 for AI generation)
- Configure messaging strategy:
  - **Single Message**: One-time connection request
  - **Multi-Step Follow-Up**: Connection request + 1-2 scheduled follow-ups
- Click "🤖 ANALYZE & GENERATE MESSAGES" to create personalized messages
- Review generated messages and create campaign

### 6. Start Automation
- Navigate to a LinkedIn search results page (or let the extension navigate for company campaigns)
- The extension will show a floating panel
- Click "Start Auto Connect" to begin automation
- Monitor progress in the extension popup

## Available Variables

Use these variables in your message templates for personalization:

- `{firstName}` - First name
- `{lastName}` - Last name  
- `{fullName}` - Full name
- `{company}` - Company name
- `{title}` - Job title
- `{currentDate}` - Current date
- `{currentDay}` - Current day of week

## Safety Features

- **Daily Limits** - Prevents exceeding LinkedIn's connection limits
- **Action Delays** - Adds realistic delays between actions
- **Activity Monitoring** - Tracks daily usage
- **Manual Control** - Easy start/stop controls

## File Structure

```
linkedin-automation-extension/
├── manifest.json              # Extension configuration
├── popup/                     # Extension popup interface
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── content/                   # LinkedIn page interaction
│   ├── linkedin-content.js
│   └── content.css
├── background/                # Background processing
│   └── service-worker.js
├── utils/                     # Utility functions
│   ├── storage.js
│   ├── messaging.js
│   └── personalization.js
└── assets/                    # Icons and images
    └── icons/
```

## Important Notes

⚠️ **Use Responsibly**: 
- Respect LinkedIn's terms of service
- Don't exceed daily limits (50 connections recommended)
- Use realistic delays between actions
- Personalize your messages

⚠️ **Account Safety**:
- Start with low daily limits
- Monitor your account for any restrictions
- Use the extension sparingly at first
- Always include personal touches in messages

## Troubleshooting

### Extension not working on LinkedIn
- Make sure you're on a LinkedIn search results page
- Refresh the page and try again
- Check that the extension has permissions for LinkedIn

### No connect buttons found
- Ensure you're on a people search results page
- Some profiles may not have connect buttons (already connected, etc.)
- Try a different search query

### Daily limit reached
- Wait until the next day for the counter to reset
- Adjust your daily limit in settings if needed

## Development

To modify or extend the extension:

1. Edit the relevant files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Test your changes

## Legal Disclaimer

This extension is for educational purposes. Users are responsible for complying with LinkedIn's terms of service and applicable laws. Use at your own risk.

## Support

For issues or questions, please check the troubleshooting section above or review the code comments for technical details.
