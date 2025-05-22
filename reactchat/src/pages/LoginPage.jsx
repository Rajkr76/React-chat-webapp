import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '../contexts/ChatContext';
import '../styles/LoginPage.css';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [recipientError, setRecipientError] = useState('');
  
  const { setCurrentUser, setRecipientEmail: setContextRecipientEmail } = useChat();
  const navigate = useNavigate();

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Reset errors
    setEmailError('');
    setRecipientError('');
    
    // Validate both emails
    let isValid = true;
    
    if (!email || !validateEmail(email)) {
      setEmailError('Please enter a valid email address');
      isValid = false;
    }
    
    if (!recipientEmail || !validateEmail(recipientEmail)) {
      setRecipientError('Please enter a valid recipient email address');
      isValid = false;
    }

    // Check if both emails are the same
    if (email === recipientEmail) {
      setRecipientError('Recipient email cannot be the same as your email');
      isValid = false;
    }
    
    if (isValid) {
      setIsSubmitting(true);
      
      // Update context with user information
      setCurrentUser(email);
      setContextRecipientEmail(recipientEmail);
      
      // Navigate to chat page
      navigate('/chat');
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1 className="login-heading">Chat Login</h1>
        <p className="login-subtitle">Start a private conversation</p>
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label className="form-label">
              Your Email <span className="required">*</span>
            </label>
            <input
              type="email"
              className={`form-input ${emailError ? 'error' : ''}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
            {emailError && <div className="error-message">{emailError}</div>}
          </div>
          
          <div className="form-group">
            <label className="form-label">
              Recipient Email <span className="required">*</span>
            </label>
            <input
              type="email"
              className={`form-input ${recipientError ? 'error' : ''}`}
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="recipient@example.com"
              required
            />
            {recipientError && <div className="error-message">{recipientError}</div>}
          </div>
          
          <button
            type="submit"
            className="submit-button"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Loading...' : 'Start Private Conversation'}
          </button>
        </form>
        
        <div className="login-info">
          <p>Your conversation will only be accessible by you and the recipient.</p>
          <p>Important: To access the same chat later, both users must use the <strong style={{color: 'red'}}>same email addresses</strong> sent in the email.</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage; 