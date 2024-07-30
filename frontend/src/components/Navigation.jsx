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

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files);
    const pdfFiles = files.filter(file => file.type === 'application/pdf');

    /** TODO: Handle multiple file uploads & lock screen while uploading files. */
    pdfFiles.forEach(async file => {
      try {
        const response = await fetch(import.meta.env.VITE_SIGNED_URL_ENDPOINT + '?object_key=' + file.name, {
          method: 'GET',
        });

        if (!response.ok) {
          throw new Error('Network response was not ok');
        }

        const data = await response.json();
        console.log(`Signed URL for ${file.name}: ${data.url}`);

        /** upload is commented until CORS fixed 
      
        // Upload the document to the signed URL // TODO: Verify
        const uploadResponse = await fetch(data.url, {
          method: 'POST',
          body: {
            data: data.fields,
            files: file,
          },
          headers: {
            'Content-Type': 'application/pdf',
          },
        });

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload document');
        }

        console.log(`Successfully uploaded ${file.name}`);

        setUploadedDocs(prevDocs => [...prevDocs, file.name]);

        */
      } catch (error) {
        console.error(`Failed to get signed URL for ${file.name}:`, error);
      }

      
    });
  };

  return (
    <Box width="10%" bgcolor={bg_color} display="flex" flexDirection="column" p={2}>

      <Box pt={6}>
        <Typography variant="h7">Documents</Typography>
        <List>
          {uploadedDocs.map((filename, index) => (
            <ListItem key={index} style={{ paddingLeft: '20px' }}>
              <Typography variant='body2'>{filename} </Typography>
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