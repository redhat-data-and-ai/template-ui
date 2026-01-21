export const agentHost = process.env.AGENT_HOST || "http://localhost:5002";

let authTypeFromEnv: string | null = (process.env.AUTH_TYPE || '').toLowerCase();

if (!authTypeFromEnv) {
    console.warn("AUTH_TYPE is not set, defaulting to null");
    authTypeFromEnv = null;
}

if (authTypeFromEnv !== 'redhat' && authTypeFromEnv !== 'google') {
    console.warn("AUTH_TYPE is not valid, defaulting to null");
    authTypeFromEnv = null;
}

export const authType = authTypeFromEnv;
