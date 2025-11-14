import { AIMessage, Message } from "@langchain/langgraph-sdk";

export interface Thread {
    id: string;
    messages: Message[];
}

// Note: APP_DATA type is declared in types/user.ts

const apiUrl = window.APP_DATA.apiUrl;

function combineToolCallandResult(messages: Message[]) {
    const newMessages: Message[] = [];
    messages.forEach((message) => {
        if (message.type !== 'tool') {
            newMessages.push(message);
        } else {

            const toolCallId = message.tool_call_id;

            for (let i = 0; i < newMessages.length; i++) {
                if (newMessages[i].type === 'ai') {
                    if (Array.isArray((newMessages[i] as AIMessage)?.tool_calls) && ((newMessages[i] as AIMessage)?.tool_calls?.length ?? 0) > 0 && toolCallId) {

                        const toolCall = (newMessages[i] as AIMessage)?.tool_calls?.find((toolCall) => toolCall.id === toolCallId);
                        if (toolCall) {
                            (toolCall as any).content = message.content;
                        }
                    }
                }
            }
        }
    })
    return newMessages;

}


export async function getThreadIdsByUserId(userId: string) {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };

    // Add SSO token if available
    if (window.USER_DATA?.accessToken) {
        headers["X-Token"] = window.USER_DATA.accessToken;
    }

    const threadIds = await fetch(`${apiUrl}/v1/threads/${userId}`, {
        method: "GET",
        headers,
    });

    return threadIds.json();
}

export async function gethistoryByThreadId(threadId: string) {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };

    // Add SSO token if available
    if (window.USER_DATA?.accessToken) {
        headers["X-Token"] = window.USER_DATA.accessToken;
    }

    const history = await fetch(`${apiUrl}/v1/history/${threadId}`, {
        method: "GET",
        headers,
    });
    return history.json().then(history => {
        console.log(history);
        history.id = threadId;
        return history;
    });
}

export async function getAllThreadsByUserId(userId: string) {
    const threadIds = await getThreadIdsByUserId(userId);
    console.log('threadIds: ', threadIds);
    const threads = await Promise.all(threadIds.map(gethistoryByThreadId)) as Thread[];
    console.log('threads: ', threads);
    const transformed = threads.map(thread => {
        return {
            ...thread,
            messages: combineToolCallandResult(thread.messages)
        }
    })
    return transformed;
}