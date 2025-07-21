// Personalization utility for message templates

class PersonalizationManager {
    // Available variables for personalization
    static getAvailableVariables() {
        return [
            { key: '{firstName}', description: 'First name of the person' },
            { key: '{lastName}', description: 'Last name of the person' },
            { key: '{fullName}', description: 'Full name of the person' },
            { key: '{company}', description: 'Company name' },
            { key: '{title}', description: 'Job title' },
            { key: '{industry}', description: 'Industry' },
            { key: '{location}', description: 'Location' },
            { key: '{currentDate}', description: 'Current date' },
            { key: '{currentDay}', description: 'Current day of week' },
            { key: '{currentMonth}', description: 'Current month' }
        ];
    }
    
    // Personalize a message template with person data
    static personalizeMessage(template, personData) {
        if (!template || !personData) {
            return template;
        }
        
        let personalizedMessage = template;
        
        // Extract names
        const fullName = personData.name || personData.fullName || '';
        const nameParts = fullName.trim().split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        
        // Date variables
        const now = new Date();
        const currentDate = now.toLocaleDateString();
        const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
        const currentMonth = now.toLocaleDateString('en-US', { month: 'long' });
        
        // Replace all variables
        const replacements = {
            '{firstName}': firstName,
            '{lastName}': lastName,
            '{fullName}': fullName,
            '{company}': personData.company || '',
            '{title}': personData.title || personData.jobTitle || '',
            '{industry}': personData.industry || '',
            '{location}': personData.location || '',
            '{currentDate}': currentDate,
            '{currentDay}': currentDay,
            '{currentMonth}': currentMonth
        };
        
        // Apply replacements
        for (const [variable, value] of Object.entries(replacements)) {
            const regex = new RegExp(this.escapeRegExp(variable), 'gi');
            personalizedMessage = personalizedMessage.replace(regex, value);
        }
        
        // Clean up any remaining empty variables
        personalizedMessage = this.cleanupMessage(personalizedMessage);
        
        return personalizedMessage;
    }
    
    // Escape special regex characters
    static escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    
    // Clean up message by removing empty variables and extra spaces
    static cleanupMessage(message) {
        // Remove any remaining variables that weren't replaced
        message = message.replace(/\{[^}]*\}/g, '');
        
        // Clean up multiple spaces
        message = message.replace(/\s+/g, ' ');
        
        // Clean up spaces around punctuation
        message = message.replace(/\s+([,.!?])/g, '$1');
        
        // Trim whitespace
        message = message.trim();
        
        return message;
    }
    
    // Validate message template
    static validateTemplate(template) {
        const errors = [];
        
        if (!template || template.trim().length === 0) {
            errors.push('Template cannot be empty');
            return errors;
        }
        
        // Check for unclosed variables
        const openBraces = (template.match(/\{/g) || []).length;
        const closeBraces = (template.match(/\}/g) || []).length;
        
        if (openBraces !== closeBraces) {
            errors.push('Unmatched braces in template');
        }
        
        // Check for unknown variables
        const variables = template.match(/\{[^}]*\}/g) || [];
        const knownVariables = this.getAvailableVariables().map(v => v.key);
        
        variables.forEach(variable => {
            if (!knownVariables.includes(variable)) {
                errors.push(`Unknown variable: ${variable}`);
            }
        });
        
        // Check message length
        if (template.length > 300) {
            errors.push('Message template is too long (max 300 characters)');
        }
        
        return errors;
    }
    
    // Generate preview of personalized message
    static generatePreview(template) {
        const sampleData = {
            name: 'John Smith',
            company: 'Tech Corp',
            title: 'Software Engineer',
            industry: 'Technology',
            location: 'San Francisco, CA'
        };
        
        return this.personalizeMessage(template, sampleData);
    }
    
    // Extract person data from LinkedIn profile elements
    static extractPersonData(profileElement) {
        const personData = {};
        
        try {
            // Try to extract name
            const nameElement = profileElement.querySelector('[data-anonymize="person-name"]') ||
                               profileElement.querySelector('.entity-result__title-text a') ||
                               profileElement.querySelector('.search-result__result-link');
            
            if (nameElement) {
                personData.name = nameElement.textContent.trim();
            }
            
            // Try to extract title and company
            const subtitleElement = profileElement.querySelector('.entity-result__primary-subtitle') ||
                                   profileElement.querySelector('.search-result__truncate');
            
            if (subtitleElement) {
                const subtitle = subtitleElement.textContent.trim();
                
                // Try to parse "Title at Company" format
                const atIndex = subtitle.toLowerCase().indexOf(' at ');
                if (atIndex !== -1) {
                    personData.title = subtitle.substring(0, atIndex).trim();
                    personData.company = subtitle.substring(atIndex + 4).trim();
                } else {
                    personData.title = subtitle;
                }
            }
            
            // Try to extract location
            const locationElement = profileElement.querySelector('.entity-result__secondary-subtitle') ||
                                   profileElement.querySelector('[data-anonymize="location"]');
            
            if (locationElement) {
                personData.location = locationElement.textContent.trim();
            }
            
        } catch (error) {
            console.error('Error extracting person data:', error);
        }
        
        return personData;
    }
    
    // Create message sequence with delays
    static createMessageSequence(templates, delays) {
        return templates.map((template, index) => ({
            id: index + 1,
            template,
            delay: delays[index] || 0,
            type: index === 0 ? 'connection' : 'followup'
        }));
    }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PersonalizationManager;
} else if (typeof window !== 'undefined') {
    window.PersonalizationManager = PersonalizationManager;
}
