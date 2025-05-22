import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '../contexts/ChatContext';
import { useSocket } from '../contexts/SocketContext';
import '../styles/ChatPage.css';

const ChatPage = () => {
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const messageEndRef = useRef(null);
  const { 
    messages, 
    currentUser, 
    recipientEmail, 
    initializeChat, 
    sendMessage,
    isInitializing
  } = useChat();
  const { 
    isConnected, 
    currentRoom, 
    otherUserOnline, 
    userStatuses, 
    refreshUserStatus 
  } = useSocket();
  const navigate = useNavigate();

  // Redirect if no user is set
  useEffect(() => {
    if (!currentUser || !recipientEmail) {
      navigate('/');
    } else {
      // Initialize the private chat room
      console.log("Initializing chat from page component");
      initializeChat();
      
      // Retry connection if not established after 3 seconds
      const retryTimer = setTimeout(() => {
        if (!isConnected || !currentRoom) {
          console.log("Connection not established, retrying...");
          initializeChat();
        }
      }, 3000);
      
      return () => clearTimeout(retryTimer);
    }
  }, [currentUser, recipientEmail, navigate, initializeChat, isConnected, currentRoom]);

  // When room is joined or messages are loaded, stop loading
  useEffect(() => {
    if (currentRoom || messages.length > 0) {
      setIsLoading(false);
    }
  }, [currentRoom, messages]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (message.trim()) {
      console.log("Sending message:", message);
      sendMessage(message);
      setMessage('');
    }
  };

  // Format timestamp
  const formatTime = (date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  // Always allow sending messages as long as user and recipient are set
  const canSendMessages = currentUser && recipientEmail;

  // Check if recipient is online (more robust check)
  const isRecipientOnline = useMemo(() => {
    if (!recipientEmail || !userStatuses) return false;
    return userStatuses[recipientEmail] === 'online';
  }, [recipientEmail, userStatuses]);

  // Debug information - helps troubleshoot connection issues
  useEffect(() => {
    console.log("Connection state:", { 
      isConnected, 
      currentRoom, 
      otherUserOnline,
      isRecipientOnline,
      userStatuses,
      canSendMessages
    });
  }, [isConnected, currentRoom, otherUserOnline, isRecipientOnline, userStatuses, canSendMessages]);

  // Periodically refresh the recipient status
  useEffect(() => {
    if (!isConnected || !recipientEmail) return;
    
    // Initial refresh
    refreshUserStatus(recipientEmail);
    
    // Set up periodic refreshes every 10 seconds
    const statusInterval = setInterval(() => {
      if (isConnected && recipientEmail) {
        refreshUserStatus(recipientEmail);
        console.log("Refreshing status for:", recipientEmail);
      }
    }, 10000);
    
    return () => clearInterval(statusInterval);
  }, [isConnected, recipientEmail, refreshUserStatus]);

  return (
    <div className="chat-container">
      <div className="chat-wrapper">
        <div className="chat-header">
          <div className="chat-header-info">
            <h2 className="chat-title">Private Chat with {recipientEmail}</h2>
            <div className="user-status">
              {isRecipientOnline ? (
                <span className="online-status">Online</span>
              ) : (
                <span className="offline-status">Offline</span>
              )}
            </div>
          </div>
          <div className="connection-info">
            <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
            {currentRoom && <span className="room-info">Room: {currentRoom}</span>}
          </div>
        </div>

        <div className="messages-container">
          {isLoading && isConnected ? (
            <div className="loading-messages">
              <p>Loading chat history...</p>
            </div>
          ) : messages.length === 0 ? (
            <p className="no-messages">
              No messages yet. Start the private conversation!
            </p>
          ) : (
            <div className="messages-list">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`message-bubble ${msg.username === currentUser ? 'sent' : 'received'} ${msg.pending ? 'pending' : ''}`}
                >
                  <p className="message-sender">
                    {msg.username === currentUser ? 'You' : msg.username}
                  </p>
                  <p className="message-text">{msg.message}</p>
                  <div className="message-footer">
                    <span className="message-time">
                      {formatTime(msg.timestamp)}
                    </span>
                    {msg.pending && <span className="message-pending">(sending...)</span>}
                  </div>
                </div>
              ))}
              <div ref={messageEndRef} />
            </div>
          )}
        </div>

        <form onSubmit={handleSendMessage} className="message-form">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={isConnected ? "Type your message..." : "Type your message (will be sent when connected)"}
            disabled={false}
            className="message-input"
          />
          <button 
            type="submit" 
            className="send-button"
            disabled={!message.trim()}
          >
            Send
          </button>
        </form>

        <div className="logoutbtn">
          <button 
            className="logout-button" 
            onClick={() => {
              // Clear user data and redirect to login
              localStorage.removeItem('currentUser');
              localStorage.removeItem('recipientEmail');
              navigate('/');
            }}
          >
            Logout
          </button>
        </div>
        
        {isInitializing && (
          <div className="connection-warning">
            Connecting to the chat room...
          </div>
        )}
        
        {!isConnected && (
          <div className="connection-error">
            Connection error. Messages will be sent when you reconnect.
          </div>
        )}
        
        {isConnected && !isRecipientOnline && currentUser !== recipientEmail && (
          <div className="status-message">
            The other user is not online. Messages will be saved and delivered when they connect.
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatPage; 