import React, { createContext, useContext, useEffect, useState } from 'react';
import { useSocket } from './SocketContext';

const ChatContext = createContext({
  messages: [],
  currentUser: '',
  recipientEmail: '',
  setCurrentUser: () => {},
  setRecipientEmail: () => {},
  initializeChat: () => {},
  sendMessage: () => {},
  isInitializing: false,
});

export const useChat = () => useContext(ChatContext);

export const ChatProvider = ({ children }) => {
  const [messages, setMessages] = useState([]);
  const [currentUser, setCurrentUser] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [chatInitialized, setChatInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  
  const { socket, isConnected, currentRoom, joinPrivateChat, sendMessage: socketSendMessage } = useSocket();

  // Initialize the chat room when both emails are set
  const initializeChat = () => {
    if (currentUser && recipientEmail && !chatInitialized && !isInitializing) {
      console.log("Initializing chat between", currentUser, "and", recipientEmail);
      setIsInitializing(true);
      
      // Create special room ID for self-chat to help debugging
      if (currentUser === recipientEmail) {
        console.log("Self-chat detected. Creating a special room.");
      }
      
      joinPrivateChat(currentUser, recipientEmail);
    }
  };

  // Watch for room connection
  useEffect(() => {
    if (currentRoom) {
      console.log("Room connected successfully:", currentRoom);
      setChatInitialized(true);
      setIsInitializing(false);
    }
  }, [currentRoom]);

  // Check for connection changes and re-initialize if needed
  useEffect(() => {
    if (isConnected && currentUser && recipientEmail && !chatInitialized && !isInitializing) {
      console.log("Reconnected, reinitializing chat");
      initializeChat();
    }
  }, [isConnected, currentUser, recipientEmail, chatInitialized, isInitializing]);

  // Attempt to resend pending messages when connection is restored
  useEffect(() => {
    if (isConnected && messages.length > 0) {
      // Find pending messages and try to resend them
      const pendingMessages = messages.filter(msg => msg.pending === true);
      
      if (pendingMessages.length > 0) {
        console.log(`Attempting to send ${pendingMessages.length} pending messages`);
        
        pendingMessages.forEach(msg => {
          console.log(`Resending message: ${msg.message}`);
          socketSendMessage(
            currentUser,
            msg.message,
            recipientEmail,
            msg.timestamp.toISOString()
          );
          
          // Update message status
          setMessages(prev => 
            prev.map(m => m.id === msg.id ? {...m, pending: false} : m)
          );
        });
      }
    }
  }, [isConnected, messages, currentUser, recipientEmail, socketSendMessage]);

  useEffect(() => {
    if (!socket) return;

    const handleReceiveMessage = (data) => {
      console.log("Received message:", data);
      
      // Make sure we don't duplicate messages
      setMessages(prevMessages => {
        // Check if message already exists by matching content and timestamp
        const messageExists = prevMessages.some(msg => 
          msg.username === data.username && 
          msg.message === data.message && 
          (data.timestamp ? msg.timestamp.toISOString() === new Date(data.timestamp).toISOString() : false)
        );
        
        if (messageExists) {
          return prevMessages;
        }
        
        // Add new message
        const newMessage = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          username: data.username,
          message: data.message,
          timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
        };
        
        return [...prevMessages, newMessage];
      });
    };

    // Handle receiving message history when joining a room
    const handleRoomJoined = (data) => {
      console.log("Room joined with history:", data);
      
      if (data.messageHistory && Array.isArray(data.messageHistory)) {
        const formattedHistory = data.messageHistory.map(msg => ({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          username: msg.username,
          message: msg.message,
          timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
        }));
        
        setMessages(formattedHistory);
      }
      
      setChatInitialized(true);
      setIsInitializing(false);
    };

    socket.on('receive_message', handleReceiveMessage);
    socket.on('room_joined', handleRoomJoined);

    return () => {
      socket.off('receive_message', handleReceiveMessage);
      socket.off('room_joined', handleRoomJoined);
    };
  }, [socket, currentUser, recipientEmail]);

  const sendMessage = (message) => {
    if (!currentUser || !recipientEmail || !message.trim()) {
      console.error("Cannot send message: Missing user information");
      return;
    }

    console.log("Sending message from", currentUser, "to", recipientEmail, ":", message);
    const timestamp = new Date().toISOString();
    
    // Add message to the local state immediately for better UX
    const newMessage = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      username: currentUser,
      message: message,
      timestamp: new Date(),
      pending: !isConnected, // Mark as pending if not connected
    };
    
    setMessages(prev => [...prev, newMessage]);
    
    // Try to send to server if connected
    if (isConnected) {
      socketSendMessage(currentUser, message, recipientEmail, timestamp);
    } else {
      console.log("Not connected. Message stored locally and will be sent when connection is restored.");
    }
  };

  // Reset chat when user changes
  useEffect(() => {
    if (currentUser && recipientEmail) {
      setMessages([]);
      setChatInitialized(false);
      setIsInitializing(false);
    }
  }, [currentUser, recipientEmail]);

  return (
    <ChatContext.Provider
      value={{
        messages,
        currentUser,
        recipientEmail,
        setCurrentUser,
        setRecipientEmail,
        initializeChat,
        sendMessage,
        isInitializing,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}; 