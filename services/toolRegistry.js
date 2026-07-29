/**
 * Tool Registry for Trillion (Tier 2: The Hands)
 * Central registry for declaring, validating, and executing tools.
 */

const tools = new Map();

/**
 * Register a tool with the system.
 * @param {Object} tool
 * @param {string} tool.name - Unique tool name
 * @param {string} tool.description - Clear description for the LLM
 * @param {Object} tool.parameters - JSON Schema parameters definition
 * @param {boolean} [tool.isConsequential=false] - If true, requires confirmation in Tier 6
 * @param {Function} tool.execute - Function to run tool: async (args) => result
 */
function registerTool(tool) {
    if (!tool.name || !tool.description || typeof tool.execute !== 'function') {
        throw new Error(`Invalid tool registration for: ${tool.name || 'unnamed'}`);
    }
    tools.set(tool.name, tool);
}

function getTool(name) {
    return tools.get(name);
}

function getAllTools() {
    return Array.from(tools.values());
}

/**
 * Get tool declarations formatted for Gemini Function Calling API
 */
function getToolDeclarations() {
    const declarations = [];
    for (const tool of tools.values()) {
        declarations.push({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters || { type: 'OBJECT', properties: {} }
        });
    }
    return declarations;
}

/**
 * Safely execute a registered tool by name with arguments.
 * Catches any tool error and returns a clean error result to the model.
 */
async function executeTool(name, args = {}) {
    const tool = tools.get(name);
    if (!tool) {
        return { error: `Tool "${name}" is not registered in the system.` };
    }

    try {
        console.log(`\n⚙️  [Executing Tool]: ${name} with args:`, JSON.stringify(args));
        const result = await tool.execute(args);
        return { success: true, result };
    } catch (err) {
        console.warn(`⚠️  [Tool Execution Error] ${name}:`, err.message);
        return { success: false, error: `Tool "${name}" encountered an error: ${err.message}` };
    }
}

// -------------------------------------------------------------
// Register First Real Tools (from Tier 0 capabilities)
// -------------------------------------------------------------

// In-memory store for reminders (Tier 2 demonstration)
const inMemoryReminders = [];

// Tool 1: Manage Reminders (Read / Write)
registerTool({
    name: 'manage_reminders',
    description: 'Add a new reminder/task or list all existing reminders.',
    isConsequential: false,
    parameters: {
        type: 'OBJECT',
        properties: {
            action: {
                type: 'STRING',
                description: 'Action to perform: "add" or "list"'
            },
            title: {
                type: 'STRING',
                description: 'The title/description of the reminder to add (required for "add")'
            },
            dueDate: {
                type: 'STRING',
                description: 'Optional due date or time for the reminder'
            }
        },
        required: ['action']
    },
    execute: async ({ action, title, dueDate }) => {
        if (action === 'add') {
            if (!title) throw new Error('Title is required when adding a reminder.');
            const item = { id: inMemoryReminders.length + 1, title, dueDate: dueDate || 'Today', status: 'pending' };
            inMemoryReminders.push(item);
            return `Reminder added: "${title}" (Due: ${item.dueDate})`;
        } else if (action === 'list') {
            if (inMemoryReminders.length === 0) return 'No reminders currently set.';
            return inMemoryReminders.map(r => `[#${r.id}] ${r.title} (Due: ${r.dueDate})`).join('\n');
        } else {
            throw new Error(`Unknown action "${action}". Supported actions: "add", "list".`);
        }
    }
});

// Tool 2: Search Math Notes / Knowledge
registerTool({
    name: 'search_math_notes',
    description: 'Search internal math study notes and syllabus formulas.',
    isConsequential: false,
    parameters: {
        type: 'OBJECT',
        properties: {
            topic: {
                type: 'STRING',
                description: 'The math topic or formula to look up (e.g., "Pythagorean theorem", "calculus derivatives", "ZIMSEC algebra")'
            }
        },
        required: ['topic']
    },
    execute: async ({ topic }) => {
        const topicLower = (topic || '').toLowerCase();
        if (topicLower.includes('pythagoras') || topicLower.includes('pythagorean')) {
            return 'Pythagorean Theorem: a² + b² = c² (for right-angled triangles).';
        } else if (topicLower.includes('calculus') || topicLower.includes('derivative')) {
            return 'Power Rule for Derivatives: d/dx (x^n) = n * x^(n-1).';
        } else if (topicLower.includes('fail_test')) {
            throw new Error('Simulated database connection timeout while fetching notes.');
        } else {
            return `Found general math note for "${topic}": Consult standard algebraic identities and formulas.`;
        }
    }
});

// Tool 3: Remember Fact (Tier 4 Memory)
const { rememberFact, forgetFact } = require('./memoryService');

registerTool({
    name: 'remember_fact',
    description: 'Save a durable user fact, preference, or identity detail to long-term memory across restarts.',
    isConsequential: false,
    parameters: {
        type: 'OBJECT',
        properties: {
            fact: {
                type: 'STRING',
                description: 'Single clear factual statement to remember (e.g., "User prefers morning review sessions")'
            },
            category: {
                type: 'STRING',
                description: 'Optional category label (e.g., "preference", "identity", "math")'
            }
        },
        required: ['fact']
    },
    execute: async ({ fact, category }) => {
        return rememberFact(fact, category || 'general');
    }
});

// Tool 4: Forget Fact (Tier 4 Memory)
registerTool({
    name: 'forget_fact',
    description: 'Remove a stale or incorrect fact from long-term memory.',
    isConsequential: false,
    parameters: {
        type: 'OBJECT',
        properties: {
            query: {
                type: 'STRING',
                description: 'The memory ID or keyword matching the fact to remove'
            }
        },
        required: ['query']
    },
    execute: async ({ query }) => {
        return forgetFact(query);
    }
});

// Tool 5: Send External Message (CONSEQUENTIAL - Tier 6 Safety Gate)
registerTool({
    name: 'send_external_message',
    description: 'Send an external message or email to a recipient. REQUIRES USER CONFIRMATION.',
    isConsequential: true,
    parameters: {
        type: 'OBJECT',
        properties: {
            recipient: {
                type: 'STRING',
                description: 'Recipient name or email address'
            },
            message: {
                type: 'STRING',
                description: 'Message body content'
            }
        },
        required: ['recipient', 'message']
    },
    execute: async ({ recipient, message }) => {
        return `Message successfully sent to ${recipient}: "${message}"`;
    }
});

// Tool 6: Delete All Reminders (CONSEQUENTIAL - Tier 6 Safety Gate)
registerTool({
    name: 'delete_all_reminders',
    description: 'Delete all stored reminders and tasks. REQUIRES USER CONFIRMATION.',
    isConsequential: true,
    parameters: {
        type: 'OBJECT',
        properties: {
            confirm: {
                type: 'BOOLEAN',
                description: 'Set to true to confirm full deletion'
            }
        },
        required: ['confirm']
    },
    execute: async () => {
        return 'All reminders have been permanently deleted.';
    }
});

module.exports = {
    registerTool,
    getTool,
    getAllTools,
    getToolDeclarations,
    executeTool
};
