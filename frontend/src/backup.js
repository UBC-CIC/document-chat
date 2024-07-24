import React, { useState, useRef } from 'react'
import { Box, IconButton, MenuItem, Select, Typography } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';

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

      <Box mt={2} p={2}>
        <Typography variant="h6">Documents</Typography>
        <Select fullWidth displayEmpty>
          <MenuItem value="" disabled>
            Select a document
          </MenuItem>
          {uploadedDocs.map((doc, index) => (
            <MenuItem key={index} value={doc}>
              {doc}
            </MenuItem>
          ))}
        </Select>
      </Box>

      <Box position="absolute" bottom={'10px'} left={'3.5%'} p={2} bgcolor={bg_color} textAlign="center">
      <input
          accept="*"
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

export default Navigation