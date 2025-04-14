require('dotenv').config();

module.exports = {
    // MongoDB configuration
    mongodb: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/test3'
    },

    // GitHub repository configuration
    github: {
        repoUrl: 'https://github.com/CVEProject/cvelist.git',
        localPath: './tmp/cvelist',
        // Specify the target folder to clone (to avoid cloning the entire repo)
        targetFolder: '2025', // Adjust as needed (e.g., '2025/3xxx', '2025/31xxx', etc.)
    },

    // Batch processing configuration
    batch: {
        size: 100 // Number of documents to process at once
    },

    // Logging configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info'
    }
};