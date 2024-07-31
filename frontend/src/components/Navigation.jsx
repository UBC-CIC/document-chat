import { Box, IconButton, List, ListItem, Typography } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { useState, useRef } from 'react';

const Navigation = () => {
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const fileInputRef = useRef(null);

  const bg_color = "#eeeeee";

  const handleFilePickerClick = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files);
    const pdfFiles = files.filter(file => file.type === 'application/pdf');
    setUploadedDocs(prevDocs => [...prevDocs, ...pdfFiles.map(file => file.name)]);
  };

  return (
    <Box width="10%" bgcolor={bg_color} display="flex" flexDirection="column" p={2}>

      <Box pt={6}>
        <Typography variant="h7">Documents</Typography>
        <List>
          {uploadedDocs.map((doc, index) => (
            <ListItem key={index} style={{ paddingLeft: '20px' }}>
              <Typography variant='body2'>{doc} </Typography>
            </ListItem>
          ))}
        </List>
      </Box>

      <Box position="absolute" bottom={'10px'} left={'3.5%'} p={2} bgcolor={bg_color} textAlign="center">
        <input
          accept="application/pdf"
          style={{ display: 'none' }}
          id="upload-button-file"
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
        />
        <IconButton onClick={handleFilePickerClick}>
          <AttachFileIcon />
        </IconButton>
      </Box>
    </Box>
  )
}

export default Navigation;