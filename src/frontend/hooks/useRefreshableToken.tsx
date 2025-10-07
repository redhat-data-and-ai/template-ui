import { useEffect, useRef, useState } from "react";

const updateTokenStatus = (tokenExpiry: Date) => {
  if (!tokenExpiry) {
    return ({ text: "No token", color: "text-red-400" });
  }

  const now = new Date();
  const diffSeconds = Math.floor((tokenExpiry.getTime() - now.getTime()) / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds <= 0) {
    return ({ text: "Token expired", color: "text-red-400" });
  } else if (diffSeconds < 60) {
    return ({ text: `${diffSeconds}s left`, color: "text-yellow-400" });
  } else if (diffMinutes < 60) {
    return ({
      text: `${diffMinutes}m left`,
      color: diffMinutes < 15 ? "text-red-400" : "text-yellow-400"
    });
  } else if (diffHours < 24) {
    return ({
      text: `${diffHours}h left`,
      color: diffHours < 2 ? "text-yellow-400" : "text-green-400"
    });
  } else {
    return ({
      text: `${diffDays}d left`,
      color: "text-green-400"
    });
  }
};

export function useRefreshableToken() {
  const [token, setToken] = useState<string | null>(window.USER_DATA.accessToken);
  const [expiresAt, setExpiresAt] = useState<string>(window.USER_DATA.expiresAt);
  const [tokenStatus, setTokenStatus] = useState<{ text: string, color: string }>({ text: "No token", color: "text-red-400" });
  const keepTokenRefreshedIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setTokenStatus(updateTokenStatus(new Date(expiresAt)));
  }, [expiresAt])

  useEffect(() => {
    keepTokenRefreshedIntervalRef.current = setInterval(async () => {
      const currentTime = new Date();
      const currentTimePlus30Seconds = new Date(currentTime.getTime() + 30000);
      const tokenExpiry = new Date(expiresAt);
      if (currentTimePlus30Seconds >= tokenExpiry) {
        console.log("Refreshing token");
        try {
          const response = await fetch("/auth/refresh?forceRefresh=true");
          const data = await response.json();
          if (data.message === "RefreshedToken") {
            setToken(data.token.access_token);
            setExpiresAt(data.token.expires_at);
          }
        } catch (error) {
          console.error("Error refreshing token", error);
        }
      }
    }, 1000);

    return () => {
      if (keepTokenRefreshedIntervalRef.current) {
        clearInterval(keepTokenRefreshedIntervalRef.current);
      }
    }
  }, [expiresAt]);

  return { token, tokenStatus };
}