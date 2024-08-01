import { Box, IconButton, List, ListItem, Typography } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { useState, useRef } from 'react';
import DocumentCard from './DocumentCard';
import { bg_color_3 } from './consts';

const Navigation = () => {
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const fileInputRef = useRef(null);

  const handleFilePickerClick = () => {
    fileInputRef.current.click();
  };

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    const pdfFiles = files.filter(file => file.type === 'application/pdf'); // Filter only PDF files

    /** TODO: Handle multiple file uploads & lock screen while uploading files. */
    pdfFiles.forEach(async file => {
      try {
        const response = await fetch(import.meta.env.VITE_SIGNED_URL_ENDPOINT + '?object_key=' + file.name, {
          method: 'GET',
        });

        if (!response.ok) {
          throw new Error('Network response was not ok. Failed to get signed URL.');
        }

        // Read the response as a stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let result = '';
        let done = false;

        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          result += decoder.decode(value, { stream: !done });
        }

        // Decode base64 to JSON object
        const presignedResponse = JSON.parse(atob(result));
        console.log(`Signed URL for ${file.name}: ${presignedResponse.url}`);

        // Upload the document to the signed URL
        const formData = new FormData();
        Object.entries({...presignedResponse.fields}).forEach(([key, value]) => {
          formData.append(key, value)
        });
        formData.append('file', file);

        formData.forEach((value, key) => {
          console.log(`${key}: ${value}`);
        })

        const uploadResponse = await fetch(presignedResponse.url, {
          method: "POST",
          body: formData
        });

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload document');
        }

        console.log(`Successfully uploaded ${file.name}`);
        setUploadedDocs(prevDocs => [...prevDocs, file.name]);

      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error);
      }

      
    });
  };

  const deleteFile = (index) => {
    // TODO: Implement delete file functionality on API
    setUploadedDocs(prevDocs => prevDocs.filter((_, i) => i !== index));
  }

  return (
    <Box width="20%" bgcolor={bg_color_3} display="flex" flexDirection="column" p={2}>

      <Box pt={6}>
        <Typography variant="h7">Documents</Typography>
        <List>
          {uploadedDocs.map((filename, index) => (
            <ListItem key={index}>
              <DocumentCard documentName={filename} index={index} deleteFunction={deleteFile} />
            </ListItem>
          ))}
        </List>
      </Box>

      <Box position="absolute" bottom={'10px'} left={'3.5%'} p={2} bgcolor={bg_color_3} textAlign="center">
        <input
          accept="application/pdf"
          style={{ display: 'none' }}
          id="upload-button-file"
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
        />
        <IconButton onClick={handleFilePickerClick}>
          <AttachFileIcon />
        </IconButton>
      </Box>
    </Box>
  )
}

export default Navigation;