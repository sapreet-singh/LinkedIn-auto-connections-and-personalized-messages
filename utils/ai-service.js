// AI Service for generating personalized LinkedIn messages using OpenAI API

class AIService {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.openai.com/v1/chat/completions';
    }
    
    // Generate personalized connection message
    async generateConnectionMessage(personData, style = 'professional') {
        const prompt = this.buildConnectionPrompt(personData, style);
        
        try {
            const response = await this.callOpenAI(prompt);
            return this.cleanMessage(response);
        } catch (error) {
            console.error('Error generating AI message:', error);
            return this.getFallbackMessage(personData);
        }
    }
    
    // Generate follow-up message
    async generateFollowUpMessage(personData, messageNumber = 1, style = 'professional') {
        const prompt = this.buildFollowUpPrompt(personData, messageNumber, style);
        
        try {
            const response = await this.callOpenAI(prompt);
            return this.cleanMessage(response);
        } catch (error) {
            console.error('Error generating AI follow-up:', error);
            return this.getFallbackFollowUp(personData, messageNumber);
        }
    }
    
    // Build connection request prompt
    buildConnectionPrompt(personData, style) {
        const styleInstructions = {
            professional: 'Write in a professional, respectful tone. Be concise and business-focused.',
            friendly: 'Write in a warm, friendly tone. Be approachable and personable.',
            casual: 'Write in a casual, relaxed tone. Be conversational and easy-going.',
            sales: 'Write in a sales-focused tone. Highlight potential business value and opportunities.'
        };
        
        return `Write a personalized LinkedIn connection request message (max 200 characters) for:
        
Name: ${personData.name || 'Unknown'}
Company: ${personData.company || 'Unknown'}
Title: ${personData.title || 'Unknown'}
Industry: ${personData.industry || 'Unknown'}

Style: ${styleInstructions[style] || styleInstructions.professional}

Requirements:
- Maximum 200 characters (LinkedIn limit)
- Personalized based on their background
- Professional and respectful
- Include a clear reason for connecting
- No generic templates
- Don't use quotes around the message

Return only the message text, nothing else.`;
    }
    
    // Build follow-up message prompt
    buildFollowUpPrompt(personData, messageNumber, style) {
        const followUpTypes = {
            1: 'Thank them for connecting and introduce yourself briefly',
            2: 'Share something valuable or ask about their work',
            3: 'Suggest a potential collaboration or meeting'
        };
        
        const styleInstructions = {
            professional: 'Write in a professional, respectful tone.',
            friendly: 'Write in a warm, friendly tone.',
            casual: 'Write in a casual, relaxed tone.',
            sales: 'Write in a sales-focused tone with clear value proposition.'
        };
        
        return `Write a personalized LinkedIn follow-up message #${messageNumber} for:
        
Name: ${personData.name || 'Unknown'}
Company: ${personData.company || 'Unknown'}
Title: ${personData.title || 'Unknown'}

Purpose: ${followUpTypes[messageNumber] || 'Continue the conversation professionally'}
Style: ${styleInstructions[style] || styleInstructions.professional}

Requirements:
- Maximum 300 characters
- Personalized and relevant
- ${messageNumber === 1 ? 'Thank them for connecting' : 'Build on previous conversation'}
- Professional and valuable
- Include their name
- Don't use quotes around the message

Return only the message text, nothing else.`;
    }
    
    // Call OpenAI API
    async callOpenAI(prompt) {
        const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a professional LinkedIn messaging assistant. Generate personalized, engaging messages that help build meaningful professional connections.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 150,
                temperature: 0.7
            })
        });
        
        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status}`);
        }
        
        const data = await response.json();
        return data.choices[0].message.content.trim();
    }
    
    // Clean and validate message
    cleanMessage(message) {
        // Remove quotes if present
        message = message.replace(/^["']|["']$/g, '');
        
        // Ensure it's not too long
        if (message.length > 300) {
            message = message.substring(0, 297) + '...';
        }
        
        return message;
    }
    
    // Fallback message if AI fails
    getFallbackMessage(personData) {
        const firstName = personData.name ? personData.name.split(' ')[0] : 'there';
        const company = personData.company ? ` at ${personData.company}` : '';
        
        return `Hi ${firstName}, I'd love to connect with you${company}. Looking forward to networking!`;
    }
    
    // Fallback follow-up message
    getFallbackFollowUp(personData, messageNumber) {
        const firstName = personData.name ? personData.name.split(' ')[0] : 'there';
        
        const fallbacks = {
            1: `Thanks for connecting, ${firstName}! I'm excited to be part of your network.`,
            2: `Hope you're doing well, ${firstName}! I'd love to learn more about your work.`,
            3: `Hi ${firstName}, I hope we can find opportunities to collaborate in the future.`
        };
        
        return fallbacks[messageNumber] || fallbacks[1];
    }
    
    // Validate API key format
    static validateApiKey(apiKey) {
        return apiKey && apiKey.startsWith('sk-') && apiKey.length > 20;
    }
    
    // Test API connection
    async testConnection() {
        try {
            const testPrompt = 'Write a simple "Hello" message.';
            const response = await this.callOpenAI(testPrompt);
            return { success: true, message: 'API connection successful' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIService;
} else if (typeof window !== 'undefined') {
    window.AIService = AIService;
}
