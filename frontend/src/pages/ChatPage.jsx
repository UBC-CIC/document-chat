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
import { bg_color_1, bg_color_2 } from '../components/consts';

const ChatPage = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  const actor_1 = 'human';
  const actor_2 = 'ai';

  const handleSend = async () => {
    if (input.trim()) {
      setMessages([...messages, { sender: actor_1, text: input, timestamp: new Date().toLocaleTimeString() }]);
      setInput('');

      // Convert the input into query string
      const params = new URLSearchParams({ prompt: input });
      const queryString = params.toString();

      // Send the input to the backend
      try {
        const response = await fetch(import.meta.env.VITE_PROMPT_ENDPOINT + '?' + queryString, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        });
  
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        
        // Read the response as a stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let responseString = '';
        let done = false;

        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          responseString += decoder.decode(value, { stream: !done });
        }

        setMessages(prevMessages => [...prevMessages, { sender: actor_2, text: responseString, timestamp: new Date().toLocaleTimeString() }]);
      
      } catch (error) {
        console.error('Failed to send message:', error);
      }

    }
  };

  return (
    <Box display="flex" height='100vh' overflow='hidden'>

      {/* Navigation Bar */}
      <Navigation />

      {/* Main Chat Area */}
      <Box width="80%" display="flex" flexDirection="column">
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
              <ListItem key={index} style={{ justifyContent: message.sender === actor_1 ? 'flex-end' : 'flex-start' }}>
                <Box display="flex" flexDirection="column" alignItems={message.sender === actor_1 ? 'flex-end' : 'flex-start'}>
                  <Paper style={{ padding: '10px', backgroundColor: message.sender === actor_1 ? 'lightgray' : 'lightblue' }}>
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