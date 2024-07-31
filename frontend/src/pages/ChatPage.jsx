import React, { useState } from 'react';
import { 
  Box, 
  TextField, 
  IconButton, 
  List, 
  ListItem, 
  AppBar, 
  Toolbar, 
  Typography, 
  Paper
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import Navigation from '../components/Navigation';


const ChatPage = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (input.trim()) {
      setMessages([...messages, { sender: 'student', text: input, timestamp: new Date().toLocaleTimeString() }]);
      setInput('');
      // Simulate AI response
      setTimeout(() => {
        setMessages(prevMessages => [...prevMessages, { sender: 'ai', text: 'This is an AI response.', timestamp: new Date().toLocaleTimeString() }]);
      }, 1000);
    }
  };

  const bg_color_1 = "#eceff1";
  const bg_color_2 = "#f5f5f5";

  return (
    <Box display="flex" height='100vh' overflow='hidden'>

      {/* Navigation Bar */}
      <Navigation />

      {/* Main Chat Area */}
      <Box width="90%" display="flex" flexDirection="column">
        <AppBar position="static" style={{ background: bg_color_1, boxShadow: 'none'}}>
          <Toolbar>
            <Typography variant="h6" color='#424242'>
              Life Cycle Assesment GPT
            </Typography>
          </Toolbar>
        </AppBar>
        <Box flexGrow={1} p={2} overflow="auto" bgcolor={bg_color_2}>
          <List>
            {messages.map((message, index) => (
              <ListItem key={index} style={{ justifyContent: message.sender === 'student' ? 'flex-end' : 'flex-start' }}>
                <Box display="flex" flexDirection="column" alignItems={message.sender === 'student' ? 'flex-end' : 'flex-start'}>
                  <Paper style={{ padding: '10px', backgroundColor: message.sender === 'student' ? 'lightgray' : 'lightblue' }}>
                    <Typography variant="body1">{message.text}</Typography>
                    <Typography variant="caption" color="textSecondary">{message.timestamp}</Typography>
                  </Paper>
                </Box>
              </ListItem>
            ))}
          </List>
        </Box>

        {/* Chatbox */}
        <Box display="flex" p={2} bgcolor={bg_color_2}>
          <TextField
            fullWidth
            variant="outlined"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleSend();
              }
            }}
          />
          <IconButton color="primary" onClick={handleSend}>
            <SendIcon />
          </IconButton>
        </Box>
      </Box>
    </Box>
  );
};

export default ChatPage;