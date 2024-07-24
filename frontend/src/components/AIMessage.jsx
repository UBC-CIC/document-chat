import React from 'react';
import { ListItemText, Box, Paper } from '@mui/material';

const AIMessage = ({ text }) => {
  return (
    <Box display="flex" justifyContent="flex-start" mb={1}>
      <Paper elevation={1} style={{ padding: '10px', backgroundColor: '#f1f1f1' }}>
        <ListItemText primary={text} />
      </Paper>
    </Box>
  );
};

export default AIMessage;