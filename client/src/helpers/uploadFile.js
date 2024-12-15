const url = `https://api.cloudinary.com/v1_1/${process.env.REACT_APP_CLOUDINARY_CLOUD_NAME}/auto/upload`;

const uploadFile = async (file) => {
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', 'chat-app-file'); // Ensure this matches your Cloudinary preset.

        const response = await fetch(url, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`Cloudinary upload failed with status: ${response.status}`);
        }

        const responseData = await response.json();

        // Validate the response structure
        if (!responseData || !responseData.url) {
            throw new Error('Invalid response from Cloudinary');
        }

        return responseData; // Contains the uploaded file's URL and other metadata.
    } catch (error) {
        console.error('File upload failed:', error);
        return {
            error: true,
            message: error.message,
        };
    }
};

export default uploadFile;
