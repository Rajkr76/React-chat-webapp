import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext({
  socket: null,
  isConnected: false,
  currentRoom: null,
  joinPrivateChat: () => {},
  sendMessage: () => {},
  reconnectAttempt: 0,
  otherUserOnline: false,
  userStatuses: {},
  refreshUserStatus: () => {},
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [otherUserOnline, setOtherUserOnline] = useState(false);
  const [messageQueue, setMessageQueue] = useState([]);
  const [userStatuses, setUserStatuses] = useState({});

  useEffect(() => {
    // Connect to the Python WebSocket server on port 5001 (new port)
    const socketInstance = io('http://localhost:5001', {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
      timeout: 10000,
      transports: ['websocket', 'polling']
    });

    socketInstance.on('connect', () => {
      console.log('Connected to WebSocket server');
      setIsConnected(true);
      setReconnectAttempt(0);
      
      // Broadcast online status to everyone
      socketInstance.emit('user_status_change', { status: 'online' });
    });

    socketInstance.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
      setIsConnected(false);
      setOtherUserOnline(false);
    });

    socketInstance.on('connection_success', (data) => {
      console.log('Connection success with SID:', data.sid);
      setIsConnected(true);
    });

    socketInstance.on('reconnect_attempt', (attemptNumber) => {
      setReconnectAttempt(attemptNumber);
      console.log(`Attempting to reconnect... (attempt ${attemptNumber})`);
    });

    socketInstance.on('reconnect', () => {
      console.log('Reconnected to server!');
      setIsConnected(true);
    });

    socketInstance.on('room_joined', (data) => {
      console.log('Room joined event received:', data);
      setCurrentRoom(data.room);
      
      // Update recipient status if provided
      if (data.recipient && data.recipientOnline !== undefined) {
        setUserStatuses(prev => ({
          ...prev,
          [data.recipient]: data.recipientOnline ? 'online' : 'offline'
        }));
        
        if (data.recipientOnline) {
          setOtherUserOnline(true);
        }
      }
    });

    socketInstance.on('user_joined', (data) => {
      console.log('Another user joined the room:', data);
      setOtherUserOnline(true);
      setUserStatuses(prev => ({
        ...prev,
        [data.email]: data.status || 'online'
      }));
    });

    socketInstance.on('user_disconnected', (data) => {
      console.log('User disconnected from room:', data);
      setOtherUserOnline(false);
      setUserStatuses(prev => ({
        ...prev,
        [data.email]: 'offline'
      }));
    });

    socketInstance.on('user_status_update', (data) => {
      console.log('User status update:', data);
      setUserStatuses(prev => ({
        ...prev,
        [data.email]: data.status
      }));
      
      if (data.status === 'online') {
        setOtherUserOnline(true);
      } else {
        setOtherUserOnline(false);
      }
    });

    socketInstance.on('error', (data) => {
      console.error('Socket error:', data.message);
    });

    setSocket(socketInstance);

    return () => {
      console.log('Cleaning up socket connection');
      socketInstance.disconnect();
    };
  }, []);

  // Try to send queued messages when connection is restored
  useEffect(() => {
    if (isConnected && messageQueue.length > 0) {
      console.log(`Sending ${messageQueue.length} queued messages`);
      
      // Create a copy to avoid issues with state updates during iteration
      const queueCopy = [...messageQueue];
      setMessageQueue([]); // Clear the queue
      
      // Send all queued messages
      queueCopy.forEach(msg => {
        console.log(`Sending queued message to ${msg.recipient}`);
        socket.emit('send_message', msg);
      });
    }
  }, [isConnected, messageQueue, socket]);

  const joinPrivateChat = (senderEmail, recipientEmail) => {
    if (socket) {
      console.log(`Joining private chat between ${senderEmail} and ${recipientEmail}`);
      // Force reconnect if needed
      if (!isConnected) {
        socket.connect();
      }
      socket.emit('join_private_chat', { senderEmail, recipientEmail });
    } else {
      console.error('Cannot join room: Socket not initialized');
    }
  };

  const sendMessage = (username, message, recipient, timestamp) => {
    const messageData = { 
      username, 
      message, 
      recipient, 
      timestamp 
    };

    if (!socket) {
      console.error('Cannot send message: Socket not initialized');
      // Queue message for later
      setMessageQueue(prev => [...prev, messageData]);
      return;
    }
    
    if (!isConnected) {
      console.log('Socket not connected, queueing message for later');
      setMessageQueue(prev => [...prev, messageData]);
      return;
    }
    
    console.log(`Sending message to ${recipient}, Room status: ${currentRoom}`);
    socket.emit('send_message', messageData);
  };

  // Function to force update user status
  const refreshUserStatus = (targetEmail) => {
    if (!socket || !isConnected) return;
    
    console.log(`Requesting status update for user: ${targetEmail}`);
    socket.emit('request_user_status', { targetEmail });
  };

  return (
    <SocketContext.Provider value={{ 
      socket, 
      isConnected,
      currentRoom,
      joinPrivateChat,
      sendMessage,
      reconnectAttempt,
      otherUserOnline,
      userStatuses,
      refreshUserStatus
    }}>
      {children}
    </SocketContext.Provider>
  );
};