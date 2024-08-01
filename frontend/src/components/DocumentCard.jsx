import React from 'react'
import { Box, Typography, Paper, IconButton } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import { bg_color_1 } from './consts'

const DocumentCard = ({ documentName, index, deleteFunction }) => {
  

  return (
    <Paper elevation={1} style={{ padding: '10px', backgroundColor: bg_color_1, maxWidth: '90%'}}>
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Typography 
          variant="body2" 
          sx={{ 
            maxWidth: '100%', 
            textOverflow: 'ellipsis', 
            overflow: 'hidden', 
            whiteSpace: 'nowrap' 
          }}
        >
          {documentName}
        </Typography>
        <Box ml="auto">
          <IconButton aria-label="delete" size="small" onClick={() => deleteFunction(index)} color='primary'>
            <DeleteIcon />
          </IconButton>
        </Box>
      </Box>
    </Paper>
  )
}

export default DocumentCard