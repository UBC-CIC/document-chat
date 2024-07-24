import React from 'react';
import { ListItemText, Box, Paper } from '@mui/material';

const StudentMessage = ({ text }) => {
  return (
    <Box display="flex" justifyContent="flex-end" mb={1}>
      <Paper elevation={1} style={{ padding: '10px', backgroundColor: '#e0f7fa' }}>
        <ListItemText primary={text} />
      </Paper>
    </Box>
  );
};

export default StudentMessage;