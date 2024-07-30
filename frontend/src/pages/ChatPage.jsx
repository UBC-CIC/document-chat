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

  // const handleSend = () => {
  //   if (input.trim()) {
  //     setMessages([...messages, { sender: 'student', text: input, timestamp: new Date().toLocaleTimeString() }]);
  //     setInput('');
  //     // Simulate AI response
  //     setTimeout(() => {
  //       setMessages(prevMessages => [...prevMessages, { sender: 'ai', text: 'This is an AI response.', timestamp: new Date().toLocaleTimeString() }]);
  //     }, 1000);
  //   }
  // };


  const handleSend = async () => {
    if (input.trim()) {
      setMessages([...messages, { sender: 'human', text: input, timestamp: new Date().toLocaleTimeString() }]);
      setInput('');

      // Convert the input into query string
      const params = new URLSearchParams({ prompt: input });
      const queryString = params.toString();
      console.log(queryString); // Output e.x.: "prompt=what%20is%20lci"

      /** upload to backend is commented until CORS fixed
      
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
  
        const data = await response.json(); // TODO: verify the response structure
        setMessages(prevMessages => [...prevMessages, { sender: 'ai', text: data, timestamp: new Date().toLocaleTimeString() }]);

      
      } catch (error) {
        console.error('Failed to send message:', error);
      }
      
      */

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