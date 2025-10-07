import React from "react";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { 
  MessageSquarePlus, 
  User, 
  MessageSquare, 
  Trash2,
  Edit3,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRefreshableToken } from "@/hooks/useRefreshableToken";

interface ChatItem {
  id: string;
  title: string;
  timestamp: Date;
  preview: string;
}

interface SidebarProps {
  userName?: string;
  currentChatId?: string;
  chatHistory: ChatItem[];
  isCollapsed?: boolean;
  tokenExpiry?: Date;
  onToggleCollapse: () => void;
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onRenameChat: (chatId: string, newTitle: string) => void;
}

function SidebarComponent({ 
  userName = "User",
  currentChatId,
  chatHistory,
  isCollapsed = false,
  onToggleCollapse,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onRenameChat
}: SidebarProps) {

  
  const [hoveredChat, setHoveredChat] = React.useState<string | null>(null);
  const [editingChat, setEditingChat] = React.useState<string | null>(null);
  const [editTitle, setEditTitle] = React.useState("");

  const { tokenStatus } = useRefreshableToken();

  const handleRename = (chatId: string, title: string) => {
    setEditingChat(chatId);
    setEditTitle(title);
  };

  const handleSaveRename = (chatId: string) => {
    onRenameChat(chatId, editTitle);
    setEditingChat(null);
    setEditTitle("");
  };

  // const formatRelativeTime = (date: Date) => {
  //   const now = new Date();
  //   const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
  //   if (diffInMinutes < 60) {
  //     return diffInMinutes <= 1 ? "Just now" : `${diffInMinutes}m ago`;
  //   }
    
  //   const diffInHours = Math.floor(diffInMinutes / 60);
  //   if (diffInHours < 24) {
  //     return `${diffInHours}h ago`;
  //   }
    
  //   const diffInDays = Math.floor(diffInHours / 24);
  //   if (diffInDays < 7) {
  //     return `${diffInDays}d ago`;
  //   }
    
  //   return date.toLocaleDateString();
  // };

  if (isCollapsed) {
    return (
      <div className="flex flex-col h-full w-12 bg-neutral-900 border-r border-neutral-700 text-neutral-100">
        {/* Toggle Button */}
        <div className="flex items-center justify-center p-2 border-b border-neutral-700">
          <button
            onClick={onToggleCollapse}
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-neutral-800 hover:shadow-md transform hover:scale-110 active:scale-95 transition-all duration-200"
            title="Expand Sidebar"
          >
            <PanelLeftOpen className="w-4 h-4 text-neutral-400 hover:text-neutral-200" />
          </button>
        </div>
        
        {/* New Chat Button - Collapsed */}
        <div className="p-2">
          <button
            onClick={onNewChat}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary hover:bg-primary/90 shadow-md hover:shadow-lg transform hover:scale-110 active:scale-95 transition-all duration-200"
            title="New Chat"
          >
            <MessageSquarePlus className="w-4 h-4 text-primary-foreground" />
          </button>
        </div>

        {/* Chat History Dots */}
        <div className="flex-1 overflow-hidden px-2">
          <ScrollArea className="h-full">
            <div className="space-y-2 py-2">
              {chatHistory.slice(0, 10).map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => onSelectChat(chat.id)}
                  className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 transform hover:scale-110 active:scale-95",
                    "bg-neutral-850 hover:bg-neutral-800 hover:shadow-sm"
                  )}
                  title={chat.title}
                >
                  <MessageSquare className={cn(
                    "w-3 h-3 transition-colors duration-200",
                    "text-neutral-400"
                  )} />
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex flex-col h-full bg-neutral-900 border-r border-neutral-700 text-neutral-100 transition-all duration-300",
      "w-64"
    )}>
      {/* Header with user info and toggle */}
      <div className="flex items-center gap-3 p-4 border-b border-neutral-700">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary">
          <User className="w-4 h-4 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-100 truncate">
            {userName}
          </p>
          <p className={`text-xs ${tokenStatus.color}`}>
            {tokenStatus.text}
          </p>
        </div>
        <button
          onClick={onToggleCollapse}
          className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-neutral-800 hover:shadow-md transform hover:scale-110 active:scale-95 transition-all duration-200"
          title="Collapse Sidebar"
        >
          <PanelLeftClose className="w-4 h-4 text-neutral-400 hover:text-neutral-200 transition-colors duration-200" />
        </button>
      </div>

              {/* New Chat Button */}
        <div className="p-4 border-b border-neutral-700">
          <Button
            onClick={onNewChat}
            className="w-full justify-start gap-2 bg-primary hover:bg-primary/90 shadow-md hover:shadow-lg transform hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 font-medium"
            size="sm"
          >
            <MessageSquarePlus className="w-4 h-4" />
            New Chat
          </Button>
        </div>

      {/* Chat History */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 py-2 border-b border-neutral-700 flex-shrink-0">
          <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
            Recent Chats
          </h3>
        </div>
        
        <div className="flex-1 overflow-y-auto px-2">
          {chatHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MessageSquare className="w-8 h-8 text-neutral-600 mb-2" />
              <p className="text-sm text-neutral-500">No chats yet</p>
              <p className="text-xs text-neutral-600 mt-1">Start a conversation!</p>
            </div>
          ) : (
            <div className="space-y-1 py-2">
              {chatHistory.map((chat) => {
                const isActive = currentChatId === chat.id;

                
                return (
                <div
                  key={chat.id}
                  className={cn(
                    "group relative flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all duration-200",
                    isActive
                      ? "bg-blue-600/30 border border-blue-500/60 shadow-lg ring-2 ring-blue-400/40"
                      : "hover:bg-neutral-800 hover:shadow-sm hover:scale-[1.01]"
                  )}
                  onMouseEnter={() => setHoveredChat(chat.id)}
                  onMouseLeave={() => setHoveredChat(null)}
                  onClick={() => onSelectChat(chat.id)}
                >
                  <MessageSquare className={cn(
                    "w-4 h-4 flex-shrink-0 transition-colors duration-200",
                    isActive 
                      ? "text-blue-400" 
                      : "text-neutral-400 group-hover:text-neutral-300"
                  )} />
                  
                  <div className="flex-1 min-w-0">
                    {editingChat === chat.id ? (
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() => handleSaveRename(chat.id)}
                        onKeyPress={(e) => {
                          if (e.key === "Enter") {
                            handleSaveRename(chat.id);
                          }
                          if (e.key === "Escape") {
                            setEditingChat(null);
                            setEditTitle("");
                          }
                        }}
                        className="w-full bg-transparent text-sm font-medium text-neutral-100 border border-neutral-600 rounded px-1 py-0.5 outline-none focus:border-primary"
                        autoFocus
                      />
                    ) : (
                      <>
                        <p className={cn(
                          "text-sm font-medium truncate transition-colors duration-200",
                          isActive 
                            ? "text-blue-100 font-bold" 
                            : "text-neutral-100 group-hover:text-white"
                        )}>
                          {chat.title}
                        </p>
                        <p className="text-xs text-neutral-400 truncate mt-0.5">
                          {chat.preview}
                        </p>
                        {/* <p className="text-xs text-neutral-500 mt-1">
                          {formatRelativeTime(chat.timestamp)}
                        </p> */}
                      </>
                    )}
                  </div>

                  {(hoveredChat === chat.id || isActive) && editingChat !== chat.id && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="w-6 h-6 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-700 hover:shadow-sm transform hover:scale-110 active:scale-95 transition-all duration-200 rounded-md"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRename(chat.id, chat.title);
                        }}
                        title="Rename chat"
                      >
                        <Edit3 className="w-3 h-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="w-6 h-6 text-neutral-400 hover:text-red-400 hover:bg-red-950/30 hover:shadow-sm transform hover:scale-110 active:scale-95 transition-all duration-200 rounded-md"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteChat(chat.id);
                        }}
                        title="Delete chat"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>
              );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer/Settings could go here */}
      <div className="p-4 border-t border-neutral-700">
        <p className="text-xs text-neutral-500 text-center">
          Dataverse AI Chat
        </p>
      </div>
    </div>
  );
}

export const Sidebar = React.memo(SidebarComponent);